import { Router } from 'express';
import { z } from 'zod';
import type { Employee, Prisma, SalaryChange, SalaryCert } from '@prisma/client';
import { prisma } from '../lib/db.js';
import { bad, notFound } from '../lib/http.js';
import { requireAuth, requireOwner } from '../lib/auth.js';
import { audit } from '../lib/audit.js';
import { storeImage } from '../lib/images.js';
import { isDate, todayBkk } from '../lib/dates.js';
import { decrypt, encrypt } from '../lib/crypto.js';
import { certPdf, type CertData } from '../lib/cert-pdf.js';

// Office staff records, salary history and salary certificates (owner 27/10/2026, mockup Fj7itm8uCcAiGSyo6rEeHw v2).
// Not the teachers. Only the Owner / SuperAdmin may see or change any of it (no permission chip).
export const router = Router();
router.use(['/employees', '/salary-certs', '/settings/cert-signer'], requireAuth, requireOwner);

const id = z.string().uuid();
const text = (max = 200) => z.string().trim().max(max);
const date = z.string().refine(isDate, 'date_format');
const optDate = z.string().refine((v) => v === '' || isDate(v), 'date_format');
const money = z.number().finite().min(0).max(100_000_000);

const last4 = (v: string) => v.replace(/\D/g, '').slice(-4);

/** The salary in force today: the newest change that has started, else the first one. */
export function salaryNow(changes: SalaryChange[], fallback: number, today = todayBkk()) {
  const sorted = [...changes].sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom) || a.createdAt.getTime() - b.createdAt.getTime());
  const started = sorted.filter((c) => c.effectiveFrom <= today);
  return (started.at(-1) ?? sorted[0])?.amount ?? fallback;
}

const statusOf = (e: Employee, today = todayBkk()) => (e.endDate && e.endDate <= today ? 'left' : 'active');

const employeeOut = (e: Employee, full = false) => ({
  id: e.id, code: e.code, image: e.image, prefix: e.prefix, firstName: e.firstName, lastName: e.lastName,
  prefixEn: e.prefixEn, firstNameEn: e.firstNameEn, lastNameEn: e.lastNameEn, nickname: e.nickname,
  nationalIdLast4: e.nationalIdLast4, birthDate: e.birthDate, phone: e.phone, email: e.email, address: e.address,
  emergencyName: e.emergencyName, emergencyPhone: e.emergencyPhone, emergencyRelation: e.emergencyRelation,
  position: e.position, positionEn: e.positionEn, empType: e.empType, startDate: e.startDate, salary: e.salary,
  bankName: e.bankName, bankAccountLast4: e.bankAccountLast4, endDate: e.endDate, endReason: e.endReason, note: e.note,
  status: statusOf(e), createdAt: e.createdAt.toISOString(),
  ...(full ? { nationalId: decrypt(e.nationalIdEnc), bankAccount: decrypt(e.bankAccountEnc) } : {}),
});
const changeOut = (c: SalaryChange) => ({ id: c.id, effectiveFrom: c.effectiveFrom, amount: c.amount, prevAmount: c.prevAmount, reason: c.reason, createdBy: c.createdBy, createdAt: c.createdAt.toISOString() });
const certOut = (c: SalaryCert) => ({
  id: c.id, employeeId: c.employeeId, no: c.no, date: c.date, lang: c.lang, showId: c.showId, salary: c.salary,
  data: JSON.parse(c.data) as CertData, createdBy: c.createdBy, createdAt: c.createdAt.toISOString(),
  cancelled: !!c.cancelledAt, cancelledAt: c.cancelledAt?.toISOString() ?? '', cancelReason: c.cancelReason, cancelledBy: c.cancelledBy,
});

/** Audit rows never carry the ID card or bank numbers, only their last 4. */
const auditRow = (e: Employee | null) => {
  if (!e) return null;
  const { nationalIdEnc: _n, bankAccountEnc: _b, ...rest } = e;
  return rest;
};
const label = (e: { code: string; firstName: string; lastName: string }) => `${e.code} ${e.firstName} ${e.lastName}`.trim();

