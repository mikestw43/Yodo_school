import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { prisma } from '../lib/db.js';
import { requireAuth } from '../lib/auth.js';
import { UPLOAD_DIR } from '../lib/config.js';
import { notFound } from '../lib/http.js';
import { isFileName } from '../lib/images.js';
import { NOTICE_KINDS, expiryNotices, offKinds, pushKeys, pushTo, rememberSite, unreadCount } from '../lib/notify.js';
import { isAllPowerful } from '../lib/auth.js';
import { forbidden } from '../lib/http.js';
import { audit } from '../lib/audit.js';

export const router = Router();

// ---------- pictures (signed-in staff only) ----------
router.get('/files/:name', requireAuth, (req, res) => {
  const name = String(req.params.name);
  const file = path.join(UPLOAD_DIR, name);
  if (!isFileName(name) || !fs.existsSync(file)) throw notFound();
  res.setHeader('Cache-Control', 'private, max-age=31536000, immutable'); // a new picture always gets a new name
  res.sendFile(file);
});

// ---------- the bell ----------
router.get('/notices', requireAuth, async (req, res) => {
  await expiryNotices();
  const items = await prisma.notice.findMany({ where: { userId: req.user!.id, deletedAt: null }, orderBy: { id: 'desc' }, take: 50 });
  res.json({
    unread: await unreadCount(req.user!.id),
    items: items.map((n) => ({ id: n.id, kind: n.kind, title: n.title, body: n.body, link: n.url, created_at: n.createdAt.toISOString(), read: !!n.readAt })),
  });
});

router.post('/notices/read', requireAuth, async (req, res) => {
  const b = z.object({ ids: z.array(z.number().int()).max(200).optional(), all: z.boolean().optional() }).parse(req.body ?? {});
  const where = { userId: req.user!.id, readAt: null, deletedAt: null, ...(b.all ? {} : { id: { in: b.ids ?? [] } }) };
  await prisma.notice.updateMany({ where, data: { readAt: new Date() } });
  res.json({ unread: await unreadCount(req.user!.id) });
});

// Remove from my bell: some, or every one already read. Removed ones count as read.
router.post('/notices/delete', requireAuth, async (req, res) => {
  const b = z.object({ ids: z.array(z.number().int()).max(200).optional(), read: z.boolean().optional() }).parse(req.body ?? {});
  const now = new Date();
  const mine = { userId: req.user!.id, deletedAt: null };
  if (b.ids) await prisma.notice.updateMany({ where: { ...mine, id: { in: b.ids } }, data: { deletedAt: now, readAt: now } });
  else if (b.read) await prisma.notice.updateMany({ where: { ...mine, readAt: { not: null } }, data: { deletedAt: now } });
  res.json({ unread: await unreadCount(req.user!.id) });
});

// ---------- what I want to hear about ----------
router.get('/me/notices', requireAuth, async (req, res) => {
  const [u, st] = await Promise.all([prisma.user.findUniqueOrThrow({ where: { id: req.user!.id } }), prisma.setting.findUnique({ where: { id: 1 } })]);
  res.json({ off: offKinds(u.noticeOff), expiryDays: st?.expiryDays ?? 14 });
});
router.put('/me/notices', requireAuth, async (req, res) => {
  const { off } = z.object({ off: z.array(z.enum(NOTICE_KINDS)).max(10) }).parse(req.body);
  await prisma.user.update({ where: { id: req.user!.id }, data: { noticeOff: [...new Set(off)].join(',') } });
  res.json({ ok: true });
});
// School-wide: how many days before a class ends the warning goes out (SuperAdmin).
router.put('/settings/notices', requireAuth, async (req, res) => {
  if (!(await isAllPowerful(req.user!))) throw forbidden();
  const { expiryDays } = z.object({ expiryDays: z.number().int().min(1).max(60) }).parse(req.body);
  const before = (await prisma.setting.findUnique({ where: { id: 1 } }))?.expiryDays ?? 14;
  await prisma.setting.upsert({ where: { id: 1 }, create: { id: 1, expiryDays }, update: { expiryDays } });
  await audit(req, 'update', 'settings', '1', 'Notifications', { expiry_days: before }, { expiry_days: expiryDays }, true);
  void expiryNotices();
  res.json({ ok: true });
});

// ---------- push devices ----------
router.get('/push/devices', requireAuth, async (req, res) => {
  res.json(await prisma.pushDevice.findMany({ where: { userId: req.user!.id }, orderBy: { id: 'asc' }, select: { id: true, label: true, endpoint: true, createdAt: true, lastOkAt: true } }));
});
router.delete('/push/devices/:id', requireAuth, async (req, res) => {
  await prisma.pushDevice.deleteMany({ where: { id: Number(req.params.id) || -1, userId: req.user!.id } }); // only your own
  res.json({ ok: true });
});
router.get('/push/key', requireAuth, (_req, res) => { res.json({ key: pushKeys().publicKey }); });

const subBody = z.object({
  endpoint: z.string().url().max(1000).refine((u) => u.startsWith('https://'), 'https'),
  keys: z.object({ p256dh: z.string().min(10).max(200), auth: z.string().min(4).max(100) }),
  label: z.string().trim().max(40).default(''),
});
// Upsert on the endpoint: the same browser signing up again must not become a second row.
router.post('/push/subscribe', requireAuth, async (req, res) => {
  const b = subBody.parse(req.body);
  rememberSite(req.get('origin'));
  const data = { userId: req.user!.id, p256dh: b.keys.p256dh, auth: b.keys.auth, label: b.label };
  await prisma.pushDevice.upsert({ where: { endpoint: b.endpoint }, create: { endpoint: b.endpoint, ...data }, update: data });
  res.json({ ok: true });
});

router.post('/push/test', requireAuth, async (req, res) => {
  const devices = await prisma.pushDevice.count({ where: { userId: req.user!.id } });
  if (!devices) return void res.json({ devices: 0, results: [] });
  const th = (await prisma.user.findUnique({ where: { id: req.user!.id } }))?.lang === 'th';
  const title = th ? 'YODO ทดสอบแจ้งเตือน' : 'YODO test notification', body = th ? 'อุปกรณ์นี้รับแจ้งเตือนได้แล้ว' : 'This device can receive notifications';
  await prisma.notice.create({ data: { userId: req.user!.id, kind: 'test', title, body, url: '/' } });
  const results = await pushTo(req.user!.id, { title, body, url: '/', tag: 'test' });
  res.json({ devices, results });
});
