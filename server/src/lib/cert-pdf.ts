import PDFDocument from 'pdfkit';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { picture } from './receipt-pdf.js';
import { certText, type CertDoc } from './cert-text.js';

export type { CertData } from './cert-text.js';

// The salary certificate as an A4 PDF for the share button (owner 27/10/2026). Laid out like the in-app view
// (client lib/cert-print.ts); the words come from lib/cert-text.ts. Fonts: Sarabun, as on receipts.
const ASSETS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../assets');
const INK = '#2b2024', GREY = '#5f4b52', PINK = '#8e2d4c', LINE = '#e6c9d2';

export function certPdf(c: CertDoc): Promise<Buffer> {
  const x = certText(c);
  const doc = new PDFDocument({ size: 'A4', margin: 0, info: { Title: `${x.title} ${c.no}`, Author: x.co } });
  doc.registerFont('r', path.join(ASSETS, 'fonts', 'Sarabun-Regular.ttf'));
  doc.registerFont('b', path.join(ASSETS, 'fonts', 'Sarabun-Bold.ttf'));
  const chunks: Buffer[] = [];
  doc.on('data', (b: Buffer) => chunks.push(b));
  const done = new Promise<Buffer>((ok) => doc.on('end', () => ok(Buffer.concat(chunks))));
  const img = (b: Buffer | undefined, px: number, py: number, fit: [number, number], align: 'left' | 'center' = 'center') => {
    if (b) { try { doc.image(b, px, py, { fit, valign: 'center', ...(align === 'center' ? { align: 'center' as const } : {}) }); } catch { /* not a picture pdfkit reads */ } }
  };
  const X0 = 60, X1 = 535, W = X1 - X0;

  if (x.cancelled) {
    doc.save().rotate(-28, { origin: [297, 420] }).fillColor('#be1e2d').fillOpacity(0.14)
      .font('b').fontSize(64).text(x.cancelled, 60, 380, { width: 475, align: 'center', lineBreak: false }).restore();
    doc.fillOpacity(1);
  }
  // letterhead: logo left, company right
  img(picture(c.data.company.logo, 'yodo-logo.png'), X0, 44, [130, 66], 'left');
  doc.font('b').fontSize(11.5).fillColor(INK).text(x.co, X0 + 180, 50, { width: W - 180, align: 'right' });
  let y = doc.y + 2;
  for (const l of x.coLines) { doc.font('r').fontSize(9).fillColor(GREY).text(l, X0 + 180, y, { width: W - 180, align: 'right' }); y = doc.y + 1; }
  y = Math.max(y, 122) + 8;
  doc.moveTo(X0, y).lineTo(X1, y).lineWidth(1.5).strokeColor(LINE).stroke();
  y += 14;
  doc.font('r').fontSize(10).fillColor(GREY).text(x.no, X0, y, { lineBreak: false });
  doc.text(x.date, X0, y, { width: W, align: 'right', lineBreak: false });
  y += 44;
  doc.font('b').fontSize(19).fillColor(PINK).text(x.title, X0, y, { width: W, align: 'center' });
  y = doc.y + 24;
  doc.font('r').fontSize(12.5).fillColor(INK).text(x.dear, X0, y, { width: W });
  y = doc.y + 12;
  // body: one paragraph, the filled-in parts bold
  const opts = { width: W, indent: 36, lineGap: 6 }; // left: pdfkit's justify loses spaces between bold and plain pieces
  doc.fontSize(12.5).fillColor(INK);
  // pdfkit: width / indent / align only on the first piece, later pieces carry on the same paragraph
  x.body.forEach(([s, bold], i) => {
    const more = i < x.body.length - 1;
    doc.font(bold ? 'b' : 'r');
    if (i === 0) doc.text(s, X0, y, { ...opts, continued: more });
    else doc.text(s, { continued: more });
  });
  y = doc.y + 18;
  doc.font('r').fontSize(12.5).text(x.given, X0, y, { width: W, indent: 36 });
  if (x.cancelLine) doc.font('r').fontSize(10.5).fillColor('#b4233c').text(x.cancelLine, X0, doc.y + 16, { width: W });

  // signature with the stamp to its left
  const sw = 210, sx = X1 - sw, sy = Math.max(doc.y + 70, 560);
  img(picture(c.data.company.stamp), sx - 112, sy - 24, [100, 100]);
  img(picture(c.data.company.sign), sx + 15, sy - 6, [sw - 30, 44]);
  doc.moveTo(sx, sy + 42).lineTo(X1, sy + 42).lineWidth(0.8).strokeColor(INK).stroke();
  doc.font('r').fontSize(11).fillColor(INK).text(x.signer, sx, sy + 48, { width: sw, align: 'center' });
  if (x.signerTitle) doc.text(x.signerTitle, sx, doc.y + 1, { width: sw, align: 'center' });
  doc.end();
  return done;
}
