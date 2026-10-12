import { Router } from 'express';
import { z } from 'zod';
import type { CoursePurchase, Prisma, Receipt, Setting } from '@prisma/client';
import { prisma } from '../lib/db.js';
import { HttpError, bad, notFound } from '../lib/http.js';
import { can, requireAuth, requirePerm } from '../lib/auth.js';
import { audit } from '../lib/audit.js';
import { storeImage } from '../lib/images.js';
import { isDate, todayBkk } from '../lib/dates.js';
import { cancelPurchases, discountOf, purchaseOut, removePurchases } from './courses.js';
import { decrypt, encrypt } from '../lib/crypto.js';
import { picture, receiptPdf, type Lang as PdfLang, type PdfReceipt, type PdfStudent } from '../lib/receipt-pdf.js';
import { receiptMail, sendMail } from '../lib/receipt-mail.js';

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
  const emails = await prisma.receiptEmail.findMany({ where: { receiptId: r.id }, orderBy: { createdAt: 'desc' } });
  res.json({
    receipt: receiptOut(r, lines), company: companyOut(setting), editable: await isNewest(r),
    emails: emails.map((e) => ({ id: e.id, to: e.to, lang: e.lang, byName: e.byName, createdAt: e.createdAt.toISOString() })),
    student: student ? { code: student.code, prefix: student.prefix, firstName: student.firstName, lastName: student.lastName, email: student.email } : null,
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

// ---------- PDF file, e-mail and the school's Gmail (owner 13/10/2026) ----------
async function pdfParts(rid: string) {
  const r = await prisma.receipt.findUnique({ where: { id: rid } });
  if (!r) throw notFound();
  const [lines, setting, student] = await Promise.all([
    prisma.coursePurchase.findMany({ where: { receiptId: r.id }, orderBy: { createdAt: 'asc' } }),
    prisma.setting.findUnique({ where: { id: 1 } }),
    prisma.student.findUnique({ where: { id: r.studentId } }),
  ]);
  const pr: PdfReceipt = {
    no: r.no, date: r.date, payer: r.payer, method: r.method, remark: r.remark, price: r.price, discount: r.discount, amount: r.amount,
    receivedByName: r.receivedByName, cancelled: !!r.cancelledAt, cancelReason: r.cancelReason,
    lines: lines.length
      ? lines.map((l) => ({ item: l.item, months: l.months, startDate: l.startDate, expiryDate: l.expiryDate, price: l.price, discount: l.discount, discountType: l.discountType, discountValue: l.discountValue, amount: l.amount }))
      : [{ item: r.item, months: r.months, startDate: r.startDate, expiryDate: r.expiryDate, price: r.price, discount: 0, discountType: 'baht', discountValue: 0, amount: r.price }],
  };
  const c = companyOut(setting);
  const s: PdfStudent = student ? { code: student.code, prefix: student.prefix, firstName: student.firstName, lastName: student.lastName } : null;
  return { r, pr, c, s, setting, student };
}
const langQ = (v: unknown): PdfLang => (v === 'th' ? 'th' : 'en');
const fileOf = (no: string) => `Receipt-${no}.pdf`;

router.get('/receipts/:id/pdf', requirePerm('receipts', 'view'), async (req, res) => {
  const { r, pr, c, s } = await pdfParts(id.parse(req.params.id));
  const pdf = await receiptPdf(pr, c, s, langQ(req.query.lang));
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${fileOf(r.no)}"`);
  res.send(pdf);
});

router.get('/receipts/:id/email-preview', requirePerm('receipts', 'view'), async (req, res) => {
  const { pr, c, s, student } = await pdfParts(id.parse(req.params.id));
  const logo = picture(c.logo, 'yodo-logo.png');
  const m = receiptMail({ r: pr, c, s, nickname: student?.nickname ?? '', lang: langQ(req.query.lang), note: String(req.query.note ?? '').slice(0, 1000), ...(logo ? { logoCid: 'logo' } : {}) });
  const html = logo ? m.html.replace(/cid:[^"]+/, `data:image/png;base64,${logo.toString('base64')}`) : m.html;
  res.json({ subject: m.subject, html });
});

const mailOut = (s: Setting | null) => {
  const pass = s?.mailPass ? decrypt(s.mailPass) : '';
  return { user: s?.mailUser ?? '', fromName: s?.mailFromName ?? '', passSet: !!pass, passLast4: pass ? pass.replace(/\s+/g, '').slice(-4) : '' };
};
router.get('/settings/mail', requirePerm('company', 'view'), async (_req, res) => {
  res.json(mailOut(await prisma.setting.findUnique({ where: { id: 1 } })));
});
router.put('/settings/mail', requirePerm('company', 'edit'), async (req, res) => {
  const b = z.object({ user: z.string().trim().max(200).refine((v) => v === '' || z.string().email().safeParse(v).success, 'email_format'), fromName: text(200), pass: z.string().max(100).default(''), clear: z.boolean().default(false) }).parse(req.body);
  const before = await prisma.setting.findUnique({ where: { id: 1 } });
  const pass = b.clear ? '' : b.pass.replace(/\s+/g, '') ? encrypt(b.pass.replace(/\s+/g, '')) : before?.mailPass ?? '';
  const data = { mailUser: b.user, mailFromName: b.fromName, mailPass: pass };
  const after = await prisma.setting.upsert({ where: { id: 1 }, create: { id: 1, ...data }, update: data });
  // the password itself never goes into the history
  const hide = (x: Setting | null) => (x ? { mail_user: x.mailUser, mail_from_name: x.mailFromName, mail_pass: x.mailPass ? 'set' : '' } : null);
  await audit(req, 'update', 'settings', '1', 'Email', hide(before), hide(after), true);
  res.json(mailOut(after));
});

async function sendWith(setting: Setting | null, msg: { to: string[]; subject: string; html: string; text: string; attachments: { filename: string; content: Buffer; cid?: string; contentType?: string }[] }) {
  const pass = setting?.mailPass ? decrypt(setting.mailPass) : '';
  if (!setting?.mailUser || !pass) throw bad('mail_not_set');
  try {
    await sendMail({ user: setting.mailUser, pass, fromName: setting.mailFromName || setting.companyNameEn || setting.companyName, ...msg });
  } catch (e) {
    const code = (e as { code?: string; responseCode?: number }).code;
    throw new HttpError(502, code === 'EAUTH' ? 'mail_auth' : 'mail_failed');
  }
}

router.post('/settings/mail/test', requirePerm('company', 'edit'), async (req, res) => {
  const setting = await prisma.setting.findUnique({ where: { id: 1 } });
  const lang = langQ(req.body?.lang);
  const subject = lang === 'th' ? 'ทดลองส่งอีเมลจาก YODO' : 'Test email from YODO';
  const body = lang === 'th' ? 'ตั้งค่าการส่งอีเมลเรียบร้อยแล้ว ระบบส่งใบเสร็จทางอีเมลได้' : 'Email sending is set up. The school system can now send receipts by email.';
  await sendWith(setting, { to: [setting?.mailUser ?? ''], subject, html: `<p>${body}</p>`, text: body, attachments: [] });
  res.json({ ok: true });
});

const emailList = z.string().trim().min(1).max(500).transform((v) => v.split(/[,;\s]+/).map((x) => x.trim()).filter(Boolean))
  .refine((l) => l.length >= 1 && l.length <= 5 && l.every((x) => z.string().email().safeParse(x).success), 'email_format');

router.post('/receipts/:id/email', requirePerm('receipts', 'view'), async (req, res) => {
  const b = z.object({ to: emailList, lang: z.enum(['th', 'en']).default('en'), note: text(1000).default('') }).parse(req.body);
  const { r, pr, c, s, setting, student } = await pdfParts(id.parse(req.params.id));
  const logo = picture(c.logo, 'yodo-logo.png');
  const m = receiptMail({ r: pr, c, s, nickname: student?.nickname ?? '', lang: b.lang, note: b.note, ...(logo ? { logoCid: 'logo@yodo' } : {}) });
  const pdf = await receiptPdf(pr, c, s, b.lang);
  await sendWith(setting, {
    to: b.to, subject: m.subject, html: m.html, text: m.text,
    attachments: [{ filename: fileOf(r.no), content: pdf, contentType: 'application/pdf' }, ...(logo ? [{ filename: 'logo.png', content: logo, cid: 'logo@yodo', contentType: 'image/png' }] : [])],
  });
  const me = await prisma.user.findUnique({ where: { id: req.user!.id } });
  const row = await prisma.receiptEmail.create({ data: { receiptId: r.id, to: b.to.join(', '), lang: b.lang, byName: [me?.firstName, me?.lastName].filter(Boolean).join(' ') || req.user!.name } });
  await audit(req, 'insert', 'receipt_emails', row.id, `${r.no} → ${row.to}`, null, { receipt_no: r.no, to: row.to, lang: row.lang }, true);
  res.status(201).json({ id: row.id, to: row.to, lang: row.lang, byName: row.byName, createdAt: row.createdAt.toISOString() });
});
