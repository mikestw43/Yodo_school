import type { Request, Response, NextFunction, CookieOptions } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from './db.js';
import { secrets } from './config.js';
import { HttpError, forbidden } from './http.js';

// Own cookie names: another app (FinHR) runs on the same NAS address, and cookies are shared across ports.
export const COOKIE = 'yodo_session';

// receipts: view / add = issue / delete = cancel; company: view / edit; money: view = see money on the dashboard;
// courses: view = the Courses page / edit = extend a course for free (owner 12/10/2026)
export const MENU_KEYS = ['dashboard', 'students', 'classes', 'teachers', 'calendar', 'users', 'auditlog', 'receipts', 'company', 'money', 'courses'] as const;
export type MenuKey = (typeof MENU_KEYS)[number];
export type PermAction = 'view' | 'add' | 'edit' | 'delete';

export type SessionUser = { id: string; username: string; name: string; role: string; positionId: string | null };

declare module 'express-serve-static-core' {
  interface Request {
    user?: SessionUser;
  }
}

export const displayName = (u: { firstName: string; lastName: string; username: string }) =>
  [u.firstName, u.lastName].filter(Boolean).join(' ') || u.username;

export function cookieOptions(req: Request, remember = true): CookieOptions {
  // "Remember me" off = a browser-session cookie, gone when the browser closes.
  return { httpOnly: true, sameSite: 'lax', secure: req.secure, path: '/', ...(remember ? { maxAge: 30 * 864e5 } : {}) };
}

export function setSession(req: Request, res: Response, u: { id: string; tokenVersion: number }, remember = true) {
  const token = jwt.sign({ uid: u.id, tv: u.tokenVersion }, secrets.jwtSecret, { expiresIn: '30d' });
  res.cookie(COOKIE, token, cookieOptions(req, remember));
}

export function clearSession(req: Request, res: Response) {
  res.clearCookie(COOKIE, { ...cookieOptions(req), maxAge: undefined });
}

// Loads the signed-in user on every request. A disabled or deleted user, or one whose
// tokenVersion was bumped (password change), is treated as signed out.
export async function loadUser(req: Request, _res: Response, next: NextFunction) {
  const token = req.cookies?.[COOKIE];
  if (!token) return next();
  try {
    const p = jwt.verify(token, secrets.jwtSecret) as { uid: string; tv: number };
    const u = await prisma.user.findUnique({ where: { id: p.uid } });
    if (u && u.status === 'Active' && !u.deletedAt && u.tokenVersion === p.tv) {
      req.user = { id: u.id, username: u.username, name: displayName(u), role: u.role, positionId: u.positionId };
    }
  } catch {
    /* invalid or expired token: signed out */
  }
  next();
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) return next(new HttpError(401, 'unauthenticated'));
  next();
}

// Mutating requests must carry this header. Browsers never add it to
// cross-site form posts, which blocks CSRF together with SameSite cookies.
export function requireAppHeader(req: Request, _res: Response, next: NextFunction) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (req.get('x-yodo') !== '1') return next(forbidden('missing_app_header'));
  next();
}

const COL: Record<PermAction, 'canView' | 'canAdd' | 'canEdit' | 'canDelete'> = { view: 'canView', add: 'canAdd', edit: 'canEdit', delete: 'canDelete' };

// SuperAdmin and anyone in a system position may do everything; others follow their position's ticks.
export async function isAllPowerful(u: SessionUser) {
  if (u.role === 'superadmin') return true;
  if (!u.positionId) return false;
  const p = await prisma.position.findUnique({ where: { id: u.positionId } });
  return !!p?.isSystem;
}

/** Only the Owner (and the hidden SuperAdmin) edits rights and roles (owner 12/10/2026). */
export async function isOwner(u: SessionUser | undefined) {
  if (!u) return false;
  if (u.role === 'superadmin') return true;
  if (!u.positionId) return false;
  const p = await prisma.position.findUnique({ where: { id: u.positionId } });
  return p?.kind === 'owner' || p?.kind === 'superadmin';
}
export async function requireOwner(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) return next(new HttpError(401, 'unauthenticated'));
  if (!(await isOwner(req.user))) return next(forbidden('owner_only'));
  next();
}

export async function can(u: SessionUser | undefined, menu: MenuKey, action: PermAction = 'view') {
  if (!u) return false;
  if (await isAllPowerful(u)) return true;
  if (!u.positionId) return false;
  const p = await prisma.positionPermission.findUnique({ where: { positionId_menuKey: { positionId: u.positionId, menuKey: menu } } });
  return !!p?.[COL[action]];
}

export const requirePerm = (menu: MenuKey, action: PermAction) =>
  async (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(new HttpError(401, 'unauthenticated'));
    if (!(await can(req.user, menu, action))) return next(forbidden());
    next();
  };
