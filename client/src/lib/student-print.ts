import { format, parseISO, isValid } from "date-fns";
import type { Student } from "@/lib/yodo-store";
import { L, fd, getLang, opt, prefixed, optOr, splitList } from "@/lib/i18n";
import logoUrlRaw from "@/assets/yodo-logo.png";
const logo = { url: logoUrlRaw };

/** The school's terms in the current language (call at render/print time). */
export const terms = () => [
  L("ข้าพเจ้าขอให้คำรับรองว่า ข้อความรายละเอียดต่างๆ ที่กรอกไว้ในใบสมัครข้างต้นนี้ถูกต้องตามความเป็นจริงทุกประการ หากข้อความใดเป็นเท็จ หรือมีการตรวจพบภายหลัง ข้าพเจ้าจะเป็นผู้รับผิดชอบในทุกกรณี",
    "I certify that all the details filled in on this application are true and correct in every respect. If any statement is false or is found to be false later, I will take full responsibility in every case."),
  L("ข้าพเจ้าขอยอมรับว่าโรงเรียน You Only Dance Once (Y.O.D.O) มีสิทธิ์ในการพิจารณารับหรือไม่รับในการสมัครแต่ละวิชาหรือถอดสิทธิ์การเป็นนักเรียนหากทำผิดกฎของทางโรงเรียน",
    "I accept that You Only Dance Once (Y.O.D.O) school has the right to accept or refuse each class application, or to withdraw student status if the school's rules are broken."),
  L("ข้าพเจ้าขอรับรองว่า หากมีอันตรายและหรือความเสียหายใดๆ ที่เกิดขึ้นกับข้าพเจ้าโดยเหตุสุดวิสัย หรืออุปกรณ์ของข้าพเจ้า ผู้ปกครองข้าพเจ้าจะเป็นผู้รับผิดชอบแต่เพียงผู้เดียว",
    "I certify that if any harm and/or damage happens to me or my belongings by unforeseeable circumstances, my parent or guardian alone will be responsible."),
  L("ข้าพเจ้าอนุญาตให้คุณครูมีสิทธิ์ในการพิจารณาคัดเลือกระดับชั้นเรียนที่เหมาะสมให้กับข้าพเจ้า",
    "I allow the teachers to choose the class level that suits me."),
  L("นักเรียนมีความจำเป็นที่จะต้องทำการสอบเพื่อประเมินศักยภาพ สำหรับการเลื่อนระดับชั้นในทุกๆ ปี",
    "Students need to take an assessment every year to move up a level."),
  L("ค่าเรียนในแต่ละ course จะต้องใช้ให้ครบภายในระยะเวลาที่ทางโรงเรียนกำหนดเท่านั้น (ยกเว้นในกรณีที่มีใบรับรองแพทย์)",
    "The fees for each course must be used within the period set by the school only (except with a medical certificate)."),
  L("ทางโรงเรียนสามารถใช้รูปภาพหรือวิดีโอ (ระหว่างการเรียน แสดง แข่ง) ของนักเรียนในการสื่อสารและโปรโมททางช่องทางออนไลน์และออฟไลน์ (หากไม่สะดวกกรุณาแจ้งทางโรงเรียน)",
    "The school may use photos or videos of students (during classes, shows and competitions) to communicate and promote online and offline (please tell the school if you do not agree)."),
  L("ข้าพเจ้าขอยอมรับว่า โรงเรียน You Only Dance Once (Y.O.D.O) มีสิทธิ์ในการไม่คืนเงินในทุกกรณี",
    "I accept that You Only Dance Once (Y.O.D.O) school has the right not to give refunds in any case."),
  L("ในกรณีที่เกิดการบาดเจ็บหรือป่วย ทางโรงเรียนสามารถผ่อนปรนระยะเวลาในการเรียนได้เฉพาะในกรณีที่มีใบรับรองแพทย์จากทางโรงพยาบาลเท่านั้น",
    "In case of injury or illness, the school can extend the study period only with a medical certificate from a hospital."),
];

