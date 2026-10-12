import { Router } from 'express';
import express from 'express';
import { prisma } from '../lib/db.js';
import { bad, forbidden } from '../lib/http.js';
import { isAllPowerful, requireAuth } from '../lib/auth.js';
import { audit } from '../lib/audit.js';
import { storeImage } from '../lib/images.js';
import { isDate } from '../lib/dates.js';

// Brings the students over from the old Lovable app: the "students" table exported as CSV or JSON
// (Lovable Cloud > Database > students > Export). Existing ids and codes are skipped, so running it
// twice adds nothing twice. SuperAdmin only.
export const router = Router();

// RFC 4180 CSV: quoted fields may hold commas, quotes ("") and new lines.
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [], field = '', q = false;
  const s = text.replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i]!;
    if (q) {
      if (c === '"') { if (s[i + 1] === '"') { field += '"'; i++; } else q = false; }
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some((x) => x !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((x) => x !== '')) rows.push(row);
  const [head, ...body] = rows;
  if (!head) return [];
  return body.map((r) => Object.fromEntries(head.map((h, i) => [h.trim(), r[i] ?? ''])));
}

const camel = (k: string) => k.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
const str = (v: unknown) => (v === null || v === undefined ? '' : String(v)).trim();
const bool = (v: unknown) => v === true || /^(true|t|1|yes)$/i.test(str(v));
// Lovable's export writes dates as dd/mm/yyyy (or yyyy-mm-dd); kept as YYYY-MM-DD.
const dmy = (v: unknown) => {
  const s = str(v);
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s);
  return m ? `${m[3]}-${m[2]!.padStart(2, '0')}-${m[1]!.padStart(2, '0')}` : s.slice(0, 10);
};
const day = (v: unknown) => { const d = dmy(v); return isDate(d) ? d : ''; };
// "25/01/2026 07:00" is Bangkok time; ISO text is read as it is.
function when(v: unknown) {
  const s = str(v);
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ T](\d{1,2}):(\d{2}))?/.exec(s);
  if (m) return new Date(`${dmy(s)}T${(m[4] ?? '0').padStart(2, '0')}:${m[5] ?? '00'}:00+07:00`);
  return new Date(s);
}
// Arrays come as JSON (["Ballet"]) or Postgres text ({Ballet,"Hip Hop"}).
function arr(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(str).filter(Boolean);
  const s = str(v);
  if (!s) return [];
  if (s.startsWith('[')) { try { return (JSON.parse(s) as unknown[]).map(str).filter(Boolean); } catch { return []; } }
  if (s.startsWith('{') && s.endsWith('}')) return (s.slice(1, -1).match(/"((?:[^"\\]|\\.)*)"|[^,]+/g) ?? []).map((x) => x.replace(/^"|"$/g, '').replace(/\\"/g, '"').trim()).filter(Boolean);
  return s.split(',').map((x) => x.trim()).filter(Boolean);
}
function picture(v: unknown) {
  const s = str(v);
  if (!s.startsWith('data:image/')) return '';
  try { return storeImage(s); } catch { return ''; }
}

export function readRows(text: string): Record<string, unknown>[] {
  const t = text.trim();
  if (!t) return [];
  if (t.startsWith('[') || t.startsWith('{')) {
    let j: unknown;
    try { j = JSON.parse(t); } catch { throw bad('bad_file'); }
    const list = Array.isArray(j) ? j : (j as { students?: unknown }).students;
    if (!Array.isArray(list)) throw bad('bad_file');
    return list as Record<string, unknown>[];
  }
  return parseCsv(t);
}

router.post('/import/students', requireAuth, express.text({ type: '*/*', limit: '300mb' }), async (req, res) => {
  if (!(await isAllPowerful(req.user!))) throw forbidden();
  const rows = readRows(typeof req.body === 'string' ? req.body : '').map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [camel(k.trim()), v])));
  if (!rows.length) throw bad('empty_file');
  if (!rows.some((r) => 'firstName' in r && 'code' in r)) throw bad('not_students');
  const dryRun = req.query.dry === '1';
  const out = { total: rows.length, added: 0, skipped: [] as { code: string; reason: string }[] };
  for (const r of rows) {
    const code = str(r.code), firstName = str(r.firstName);
    if (!code || !firstName) { out.skipped.push({ code, reason: 'missing' }); continue; }
    const rid = /^[0-9a-f-]{36}$/i.test(str(r.id)) ? str(r.id) : undefined;
    if (await prisma.student.findFirst({ where: { OR: [{ code }, ...(rid ? [{ id: rid }] : [])] } })) { out.skipped.push({ code, reason: 'exists' }); continue; }
    if (dryRun) { out.added++; continue; }
    const deleted = bool(r.delFlg);
    const created = when(r.createdAt);
    const s = await prisma.student.create({ data: {
      ...(rid ? { id: rid } : {}), code, firstName, prefix: str(r.prefix), lastName: str(r.lastName), nickname: str(r.nickname), dob: day(r.dob),
      nationality: str(r.nationality), nationalityOther: str(r.nationalityOther), religion: str(r.religion), address: str(r.address),
      phone: str(r.phone), email: str(r.email), lineId: str(r.lineId), emergencyName: str(r.emergencyName), emergencyPhone: str(r.emergencyPhone),
      relationship: str(r.relationship), image: picture(r.image), interested: JSON.stringify(arr(r.interested)), hasExperience: bool(r.hasExperience),
      experienceDetail: str(r.experienceDetail), source: str(r.source), sourceOther: str(r.sourceOther),
      status: str(r.status) === 'Disabled' ? 'Disabled' : 'Active', signature: picture(r.signature), signedAt: day(r.signedAt),
      ...(Number.isNaN(created.getTime()) ? {} : { createdAt: created }), ...(deleted ? { deletedAt: new Date() } : {}),
    } });
    await audit(req, 'insert', 'students', s.id, [s.code, s.firstName, s.lastName].join(' '), null, s);
    out.added++;
  }
  res.json(out);
});
