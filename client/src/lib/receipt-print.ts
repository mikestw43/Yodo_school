import { parseISO, isValid, format } from "date-fns";
import type { Receipt } from "@/lib/yodo-store";
import { prefixed, type Lang } from "@/lib/i18n";
import logoUrlRaw from "@/assets/yodo-logo.png";

// The A4 receipt (owner 12/10/2026, mockup 3gLnsvQrxnGWHKpPmbRxBA board 3). One HTML page, used both by the in-app view
// (an iframe) and by the print window, in Thai or English (the receipt has its own TH/EN switch).

export type Company = { name: string; nameEn: string; address: string; phone: string; email: string; taxId: string; branch: string; logo: string; sign: string };
export type ReceiptStudent = { code: string; prefix: string; firstName: string; lastName: string } | null;

const esc = (v: string | number | null | undefined) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);
const d = (v?: string) => { if (!v) return "-"; const x = parseISO(v); return isValid(x) ? format(x, "dd/MM/yyyy") : "-"; };
export const money = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const abs = (u: string) => (u.startsWith("/") ? new URL(u, window.location.origin).href : u);

// ---------- amount in words ----------
const TH_D = ["", "หนึ่ง", "สอง", "สาม", "สี่", "ห้า", "หก", "เจ็ด", "แปด", "เก้า"];
const TH_P = ["", "สิบ", "ร้อย", "พัน", "หมื่น", "แสน"];
function thInt(n: number): string {
  if (n === 0) return "";
  if (n >= 1_000_000) return thInt(Math.floor(n / 1_000_000)) + "ล้าน" + thInt(n % 1_000_000);
  const s = String(n);
  let out = "";
  for (let i = 0; i < s.length; i++) {
    const dg = s.charCodeAt(i) - 48;
    const pos = s.length - 1 - i;
    if (dg === 0) continue;
    if (pos === 1 && dg === 1) out += "สิบ";
    else if (pos === 1 && dg === 2) out += "ยี่สิบ";
    else if (pos === 0 && dg === 1 && s.length > 1) out += "เอ็ด";
    else out += (TH_D[dg] ?? "") + (TH_P[pos] ?? "");
  }
  return out;
}
/** "เก้าพันห้าร้อยบาทถ้วน" */
export function bahtTextTh(amount: number) {
  const satang = Math.round(amount * 100) % 100;
  const baht = Math.floor(Math.round(amount * 100) / 100);
  if (baht === 0 && satang === 0) return "ศูนย์บาทถ้วน";
  return (baht ? thInt(baht) + "บาท" : "") + (satang ? thInt(satang) + "สตางค์" : "ถ้วน");
}
const EN_1 = ["", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const EN_10 = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
function en999(n: number): string {
  const h = Math.floor(n / 100), r = n % 100;
  const rest = r < 20 ? EN_1[r] : EN_10[Math.floor(r / 10)] + (r % 10 ? "-" + EN_1[r % 10] : "");
  return [h ? EN_1[h] + " hundred" : "", rest].filter(Boolean).join(" ");
}
function enInt(n: number): string {
  if (n === 0) return "zero";
  const parts: string[] = [];
  for (const [v, w] of [[1e9, "billion"], [1e6, "million"], [1e3, "thousand"]] as const) {
    if (n >= v) { parts.push(en999(Math.floor(n / v)) + " " + w); n %= v; }
  }
  if (n) parts.push(en999(n));
  return parts.join(" ");
}
/** "Nine thousand five hundred baht only" */
export function bahtTextEn(amount: number) {
  const satang = Math.round(amount * 100) % 100;
  const baht = Math.floor(Math.round(amount * 100) / 100);
  const s = enInt(baht) + " baht" + (satang ? " and " + enInt(satang) + " satang" : " only");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export const methodLabel = (m: string, lang: Lang) =>
  ({ cash: lang === "en" ? "Cash" : "เงินสด", transfer: lang === "en" ? "Bank transfer" : "โอนเงิน", card: lang === "en" ? "Credit card" : "บัตรเครดิต" } as Record<string, string>)[m] ?? m;

export function receiptHtml(o: { receipt: Receipt; company: Company; student: ReceiptStudent; lang: Lang; print?: boolean }) {
  const { receipt: r, company: c, student: s, lang } = o;
  const T = (th: string, en: string) => (lang === "en" ? en : th);
  const name = s ? `${prefixed(s.prefix, s.firstName)} ${s.lastName}`.trim() : "-";
  const coName = (lang === "en" ? c.nameEn || c.name : c.name || c.nameEn) || "YODO Dance Academy";
  const logo = abs(c.logo || logoUrlRaw);
  const coLines = [
    c.address,
    [c.phone ? T(`โทร ${c.phone}`, `Tel. ${c.phone}`) : "", c.email].filter(Boolean).join(" · "),
    c.taxId ? T(`เลขประจำตัวผู้เสียภาษี ${c.taxId}${c.branch ? ` (${c.branch})` : ""}`, `Tax ID ${c.taxId}${c.branch ? ` (${c.branch})` : ""}`) : "",
  ].filter(Boolean);
  const months = T(`${r.months} เดือน`, `${r.months} ${r.months === 1 ? "month" : "months"}`);
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><title>${esc(r.no)}</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+Thai:wght@400;600;700&family=Noto+Serif+Thai:wght@700&display=swap">
<style>
@page{size:A4;margin:0}*{box-sizing:border-box}
html,body{margin:0;background:#fff;color:#2b2024;font-family:'Noto Sans Thai',Tahoma,sans-serif}
.sheet{width:210mm;height:297mm;margin:0 auto;padding:13mm 15mm 12mm;display:flex;flex-direction:column;gap:6mm;position:relative;overflow:hidden;background:#fff}
.head{display:flex;justify-content:space-between;align-items:flex-start;gap:6mm;padding-bottom:4mm;border-bottom:2px solid #e6c9d2}
.co{display:flex;flex-direction:column;gap:1.5mm;max-width:105mm}.co img{width:45mm;height:23mm;object-fit:contain;object-position:left center}
.co b{font-size:10.5pt}.co div{font-size:9pt;line-height:1.5;color:#5f4b52;white-space:pre-line}
.ttl{text-align:right;display:flex;flex-direction:column;gap:1.5mm;font-size:10pt}.ttl h1{margin:0 0 1mm;font-family:'Noto Serif Thai',serif;font-size:21pt;color:#8e2d4c}
.ttl b{font-size:11pt}.mono{font-family:ui-monospace,Menlo,monospace}
.who{display:grid;grid-template-columns:1fr 1fr;gap:3mm 7mm;font-size:10.5pt}.lbl{font-size:8.5pt;color:#7a666c}.val{border-bottom:1px dotted #b9a2a9;padding-bottom:.8mm;min-height:6mm}
table{width:100%;border-collapse:collapse;font-size:10.5pt;border:1px solid #e6c9d2}th{background:#f6e6eb;color:#8e2d4c;font-weight:600;text-align:left;padding:2.5mm 3mm}
td{padding:3mm;border-top:1px solid #f1e5e8;vertical-align:top}.r{text-align:right}.sub{font-size:8.5pt;color:#7a666c}
.tot{align-self:flex-end;width:80mm;display:flex;flex-direction:column;gap:1.5mm;font-size:10.5pt}.tot div{display:flex;justify-content:space-between}
.tot .grand{background:#f6e6eb;color:#8e2d4c;font-weight:700;font-size:12.5pt;padding:2mm 3mm;border-radius:2mm}.words{text-align:right;font-size:9pt;color:#5f4b52}
.pay{font-size:10pt}.note{font-size:9.5pt;color:#5f4b52}
.sign{margin-top:auto;display:flex;justify-content:flex-end}.sign div{width:62mm;text-align:center;font-size:10pt;display:flex;flex-direction:column;gap:1mm}
.sign .line{height:16mm;border-bottom:1px solid #2b2024;position:relative}.sign img{position:absolute;left:50%;bottom:1mm;transform:translateX(-50%);max-height:14mm;max-width:100%}
.void{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none}
.void span{transform:rotate(-28deg);font-size:58pt;font-weight:700;color:rgba(190,30,45,.16);border:5px solid rgba(190,30,45,.16);padding:2mm 8mm;border-radius:4mm}
.voidnote{color:#b4233c;font-size:10pt}
@media screen{body{background:#fff}}
</style></head><body><section class="sheet">
${r.cancelled ? `<div class="void"><span>${T("ยกเลิก", "CANCELLED")}</span></div>` : ""}
<div class="head"><div class="co"><img src="${esc(logo)}" alt="YODO"><b>${esc(coName)}</b>${coLines.length ? `<div>${esc(coLines.join("\n"))}</div>` : ""}</div>
<div class="ttl"><h1>${T("ใบเสร็จรับเงิน", "Receipt")}</h1><div>${T("เลขที่", "No.")} <b class="mono">${esc(r.no)}</b></div><div>${T("วันที่", "Date")} <b>${d(r.date)}</b></div></div></div>
<div class="who"><div><div class="lbl">${T("ได้รับเงินจาก", "Received from")}</div><div class="val">${esc(r.payer || name)}</div></div>
<div><div class="lbl">${T("นักเรียน", "Student")}</div><div class="val">${esc(name)}${s ? ` · <span class="mono">${esc(s.code)}</span>` : ""}</div></div></div>
<table><thead><tr><th style="width:9mm">#</th><th>${T("รายการ", "Item")}</th><th class="r">${T("อายุคอร์ส", "Course length")}</th><th class="r">${T("จำนวนเงิน", "Amount")}</th></tr></thead>
<tbody><tr><td>1</td><td>${esc(r.item)}${r.startDate ? `<div class="sub">${d(r.startDate)} – ${d(r.expiryDate)}</div>` : ""}</td><td class="r">${esc(months)}</td><td class="r">${money(r.price)}</td></tr></tbody></table>
<div class="tot"><div><span>${T("รวม", "Subtotal")}</span><span>${money(r.price)}</span></div>
${r.discount ? `<div><span>${T("ส่วนลด", "Discount")}</span><span>− ${money(r.discount)}</span></div>` : ""}
<div class="grand"><span>${T("ยอดชำระ", "Total paid")}</span><span>${money(r.amount)} ${T("บาท", "THB")}</span></div>
<div class="words">(${esc(lang === "en" ? bahtTextEn(r.amount) : bahtTextTh(r.amount))})</div></div>
<div class="pay">${T("ชำระโดย", "Paid by")}: <b>${esc(methodLabel(r.method, lang))}</b> ${T("วันที่", "on")} ${d(r.date)}</div>
${r.remark ? `<div class="note">${T("หมายเหตุ", "Remark")}: ${esc(r.remark)}</div>` : ""}
${r.cancelled ? `<div class="voidnote">${T("ยกเลิกแล้ว", "Cancelled")}${r.cancelReason ? `: ${esc(r.cancelReason)}` : ""}</div>` : ""}
<div class="sign"><div><div class="line">${c.sign ? `<img src="${esc(abs(c.sign))}" alt="">` : ""}</div><div>${T("ผู้รับเงิน", "Received by")}</div><div style="color:#5f4b52">(${esc(r.receivedByName)})</div></div></div>
</section>${o.print ? `<script>window.addEventListener('load',async()=>{try{await document.fonts.ready;await Promise.all(Array.from(document.images,i=>i.decode().catch(()=>{})))}finally{window.focus();window.print()}})</script>` : ""}</body></html>`;
}

/** Opens the receipt in a new window and prints it. */
export function printReceipt(o: { receipt: Receipt; company: Company; student: ReceiptStudent; lang: Lang }) {
  const w = window.open("", "_blank");
  if (!w) return false;
  w.document.open();
  w.document.write(receiptHtml({ ...o, print: true }));
  w.document.close();
  return true;
}
