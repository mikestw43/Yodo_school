import { Router, type Request } from 'express';
import { z } from 'zod';
import type { CoursePurchase, Enrollment, Prisma } from '@prisma/client';
import { prisma } from '../lib/db.js';
import { bad, forbidden, notFound } from '../lib/http.js';
import { can, requirePerm } from '../lib/auth.js';
import { audit } from '../lib/audit.js';
import { storeImage } from '../lib/images.js';
import { addDays, isDate, todayBkk } from '../lib/dates.js';
import { notifyAll } from '../lib/notify.js';
import { nextReceiptNo, receiptOut } from './receipts.js';

// Buying courses (several in one receipt), free extensions and the history behind them (owner 12/10/2026,
// mockup WTr5LoqwQAEnSrKDuzZiMi). The Enrollment row keeps the current period; CoursePurchase keeps every step.
export const router = Router();

const id = z.string().uuid();
const day = z.string().refine(isDate, 'date_format');
const text = (max = 200) => z.string().trim().max(max);
const baht = z.number().min(0).max(10_000_000);
const round2 = (n: number) => Math.round(n * 100) / 100;

/** Money is only sent to those who may see it. */
export const purchaseOut = (p: CoursePurchase, money: boolean, receiptNo = '') => ({
  id: p.id, studentId: p.studentId, classId: p.classId, enrollmentId: p.enrollmentId, kind: p.kind, date: p.date, item: p.item,
  months: p.months, weeks: p.weeks, startDate: p.startDate, expiryDate: p.expiryDate, fromExpiry: p.fromExpiry, reason: p.reason, byName: p.byName,
  receiptId: p.receiptId, receiptNo, cancelled: !!p.cancelledAt, createdAt: p.createdAt.toISOString(),
  ...(money ? { price: p.price, discountType: p.discountType, discountValue: p.discountValue, discount: p.discount, amount: p.amount } : {}),
});
export const seesMoney = async (req: Request) => (await can(req.user, 'receipts', 'view')) || (await can(req.user, 'money', 'view'));

const enrollmentOut = (e: Enrollment) => ({
  id: e.id, studentId: e.studentId, classId: e.classId, joinedAt: e.joinedAt.toISOString(), purchaseDate: e.purchaseDate, startDate: e.startDate,
  expiryDate: e.expiryDate, remark: e.remark, receiptImage: e.receiptImage,
});

/** Discount in baht from "10 %" or "500 baht". */
export function discountOf(price: number, type: 'baht' | 'pct', value: number) {
  if (type === 'pct') { if (value > 100) throw bad('discount_too_big'); return round2((price * value) / 100); }
  if (value > price) throw bad('discount_too_big');
  return round2(value);
}

const lineBody = z.object({
  classId: id, startDate: day, expiryDate: day, price: baht,
  discountType: z.enum(['baht', 'pct']).default('baht'), discountValue: baht.default(0),
});
const payBody = z.object({
  date: day, method: z.enum(['cash', 'transfer', 'card']), slip: z.string().max(12_000_000).default(''),
  payer: text(200).default(''), remark: text(500).default(''),
});

