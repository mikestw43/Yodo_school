// Wording of the salary certificate (owner 27/10/2026, mockup Fj7itm8uCcAiGSyo6rEeHw: no "purpose" line).
// Shared word for word with client/src/lib/cert-text.ts (a test checks they are the same file).
export type CertLang = 'th' | 'en';
export type CertData = {
  prefix: string; firstName: string; lastName: string; prefixEn: string; firstNameEn: string; lastNameEn: string;
  nationalId: string; position: string; positionEn: string; empType: string; startDate: string;
  company: { name: string; nameEn: string; address: string; phone: string; email: string; taxId: string; branch: string; logo: string; sign: string; stamp: string };
  signer: { name: string; nameEn: string; title: string; titleEn: string };
};
export type CertDoc = { no: string; date: string; lang: string; salary: number; cancelled: boolean; cancelReason: string; data: CertData };

const TH_MONTHS = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
const EN_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
/** "15 ตุลาคม 2026" / "15 October 2026" (Christian era, owner's rule). */
export const longDate = (iso: string, lang: CertLang) => {
  if (!iso) return '';
  const d = Number(iso.slice(8, 10)), m = Number(iso.slice(5, 7)) - 1, y = iso.slice(0, 4);
  return `${d} ${(lang === 'en' ? EN_MONTHS : TH_MONTHS)[m]} ${y}`;
};
export const certMoney = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const idText = (v: string) => (/^\d{13}$/.test(v) ? `${v[0]}-${v.slice(1, 5)}-${v.slice(5, 10)}-${v.slice(10, 12)}-${v[12]}` : v);

// amount in words (same as lib/receipt-pdf.ts)
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
export function certWords(amount: number, lang: CertLang) {
  const satang = Math.round(amount * 100) % 100, baht = Math.floor(Math.round(amount * 100) / 100);
  if (lang === 'th') return (baht ? thInt(baht) + 'บาท' : 'ศูนย์บาท') + (satang ? thInt(satang) + 'สตางค์' : 'ถ้วน');
  const s = enInt(baht) + ' baht' + (satang ? ' and ' + enInt(satang) + ' satang' : ' only');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Every piece of text on the certificate; `bold` marks the filled-in parts of the body. */
export function certText(c: CertDoc) {
  const lang: CertLang = c.lang === 'en' ? 'en' : 'th';
  const d = c.data, T = (th: string, en: string) => (lang === 'en' ? en : th);
  const name = lang === 'en'
    ? [d.prefixEn, d.firstNameEn, d.lastNameEn].filter(Boolean).join(' ')
    : [d.prefix, d.firstName, d.lastName].filter(Boolean).join(' ');
  const co = (lang === 'en' ? d.company.nameEn || d.company.name : d.company.name || d.company.nameEn) || 'YODO';
  const pos = lang === 'en' ? d.positionEn || d.position : d.position;
  const pay = lang === 'en' ? `THB ${certMoney(c.salary)} (${certWords(c.salary, 'en')})` : `${certMoney(c.salary)} บาท (${certWords(c.salary, 'th')})`;
  // body as runs: [text, bold]
  const body: [string, boolean][] = lang === 'en'
    ? [['This is to certify that ', false], [name, true], ...(d.nationalId ? [[', ID card no. ', false], [idText(d.nationalId), true], [',', false]] as [string, boolean][] : []),
      [` has been a ${d.empType === 'part' ? 'part-time' : 'full-time'} employee of ${co} since `, false], [longDate(d.startDate, 'en'), true],
      [' up to the present, in the position of ', false], [pos, true], [', with a monthly salary of ', false], [pay, true], ['.', false]]
    : [[`${co} ขอรับรองว่า `, false], [name, true], ...(d.nationalId ? [[' เลขประจำตัวประชาชน ', false], [idText(d.nationalId), true]] as [string, boolean][] : []),
      [` เป็นพนักงาน${d.empType === 'part' ? 'พาร์ตไทม์' : 'ประจำ'}ของบริษัทฯ ตั้งแต่วันที่ `, false], [longDate(d.startDate, 'th'), true],
      [' จนถึงปัจจุบัน ตำแหน่ง ', false], [pos, true], [' ได้รับเงินเดือนเดือนละ ', false], [pay, true]];
  const signer = lang === 'en' ? d.signer.nameEn || d.signer.name : d.signer.name || d.signer.nameEn;
  const title = lang === 'en' ? d.signer.titleEn || d.signer.title : d.signer.title || d.signer.titleEn;
  return {
    lang, co, name,
    coLines: [
      d.company.address,
      [d.company.phone ? T(`โทร ${d.company.phone}`, `Tel. ${d.company.phone}`) : '', d.company.email].filter(Boolean).join(' · '),
      d.company.taxId ? T(`เลขประจำตัวผู้เสียภาษี ${d.company.taxId}`, `Tax ID ${d.company.taxId}`) + (d.company.branch ? ` (${d.company.branch})` : '') : '',
    ].filter(Boolean),
    no: T(`ที่ ${c.no}`, `No. ${c.no}`),
    date: T(`วันที่ ${longDate(c.date, 'th')}`, longDate(c.date, 'en')),
    title: T('หนังสือรับรองเงินเดือน', 'Salary Certificate'),
    dear: T('เรียน ผู้ที่เกี่ยวข้อง', 'To whom it may concern,'),
    body,
    given: T(`ให้ไว้ ณ วันที่ ${longDate(c.date, 'th')}`, `Given on ${longDate(c.date, 'en')}.`),
    signer: signer ? `(${signer})` : '(........................................)',
    signerTitle: title,
    cancelled: c.cancelled ? T('ยกเลิก', 'CANCELLED') : '',
    cancelLine: c.cancelled ? T('ยกเลิกแล้ว', 'Cancelled') + (c.cancelReason ? `: ${c.cancelReason}` : '') : '',
  };
}