const body = z.object({
  image: z.string().max(12_000_000).default(''),
  prefix: text(30).default(''), firstName: text(100).pipe(z.string().min(1, 'first_name_required')), lastName: text(100).default(''),
  prefixEn: text(30).default(''), firstNameEn: text(100).default(''), lastNameEn: text(100).default(''), nickname: text(50).default(''),
  nationalId: z.string().trim().default('').refine((v) => v === '' || /^\d{13}$/.test(v.replace(/[\s-]/g, '')), 'national_id_format'),
  birthDate: optDate.default(''), phone: text(30).default(''), email: text(255).default(''), address: text(1000).default(''),
  emergencyName: text(200).default(''), emergencyPhone: text(30).default(''), emergencyRelation: text(100).default(''),
  position: text(200).default(''), positionEn: text(200).default(''), empType: z.enum(['full', 'part']).default('full'),
  startDate: date, bankName: text(100).default(''), bankAccount: text(30).default(''),
  endDate: optDate.default(''), endReason: text(500).default(''), note: text(2000).default(''),
});
const dataOf = (b: z.infer<typeof body>) => {
  const nid = b.nationalId.replace(/[\s-]/g, '');
  return {
    image: storeImage(b.image), prefix: b.prefix, firstName: b.firstName, lastName: b.lastName, prefixEn: b.prefixEn,
    firstNameEn: b.firstNameEn, lastNameEn: b.lastNameEn, nickname: b.nickname,
    nationalIdEnc: encrypt(nid), nationalIdLast4: last4(nid), birthDate: b.birthDate, phone: b.phone, email: b.email, address: b.address,
    emergencyName: b.emergencyName, emergencyPhone: b.emergencyPhone, emergencyRelation: b.emergencyRelation,
    position: b.position, positionEn: b.positionEn, empType: b.empType, startDate: b.startDate,
    bankName: b.bankName, bankAccountEnc: encrypt(b.bankAccount), bankAccountLast4: last4(b.bankAccount),
    endDate: b.endDate, endReason: b.endDate ? b.endReason : '', note: b.note,
  };
};

async function nextCode(db: Prisma.TransactionClient) {
  const all = await db.employee.findMany({ select: { code: true } }); // deleted ones too: codes are never reused
  const n = Math.max(0, ...all.map((e) => Number(e.code.replace(/\D/g, '')) || 0)) + 1;
  return `EMP${String(n).padStart(3, '0')}`;
}
async function getEmployee(eid: string) {
  const e = await prisma.employee.findFirst({ where: { id: eid, deletedAt: null } });
  if (!e) throw notFound();
  return e;
}

router.get('/employees', async (_req, res) => {
  const rows = await prisma.employee.findMany({ where: { deletedAt: null }, orderBy: { code: 'asc' } });
  res.json(rows.map((e) => employeeOut(e)));
});

router.get('/employees/:id', async (req, res) => {
  const e = await getEmployee(id.parse(req.params.id));
  const [changes, certs] = await Promise.all([
    prisma.salaryChange.findMany({ where: { employeeId: e.id }, orderBy: [{ effectiveFrom: 'desc' }, { createdAt: 'desc' }] }),
    prisma.salaryCert.findMany({ where: { employeeId: e.id }, orderBy: [{ date: 'desc' }, { createdAt: 'desc' }] }),
  ]);
  res.json({ employee: employeeOut(e, true), salaryChanges: changes.map(changeOut), certs: certs.map(certOut) });
});

router.post('/employees', async (req, res) => {
  const b = body.extend({ salary: money, salaryFrom: optDate.default('') }).parse(req.body);
  const e = await prisma.$transaction(async (db) => {
    const e = await db.employee.create({ data: { code: await nextCode(db), ...dataOf(b), salary: b.salary } });
    await db.salaryChange.create({ data: { employeeId: e.id, effectiveFrom: b.salaryFrom || b.startDate, amount: b.salary, prevAmount: 0, reason: '', createdBy: req.user!.name } });
    return e;
  });
  await audit(req, 'insert', 'employees', e.id, label(e), null, auditRow(e));
  res.status(201).json(employeeOut(e, true));
});

