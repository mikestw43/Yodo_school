import { Router } from 'express';
import { z } from 'zod';
import type { CoursePurchase, Prisma, Receipt, Setting } from '@prisma/client';
import { prisma } from '../lib/db.js';
import { bad, notFound } from '../lib/http.js';
import { can, requireAuth, requirePerm } from '../lib/auth.js';
import { audit } from '../lib/audit.js';
import { storeImage } from '../lib/images.js';
import { isDate, todayBkk } from '../lib/dates.js';
import { cancelPurchases, discountOf, purchaseOut, removePurchases } from './courses.js';

// Receipts for class purchases and the company details printed on them (owner 12/10/2026).
export const router = Router();

const id = z.string().uuid();
const text = (max = 200) => z.string().trim().max(max);

export const receiptOut = (r: Receipt, lines?: CoursePurchase[]) => ({
  id: r.id, no: r.no, date: r.date, studentId: r.studentId, enrollmentId: r.enrollmentId, classId: r.classId, item: r.item,
  months: r.months, startDate: r.startDate, expiryDate: r.expiryDate, price: r.price, discount: r.discount, amount: r.amount,
  method: r.method, slip: r.slip, payer: r.payer, remark: r.remark, receivedByName: r.receivedByName,
  cancelled: !!r.cancelledAt, cancelledAt: r.cancelledAt?.toISOString() ?? '', cancelReason: r.cancelReason, cancelledBy: r.cancelledBy,
  createdAt: r.createdAt.toISOString(),
  ...(lines ? { lines: lines.map((p) => purchaseOut(p, true, r.no)) } : {}),
});
const companyOut = (s: Setting | null) => ({
  name: s?.companyName ?? '', nameEn: s?.companyNameEn ?? '', address: s?.companyAddress ?? '', phone: s?.companyPhone ?? '',
  email: s?.companyEmail ?? '', taxId: s?.companyTaxId ?? '', branch: s?.companyBranch ?? '', logo: s?.receiptLogo ?? '', sign: s?.receiptSign ?? '', stamp: s?.receiptStamp ?? '', signName: s?.receiptSignName ?? '',
});

