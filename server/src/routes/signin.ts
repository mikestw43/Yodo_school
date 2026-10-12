import { Router, type Request } from 'express';
import { z } from 'zod';
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';
import {
  generateAuthenticationOptions, generateRegistrationOptions, verifyAuthenticationResponse, verifyRegistrationResponse,
  type AuthenticatorTransportFuture,
} from '@simplewebauthn/server';
import { prisma } from '../lib/db.js';
import { audit } from '../lib/audit.js';
import { isAllPowerful, requireAuth } from '../lib/auth.js';
import { bad, forbidden, HttpError, notFound } from '../lib/http.js';
import { finishLogin, throttle } from './auth.js';

// Other ways to sign in (copied from FinHR): "Continue with Google" and Face ID / fingerprint (passkeys).
// Both only sign in people who already have an active account here.
export const router = Router();

const googleClientId = async () => (await prisma.setting.findUnique({ where: { id: 1 } }))?.googleClientId ?? '';

// Public: the login page needs to know whether to show the Google button.
router.get('/auth/options', async (_req, res) => { res.json({ googleClientId: await googleClientId() }); });

// SuperAdmin pastes the school's Google client ID (public, not a secret; the client secret is never used).
router.put('/settings/google', requireAuth, async (req, res) => {
  if (!(await isAllPowerful(req.user!))) throw forbidden();
  const { googleClientId: v } = z.object({ googleClientId: z.string().trim().max(200).refine((x) => !x || /^[\w.-]+\.apps\.googleusercontent\.com$/.test(x), 'google_client_id_format') }).parse(req.body);
  const before = await googleClientId();
  await prisma.setting.upsert({ where: { id: 1 }, create: { id: 1, googleClientId: v }, update: { googleClientId: v } });
  await audit(req, 'update', 'settings', '1', 'Google', { google_client_id: before }, { google_client_id: v }, true);
  res.json({ ok: true });
});

// ---------- Google ----------
let googleKeys: JWTVerifyGetKey = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));
export const setGoogleKeysForTest = (k: JWTVerifyGetKey) => { googleKeys = k; };

router.post('/auth/google', async (req, res) => {
  const { credential } = z.object({ credential: z.string().min(20).max(5000) }).parse(req.body);
  throttle(`google|${req.ip}`);
  const aud = await googleClientId();
  if (!aud) throw bad('google_not_set_up');
  let p: { sub?: string; email?: string; email_verified?: boolean };
  try {
    p = (await jwtVerify(credential, googleKeys, { issuer: ['https://accounts.google.com', 'accounts.google.com'], audience: aud })).payload as typeof p;
  } catch {
    throw new HttpError(401, 'google_failed');
  }
  if (!p.sub || !p.email || p.email_verified !== true) throw new HttpError(401, 'google_failed');
  const email = p.email.toLowerCase();
  // Linked accounts are found by Google's id; otherwise by the email on the profile (exactly one), then linked.
  let u = await prisma.user.findFirst({ where: { googleSub: p.sub, deletedAt: null } });
  if (!u) {
    const same = (await prisma.user.findMany({ where: { deletedAt: null } })).filter((x) => x.email.trim().toLowerCase() === email);
    if (same.length !== 1 || (same[0]!.googleSub && same[0]!.googleSub !== p.sub)) throw new HttpError(401, 'google_no_account');
    u = same[0]!;
    if (u.status === 'Active') u = await prisma.user.update({ where: { id: u.id }, data: { googleSub: p.sub } });
  }
  await finishLogin(req, res, u, true, 'google');
});

// ---------- passkeys (Face ID / fingerprint) ----------
// The site address the browser is on decides which passkeys work, so it is read from the request.
// A forged Origin header does not help an attacker: the device signs the real address.
function site(req: Request) {
  const origin = req.get('origin') ?? '';
  let url: URL;
  try { url = new URL(origin); } catch { throw bad('passkey_needs_https'); }
  if (url.protocol !== 'https:' && url.hostname !== 'localhost') throw bad('passkey_needs_https');
  return { origin: url.origin, rpID: url.hostname };
}

const challenges = new Map<string, { exp: number }>();
function remember(key: string) {
  const now = Date.now();
  for (const [k, v] of challenges) if (v.exp < now) challenges.delete(k);
  challenges.set(key, { exp: now + 5 * 60e3 });
}
function takeChallenge(key: string) {
  const c = challenges.get(key);
  challenges.delete(key);
  return !!c && c.exp >= Date.now();
}
const challengeOf = (r: { response?: { clientDataJSON?: string } } | undefined) => {
  try { return String(JSON.parse(Buffer.from(r?.response?.clientDataJSON ?? '', 'base64url').toString()).challenge ?? ''); } catch { return ''; }
};
const transportsOf = (s: string) => (s ? (s.split(',') as AuthenticatorTransportFuture[]) : undefined);