function escapeHtml(value: string | number | null | undefined) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character] ?? character);
}

export function displayDate(value: string) {
  const date = parseISO(value);
  return isValid(date) ? format(date, "dd/MM/yyyy") : "";
}

export function ageDetail(dob: string) {
  const birth = parseISO(dob);
  if (!isValid(birth)) return "";
  const today = new Date();
  if (birth > today) return "";
  let years = today.getFullYear() - birth.getFullYear();
  let months = today.getMonth() - birth.getMonth();
  if (today.getDate() < birth.getDate()) months--;
  if (months < 0) { years--; months += 12; }
  return years > 0 ? L(`${years} ปี ${months} เดือน`, `${years} years ${months} months`) : L(`${months} เดือน`, `${months} months`);
}

/** The two statements ticked before signing (owner's wording 12/10/2026). */
export const agreeText = () => L("ข้าพเจ้าได้อ่านและยอมรับข้อตกลงและเงื่อนไขของโรงเรียนด้านบนแล้ว", "I have read and agree to the school's terms and conditions above.");
/** A tick box line for the printed application: ticked once signed (signing needs both ticks; owner 12/10/2026). */
export const BOX_SVG = (on: boolean) => `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#2b2024" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2"/>${on ? '<path d="m9 12 2 2 4-4"/>' : ""}</svg>`;
export const correctText = () => L("ขอยืนยันว่าข้อมูลที่กรอกในใบสมัครทั้งหมดถูกต้องตามความเป็นจริง", "I confirm that the information provided in this application form is true and correct.");

/** The applicant's label under the signature line (owner 12/10/2026). */
export const signerLabel = () => L("ผู้สมัคร / ผู้ปกครอง", "Applicant / Parent");

