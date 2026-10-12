import { Router } from 'express';
import { z } from 'zod';
import type { Receipt, Setting } from '@prisma/client';
import { prisma } from '../lib/db.js';
import { bad, notFound } from '../lib/http.js';
import { can, requireAuth, requirePerm } from '../lib/auth.js';
import { audit } from '../lib/audit.js';
import { storeImage } from '../lib/images.js';
import { isDate, todayBkk } from '../lib/dates.js';

// Receipts for class purchases and the company details printed on them (owner 12/10/2026).
export const router = Router();

const id = z.string().uuid();
const text = (max = 200) => z.string().trim().max(max);

export const receiptOut = (r: Receipt) => ({
  id: r.id, no: r.no, date: r.date, studentId: r.studentId, enrollmentId: r.enrollmentId, classId: r.classId, item: r.item,
  months: r.months, startDate: r.startDate, expiryDate: r.expiryDate, price: r.price, discount: r.discount, amount: r.amount,
  method: r.method, slip: r.slip, payer: r.payer, remark: r.remark, receivedByName: r.receivedByName,
  cancelled: !!r.cancelledAt, cancelledAt: r.cancelledAt?.toISOString() ?? '', cancelReason: r.cancelReason, cancelledBy: r.cancelledBy,
  createdAt: r.createdAt.toISOString(),
});
const companyOut = (s: Setting | null) => ({
  name: s?.companyName ?? '', nameEn: s?.companyNameEn ?? '', address: s?.companyAddress ?? '', phone: s?.companyPhone ?? '',
  email: s?.companyEmail ?? '', taxId: s?.companyTaxId ?? '', branch: s?.companyBranch ?? '', logo: s?.receiptLogo ?? '', sign: s?.receiptSign ?? '',
});

// ---------- company settings ----------
router.get('/settings/company', requirePerm('company', 'view'), async (_req, res) => {
  res.json(companyOut(await prisma.setting.findUnique({ where: { id: 1 } })));
});
router.put('/settings/company', requirePerm('company', 'edit'), async (req, res) => {
  const b = z.object({
    name: text(300), nameEn: text(300), address: text(1000), phone: text(50), email: text(255),
    taxId: z.string().trim().refine((v) => v === '' || /^\d{13}$/.test(v), 'tax_id_format'), branch: text(100),
    logo: z.string().max(12_000_000), sign: z.string().max(12_000_000),
  }).parse(req.body);
  const before = await prisma.setting.findUnique({ where: { id: 1 } });
  const data = {
    companyName: b.name, companyNameEn: b.nameEn, companyAddress: b.address, companyPhone: b.phone, companyEmail: b.email,
    companyTaxId: b.taxId, companyBranch: b.branch, receiptLogo: storeImage(b.logo), receiptSign: storeImage(b.sign),
  };
  const after = await prisma.setting.upsert({ where: { id: 1 }, create: { id: 1, ...data }, update: data });
  await audit(req, 'update', 'settings', '1', 'Company', before, after);
  res.json(companyOut(after));
});

// ---------- receipts ----------
const month = z.string().regex(/^\d{4}-\d{2}$/);
router.get('/receipts', requirePerm('receipts', 'view'), async (req, res) => {
  const q = z.object({ month: month.optional(), enrollmentId: id.optional(), studentId: id.optional() }).parse(req.query);
  const where = q.enrollmentId ? { enrollmentId: q.enrollmentId } : q.studentId ? { studentId: q.studentId } : { date: { startsWith: q.month ?? todayBkk().slice(0, 7) } };
  const rows = await prisma.receipt.findMany({ where, orderBy: [{ date: 'desc' }, { seq: 'desc' }] });
  res.json(rows.map(receiptOut));
});

