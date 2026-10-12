import { Router, type Request, type Response } from 'express';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../lib/db.js';
import { clearSession, cookieOptions, requireAuth } from '../lib/auth.js';
import { HttpError } from '../lib/http.js';
import { audit } from '../lib/audit.js';
import { finishLogin, throttle } from './auth.js';

// Sign in with a 4 or 6 digit PIN on a device where the person set one (copied from FinHR).
// The PIN only works together with this device's own secret (an httpOnly cookie), so a PIN alone is useless
// elsewhere. Five wrong PINs remove it from the device: then username/password (or Google) and a new PIN.
export const router = Router();
const MAX_FAILS = 5;
const COOKIE = 'yodo_pin'; // own name: FinHR shares the NAS host name
const hash = (t: string) => crypto.createHash('sha256').update(t).digest('hex');
const pinBody = z.object({ pin: z.string().regex(/^(\d{4}|\d{6})$/, 'pin_format') });

async function devicePin(req: Request) {
  const tok = req.cookies?.[COOKIE];
  if (typeof tok !== 'string' || tok.length < 20) return null;
  return prisma.devicePin.findUnique({ where: { tokenHash: hash(tok) } });
}
function forget(res: Response) { res.clearCookie(COOKIE, { path: '/' }); }

// Each try is counted BEFORE the PIN is compared, so many tries sent at once cannot get past the limit.
async function check(req: Request, res: Response, d: { id: number; pinHash: string }, pin: string) {
  const claimed = await prisma.devicePin.updateMany({ where: { id: d.id, fails: { lt: MAX_FAILS } }, data: { fails: { increment: 1 } } });
  if (!claimed.count) { await prisma.devicePin.deleteMany({ where: { id: d.id } }); forget(res); throw new HttpError(401, 'pin_locked'); }
  if (await bcrypt.compare(pin, d.pinHash)) { await prisma.devicePin.update({ where: { id: d.id }, data: { fails: 0, lastUsedAt: new Date() } }); return; }
  throttle(`pin|${req.ip}`, 20); // wrong PINs from one address, all devices together
  const now = await prisma.devicePin.findUnique({ where: { id: d.id } });
  if (!now || now.fails >= MAX_FAILS) { await prisma.devicePin.deleteMany({ where: { id: d.id } }); forget(res); throw new HttpError(401, 'pin_locked'); }
  throw new HttpError(401, 'wrong_pin');
}

// ---------- signed in: set, change, turn off on this device ----------
router.get('/me/pin', requireAuth, async (req, res) => {
  const d = await devicePin(req);
  res.json({ on: !!d && d.userId === req.user!.id });
});
router.post('/me/pin', requireAuth, async (req, res) => {
  const { pin } = pinBody.parse(req.body);
  const old = await devicePin(req);
  if (old) await prisma.devicePin.delete({ where: { id: old.id } });
  const token = crypto.randomBytes(32).toString('base64url');
  await prisma.devicePin.create({ data: { userId: req.user!.id, tokenHash: hash(token), pinHash: await bcrypt.hash(pin, 10) } });
  res.cookie(COOKIE, token, { ...cookieOptions(req), maxAge: 365 * 864e5 });
  await audit(req, 'update', 'profiles', req.user!.id, req.user!.username, null, { pin: old ? 'changed' : 'on' }, true);
  res.json({ ok: true });
});
router.delete('/me/pin', requireAuth, async (req, res) => {
  const d = await devicePin(req);
  if (d) await prisma.devicePin.delete({ where: { id: d.id } });
  forget(res);
  await audit(req, 'update', 'profiles', req.user!.id, req.user!.username, null, { pin: 'off' }, true);
  res.json({ ok: true });
});
// Unlocking the app after it locked itself (auto-lock).
router.post('/me/pin/check', requireAuth, async (req, res) => {
  const { pin } = pinBody.parse(req.body);
  const d = await devicePin(req);
  if (!d || d.userId !== req.user!.id) throw new HttpError(400, 'pin_off');
  try { await check(req, res, d, pin); }
  catch (e) { if (e instanceof HttpError && e.code === 'pin_locked') clearSession(req, res); throw e; }
  res.json({ ok: true });
});

// ---------- signed out: the PIN pad ----------
router.get('/auth/pin', async (req, res) => {
  const d = await devicePin(req);
  const u = d ? await prisma.user.findUnique({ where: { id: d.userId } }) : null;
  if (!d || !u || u.status !== 'Active' || u.deletedAt) { if (d) { await prisma.devicePin.deleteMany({ where: { id: d.id } }); forget(res); } return void res.json({ on: false }); }
  res.json({ on: true, name: u.nickname || u.firstName || u.username });
});
router.post('/auth/pin', async (req, res) => {
  const { pin } = pinBody.parse(req.body);
  const d = await devicePin(req);
  if (!d) throw new HttpError(400, 'pin_off');
  const u = await prisma.user.findUnique({ where: { id: d.userId } });
  if (!u || u.status !== 'Active' || u.deletedAt) { await prisma.devicePin.delete({ where: { id: d.id } }); forget(res); throw new HttpError(403, 'account_disabled'); }
  await check(req, res, d, pin);
  await finishLogin(req, res, u, true, 'pin');
});

// Whenever someone is signed out everywhere (password changed or reset, account disabled or deleted),
// their PINs go too, except the one on the device making the change.
export async function dropPins(userId: string, keep?: Request) {
  const mine = keep ? await devicePin(keep) : null;
  await prisma.devicePin.deleteMany({ where: { userId, ...(mine ? { id: { not: mine.id } } : {}) } });
}