/** Date the student applied (when the record was made), dd/mm/yyyy in Bangkok. */
export function appliedOn(student: Student) {
  const d = new Date(student.createdAt);
  return isNaN(d.getTime()) ? "" : fd(d.toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" }));
}

export type FormField = { label: string; value: string; span: number };
/** Page 2 of the application, design A (owner 12/10/2026): four sections of label-over-value fields on a 6-column grid. */
export function formSections(student: Student): { title: string; fields: FormField[] }[] {
  const nationality = student.nationality === "Other" ? student.nationalityOther : opt(student.nationality);
  const sources = splitList(student.source);
  const f = (label: string, value: string | null | undefined, span = 2): FormField => ({ label, value: String(value ?? ""), span });
  return [
    { title: L("ข้อมูลนักเรียน", "Student"), fields: [
      f(L("ชื่อ", "First name"), prefixed(student.prefix, student.firstName)), f(L("นามสกุล", "Last name"), student.lastName), f(L("ชื่อเล่น", "Nickname"), student.nickname),
      f(L("วันเกิด", "Date of birth"), displayDate(student.dob)), f(L("อายุ", "Age"), ageDetail(student.dob)), f(L("เชื้อชาติ", "Ethnicity"), optOr(student.ethnicity, student.ethnicityOther)),
      f(L("สัญชาติ", "Nationality"), nationality), f(L("ศาสนา", "Religion"), optOr(student.religion, student.religionOther), 4),
    ] },
    { title: L("ข้อมูลติดต่อ", "Contact"), fields: [
      f(L("ที่อยู่", "Address"), student.address, 6),
      f(L("เบอร์โทร", "Phone"), student.phone), f("E-mail", student.email), f("Line ID", student.lineId),
    ] },
    { title: L("ผู้ติดต่อฉุกเฉิน", "Emergency contact"), fields: [
      f(L("ชื่อ", "Name"), student.emergencyName), f(L("ความสัมพันธ์", "Relationship"), student.relationship), f(L("เบอร์โทร", "Phone"), student.emergencyPhone),
    ] },
    { title: L("การเรียนเต้น", "Dance"), fields: [
      f(L("คลาสที่สนใจ", "Interested classes"), student.interested.map(opt).join(", "), 6),
      f(L("เคยเรียนเต้นมาก่อน", "Danced before"), student.hasExperience ? L("เคย", "Yes") : L("ไม่เคย", "No")), f(L("โปรดระบุ", "Please specify"), student.hasExperience ? student.experienceDetail : "", 4),
      f(L("รู้จัก Y.O.D.O. จาก", "Heard about Y.O.D.O. from"), sources.map(opt).join(", "), sources.includes("Other") ? 3 : 6),
      ...(sources.includes("Other") ? [f(L("อื่นๆ โปรดระบุ", "Other, please specify"), student.sourceOther, 3)] : []),
    ] },
  ];
}

/** A picture the document may show: a data URL or one of our stored files (made absolute for the print window). */
function picUrl(v = "") {
  if (/^data:image\/(?:png|jpeg|webp|gif);base64,/i.test(v) || /^https?:\/\//i.test(v)) return v;
  if (v.startsWith("/api/files/")) return new URL(v, window.location.origin).href;
  return "";
}

function signature(date: string, raw = "") {
  const img = picUrl(raw);
  const pic = img ? `<img class="sign-img" src="${escapeHtml(img)}" alt="${escapeHtml(L("ลายเซ็น", "Signature"))}" />` : "";
  return `<div class="signature"><div class="sign-line"><span class="line">${pic}</span></div><div class="sign-who">${escapeHtml(signerLabel())}</div><div class="sign-date"><span>${escapeHtml(L("วันที่", "Date"))}</span><span>${escapeHtml(date)}</span></div></div>`;
}

/** Opens a standalone, print-only A4 document; no student data is sent to a server. */
export function printStudentDocument(student: Student): boolean {
  const popup = window.open("", "_blank");
  if (!popup) return false;

  const today = student.signedAt ? fd(student.signedAt) : fd(new Date());
  const logoUrl = new URL(logo.url, window.location.origin).href;
  const photo = picUrl(student.image);
  const image = photo
    ? `<img class="student-photo" src="${escapeHtml(photo)}" alt="${escapeHtml(L("รูปนักเรียน", "Student photo"))}" />`
    : `<div class="student-photo empty-photo"></div>`;
  const sections = formSections(student).map((sec) => `<div class="sec"><div class="sec-title"><span>${escapeHtml(sec.title)}</span><i></i></div><div class="grid">${sec.fields.map((x) => `<div class="fld" style="grid-column: span ${x.span}"><div class="lbl">${escapeHtml(x.label)}</div><div class="val">${escapeHtml(x.value)}</div></div>`).join("")}</div></div>`).join("");

  popup.document.open();
  popup.document.write(`<!doctype html><html lang="${getLang()}"><head><meta charset="utf-8"/><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+Thai:wght@400;600&family=Noto+Serif+Thai:wght@600;700&display=swap"/><title>${escapeHtml(student.code)} - YODO</title>
<style>
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #fff; color: #171717; font-family: Tahoma, Arial, sans-serif; font-weight: 400; }
  .sheet { width: 210mm; height: 297mm; padding: 12mm 27mm 11mm; margin: 0 auto; display: flex; flex-direction: column; overflow: hidden; break-after: page; page-break-after: always; }
  .sheet:last-child { break-after: auto; page-break-after: auto; }
  .logo { width: 66mm; height: 34mm; object-fit: contain; display: block; margin: 0 auto; }
  .terms { margin-top: 11mm; font-size: 10.2pt; font-weight: 400; line-height: 1.55; }
  .terms-title { margin: 0 0 5mm; font-size: 10.6pt; font-weight: 400; }
  .terms ol { margin: 0; padding-left: 10mm; }
  .terms li { padding-left: 3mm; margin-bottom: 3.1mm; }
  .signature { width: 72mm; margin: auto 0 0 auto; font-size: 10pt; font-weight: 400; text-align: center; }
  .sign-line .line { display: block; height: 16mm; border-bottom: 1px solid #111; position: relative; }
  .sign-img { position: absolute; left: 50%; bottom: 1mm; transform: translateX(-50%); max-height: 15mm; max-width: 100%; object-fit: contain; }
  .sign-who { padding-top: 1.5mm; }
  .sign-date { display: flex; justify-content: center; gap: 2mm; color: #5f4b52; padding-top: 0.5mm; }
  .p2 { padding: 12mm 15mm 11mm; gap: 5mm; font-family: 'Noto Sans Thai', Tahoma, sans-serif; color: #2b2024; }
  .p2 .head { display: flex; align-items: flex-start; gap: 6mm; }
  .p2 .head-text { flex: 1; display: flex; flex-direction: column; gap: 2.5mm; }
  .p2 .logo { width: 50mm; height: 26mm; object-position: left center; margin: 0; }
  .p2 h1 { margin: 0; font-family: 'Noto Serif Thai', serif; font-size: 22pt; font-weight: 700; color: #8e2d4c; line-height: 1.1; }
  .p2 .meta { display: flex; gap: 5mm; font-size: 9.5pt; color: #6b5a60; }
  .p2 .meta b { color: #2b2024; font-weight: 600; }
  .student-photo { display: block; width: 35mm; height: 45mm; object-fit: cover; border-radius: 2.5mm; border: 1px solid #ead7dd; flex-shrink: 0; }
  .empty-photo { background: transparent; border-style: dashed; }
  .sec { display: flex; flex-direction: column; gap: 2mm; }
  .sec-title { display: flex; align-items: center; gap: 2.5mm; font-size: 10pt; font-weight: 600; color: #8e2d4c; white-space: nowrap; }
  .sec-title i { flex: 1; height: 1px; background: #e6c9d2; }
  .grid { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); column-gap: 4.5mm; row-gap: 2.6mm; }
  .tick { display: flex; align-items: flex-start; gap: 2mm; font-size: 10.2pt; margin-top: 3mm; }
  .tick svg { flex-shrink: 0; margin-top: 0.6mm; }
  .lbl { font-size: 8.3pt; color: #7a666c; }
  .val { font-size: 10.5pt; min-height: 6mm; padding-bottom: 0.8mm; border-bottom: 1px dotted #b9a2a9; word-break: break-word; }
  @media screen { body { background: #eee; } .sheet { background: #fff; box-shadow: 0 2px 15px #bbb; margin: 10mm auto; } }
  @media print { html, body { width: 210mm; } .sheet { margin: 0; box-shadow: none; } }
</style></head><body>
<section class="sheet"><img class="logo" src="${escapeHtml(logoUrl)}" alt="YODO You Only Dance Once" />
<div class="terms"><p class="terms-title">${escapeHtml(L("ข้อตกลงและเงื่อนไขของโรงเรียน", "School terms and conditions"))}</p><ol>${terms().map((term) => `<li>${escapeHtml(term)}</li>`).join("")}</ol><div class="tick">${BOX_SVG(!!student.signature)}<span>${escapeHtml(agreeText())}</span></div></div>
${signature(today, student.signature)}</section>
<section class="sheet p2"><div class="head"><div class="head-text"><img class="logo" src="${escapeHtml(logoUrl)}" alt="YODO You Only Dance Once" />
<h1>${escapeHtml(L("ใบสมัครเรียน", "Application form"))}</h1>
<div class="meta"><span>${escapeHtml(L("รหัสนักเรียน", "Student ID"))} <b>${escapeHtml(student.code)}</b></span><span>${escapeHtml(L("วันที่สมัคร", "Applied on"))} <b>${escapeHtml(appliedOn(student))}</b></span></div></div>
${image}</div>
${sections}
<div class="tick">${BOX_SVG(!!student.signature)}<span>${escapeHtml(correctText())}</span></div>
${signature(today, student.signature)}</section>
<script>
  window.addEventListener('load', async () => {
    try {
      await document.fonts.ready;
      await Promise.all(Array.from(document.images, img => img.decode().catch(() => {})));
    } finally { window.focus(); window.print(); }
  });
</script>
</body></html>`);
  popup.document.close();
  return true;
}