router.post('/courses/buy', requirePerm('students', 'edit'), async (req, res) => {
  const b = z.object({ studentId: id, lines: z.array(lineBody).min(1).max(20), pay: payBody.optional() }).parse(req.body);
  if (b.pay && !(await can(req.user, 'receipts', 'add'))) throw forbidden();
  const s = await prisma.student.findFirst({ where: { id: b.studentId, deletedAt: null } });
  if (!s) throw notFound();
  if (new Set(b.lines.map((l) => l.classId)).size !== b.lines.length) throw bad('same_class_twice');
  const classes = await prisma.danceClass.findMany({ where: { id: { in: b.lines.map((l) => l.classId) } } });
  const lines = await Promise.all(b.lines.map(async (l) => {
    const c = classes.find((x) => x.id === l.classId);
    if (!c) throw notFound();
    const e = await prisma.enrollment.findUnique({ where: { studentId_classId: { studentId: s.id, classId: c.id } } });
    if (!e && (c.disabled || c.status !== 'Active')) throw bad('class_closed');
    if (l.expiryDate < l.startDate) throw bad('expiry_before_start');
    const discount = discountOf(l.price, l.discountType, l.discountValue);
    return { ...l, c, e, discount, amount: round2(l.price - discount) };
  }));
  const me = await prisma.user.findUnique({ where: { id: req.user!.id } });
  const byName = [me?.firstName, me?.lastName].filter(Boolean).join(' ') || req.user!.name;
  const date = b.pay?.date ?? todayBkk();
  const slip = b.pay ? storeImage(b.pay.slip) : '';

  const out = await prisma.$transaction(async (db) => {
    const rows: { before: Enrollment | null; after: Enrollment; p: CoursePurchase }[] = [];
    for (const l of lines) {
      // The period so far comes from the history that still counts (a cancelled receipt counts for nothing).
      const all = l.e ? await db.coursePurchase.findMany({ where: { enrollmentId: l.e.id } }) : [];
      const live = all.filter((p) => !p.cancelledAt);
      const gone = all.length > 0 && live.length === 0; // only cancelled rows: start afresh
      const prevExpiry = !l.e || gone ? '' : live.length ? live.reduce((m, p) => (p.expiryDate > m ? p.expiryDate : m), '') : l.e.expiryDate;
      const prevStart = !l.e || gone ? '' : l.e.startDate;
      // Bought again before (or right after) the old period ends: one run of dates, the start stays.
      const joined = !!prevExpiry && l.startDate <= addDays(prevExpiry, 1);
      const startDate = joined && prevStart && prevStart <= l.startDate ? prevStart : l.startDate;
      const expiryDate = joined && prevExpiry > l.expiryDate ? prevExpiry : l.expiryDate;
      const after = l.e
        ? await db.enrollment.update({ where: { id: l.e.id }, data: { purchaseDate: date, startDate, expiryDate } })
        : await db.enrollment.create({ data: { studentId: s.id, classId: l.c.id, purchaseDate: date, startDate, expiryDate } });
      const p = await db.coursePurchase.create({ data: {
        studentId: s.id, classId: l.c.id, enrollmentId: after.id, kind: 'buy', date, item: l.c.name, months: l.c.months, weeks: l.c.weeks,
        startDate: l.startDate, expiryDate: l.expiryDate, fromStart: l.e?.startDate ?? '', fromExpiry: l.e?.expiryDate ?? '',
        price: l.price, discountType: l.discountType, discountValue: l.discountValue, discount: l.discount, amount: l.amount, byName,
      } });
      rows.push({ before: l.e, after, p });
    }
    let receipt = null;
    if (b.pay) {
      const { no, ym, seq } = await nextReceiptNo(db, b.pay.date);
      const first = rows[0]!;
      receipt = await db.receipt.create({ data: {
        no, ym, seq, date: b.pay.date, studentId: s.id, enrollmentId: first.after.id, classId: first.after.classId,
        item: lines.map((l) => l.c.name).join(', '), months: lines[0]!.c.months, weeks: lines[0]!.c.weeks,
        startDate: lines.reduce((m, l) => (l.startDate < m ? l.startDate : m), lines[0]!.startDate),
        expiryDate: lines.reduce((m, l) => (l.expiryDate > m ? l.expiryDate : m), ''),
        price: round2(lines.reduce((t, l) => t + l.price, 0)), discount: round2(lines.reduce((t, l) => t + l.discount, 0)),
        amount: round2(lines.reduce((t, l) => t + l.amount, 0)), method: b.pay.method, slip, payer: b.pay.payer, remark: b.pay.remark,
        receivedById: req.user!.id, receivedByName: byName,
      } });
      await db.coursePurchase.updateMany({ where: { id: { in: rows.map((r) => r.p.id) } }, data: { receiptId: receipt.id } });
      for (const r of rows) r.p.receiptId = receipt.id;
    }
    return { rows, receipt };
  });

  for (const r of out.rows) {
    const label = `${s.code} ${s.firstName} → ${r.p.item}`;
    await audit(req, r.before ? 'update' : 'insert', 'enrollments', r.after.id, label, r.before, r.after);
    void notifyAll({ kind: 'enrollment', ref: `enrollment:${r.after.id}`, url: '/courses', text: (lg) => ({
      title: r.before ? (lg === 'th' ? 'ต่ออายุคลาส' : 'Class renewed') : (lg === 'th' ? 'ลงทะเบียนคลาสใหม่' : 'New class enrollment'), body: label,
    }) });
  }
  if (out.receipt) await audit(req, 'insert', 'receipts', out.receipt.id, `${out.receipt.no} ${s.code}`, null, out.receipt);
  const money = await seesMoney(req);
  res.status(201).json({
    enrollments: out.rows.map((r) => enrollmentOut(r.after)),
    purchases: out.rows.map((r) => purchaseOut(r.p, money, out.receipt?.no ?? '')),
    receipt: out.receipt ? receiptOut(out.receipt) : null,
  });
});

