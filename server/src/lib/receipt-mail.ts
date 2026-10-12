import fs from 'node:fs';
import path from 'node:path';
import nodemailer from 'nodemailer';
import { type Lang, type PdfCompany, type PdfReceipt, type PdfStudent, methodText, money, studentName } from './receipt-pdf.js';

// The receipt e-mail (owner 13/10/2026, mockup R4EUKR2FJGuQcf4Xjytzm8, English approved): a short thank-you, the
// classes and the total, the receipt as a PDF attachment. No "call us / reply to us" lines (owner: keeps it simple).
// Sent through the school's Gmail with an app password the owner typed in Company settings.

const esc = (v: string) => v.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c);
const dmy = (iso: string) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '-');

export type MailParts = { subject: string; html: string; text: string };

export function receiptMail(o: {
  r: PdfReceipt; c: PdfCompany; s: PdfStudent; nickname: string; lang: Lang; note: string; logoCid?: string;
}): MailParts {
  const { r, c, s, lang } = o;
  const T = (th: string, en: string) => (lang === 'en' ? en : th);
  const co = (lang === 'en' ? c.nameEn || c.name : c.name || c.nameEn) || 'YODO';
  const student = studentName(s, lang);
  const payer = r.payer || student;
  const kid = o.nickname || s?.firstName || '';
  const signer = c.signName || r.receivedByName;
  const subject = T(`ใบเสร็จรับเงิน ${r.no} จาก ${co}`, `Your receipt ${r.no} from ${co}`);
  // no payer typed (the usual case) = the parent, never "Khun ด.ญ. ..." (a child's name)
  const greet = !r.payer.trim()
    ? T('เรียน ผู้ปกครอง', 'Dear Parent/Guardian,')
    : T(`เรียน คุณ${payer.replace(/^คุณ\s*/, '')}`, `Dear Khun ${payer.replace(/^(Khun|คุณ)\s*/i, '')},`);
  const intro = T(
    `ขอบคุณสำหรับการชำระเงิน ทางโรงเรียนได้แนบใบเสร็จรับเงินของ ${student}${s ? ` (รหัสนักเรียน ${s.code})` : ''} มาพร้อมอีเมลนี้`,
    `Thank you for your payment. Please find attached the official receipt for ${student}${s ? ` (student no. ${s.code})` : ''}.`,
  );
  const outro = kid ? T(`แล้วพบกัน${kid}ในคลาสนะคะ`, `We look forward to seeing ${kid} in class.`) : '';
  const regards = T('ขอแสดงความนับถือ', 'Kind regards,');
  const total = `${T('ยอดชำระ', 'Total paid')} (${methodText(r.method, lang).toLowerCase()})`;
  const foot = T('อีเมลนี้ส่งจากระบบของโรงเรียน ไฟล์ PDF ที่แนบมาคือใบเสร็จรับเงินฉบับจริง', 'This email was sent from the school system. The attached PDF is your official receipt.');
  const note = o.note.trim();

  const rows = r.lines.map((l, i) => `<tr><td style="padding:9px 14px;${i ? 'border-top:1px solid #f1e5e8;' : ''}">${esc(l.item)}${l.startDate ? `<br><span style="font-size:12px;color:#7a666c">${dmy(l.startDate)} – ${dmy(l.expiryDate)}</span>` : ''}</td><td style="padding:9px 14px;text-align:right;vertical-align:top;${i ? 'border-top:1px solid #f1e5e8;' : ''}">${money(l.amount ?? l.price - l.discount)}</td></tr>`).join('');
  const html = `<!doctype html><html lang="${lang}"><body style="margin:0;background:#ece7e8;font-family:Arial,'Noto Sans Thai',Tahoma,sans-serif;color:#2b2024">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ece7e8;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden">
<tr><td style="padding:22px 32px 16px;border-bottom:3px solid #e6c9d2">
<table role="presentation" width="100%"><tr><td>${o.logoCid ? `<img src="cid:${o.logoCid}" alt="${esc(co)}" width="150" style="display:block;width:150px;height:auto">` : `<b style="font-size:20px;color:#8e2d4c">${esc(co)}</b>`}</td>
<td style="text-align:right;font-size:12px;color:#7a666c">${T('ใบเสร็จรับเงิน', 'Receipt')}<br><b style="font-family:monospace;font-size:14px;color:#8e2d4c">${esc(r.no)}</b></td></tr></table></td></tr>
<tr><td style="padding:24px 32px;font-size:15px;line-height:1.65">
<p style="margin:0 0 14px">${esc(greet)}</p>
<p style="margin:0 0 14px">${esc(intro)}</p>
${note ? `<p style="margin:0 0 14px;white-space:pre-line">${esc(note)}</p>` : ''}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #ecdde1;border-radius:10px;border-collapse:separate;font-size:14px;margin:0 0 14px">
<tr><td style="padding:9px 14px;background:#f8eef1;font-weight:bold;color:#8e2d4c">${T('ใบเสร็จ', 'Receipt')} ${esc(r.no)} · ${dmy(r.date)}</td><td style="padding:9px 14px;background:#f8eef1;font-weight:bold;color:#8e2d4c;text-align:right">${T('บาท', 'THB')}</td></tr>
${rows}
<tr><td style="padding:10px 14px;border-top:1px solid #ecdde1;font-weight:bold">${esc(total)}</td><td style="padding:10px 14px;border-top:1px solid #ecdde1;font-weight:bold;text-align:right">${money(r.amount)}</td></tr>
</table>
${outro ? `<p style="margin:0 0 14px">${esc(outro)}</p>` : ''}
<p style="margin:0">${esc(regards)}<br><b>${esc(signer)}</b><br>${esc(co)}</p>
</td></tr>
<tr><td style="padding:14px 32px;background:#faf6f7;font-size:12px;line-height:1.6;color:#7a666c">${esc([co, c.address].filter(Boolean).join(' · '))}<br>${esc(foot)}</td></tr>
</table></td></tr></table></body></html>`;

  const text = [
    greet, '', intro, ...(note ? ['', note] : []), '',
    `${T('ใบเสร็จ', 'Receipt')} ${r.no} · ${dmy(r.date)}`,
    ...r.lines.map((l) => `- ${l.item}${l.startDate ? ` (${dmy(l.startDate)} – ${dmy(l.expiryDate)})` : ''}: ${money(l.amount ?? l.price - l.discount)}`),
    `${total}: ${money(r.amount)} ${T('บาท', 'THB')}`, '',
    ...(outro ? [outro, ''] : []),
    regards, signer, co, '', foot,
  ].join('\n');
  return { subject, html, text };
}

/** Gmail through SMTP. MAIL_OUT_DIR (tests) writes each message to a .eml file there instead of sending it. */
export async function sendMail(o: {
  user: string; pass: string; fromName: string; to: string[]; subject: string; html: string; text: string;
  attachments: { filename: string; content: Buffer; cid?: string; contentType?: string }[];
}) {
  const out = process.env.MAIL_OUT_DIR;
  const transport = out
    ? nodemailer.createTransport({ streamTransport: true, buffer: true, newline: 'unix' })
    : nodemailer.createTransport({ host: 'smtp.gmail.com', port: 465, secure: true, auth: { user: o.user, pass: o.pass.replace(/\s+/g, '') } });
  const info = await transport.sendMail({
    from: { name: o.fromName || o.user, address: o.user }, to: o.to, subject: o.subject, html: o.html, text: o.text, attachments: o.attachments,
  });
  if (out) {
    fs.mkdirSync(out, { recursive: true });
    fs.writeFileSync(path.join(out, `${Date.now()}-${o.to[0]}.eml`), (info as unknown as { message: Buffer }).message);
  }
}
