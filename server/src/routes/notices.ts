import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { prisma } from '../lib/db.js';
import { requireAuth } from '../lib/auth.js';
import { UPLOAD_DIR } from '../lib/config.js';
import { notFound } from '../lib/http.js';
import { isFileName } from '../lib/images.js';
import { expiryNotices, pushKeys, pushTo, rememberSite, unreadCount } from '../lib/notify.js';

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
  const items = await prisma.notice.findMany({ where: { userId: req.user!.id }, orderBy: { id: 'desc' }, take: 50 });
  res.json({
    unread: await unreadCount(req.user!.id),
    items: items.map((n) => ({ id: n.id, kind: n.kind, title: n.title, body: n.body, link: n.url, created_at: n.createdAt.toISOString(), read: !!n.readAt })),
  });
});

router.post('/notices/read', requireAuth, async (req, res) => {
  const b = z.object({ ids: z.array(z.number().int()).max(200).optional(), all: z.boolean().optional() }).parse(req.body ?? {});
  const where = { userId: req.user!.id, readAt: null, ...(b.all ? {} : { id: { in: b.ids ?? [] } }) };
  await prisma.notice.updateMany({ where, data: { readAt: new Date() } });
  res.json({ unread: await unreadCount(req.user!.id) });
});

// ---------- push devices ----------
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
  await prisma.notice.create({ data: { userId: req.user!.id, kind: 'test', title: 'YODO ทดสอบแจ้งเตือน', body: 'อุปกรณ์นี้รับแจ้งเตือนได้แล้ว', url: '/' } });
  const results = await pushTo(req.user!.id, { title: 'YODO ทดสอบแจ้งเตือน', body: 'อุปกรณ์นี้รับแจ้งเตือนได้แล้ว', url: '/', tag: 'test' });
  res.json({ devices, results });
});