// A free extension (teacher ill, school closed...): no money, no receipt, kept in the history.
router.post('/courses/extend', requirePerm('courses', 'edit'), async (req, res) => {
  const b = z.object({ enrollmentId: id, expiryDate: day, reason: text(300).default('') }).parse(req.body);
  const before = await prisma.enrollment.findUnique({ where: { id: b.enrollmentId } });
  if (!before) throw notFound();
  const [s, c, me] = await Promise.all([
    prisma.student.findFirst({ where: { id: before.studentId, deletedAt: null } }),
    prisma.danceClass.findUnique({ where: { id: before.classId } }),
    prisma.user.findUnique({ where: { id: req.user!.id } }),
  ]);
  if (!s || !c) throw notFound();
  if (before.expiryDate && b.expiryDate <= before.expiryDate) throw bad('extend_not_later');
  const byName = [me?.firstName, me?.lastName].filter(Boolean).join(' ') || req.user!.name;
  const [after, p] = await prisma.$transaction([
    prisma.enrollment.update({ where: { id: before.id }, data: { expiryDate: b.expiryDate } }),
    prisma.coursePurchase.create({ data: {
      studentId: s.id, classId: c.id, enrollmentId: before.id, kind: 'extend', date: todayBkk(), item: c.name,
      startDate: before.startDate, expiryDate: b.expiryDate, fromStart: before.startDate, fromExpiry: before.expiryDate, reason: b.reason, byName,
    } }),
  ]);
  const label = `${s.code} ${s.firstName} → ${c.name}`;
  await audit(req, 'update', 'enrollments', after.id, `${label} (+${b.reason || 'extend'})`, before, after);
  void notifyAll({ kind: 'enrollment', ref: `enrollment:${after.id}`, url: '/courses', text: (lg) => ({ title: lg === 'th' ? 'ขยายเวลาคลาส' : 'Class extended', body: label }) });
  res.status(201).json({ enrollment: enrollmentOut(after), purchase: purchaseOut(p, await seesMoney(req)) });
});

