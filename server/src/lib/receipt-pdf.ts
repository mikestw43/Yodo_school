import PDFDocument from 'pdfkit';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { UPLOAD_DIR } from './config.js';
import { fileName, isFileName } from './images.js';

// The receipt as a real A4 PDF file, for e-mail attachments and the phone's share button (owner 13/10/2026).
// Laid out like the in-app receipt (client lib/receipt-print.ts), Thai or English. Fonts: Sarabun (OFL), as in FinHR.
const ASSETS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../assets');
const INK = '#2b2024', GREY = '#5f4b52', SOFT = '#7a666c', PINK = '#8e2d4c', BAND = '#f6e6eb', LINE = '#e6c9d2';

export type Lang = 'th' | 'en';
export type PdfLine = { item: string; months: number; startDate: string; expiryDate: string; price: number; discount: number; discountType: string; discountValue: number; amount?: number };
export type PdfReceipt = {
  no: string; date: string; payer: string; method: string; remark: string; price: number; discount: number; amount: number;
  receivedByName: string; cancelled: boolean; cancelReason: string; lines: PdfLine[];
};
export type PdfCompany = { name: string; nameEn: string; address: string; phone: string; email: string; taxId: string; branch: string; logo: string; sign: string; stamp: string; signName: string };
export type PdfStudent = { code: string; prefix: string; firstName: string; lastName: string } | null;

const dmy = (iso: string) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '-');
export const money = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ---------- names (a Thai name keeps its Thai title; client lib/i18n.ts `prefixed`) ----------
const PREFIX_EN: Record<string, string> = { 'ด.ญ.': 'Miss', 'ด.ช.': 'Master', 'นาย': 'Mr.', 'นางสาว': 'Ms.', 'นาง': 'Mrs.' };
export function studentName(s: PdfStudent, lang: Lang) {
  if (!s) return '-';
  const thai = /[฀-๿]/.test(s.firstName);
  const p = s.prefix ? (lang === 'en' && !thai ? PREFIX_EN[s.prefix] ?? s.prefix : s.prefix) : '';
  return [p ? `${p} ${s.firstName}` : s.firstName, s.lastName].filter(Boolean).join(' ');
}

// ---------- amount in words (same as the client) ----------
const TH_D = ['', 'หนึ่ง', 'สอง', 'สาม', 'สี่', 'ห้า', 'หก', 'เจ็ด', 'แปด', 'เก้า'];
const TH_P = ['', 'สิบ', 'ร้อย', 'พัน', 'หมื่น', 'แสน'];
function thInt(n: number): string {
  if (n === 0) return '';
  if (n >= 1_000_000) return thInt(Math.floor(n / 1_000_000)) + 'ล้าน' + thInt(n % 1_000_000);
  const s = String(n);
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const dg = s.charCodeAt(i) - 48, pos = s.length - 1 - i;
    if (dg === 0) continue;
    if (pos === 1 && dg === 1) out += 'สิบ';
    else if (pos === 1 && dg === 2) out += 'ยี่สิบ';
    else if (pos === 0 && dg === 1 && s.length > 1) out += 'เอ็ด';
    else out += (TH_D[dg] ?? '') + (TH_P[pos] ?? '');
  }
  return out;
}
export function bahtTextTh(amount: number) {
  const satang = Math.round(amount * 100) % 100, baht = Math.floor(Math.round(amount * 100) / 100);
  if (baht === 0 && satang === 0) return 'ศูนย์บาทถ้วน';
  return (baht ? thInt(baht) + 'บาท' : '') + (satang ? thInt(satang) + 'สตางค์' : 'ถ้วน');
}
const EN_1 = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const EN_10 = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
const en999 = (n: number) => { const h = Math.floor(n / 100), r = n % 100; const rest = r < 20 ? EN_1[r] : EN_10[Math.floor(r / 10)] + (r % 10 ? '-' + EN_1[r % 10] : ''); return [h ? EN_1[h] + ' hundred' : '', rest].filter(Boolean).join(' '); };
function enInt(n: number) {
  if (n === 0) return 'zero';
  const parts: string[] = [];
  for (const [v, w] of [[1e9, 'billion'], [1e6, 'million'], [1e3, 'thousand']] as const) if (n >= v) { parts.push(en999(Math.floor(n / v)) + ' ' + w); n %= v; }
  if (n) parts.push(en999(n));
  return parts.join(' ');
}
export function bahtTextEn(amount: number) {
  const satang = Math.round(amount * 100) % 100, baht = Math.floor(Math.round(amount * 100) / 100);
  const s = enInt(baht) + ' baht' + (satang ? ' and ' + enInt(satang) + ' satang' : ' only');
  return s.charAt(0).toUpperCase() + s.slice(1);
}
export const methodText = (m: string, lang: Lang) =>
  (({ cash: ['เงินสด', 'Cash'], transfer: ['โอนเงิน', 'Bank transfer'], card: ['บัตรเครดิต', 'Credit card'] } as Record<string, [string, string]>)[m] ?? [m, m])[lang === 'en' ? 1 : 0];