router.get('/me/passkeys', requireAuth, async (req, res) => {
  res.json(await prisma.passkey.findMany({
    where: { userId: req.user!.id, deletedAt: null }, orderBy: { id: 'asc' },
    select: { id: true, deviceName: true, createdAt: true, lastUsedAt: true },
  }));
});

router.post('/me/passkeys/options', requireAuth, async (req, res) => {
  const { rpID } = site(req);
  const existing = await prisma.passkey.findMany({ where: { userId: req.user!.id, deletedAt: null } });
  const options = await generateRegistrationOptions({
    rpName: 'YODO', rpID, userName: req.user!.username, userDisplayName: req.user!.name,
    userID: new TextEncoder().encode(`yodo-user-${req.user!.id}`), // own handle: FinHR uses the same host name
    attestationType: 'none',
    excludeCredentials: existing.map((p) => ({ id: p.credentialId, transports: transportsOf(p.transports) })),
    authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
  });
  remember(`reg:${req.user!.id}:${options.challenge}`);
  res.json(options);
});

router.post('/me/passkeys', requireAuth, async (req, res) => {
  const body = z.object({ response: z.any(), deviceName: z.string().trim().max(60).default('') }).parse(req.body);
  const { origin, rpID } = site(req);
  const challenge = challengeOf(body.response);
  if (!takeChallenge(`reg:${req.user!.id}:${challenge}`)) throw bad('passkey_expired');
  let v;
  try {
    v = await verifyRegistrationResponse({ response: body.response, expectedChallenge: challenge, expectedOrigin: origin, expectedRPID: rpID, requireUserVerification: true });
  } catch {
    throw bad('passkey_failed');
  }
  if (!v.verified || !v.registrationInfo) throw bad('passkey_failed');
  const cred = v.registrationInfo.credential;
  if (await prisma.passkey.findUnique({ where: { credentialId: cred.id } })) throw bad('passkey_exists');
  const p = await prisma.passkey.create({ data: {
    userId: req.user!.id, credentialId: cred.id, publicKey: Buffer.from(cred.publicKey), counter: cred.counter,
    transports: (cred.transports ?? []).join(','), deviceName: body.deviceName,
  } });
  await audit(req, 'update', 'profiles', req.user!.id, req.user!.username, null, { face_id: `on (${p.deviceName})` }, true);
  res.status(201).json({ id: p.id, deviceName: p.deviceName, createdAt: p.createdAt, lastUsedAt: null });
});

router.delete('/me/passkeys/:id', requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const p = Number.isInteger(id) ? await prisma.passkey.findFirst({ where: { id, userId: req.user!.id, deletedAt: null } }) : null; // only your own
  if (!p) throw notFound();
  await prisma.passkey.update({ where: { id }, data: { deletedAt: new Date() } });
  await audit(req, 'update', 'profiles', req.user!.id, req.user!.username, null, { face_id: `removed (${p.deviceName})` }, true);
  res.json({ ok: true });
});

router.post('/auth/passkey/options', async (req, res) => {
  const { rpID } = site(req);
  throttle(`passkey|${req.ip}`);
  const options = await generateAuthenticationOptions({ rpID, userVerification: 'required' });
  remember(`auth:${options.challenge}`);
  res.json(options);
});

router.post('/auth/passkey', async (req, res) => {
  const { response } = z.object({ response: z.any() }).parse(req.body);
  const { origin, rpID } = site(req);
  const challenge = challengeOf(response);
  if (!takeChallenge(`auth:${challenge}`)) throw bad('passkey_expired');
  const p = typeof response?.id === 'string' ? await prisma.passkey.findFirst({ where: { credentialId: response.id, deletedAt: null } }) : null;
  if (!p) throw new HttpError(401, 'passkey_unknown');
  let v;
  try {
    v = await verifyAuthenticationResponse({
      response, expectedChallenge: challenge, expectedOrigin: origin, expectedRPID: rpID, requireUserVerification: true,
      credential: { id: p.credentialId, publicKey: new Uint8Array(p.publicKey), counter: p.counter, transports: transportsOf(p.transports) },
    });
  } catch {
    throw new HttpError(401, 'passkey_failed');
  }
  if (!v.verified) throw new HttpError(401, 'passkey_failed');
  await prisma.passkey.update({ where: { id: p.id }, data: { counter: v.authenticationInfo.newCounter, lastUsedAt: new Date() } });
  const u = await prisma.user.findUnique({ where: { id: p.userId } });
  if (!u) throw new HttpError(401, 'passkey_unknown');
  await finishLogin(req, res, u, true, 'face_id');
});
