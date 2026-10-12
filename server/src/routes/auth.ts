import { Router, type Request, type Response } from 'express';
import type { User } from '@prisma/client';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../lib/db.js';
import { DATA_DIR } from '../lib/config.js';
import { bad, forbidden, HttpError } from '../lib/http.js';
import { clearSession, displayName, requireAuth, setSession } from '../lib/auth.js';
import { ensureRoles } from '../lib/roles.js';
import { audit } from '../lib/audit.js';
import { storeImage } from '../lib/images.js';
import { dropPins } from './pin.js';

export const router = Router();

export const username = z.string().trim().toLowerCase().regex(/^[a-z0-9._-]{3,30}$/, 'username_format');
export const optEmail = z.string().trim().max(255).refine((v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), 'email_format');
export const optPhone = z.string().trim().max(20).refine((v) => !v || /^\d{10}$/.test(v), 'phone_format');
const part = z.string().trim().max(100);

// ---------- first-run setup ----------
// While no user exists, a one-time code is written to the data folder. Only someone who can open
// that folder (the owner, via File Station or SSH) can create the first account.
const SETUP_FILE = path.join(DATA_DIR, 'setup-code.txt');

export async function ensureSetupCode() {
  if ((await prisma.user.count()) > 0) {
    if (fs.existsSync(SETUP_FILE)) fs.unlinkSync(SETUP_FILE);
    return;
  }
  if (!fs.existsSync(SETUP_FILE)) fs.writeFileSync(SETUP_FILE, crypto.randomInt(10 ** 7, 10 ** 8).toString() + '\n', { mode: 0o644 });
  console.log(`First-run setup: the setup code is in ${SETUP_FILE}`);
}

router.get('/setup/status', async (_req, res) => {
  res.json({ needsSetup: (await prisma.user.count()) === 0 });
});

router.post('/setup', async (req, res) => {
  const body = z.object({ code: z.string().trim(), firstName: part.min(1), lastName: part, username, password: z.string().min(6).max(100) }).parse(req.body);
  if ((await prisma.user.count()) > 0) throw forbidden('already_set_up');
  const expected = fs.existsSync(SETUP_FILE) ? fs.readFileSync(SETUP_FILE, 'utf8').trim() : '';
  if (!expected || !crypto.timingSafeEqual(Buffer.from(body.code.padEnd(8)), Buffer.from(expected.padEnd(8)))) throw forbidden('wrong_setup_code');
  const user = await prisma.$transaction(async (db) => {
    // The first account is the hidden SuperAdmin (Dev); the Owner / Partner / Admin roles are made by ensureRoles.
    let pos = await db.position.findFirst({ where: { kind: 'superadmin' } });
    if (!pos) pos = await db.position.create({ data: { name: 'SuperAdmin', description: 'ผู้ดูแลระบบ เข้าถึงได้ทุกเมนู', isSystem: true, kind: 'superadmin' } });
    return db.user.create({ data: {
      username: body.username, passwordHash: await bcrypt.hash(body.password, 12), role: 'superadmin',
      firstName: body.firstName, lastName: body.lastName, positionId: pos.id,
    } });
  });
  fs.unlinkSync(SETUP_FILE);
  await ensureRoles();
  req.user = { id: user.id, username: user.username, name: displayName(user), role: user.role, positionId: user.positionId };
  await audit(req, 'insert', 'profiles', user.id, user.username, null, { ...user, passwordHash: undefined });
  setSession(req, res, user);
  res.json({ ok: true });
});

// ---------- login / logout ----------
const attempts = new Map<string, { n: number; until: number }>();
export function throttle(key: string, max = 10) {
  const now = Date.now();
  const a = attempts.get(key);
  if (a && a.until > now && a.n >= max) throw new HttpError(429, 'too_many_attempts');
  if (!a || a.until <= now) attempts.set(key, { n: 1, until: now + 15 * 60e3 });
  else a.n++;
}

