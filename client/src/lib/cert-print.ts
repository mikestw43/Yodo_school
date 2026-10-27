import logoUrlRaw from "@/assets/yodo-logo.png";
import { certText, type CertDoc } from "@/lib/cert-text";

// The A4 salary certificate (owner 27/10/2026, mockup Fj7itm8uCcAiGSyo6rEeHw). One HTML page for the in-app view (an
// iframe) and the print window; the PDF for sharing is drawn by the server (lib/cert-pdf.ts) from the same words.
const esc = (v: string | number | null | undefined) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);
const abs = (u: string) => (u.startsWith("/") ? new URL(u, window.location.origin).href : u);

export function certHtml(c: CertDoc, print = false) {
  const x = certText(c);
  const co = c.data.company;
  const body = x.body.map(([s, b]) => (b ? `<b>${esc(s)}</b>` : esc(s))).join("");
  return `<!doctype html><html lang="${x.lang}"><head><meta charset="utf-8"><title>${esc(c.no)}</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+Thai:wght@400;600;700&family=Noto+Serif+Thai:wght@500;700&display=swap">
<style>
@page{size:A4;margin:0}*{box-sizing:border-box}
html,body{margin:0;background:#fff;color:#2b2024;font-family:'Noto Sans Thai',Tahoma,sans-serif}
.sheet{width:210mm;height:297mm;margin:0 auto;padding:15mm 21mm 14mm;display:flex;flex-direction:column;position:relative;overflow:hidden;background:#fff}
.head{display:flex;justify-content:space-between;align-items:flex-start;gap:8mm;padding-bottom:4mm;border-bottom:2px solid #e6c9d2}
.head img{width:45mm;height:23mm;object-fit:contain;object-position:left center}
.co{text-align:right;font-size:9pt;line-height:1.55;color:#5f4b52;white-space:pre-line;max-width:105mm}.co b{display:block;font-size:11pt;color:#2b2024}
.meta{display:flex;justify-content:space-between;font-size:10pt;color:#5f4b52;margin-top:5mm}
h1{font-family:'Noto Serif Thai',serif;text-align:center;font-size:19pt;color:#8e2d4c;margin:13mm 0 9mm}
p{margin:0 0 4mm;font-size:12.5pt;line-height:1.95}.ind{text-indent:12.5mm}
.sign{margin-top:22mm;display:flex;justify-content:flex-end;align-items:flex-end;gap:4mm}.sign .stamp{max-width:34mm;max-height:34mm;object-fit:contain}
.sign div{width:74mm;text-align:center;font-size:11pt;display:flex;flex-direction:column;gap:1mm}
.sign .line{height:17mm;border-bottom:1px solid #2b2024;position:relative}.sign .line img{position:absolute;left:50%;bottom:1mm;transform:translateX(-50%);max-height:15mm;max-width:100%}
.void{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none}
.void span{transform:rotate(-28deg);font-size:58pt;font-weight:700;color:rgba(190,30,45,.16);border:5px solid rgba(190,30,45,.16);padding:2mm 8mm;border-radius:4mm}
.voidnote{color:#b4233c;font-size:10pt}
</style></head><body><section class="sheet">
${x.cancelled ? `<div class="void"><span>${esc(x.cancelled)}</span></div>` : ""}
<div class="head"><img src="${esc(abs(co.logo || logoUrlRaw))}" alt="YODO"><div class="co"><b>${esc(x.co)}</b>${esc(x.coLines.join("\n"))}</div></div>
<div class="meta"><span>${esc(x.no)}</span><span>${esc(x.date)}</span></div>
<h1>${esc(x.title)}</h1>
<p>${esc(x.dear)}</p>
<p class="ind" data-testid="cert-body">${body}</p>
<p class="ind">${esc(x.given)}</p>
${x.cancelLine ? `<p class="voidnote">${esc(x.cancelLine)}</p>` : ""}
<div class="sign">${co.stamp ? `<img class="stamp" src="${esc(abs(co.stamp))}" alt="">` : ""}<div><div class="line">${co.sign ? `<img src="${esc(abs(co.sign))}" alt="">` : ""}</div><div>${esc(x.signer)}</div>${x.signerTitle ? `<div>${esc(x.signerTitle)}</div>` : ""}</div></div>
</section>${print ? `<script>window.addEventListener('load',async()=>{try{await document.fonts.ready;await Promise.all(Array.from(document.images,i=>i.decode().catch(()=>{})))}finally{window.focus();window.print()}})</script>` : ""}</body></html>`;
}

export function printCert(c: CertDoc) {
  const w = window.open("", "_blank");
  if (!w) return false;
  w.document.open();
  w.document.write(certHtml(c, true));
  w.document.close();
  return true;
}
