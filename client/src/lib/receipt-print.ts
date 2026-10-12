import { format, parseISO, isValid } from "date-fns";
import type { Student } from "@/lib/yodo-store";
import logoUrlRaw from "@/assets/yodo-logo.png";
const logo = { url: logoUrlRaw };

const esc = (v: string | number | null | undefined) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);
const d = (v?: string) => { if (!v) return "-"; const x = parseISO(v); return isValid(x) ? format(x, "dd/MM/yyyy") : "-"; };
const money = (n: number | null | undefined) => n == null ? "-" : n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function printReceipt(o: {
  student: Student; enrollmentId: string; className: string; price: number | null | undefined;
  purchaseDate?: string; startDate?: string; expiryDate?: string; remark?: string; months: number; total: number | null;
}) {
  const w = window.open("", "_blank", "width=900,height=1000");
  if (!w) return false;
  const pd = o.purchaseDate || format(new Date(), "yyyy-MM-dd");
  const no = `RC-${pd.replace(/-/g, "")}-${o.enrollmentId.slice(0, 4).toUpperCase()}`;
  const logoUrl = new URL(logo.url, window.location.origin).href;
  const name = `${o.student.prefix ?? ""} ${o.student.firstName} ${o.student.lastName}`.trim();
  w.document.write(`<!doctype html><html lang="th"><head><meta charset="utf-8"><title>${esc(no)}</title><style>
@page{size:A4;margin:0}*{box-sizing:border-box}body{margin:0;font-family:Tahoma,Arial,sans-serif;color:#171717;background:#eee}
.sheet{width:210mm;min-height:297mm;margin:0 auto;background:#fff;padding:16mm 16mm 14mm;display:flex;flex-direction:column}
.head{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #c98a9a;padding-bottom:6mm}
.head img{width:52mm;height:26mm;object-fit:contain}.ttl{text-align:right}.ttl h1{margin:0;font-size:20pt;color:#a85a6e}.ttl p{margin:2mm 0 0;font-size:10pt}
.info{display:flex;justify-content:space-between;margin:7mm 0;font-size:10.5pt;line-height:1.8}.info b{display:inline-block;min-width:26mm}
table{width:100%;border-collapse:collapse;font-size:10.5pt}th{background:#f7e6ea;color:#7a3a4b}th,td{border:1px solid #d9b8c0;padding:3mm;text-align:center}td.l{text-align:left}
.tot{display:flex;justify-content:flex-end;margin-top:5mm}.tot div{min-width:80mm;display:flex;justify-content:space-between;padding:3mm 4mm;background:#f7e6ea;font-size:13pt;font-weight:bold;color:#7a3a4b}
.remark{margin-top:6mm;font-size:10pt}.sign{margin-top:auto;display:flex;justify-content:flex-end}.sign div{width:70mm;text-align:center;font-size:10pt}
.sign .line{border-bottom:1px solid #111;height:16mm;margin-bottom:2mm}@media print{body{background:#fff}}
</style></head><body><div class="sheet">
<div class="head"><img src="${esc(logoUrl)}" alt="YODO"><div class="ttl"><h1>ใบเสร็จรับเงิน</h1><p>Receipt</p><p>YODO Dance Academy</p></div></div>
<div class="info"><div><div><b>ชื่อนักเรียน</b>${esc(name)}</div><div><b>รหัสนักเรียน</b>${esc(o.student.code)}</div><div><b>เบอร์โทร</b>${esc(o.student.phone || "-")}</div></div>
<div><div><b>เลขที่</b>${esc(no)}</div><div><b>วันที่</b>${esc(d(pd))}</div></div></div>
<table><thead><tr><th>ลำดับ</th><th>รายการ</th><th>ระยะเวลา</th><th>จำนวนเดือน</th><th>ราคา/เดือน</th><th>จำนวนเงิน (บาท)</th></tr></thead>
<tbody><tr><td>1</td><td class="l">${esc(o.className)}</td><td>${esc(d(o.startDate))} – ${esc(d(o.expiryDate))}</td><td>${o.months || "-"}</td><td>${money(o.price)}</td><td>${money(o.total)}</td></tr></tbody></table>
<div class="tot"><div><span>ยอดรวม</span><span>${money(o.total)} บาท</span></div></div>
${o.remark ? `<div class="remark"><b>หมายเหตุ:</b> ${esc(o.remark)}</div>` : ""}
<div class="sign"><div><div class="line"></div>ผู้รับเงิน<br>วันที่ ${esc(d(pd))}</div></div>
</div><script>window.onload=()=>{setTimeout(()=>window.print(),300)}</script></body></html>`);
  w.document.close();
  return true;
}