/** A stored picture ("/api/files/<name>") as bytes, or the bundled YODO logo. Only PNG/JPEG can go into the PDF. */
export function picture(v: string, fallback?: string): Buffer | undefined {
  const n = fileName(v);
  if (n && isFileName(n) && /\.(png|jpe?g)$/i.test(n)) {
    const f = path.join(UPLOAD_DIR, n);
    if (fs.existsSync(f)) return fs.readFileSync(f);
  }
  return fallback ? fs.readFileSync(path.join(ASSETS, fallback)) : undefined;
}

export function receiptPdf(r: PdfReceipt, c: PdfCompany, s: PdfStudent, lang: Lang): Promise<Buffer> {
  const T = (th: string, en: string) => (lang === 'en' ? en : th);
  const coName = (lang === 'en' ? c.nameEn || c.name : c.name || c.nameEn) || 'YODO';
  const doc = new PDFDocument({ size: 'A4', margin: 0, info: { Title: `${T('ใบเสร็จรับเงิน', 'Receipt')} ${r.no}`, Author: coName } });
  doc.registerFont('r', path.join(ASSETS, 'fonts', 'Sarabun-Regular.ttf'));
  doc.registerFont('b', path.join(ASSETS, 'fonts', 'Sarabun-Bold.ttf'));
  const chunks: Buffer[] = [];
  doc.on('data', (b: Buffer) => chunks.push(b));
  const done = new Promise<Buffer>((ok) => doc.on('end', () => ok(Buffer.concat(chunks))));
  const t = (font: 'r' | 'b', size: number, str: string, x: number, y: number, o: PDFKit.Mixins.TextOptions = {}, color = INK) =>
    doc.font(font).fontSize(size).fillColor(color).text(str, x, y, { lineBreak: false, ...o });
  // left = no `align` (pdfkit puts it at x); otherwise centred in the box
  const img = (b: Buffer | undefined, x: number, y: number, fit: [number, number], align: 'left' | 'center' = 'center') => {
    if (b) { try { doc.image(b, x, y, { fit, valign: 'center', ...(align === 'center' ? { align: 'center' as const } : {}) }); } catch { /* not a picture pdfkit reads: leave it out */ } }
  };
  const X0 = 42, X1 = 553, W = X1 - X0;

  // cancelled: a big faint stamp across the page
  if (r.cancelled) {
    doc.save().rotate(-28, { origin: [297, 420] }).fillColor('#be1e2d').fillOpacity(0.14)
      .font('b').fontSize(64).text(T('ยกเลิก', 'CANCELLED'), 60, 380, { width: 475, align: 'center', lineBreak: false }).restore();
    doc.fillOpacity(1);
  }
  // header: logo + company on the left, title on the right
  img(picture(c.logo, 'yodo-logo.png'), X0, 36, [130, 66], 'left');
  let y = 108;
  t('b', 11, coName, X0, y, { width: 300 }); y += 16;
  const coLines = [
    c.address,
    [c.phone ? T(`โทร ${c.phone}`, `Tel. ${c.phone}`) : '', c.email].filter(Boolean).join(' · '),
    c.taxId ? T(`เลขประจำตัวผู้เสียภาษี ${c.taxId}`, `Tax ID ${c.taxId}`) + (c.branch ? ` (${c.branch})` : '') : '',
  ].filter(Boolean);
  for (const l of coLines) { doc.font('r').fontSize(9).fillColor(GREY).text(l, X0, y, { width: 300 }); y = doc.y + 1; }
  t('b', 22, T('ใบเสร็จรับเงิน', 'Receipt'), X1 - 250, 40, { width: 250, align: 'right' }, PINK);
  t('r', 10, `${T('เลขที่', 'No.')} ${r.no}`, X1 - 250, 74, { width: 250, align: 'right' });
  t('r', 10, `${T('วันที่', 'Date')} ${dmy(r.date)}`, X1 - 250, 90, { width: 250, align: 'right' });
  y = Math.max(y, 150) + 6;
  doc.moveTo(X0, y).lineTo(X1, y).lineWidth(1.5).strokeColor(LINE).stroke();
  y += 14;

  // who
  const name = studentName(s, lang);
  const half = W / 2 - 10;
  t('r', 8.5, T('ได้รับเงินจาก', 'Received from'), X0, y, {}, SOFT);
  t('r', 8.5, T('นักเรียน', 'Student'), X0 + W / 2 + 10, y, {}, SOFT);
  t('r', 10.5, r.payer || name, X0, y + 12, { width: half, ellipsis: true });
  t('r', 10.5, s ? `${name} · ${s.code}` : name, X0 + W / 2 + 10, y + 12, { width: half, ellipsis: true });
  for (const x of [X0, X0 + W / 2 + 10]) doc.moveTo(x, y + 29).lineTo(x + half, y + 29).dash(1, { space: 2 }).lineWidth(0.6).strokeColor('#b9a2a9').stroke().undash();
  y += 46;

  // the classes
  const cols = { n: X0 + 8, item: X0 + 32, len: X0 + 330, amt: X1 - 8 };
  doc.rect(X0, y, W, 22).fill(BAND);
  t('b', 10, '#', cols.n, y + 5, {}, PINK);
  t('b', 10, T('รายการ', 'Item'), cols.item, y + 5, {}, PINK);
  t('b', 10, T('ระยะเวลา', 'Length'), cols.len, y + 5, { width: 90, align: 'right' }, PINK);
  t('b', 10, T('จำนวนเงิน', 'Amount'), cols.amt - 110, y + 5, { width: 110, align: 'right' }, PINK);
  const top = y;
  y += 28;
  r.lines.forEach((l, i) => {
    const months = l.months ? T(`${l.months} เดือน`, `${l.months} ${l.months === 1 ? 'month' : 'months'}`) : '-';
    const off = l.discount ? ` · ${T('ส่วนลด', 'discount')} ${l.discountType === 'pct' ? `${l.discountValue}%` : money(l.discount)}` : '';
    t('r', 10.5, String(i + 1), cols.n, y);
    t('r', 10.5, l.item, cols.item, y, { width: 280, ellipsis: true });
    if (l.startDate) t('r', 8.5, `${dmy(l.startDate)} – ${dmy(l.expiryDate)}${off}`, cols.item, y + 15, { width: 290, ellipsis: true }, SOFT);
    t('r', 10.5, months, cols.len, y, { width: 90, align: 'right' });
    t('r', 10.5, money(l.price), cols.amt - 110, y, { width: 110, align: 'right' });
    y += 34;
    if (i < r.lines.length - 1) doc.moveTo(X0, y - 6).lineTo(X1, y - 6).lineWidth(0.5).strokeColor('#f1e5e8').stroke();
  });
  doc.rect(X0, top, W, y - top - 4).lineWidth(0.8).strokeColor(LINE).stroke();
  y += 6;

  // totals
  const tx = X1 - 230;
  const row = (a: string, b: string) => { t('r', 10.5, a, tx, y); t('r', 10.5, b, X1 - 120, y, { width: 120, align: 'right' }); y += 18; };
  row(T('รวม', 'Subtotal'), money(r.price));
  if (r.discount) row(T('ส่วนลด', 'Discount'), `- ${money(r.discount)}`);
  doc.roundedRect(tx - 8, y - 2, 238, 26, 5).fill(BAND);
  t('b', 12.5, T('ยอดชำระ', 'Total paid'), tx, y + 4, {}, PINK);
  t('b', 12.5, `${money(r.amount)} ${T('บาท', 'THB')}`, X1 - 150, y + 4, { width: 142, align: 'right' }, PINK);
  y += 32;
  t('r', 9, `(${lang === 'en' ? bahtTextEn(r.amount) : bahtTextTh(r.amount)})`, X0, y, { width: W, align: 'right' }, GREY);
  y += 26;
  t('r', 10, `${T('ชำระโดย', 'Paid by')}: ${methodText(r.method, lang)} ${T('วันที่', 'on')} ${dmy(r.date)}`, X0, y);
  y += 18;
  if (r.remark) { doc.font('r').fontSize(9.5).fillColor(GREY).text(`${T('หมายเหตุ', 'Remark')}: ${r.remark}`, X0, y, { width: W }); y = doc.y + 4; }
  if (r.cancelled) t('r', 10, T('ยกเลิกแล้ว', 'Cancelled') + (r.cancelReason ? `: ${r.cancelReason}` : ''), X0, y, { width: W }, '#b4233c');

  // signature (and the stamp beside it) at the foot of the page
  const sx = X1 - 176, sy = 690;
  img(picture(c.stamp), sx - 108, sy - 20, [96, 96]);
  img(picture(c.sign), sx, sy - 6, [176, 40]);
  doc.moveTo(sx, sy + 38).lineTo(X1, sy + 38).lineWidth(0.8).strokeColor(INK).stroke();
  t('r', 10, T('ผู้รับเงิน', 'Received by'), sx, sy + 44, { width: 176, align: 'center' });
  t('r', 10, `(${c.signName || r.receivedByName})`, sx, sy + 60, { width: 176, align: 'center' }, GREY);
  doc.end();
  return done;
}
