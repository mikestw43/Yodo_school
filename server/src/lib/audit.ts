import type { Request } from 'express';
import crypto from 'node:crypto';
import { prisma } from './db.js';

// Rows are kept in the old app's shape (snake_case column names) so the Audit Log page reads the same.
const SKIP = new Set(['created_at', 'joined_at', 'updated_at', 'deleted_at', 'password_hash', 'token_version', 'last_login_at', 'lang', 'theme', 'google_sub']);
const IMAGES = new Set(['image', 'receipt_image', 'signature']);
const LISTS = new Set(['interested', 'specializations']);
/** Staff records, salaries and salary certificates: only the Owner / SuperAdmin may read these audit rows (owner 27/10/2026). */
export const STAFF_TABLES = ['employees', 'salary_changes', 'salary_certs'];
const snake = (k: string) => k.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);

export function snap(row: Record<string, unknown> | null | undefined): Record<string, unknown> | null {
  if (!row) return null;
  const out: Record<string, unknown> = {};
  for (const [k0, v] of Object.entries(row)) {
    const k = snake(k0);
    if (SKIP.has(k)) continue;
    if (IMAGES.has(k)) out[k] = v ? 'img:' + crypto.createHash('md5').update(String(v)).digest('hex') : '';
    else if (LISTS.has(k) && typeof v === 'string') { try { out[k] = JSON.parse(v); } catch { out[k] = []; } }
    else out[k] = v instanceof Date ? v.toISOString() : v;
  }
  return out;
}

export async function audit(
  req: Request, action: string, tableName: string, recordId: string, recordLabel: string,
  before?: Record<string, unknown> | null, after?: Record<string, unknown> | null, raw = false,
) {
  const o = raw ? before ?? null : snap(before);
  const n = raw ? after ?? null : snap(after);
  if (action === 'update' && o && n && JSON.stringify(o) === JSON.stringify(n)) return;
  await prisma.auditLog.create({
    data: {
      actorId: req.user?.id ?? null, actorName: req.user?.name ?? '', action, tableName, recordId, recordLabel,
      oldData: o ? JSON.stringify(o) : null, newData: n ? JSON.stringify(n) : null,
    },
  });
}