// One month's money in (cancelled receipts count for nothing). Used by the receipts page and the dashboard.
router.get('/receipts/summary', requireAuth, async (req, res) => {
  if (!(await can(req.user, 'receipts', 'view')) && !(await can(req.user, 'money', 'view'))) throw notFound();
  const m = month.parse(req.query.month ?? todayBkk().slice(0, 7));
  const rows = await prisma.receipt.findMany({ where: { date: { startsWith: m } } });
  const live = rows.filter((r) => !r.cancelledAt);
  const by = (k: string) => live.filter((r) => r.method === k).reduce((t, r) => t + r.amount, 0);
  res.json({ month: m, total: live.reduce((t, r) => t + r.amount, 0), count: live.length, cancelled: rows.length - live.length, cash: by('cash'), transfer: by('transfer'), card: by('card') });
});

router.get('/receipts/:id', requirePerm('receipts', 'view'), async (req, res) => {
  const r = await prisma.receipt.findUnique({ where: { id: id.parse(req.params.id) } });
  if (!r) throw notFound();
  const [student, setting] = await Promise.all([prisma.student.findUnique({ where: { id: r.studentId } }), prisma.setting.findUnique({ where: { id: 1 } })]);
  res.json({
    receipt: receiptOut(r), company: companyOut(setting),
    student: student ? { code: student.code, prefix: student.prefix, firstName: student.firstName, lastName: student.lastName } : null,
  });
});

const ymOf = (d: string) => d.slice(2, 4) + d.slice(5, 7);

router.post('/receipts', requirePerm('receipts', 'add'), async (req, res) => {
  const b = z.object({
    enrollmentId: id, date: z.string().refine(isDate, 'date_format'), price: z.number().min(0).max(10_000_000),
    discount: z.number().min(0).max(10_000_000).default(0), method: z.enum(['cash', 'transfer', 'card']),
    slip: z.string().max(12_000_000).default(''), payer: text(200).default(''), remark: text(500).default(''),
  }).parse(req.body);
  if (b.discount > b.price) throw bad('discount_too_big');
  const e = await prisma.enrollment.findUnique({ where: { id: b.enrollmentId } });
  if (!e) throw notFound();
  const [s, c, me] = await Promise.all([
    prisma.student.findFirst({ where: { id: e.studentId, deletedAt: null } }),
    prisma.danceClass.findUnique({ where: { id: e.classId } }),
    prisma.user.findUnique({ where: { id: req.user!.id } }),
  ]);
  if (!s || !c) throw notFound();
  const slip = storeImage(b.slip);
  const ym = ymOf(b.date);
  // Numbers never skip: the next one in the receipt's month, worked out inside the write.
  const r = await prisma.$transaction(async (db) => {
    const last = await db.receipt.findFirst({ where: { ym }, orderBy: { seq: 'desc' } });
    const seq = (last?.seq ?? 0) + 1;
    return db.receipt.create({ data: {
      no: `RC${ym}-${String(seq).padStart(4, '0')}`, ym, seq, date: b.date, studentId: s.id, enrollmentId: e.id, classId: c.id,
      item: c.name, months: c.months, startDate: e.startDate, expiryDate: e.expiryDate, price: b.price, discount: b.discount,
      amount: Math.round((b.price - b.discount) * 100) / 100, method: b.method, slip, payer: b.payer, remark: b.remark,
      receivedById: req.user!.id, receivedByName: [me?.firstName, me?.lastName].filter(Boolean).join(' ') || req.user!.name,
    } });
  });
  await audit(req, 'insert', 'receipts', r.id, `${r.no} ${s.code}`, null, r);
  res.status(201).json(receiptOut(r));
});

router.post('/receipts/:id/cancel', requirePerm('receipts', 'delete'), async (req, res) => {
  const before = await prisma.receipt.findUnique({ where: { id: id.parse(req.params.id) } });
  if (!before) throw notFound();
  if (before.cancelledAt) throw bad('already_cancelled');
  const { reason } = z.object({ reason: text(300).default('') }).parse(req.body);
  const after = await prisma.receipt.update({ where: { id: before.id }, data: { cancelledAt: new Date(), cancelReason: reason, cancelledBy: req.user!.name } });
  await audit(req, 'update', 'receipts', after.id, after.no, before, after);
  res.json(receiptOut(after));
});