// ---------- company settings ----------
router.get('/settings/company', requirePerm('company', 'view'), async (_req, res) => {
  res.json(companyOut(await prisma.setting.findUnique({ where: { id: 1 } })));
});
router.put('/settings/company', requirePerm('company', 'edit'), async (req, res) => {
  const b = z.object({
    name: text(300), nameEn: text(300), address: text(1000), phone: text(50), email: text(255),
    taxId: z.string().trim().refine((v) => v === '' || /^\d{13}$/.test(v), 'tax_id_format'), branch: text(100),
    logo: z.string().max(12_000_000), sign: z.string().max(12_000_000), stamp: z.string().max(12_000_000).default(''), signName: text(200).default(''),
  }).parse(req.body);
  const before = await prisma.setting.findUnique({ where: { id: 1 } });
  const data = {
    companyName: b.name, companyNameEn: b.nameEn, companyAddress: b.address, companyPhone: b.phone, companyEmail: b.email,
    companyTaxId: b.taxId, companyBranch: b.branch, receiptLogo: storeImage(b.logo), receiptSign: storeImage(b.sign), receiptStamp: storeImage(b.stamp), receiptSignName: b.signName,
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
  res.json(rows.map((r) => receiptOut(r)));
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
  const lines = await prisma.coursePurchase.findMany({ where: { receiptId: r.id }, orderBy: { createdAt: 'asc' } });
  res.json({
    receipt: receiptOut(r, lines), company: companyOut(setting), editable: await isNewest(r),
    student: student ? { code: student.code, prefix: student.prefix, firstName: student.firstName, lastName: student.lastName } : null,
  });
});

const ymOf = (d: string) => d.slice(2, 4) + d.slice(5, 7);

/** The next receipt number in the month of `date`. Call inside the write so numbers never skip. */
export async function nextReceiptNo(db: Prisma.TransactionClient, date: string) {
  const ym = ymOf(date);
  const last = await db.receipt.findFirst({ where: { ym }, orderBy: { seq: 'desc' } });
  const seq = (last?.seq ?? 0) + 1;
  return { ym, seq, no: `RC${ym}-${String(seq).padStart(4, '0')}` };
}

/** Only the newest receipt of THIS month can be edited or deleted (no receipt after it yet; owner 12/10/2026:
 *  last month's are final). Older ones can only be cancelled. */
async function isNewest(r: Receipt, db: Prisma.TransactionClient = prisma) {
  if (r.cancelledAt || r.ym !== ymOf(todayBkk())) return false;
  return !(await db.receipt.findFirst({ where: { ym: r.ym, seq: { gt: r.seq } } }));
}

// Receipts are made by POST /courses/buy (one receipt, one or more courses; routes/courses.ts).

router.post('/receipts/:id/cancel', requirePerm('receipts', 'delete'), async (req, res) => {
  const before = await prisma.receipt.findUnique({ where: { id: id.parse(req.params.id) } });
  if (!before) throw notFound();
  if (before.cancelledAt) throw bad('already_cancelled');
  const { reason } = z.object({ reason: text(300).default('') }).parse(req.body);
  const after = await prisma.$transaction(async (db) => {
    const r = await db.receipt.update({ where: { id: before.id }, data: { cancelledAt: new Date(), cancelReason: reason, cancelledBy: req.user!.name } });
    await cancelPurchases(db, r.id);
    return r;
  });
  await audit(req, 'update', 'receipts', after.id, after.no, before, after);
  res.json(receiptOut(after));
});

const round2 = (n: number) => Math.round(n * 100) / 100;

// Edit the newest receipt: money, how it was paid, the date within the same month, payer, remark, slip.
// The courses and their dates stay; to change those, delete the receipt and buy again.
router.put('/receipts/:id', requirePerm('receipts', 'edit'), async (req, res) => {
  const before = await prisma.receipt.findUnique({ where: { id: id.parse(req.params.id) } });
  if (!before) throw notFound();
  const b = z.object({
    date: z.string().refine(isDate, 'date_format'), method: z.enum(['cash', 'transfer', 'card']), slip: z.string().max(12_000_000).default(''),
    payer: text(200).default(''), remark: text(500).default(''),
    lines: z.array(z.object({ id, price: z.number().min(0).max(10_000_000), discountType: z.enum(['baht', 'pct']), discountValue: z.number().min(0).max(10_000_000) })).min(1),
  }).parse(req.body);
  if (ymOf(b.date) !== before.ym) throw bad('receipt_same_month');
  const lines = await prisma.coursePurchase.findMany({ where: { receiptId: before.id }, orderBy: { createdAt: 'asc' } });
  if (lines.length !== b.lines.length || !b.lines.every((l) => lines.some((p) => p.id === l.id))) throw bad('receipt_lines');
  const money = b.lines.map((l) => { const discount = discountOf(l.price, l.discountType, l.discountValue); return { ...l, discount, amount: round2(l.price - discount) }; });
  const slip = b.method === 'transfer' ? storeImage(b.slip) : '';
  const after = await prisma.$transaction(async (db) => {
    const now = await db.receipt.findUnique({ where: { id: before.id } });
    if (!now || !(await isNewest(now, db))) throw bad('receipt_not_newest');
    for (const m of money) await db.coursePurchase.update({ where: { id: m.id }, data: { price: m.price, discountType: m.discountType, discountValue: m.discountValue, discount: m.discount, amount: m.amount, date: b.date } });
    return db.receipt.update({ where: { id: before.id }, data: {
      date: b.date, method: b.method, slip, payer: b.payer, remark: b.remark,
      price: round2(money.reduce((t, m) => t + m.price, 0)), discount: round2(money.reduce((t, m) => t + m.discount, 0)), amount: round2(money.reduce((t, m) => t + m.amount, 0)),
    } });
  });
  await audit(req, 'update', 'receipts', after.id, after.no, before, after);
  res.json(receiptOut(after));
});

// Delete the newest receipt: its number is free for the next one, its courses are taken back.
router.post('/receipts/:id/delete', requirePerm('receipts', 'edit'), async (req, res) => {
  const before = await prisma.receipt.findUnique({ where: { id: id.parse(req.params.id) } });
  if (!before) throw notFound();
  await prisma.$transaction(async (db) => {
    const now = await db.receipt.findUnique({ where: { id: before.id } });
    if (!now || !(await isNewest(now, db))) throw bad('receipt_not_newest');
    await removePurchases(db, before.id);
    await db.receipt.delete({ where: { id: before.id } });
  });
  await audit(req, 'delete', 'receipts', before.id, before.no, before, null);
  res.json({ ok: true });
});