// Username or email (the email on the person's profile).
router.post('/auth/login', async (req, res) => {
  const body = z.object({ identifier: z.string().trim().toLowerCase().min(1).max(200), password: z.string().max(200), remember: z.boolean().default(true) }).parse(req.body);
  throttle(`${req.ip}|${body.identifier}`);
  throttle(`acct|${body.identifier}`, 30); // open to the internet: cap guesses per account from all addresses
  const u = body.identifier.includes('@')
    ? await prisma.user.findFirst({ where: { email: body.identifier, deletedAt: null } })
    : await prisma.user.findFirst({ where: { username: body.identifier, deletedAt: null } });
  // Same answer for unknown account and wrong password.
  if (!u || !(await bcrypt.compare(body.password, u.passwordHash))) throw new HttpError(401, 'wrong_credentials');
  if (u.status !== 'Active') throw forbidden('account_disabled');
  attempts.delete(`${req.ip}|${body.identifier}`);
  attempts.delete(`acct|${body.identifier}`);
  await finishLogin(req, res, u, body.remember, 'password');
});

// Every way of signing in ends here: session cookie + a login row in the history.
export async function finishLogin(req: Request, res: Response, u: User, remember: boolean, method: string) {
  if (u.status !== 'Active' || u.deletedAt) throw forbidden('account_disabled');
  await prisma.user.update({ where: { id: u.id }, data: { lastLoginAt: new Date() } });
  setSession(req, res, u, remember);
  req.user = { id: u.id, username: u.username, name: displayName(u), role: u.role, positionId: u.positionId };
  const full = [u.firstName, u.lastName].filter(Boolean).join(' ');
  await audit(req, 'login', 'auth', u.id, full, null, { full_name: full, logged_in_at: new Date().toISOString(), method }, true);
  res.json({ ok: true });
}

router.post('/auth/logout', async (req, res) => {
  if (req.user) {
    const u = await prisma.user.findUnique({ where: { id: req.user.id } });
    const full = [u?.firstName, u?.lastName].filter(Boolean).join(' ');
    await audit(req, 'logout', 'auth', req.user.id, full, null, { full_name: full, logged_out_at: new Date().toISOString() }, true);
  }
  clearSession(req, res);
  res.json({ ok: true });
});

// ---------- me ----------
router.get('/me', requireAuth, async (req, res) => {
  const u = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id } });
  const pos = u.positionId ? await prisma.position.findUnique({ where: { id: u.positionId } }) : null;
  res.json({
    id: u.id, username: u.username, firstName: u.firstName, lastName: u.lastName, nickname: u.nickname, email: u.email, phone: u.phone,
    image: u.image, positionId: u.positionId ?? '', positionName: pos?.name ?? '', role: u.role, superadmin: u.role === 'superadmin',
    name: displayName(u), googleLinked: !!u.googleSub, lang: u.lang === 'th' ? 'th' : 'en',
  });
});

router.patch('/me', requireAuth, async (req, res) => {
  const body = z.object({ firstName: part, lastName: part, nickname: part, email: optEmail, phone: optPhone, image: z.string().max(12_000_000) }).parse(req.body);
  const before = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id } });
  const after = await prisma.user.update({ where: { id: before.id }, data: { ...body, image: storeImage(body.image) } });
  await audit(req, 'update', 'profiles', before.id, before.username, before, after);
  res.json({ ok: true });
});

router.patch('/me/lang', requireAuth, async (req, res) => {
  const { lang } = z.object({ lang: z.enum(['th', 'en']) }).parse(req.body);
  await prisma.user.update({ where: { id: req.user!.id }, data: { lang } });
  res.json({ ok: true });
});

router.post('/me/password/check', requireAuth, async (req, res) => {
  const { current } = z.object({ current: z.string().max(200) }).parse(req.body);
  throttle(`pwcheck|${req.user!.id}`);
  const u = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id } });
  if (!(await bcrypt.compare(current, u.passwordHash))) throw bad('wrong_password');
  res.json({ ok: true });
});

router.post('/me/password', requireAuth, async (req, res) => {
  const body = z.object({ current: z.string().max(200), next: z.string().min(6).max(100) }).parse(req.body);
  throttle(`pwcheck|${req.user!.id}`);
  const u = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id } });
  if (!(await bcrypt.compare(body.current, u.passwordHash))) throw bad('wrong_password');
  if (body.next === body.current) throw bad('same_password');
  const updated = await prisma.user.update({ where: { id: u.id }, data: { passwordHash: await bcrypt.hash(body.next, 12), tokenVersion: { increment: 1 } } });
  await dropPins(u.id, req); // other devices' PINs go; this device keeps its own
  await audit(req, 'update', 'profiles', u.id, u.username, null, { password: '********' }, true);
  setSession(req, res, updated); // stay signed in here, signed out everywhere else
  res.json({ ok: true });
});