/** A receipt was cancelled: its lines count for nothing, and a period it gave is taken back. */
export async function cancelPurchases(db: Prisma.TransactionClient, receiptId: string) {
  const lines = await db.coursePurchase.findMany({ where: { receiptId, cancelledAt: null } });
  await db.coursePurchase.updateMany({ where: { receiptId }, data: { cancelledAt: new Date() } });
  for (const p of lines) {
    const e = await db.enrollment.findUnique({ where: { id: p.enrollmentId } });
    if (!e) continue;
    const live = await db.coursePurchase.findMany({ where: { enrollmentId: e.id, cancelledAt: null }, orderBy: { createdAt: 'asc' } });
    if (live.length) {
      const expiryDate = live.reduce((m, x) => (x.expiryDate > m ? x.expiryDate : m), '');
      await db.enrollment.update({ where: { id: e.id }, data: { expiryDate } });
    } else if (p.fromExpiry) {
      await db.enrollment.update({ where: { id: e.id }, data: { startDate: p.fromStart, expiryDate: p.fromExpiry } });
    }
  }
}

/** Once: the history starts from the receipts and enrollments made before it existed. */
export async function ensureCourseHistory() {
  const key = 'once:course-history';
  if (await prisma.noticeKey.findUnique({ where: { key } })) return;
  const receipts = await prisma.receipt.findMany({ orderBy: { createdAt: 'asc' } });
  for (const r of receipts) {
    if (await prisma.coursePurchase.findFirst({ where: { receiptId: r.id } })) continue;
    await prisma.coursePurchase.create({ data: {
      studentId: r.studentId, classId: r.classId, enrollmentId: r.enrollmentId, kind: 'buy', date: r.date, item: r.item, months: r.months,
      startDate: r.startDate, expiryDate: r.expiryDate, price: r.price, discountType: 'baht', discountValue: r.discount, discount: r.discount,
      amount: r.amount, receiptId: r.id, byName: r.receivedByName, cancelledAt: r.cancelledAt, createdAt: r.createdAt,
    } });
  }
  const enrollments = await prisma.enrollment.findMany();
  const classes = new Map((await prisma.danceClass.findMany()).map((c) => [c.id, c]));
  for (const e of enrollments) {
    if (await prisma.coursePurchase.findFirst({ where: { enrollmentId: e.id } })) continue;
    await prisma.coursePurchase.create({ data: {
      studentId: e.studentId, classId: e.classId, enrollmentId: e.id, kind: 'buy', date: e.purchaseDate || e.startDate || e.joinedAt.toISOString().slice(0, 10),
      item: classes.get(e.classId)?.name ?? '', startDate: e.startDate, expiryDate: e.expiryDate, createdAt: e.joinedAt,
    } });
  }
  await prisma.noticeKey.create({ data: { key } });
}

/** The newest receipt was deleted (owner 12/10/2026): its courses go, each period goes back to what it was before. */
export async function removePurchases(db: Prisma.TransactionClient, receiptId: string) {
  const lines = await db.coursePurchase.findMany({ where: { receiptId } });
  const ids = lines.map((p) => p.id);
  for (const p of lines) {
    const e = await db.enrollment.findUnique({ where: { id: p.enrollmentId } });
    if (!e) continue;
    const others = await db.coursePurchase.findMany({ where: { enrollmentId: e.id, id: { notIn: ids } } });
    const live = others.filter((x) => !x.cancelledAt);
    if (!others.length && !p.fromExpiry) {
      // the student joined the class with this receipt: they leave it again (and its lessons)
      const sched = (await db.schedule.findMany({ where: { classId: e.classId }, select: { id: true } })).map((x) => x.id);
      await db.scheduleStudent.deleteMany({ where: { studentId: e.studentId, scheduleId: { in: sched } } });
      await db.enrollment.delete({ where: { id: e.id } });
    } else if (live.length) {
      const expiryDate = live.reduce((m, x) => (x.expiryDate > m ? x.expiryDate : m), '');
      await db.enrollment.update({ where: { id: e.id }, data: { expiryDate, ...(p.fromStart ? { startDate: p.fromStart } : {}) } });
    } else {
      await db.enrollment.update({ where: { id: e.id }, data: { startDate: p.fromStart || e.startDate, expiryDate: p.fromExpiry } });
    }
  }
  await db.coursePurchase.deleteMany({ where: { receiptId } });
}
