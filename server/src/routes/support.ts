import { Router, type Request } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/db.js';
import { bad, forbidden, notFound, HttpError } from '../lib/http.js';
import { displayName } from '../lib/auth.js';
import { storeImage } from '../lib/images.js';
import { pushTo } from '../lib/notify.js';

// "Chat with support" (owner 25/10/2026, mockup D1GCdHAfNmKbMkrNXQBjed). Everyone signed in has one conversation with the
// support side; only the SuperAdmin answers (owner: "ผมเป็นคนตอบ") and sees every conversation in the inbox. Users see the
// answers as "ผู้ดูแล" / "Support", never a name. The page / device / app version of each message are kept for the
// SuperAdmin only. A new message rings the bell and pushes to the other side's phones.
export const router = Router();

const isSupport = (req: Request) => req.user?.role === 'superadmin';
const me = (req: Request) => {
  if (!req.user) throw new HttpError(401, 'unauthenticated');
  return req.user;
};
const requireSupport = (req: Request) => { me(req); if (!isSupport(req)) throw forbidden(); };

type Msg = Awaited<ReturnType<typeof prisma.supportMessage.findMany>>[number];
const out = (m: Msg, full: boolean) => ({
  id: m.id, fromAdmin: m.fromAdmin, text: m.text, image: m.image, createdAt: m.createdAt.toISOString(), read: !!m.readAt,
  ...(full ? { page: m.page, device: m.device, version: m.version } : {}),
});
const msgBody = z.object({
  text: z.string().trim().max(4000).default(''),
  image: z.string().max(12_000_000).default(''), // a data URL only, never an existing file
  page: z.string().max(200).default(''),
  device: z.string().max(40).default(''),
  version: z.string().max(40).default(''),
}).refine((b) => b.text || b.image, { message: 'empty' });
const picture = (v: string) => {
  if (!v) return '';
  if (!v.startsWith('data:')) throw bad('bad_image');
  return storeImage(v);
};
const short = (t: string, image: string, lang: string) => (t ? t.slice(0, 140) : image ? (lang === 'th' ? 'ส่งรูปภาพ' : 'Sent a picture') : '');

/** Bell row + push for one person; tapping it opens the conversation. */
async function ring(userId: string, lang: string, ref: string, url: string, title: string, body: string) {
  try {
    await prisma.notice.create({ data: { userId, kind: 'support', ref, title, body, url } });
    void pushTo(userId, { title, body, url, tag: ref }).catch(() => {});
  } catch { /* a notification never breaks the message */ }
  void lang;
}
/** Reading a conversation clears its bell rows for the reader. */
const clearBell = (userId: string, ref: string) => prisma.notice.updateMany({ where: { userId, ref, readAt: null }, data: { readAt: new Date() } });

// ---------- my own conversation ----------
router.get('/support/me', async (req, res) => {
  const u = me(req);
  await prisma.supportMessage.updateMany({ where: { userId: u.id, fromAdmin: true, readAt: null }, data: { readAt: new Date() } });
  await clearBell(u.id, `support:${u.id}`);
  const list = await prisma.supportMessage.findMany({ where: { userId: u.id }, orderBy: { createdAt: 'asc' } });
  res.json({ messages: list.map((m) => out(m, false)) });
});

router.post('/support/me', async (req, res) => {
  const u = me(req);
  if (isSupport(req)) throw bad('support_uses_inbox');
  const b = msgBody.parse(req.body);
  const m = await prisma.supportMessage.create({ data: { userId: u.id, byId: u.id, text: b.text, image: picture(b.image), page: b.page, device: b.device, version: b.version } });
  const who = await prisma.user.findUnique({ where: { id: u.id } });
  const name = who ? who.nickname || displayName(who) : u.username;
  const admins = await prisma.user.findMany({ where: { role: 'superadmin', status: 'Active', deletedAt: null } });
  for (const a of admins) {
    const th = a.lang === 'th';
    await ring(a.id, a.lang, `support:${u.id}`, `/support/${u.id}`, th ? `แชทจาก ${name}` : `Chat from ${name}`, short(m.text, m.image, a.lang));
  }
  res.status(201).json(out(m, false));
});

// ---------- unread count (menu badge) ----------
router.get('/support/unread', async (req, res) => {
  const u = me(req);
  const n = isSupport(req)
    ? await prisma.supportMessage.count({ where: { fromAdmin: false, readAt: null } })
    : await prisma.supportMessage.count({ where: { userId: u.id, fromAdmin: true, readAt: null } });
  res.json({ unread: n, support: isSupport(req) });
});

// ---------- the SuperAdmin's inbox ----------
router.get('/support/rooms', async (req, res) => {
  requireSupport(req);
  const all = await prisma.supportMessage.findMany({ orderBy: { createdAt: 'desc' } });
  const rooms = new Map<string, { last: Msg; unread: number }>();
  for (const m of all) {
    const r = rooms.get(m.userId) ?? { last: m, unread: 0 };
    if (!m.fromAdmin && !m.readAt) r.unread++;
    rooms.set(m.userId, r);
  }
  const users = await prisma.user.findMany({ where: { id: { in: [...rooms.keys()] } } });
  const positions = await prisma.position.findMany({ where: { id: { in: users.map((x) => x.positionId ?? '') } } });
  const posName = (id: string | null) => positions.find((x) => x.id === id)?.name ?? '';
  res.json({ rooms: [...rooms.entries()].map(([userId, r]) => {
    const p = users.find((x) => x.id === userId);
    return {
      userId, name: p ? p.nickname || displayName(p) : '-', fullName: p ? displayName(p) : '-', image: p?.image ?? '',
      position: posName(p?.positionId ?? null), last: out(r.last, true), unread: r.unread,
    };
  }) });
});

router.get('/support/rooms/:userId', async (req, res) => {
  requireSupport(req);
  const userId = String(req.params['userId']);
  const p = await prisma.user.findUnique({ where: { id: userId } });
  if (!p) throw notFound();
  const pos = p.positionId ? await prisma.position.findUnique({ where: { id: p.positionId } }) : null;
  await prisma.supportMessage.updateMany({ where: { userId, fromAdmin: false, readAt: null }, data: { readAt: new Date() } });
  await clearBell(me(req).id, `support:${userId}`);
  const list = await prisma.supportMessage.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } });
  res.json({ user: { id: p.id, name: p.nickname || displayName(p), fullName: displayName(p), image: p.image, position: pos?.name ?? '' }, messages: list.map((m) => out(m, true)) });
});

router.post('/support/rooms/:userId', async (req, res) => {
  requireSupport(req);
  const userId = String(req.params['userId']);
  const p = await prisma.user.findFirst({ where: { id: userId, deletedAt: null } });
  if (!p) throw notFound();
  const b = msgBody.parse(req.body);
  const m = await prisma.supportMessage.create({ data: { userId, fromAdmin: true, byId: me(req).id, text: b.text, image: picture(b.image) } });
  const th = p.lang === 'th';
  await ring(p.id, p.lang, `support:${p.id}`, '/support', th ? 'ผู้ดูแลตอบแชทแล้ว' : 'Support replied', short(m.text, m.image, p.lang));
  res.status(201).json(out(m, true));
});
