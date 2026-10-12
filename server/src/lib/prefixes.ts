import type { Request } from 'express';
import { prisma } from './db.js';
import { audit } from './audit.js';
import { todayBkk } from './dates.js';

// Owner 12/10/2026: student titles are kept as the Thai choices (ด.ญ., ด.ช., นาย, นางสาว, นาง); the form shows both
// languages and the English screens translate them. Titles that came in as English or other spellings are put back.
const CHILD_AGE = 15;
function isChild(dob: string, today: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dob)) return true; // unknown birthday: most students are children (owner)
  const age = Number(today.slice(0, 4)) - Number(dob.slice(0, 4)) - (today.slice(5) < dob.slice(5) ? 1 : 0);
  return age < CHILD_AGE;
}
/** The Thai title for a stored one, or null when it is already a Thai choice or not known. */
export function thaiPrefix(prefix: string, dob: string, today = todayBkk()): string | null {
  const p = prefix.trim().toLowerCase().replace(/\.$/, '');
  if (['ด.ญ.', 'ด.ช.', 'นาย', 'นางสาว', 'นาง'].includes(prefix.trim())) return null;
  const child = isChild(dob, today);
  if (['miss', 'เด็กหญิง', 'ด.ญ', 'dj'].includes(p)) return child ? 'ด.ญ.' : 'นางสาว';
  if (['master', 'mstr', 'เด็กชาย', 'ด.ช', 'dc'].includes(p)) return 'ด.ช.';
  if (['mr', 'mister'].includes(p)) return child ? 'ด.ช.' : 'นาย';
  if (['ms', 'น.ส', 'น.ส.'].includes(p) || prefix.trim() === 'น.ส.') return child ? 'ด.ญ.' : 'นางสาว';
  if (['mrs'].includes(p)) return 'นาง';
  return null;
}

/** Once at start: students' English / other titles become the Thai choice (each change in the audit log). */
export async function ensureThaiPrefixes() {
  const key = 'once:prefix-th';
  if (await prisma.noticeKey.findUnique({ where: { key } })) return;
  const sys = { user: { id: '', name: 'System', username: 'system', role: 'system', positionId: null } } as unknown as Request;
  for (const s of await prisma.student.findMany({ where: { prefix: { not: '' } } })) {
    const to = thaiPrefix(s.prefix, s.dob);
    if (!to) continue;
    const after = await prisma.student.update({ where: { id: s.id }, data: { prefix: to } });
    await audit(sys, 'update', 'students', s.id, `${s.code} ${s.firstName}`, s, after);
  }
  await prisma.noticeKey.create({ data: { key } });
}
