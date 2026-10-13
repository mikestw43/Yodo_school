import fs from 'node:fs';
import path from 'node:path';
import webpush from 'web-push';
import { prisma } from './db.js';
import { DATA_DIR } from './config.js';
import { todayBkk, addDays } from './dates.js';

// The bell: a row per person (reading on one device clears it everywhere), plus a Web Push to every
// device that turned notifications on. Every staff member gets the same events (as in the old app).
// Nothing here ever throws into the action that raised it.

// ---------- VAPID keys: made once and kept in the data folder ----------
const KEY_FILE = path.join(DATA_DIR, 'push.json');
type Keys = { publicKey: string; privateKey: string; subject?: string };
let keys: Keys | null = null;
export function pushKeys(): Keys {
  if (keys) return keys;
  if (fs.existsSync(KEY_FILE)) keys = JSON.parse(fs.readFileSync(KEY_FILE, 'utf8')) as Keys;
  else {
    keys = webpush.generateVAPIDKeys();
    fs.writeFileSync(KEY_FILE, JSON.stringify(keys, null, 2), { mode: 0o600 });
  }
  return keys;
}
// Apple refuses a push whose sender is not a real https: address, so the site's own address is used:
// remembered the first time a phone signs up from it.
export function rememberSite(origin: string | undefined) {
  if (!origin) return;
  let u: URL;
  try { u = new URL(origin); } catch { return; }
  if (u.protocol !== 'https:' || u.hostname === 'localhost') return;
  const k = pushKeys();
  if (k.subject === u.origin) return;
  keys = { ...k, subject: u.origin };
  fs.writeFileSync(KEY_FILE, JSON.stringify(keys, null, 2), { mode: 0o600 });
}

export const unreadCount = (userId: string) => prisma.notice.count({ where: { userId, readAt: null, deletedAt: null } });

// Kinds a person can turn off (owner 12/10/2026). Test notices always go through.
export const NOTICE_KINDS = ['enrollment', 'schedule', 'expiry'] as const;
export const offKinds = (s: string) => s.split(',').filter(Boolean);

export type DeviceResult = { label: string; ok: boolean; status: number | null; detail: string };
export async function pushTo(userId: string, payload: { title: string; body: string; url: string; tag: string }): Promise<DeviceResult[]> {
  const devices = await prisma.pushDevice.findMany({ where: { userId } });
  if (!devices.length) return [];
  const k = pushKeys();
  if (!k.subject) return devices.map((d) => ({ label: d.label, ok: false, status: null, detail: 'site address not known yet' }));
  const body = JSON.stringify({ ...payload, badge: await unreadCount(userId) });
  return Promise.all(devices.map(async (d): Promise<DeviceResult> => {
    try {
      await webpush.sendNotification({ endpoint: d.endpoint, keys: { p256dh: d.p256dh, auth: d.auth } }, body, {
        TTL: 3600, urgency: 'high', vapidDetails: { subject: k.subject!, publicKey: k.publicKey, privateKey: k.privateKey },
      });
      await prisma.pushDevice.update({ where: { id: d.id }, data: { lastOkAt: new Date() } });
      return { label: d.label, ok: true, status: 201, detail: '' };
    } catch (err) {
      const e = err as { statusCode?: number; body?: string; message?: string };
      const status = e.statusCode ?? null;
      if (status === 404 || status === 410) {
        await prisma.pushDevice.delete({ where: { id: d.id } }).catch(() => {});
        return { label: d.label, ok: false, status, detail: 'subscription expired' };
      }
      return { label: d.label, ok: false, status, detail: String(e.body || e.message || '').slice(0, 200) };
    }
  }));
}

export type Lang = 'th' | 'en';
// The text is made in each person's own language (owner 12/10/2026).
export type NoticeIn = { kind: string; ref?: string; text: (lang: Lang) => { title: string; body: string }; url: string };

export async function notifyAll(n: NoticeIn) {
  try {
    const users = await prisma.user.findMany({ where: { status: 'Active', deletedAt: null }, select: { id: true, lang: true, noticeOff: true } });
    for (const u of users) {
      if (offKinds(u.noticeOff).includes(n.kind)) continue;
      const t = n.text(u.lang === 'th' ? 'th' : 'en');
      const title = t.title.slice(0, 120), body = t.body.slice(0, 300);
      await prisma.notice.create({ data: { userId: u.id, kind: n.kind, ref: n.ref ?? '', title, body, url: n.url } });
      void pushTo(u.id, { title, body, url: n.url, tag: n.ref || n.kind }).catch(() => {});
    }
  } catch { /* a notification must never break what raised it */ }
}

export const fdate = (d: string) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : ''); // dd/mm/yyyy, Christian era

// Classes ending within the school's set number of days (default 7): one warning per enrollment and expiry date.
export async function expiryNotices() {
  try {
    const today = todayBkk();
    const days = (await prisma.setting.findUnique({ where: { id: 1 } }))?.expiryDays ?? 7;
    const list = await prisma.enrollment.findMany({ where: { expiryDate: { gte: today, lte: addDays(today, days) } } });
    for (const e of list) {
      const key = `expiry:${e.id}:${e.expiryDate}`;
      if (await prisma.noticeKey.findUnique({ where: { key } })) continue;
      const [s, c] = await Promise.all([
        prisma.student.findFirst({ where: { id: e.studentId, deletedAt: null } }),
        prisma.danceClass.findUnique({ where: { id: e.classId } }),
      ]);
      if (!s || !c) continue;
      await prisma.noticeKey.create({ data: { key } });
      await notifyAll({ kind: 'expiry', ref: key, url: '/courses?show=soon', text: (l) => l === 'th'
        ? { title: 'คลาสใกล้หมดอายุ', body: `${s.code} ${s.firstName} → ${c.name} หมดอายุ ${fdate(e.expiryDate)}` }
        : { title: 'Class ending soon', body: `${s.code} ${s.firstName} → ${c.name} ends ${fdate(e.expiryDate)}` } });
    }
  } catch (e) { console.error('expiry notices failed', e); }
}

export function scheduleExpiryCheck() {
  void expiryNotices();
  setInterval(() => void expiryNotices(), 3600e3).unref();
}