router.put('/employees/:id', async (req, res) => {
  const before = await getEmployee(id.parse(req.params.id));
  const b = body.parse(req.body);
  const after = await prisma.employee.update({ where: { id: before.id }, data: dataOf(b) });
  await audit(req, 'update', 'employees', after.id, label(after), auditRow(before), auditRow(after));
  res.json(employeeOut(after, true));
});

router.delete('/employees/:id', async (req, res) => {
  const before = await getEmployee(id.parse(req.params.id));
  const after = await prisma.employee.update({ where: { id: before.id }, data: { deletedAt: new Date() } });
  await audit(req, 'delete', 'employees', after.id, label(after), auditRow(before), null);
  res.json({ ok: true });
});

// ---------- salary ----------
async function refreshSalary(db: Prisma.TransactionClient, eid: string) {
  const changes = await db.salaryChange.findMany({ where: { employeeId: eid } });
  const e = await db.employee.findUniqueOrThrow({ where: { id: eid } });
  return db.employee.update({ where: { id: eid }, data: { salary: salaryNow(changes, e.salary) } });
}

router.post('/employees/:id/salary', async (req, res) => {
  const e = await getEmployee(id.parse(req.params.id));
  const b = z.object({ effectiveFrom: date, amount: money, reason: text(500).default('') }).parse(req.body);
  const { change, after } = await prisma.$transaction(async (db) => {
    const prev = salaryNow(await db.salaryChange.findMany({ where: { employeeId: e.id, effectiveFrom: { lt: b.effectiveFrom } } }), e.salary, b.effectiveFrom);
    const change = await db.salaryChange.create({ data: { employeeId: e.id, effectiveFrom: b.effectiveFrom, amount: b.amount, prevAmount: prev, reason: b.reason, createdBy: req.user!.name } });
    return { change, after: await refreshSalary(db, e.id) };
  });
  await audit(req, 'insert', 'salary_changes', change.id, label(e), null, { ...change, employee: e.code });
  res.status(201).json({ change: changeOut(change), salary: after.salary });
});

router.delete('/employees/:id/salary/:cid', async (req, res) => {
  const e = await getEmployee(id.parse(req.params.id));
  const c = await prisma.salaryChange.findFirst({ where: { id: id.parse(req.params.cid), employeeId: e.id } });
  if (!c) throw notFound();
  if ((await prisma.salaryChange.count({ where: { employeeId: e.id } })) <= 1) throw bad('last_salary');
  const after = await prisma.$transaction(async (db) => { await db.salaryChange.delete({ where: { id: c.id } }); return refreshSalary(db, e.id); });
  await audit(req, 'delete', 'salary_changes', c.id, label(e), { ...c, employee: e.code }, null);
  res.json({ ok: true, salary: after.salary });
});

// ---------- who signs ----------
const signerOut = (s: { certSignName: string; certSignNameEn: string; certSignTitle: string; certSignTitleEn: string } | null) => ({
  name: s?.certSignName ?? '', nameEn: s?.certSignNameEn ?? '', title: s?.certSignTitle ?? '', titleEn: s?.certSignTitleEn ?? '',
});
router.get('/settings/cert-signer', async (_req, res) => {
  res.json(signerOut(await prisma.setting.findUnique({ where: { id: 1 } })));
});
router.put('/settings/cert-signer', async (req, res) => {
  const b = z.object({ name: text(200), nameEn: text(200), title: text(200), titleEn: text(200) }).parse(req.body);
  const before = await prisma.setting.findUnique({ where: { id: 1 } });
  const data = { certSignName: b.name, certSignNameEn: b.nameEn, certSignTitle: b.title, certSignTitleEn: b.titleEn };
  const after = await prisma.setting.upsert({ where: { id: 1 }, create: { id: 1, ...data }, update: data });
  await audit(req, 'update', 'settings', '1', 'Certificate signer', signerOut(before), signerOut(after), true);
  res.json(signerOut(after));
});

// ---------- salary certificates ----------
const ymOf = (d: string) => d.slice(2, 4) + d.slice(5, 7);

router.post('/employees/:id/certs', async (req, res) => {
  const e = await getEmployee(id.parse(req.params.id));
  const b = z.object({ lang: z.enum(['th', 'en']), showId: z.boolean(), salary: money.refine((n) => n > 0, 'salary_required') }).parse(req.body);
  const today = todayBkk();
  if (statusOf(e, today) === 'left') throw bad('employee_left');
  if (b.lang === 'en' && !e.firstNameEn) throw bad('english_name_missing');
  if (b.showId && !e.nationalIdLast4) throw bad('national_id_missing');
  const s = await prisma.setting.findUnique({ where: { id: 1 } });
  const data: CertData = {
    prefix: e.prefix, firstName: e.firstName, lastName: e.lastName, prefixEn: e.prefixEn, firstNameEn: e.firstNameEn, lastNameEn: e.lastNameEn,
    nationalId: b.showId ? decrypt(e.nationalIdEnc) : '', position: e.position, positionEn: e.positionEn || e.position,
    empType: e.empType, startDate: e.startDate,
    company: {
      name: s?.companyName ?? '', nameEn: s?.companyNameEn ?? '', address: s?.companyAddress ?? '', phone: s?.companyPhone ?? '',
      email: s?.companyEmail ?? '', taxId: s?.companyTaxId ?? '', branch: s?.companyBranch ?? '', logo: s?.receiptLogo ?? '',
      sign: s?.receiptSign ?? '', stamp: s?.receiptStamp ?? '',
    },
    signer: signerOut(s),
  };
  const c = await prisma.$transaction(async (db) => {
    const ym = ymOf(today);
    const last = await db.salaryCert.findFirst({ where: { ym }, orderBy: { seq: 'desc' } });
    const seq = (last?.seq ?? 0) + 1;
    return db.salaryCert.create({ data: { employeeId: e.id, no: `CE${ym}-${String(seq).padStart(4, '0')}`, ym, seq, date: today, lang: b.lang, showId: b.showId, salary: b.salary, data: JSON.stringify(data), createdBy: req.user!.name } });
  });
  const { data: _d, ...row } = c;
  await audit(req, 'insert', 'salary_certs', c.id, `${c.no} ${label(e)}`, null, row);
  res.status(201).json(certOut(c));
});

async function getCert(cid: string) {
  const c = await prisma.salaryCert.findUnique({ where: { id: cid } });
  if (!c) throw notFound();
  return c;
}
router.get('/salary-certs/:id', async (req, res) => {
  res.json(certOut(await getCert(id.parse(req.params.id))));
});
router.post('/salary-certs/:id/cancel', async (req, res) => {
  const c = await getCert(id.parse(req.params.id));
  if (c.cancelledAt) throw bad('cert_cancelled');
  const b = z.object({ reason: text(500).pipe(z.string().min(1, 'reason_required')) }).parse(req.body);
  const after = await prisma.salaryCert.update({ where: { id: c.id }, data: { cancelledAt: new Date(), cancelReason: b.reason, cancelledBy: req.user!.name } });
  const { data: _a, ...o } = c, { data: _b, ...n } = after;
  await audit(req, 'update', 'salary_certs', c.id, c.no, o, n);
  res.json(certOut(after));
});
router.get('/salary-certs/:id/pdf', async (req, res) => {
  const c = certOut(await getCert(id.parse(req.params.id)));
  const pdf = await certPdf(c);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="Salary-Certificate-${c.no}.pdf"`);
  res.send(pdf);
});
