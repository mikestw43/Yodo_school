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

function cell(label: string, value: string | number | null | undefined, labelSpan = 2, valueSpan = 2) {
  return `<th colspan="${labelSpan}"><span>${escapeHtml(label)}</span></th><td colspan="${valueSpan}"><span>${escapeHtml(value)}</span></td>`;
}

function signature(date: string, img = "") {
  const pic = /^data:image\/png;base64,/i.test(img) ? `<img class="sign-img" src="${escapeHtml(img)}" alt="${escapeHtml(L("ลายเซ็น", "Signature"))}" />` : "";
  return `<div class="signature"><div class="sign-line"><span>${escapeHtml(L("ลายเซ็นต์", "Signature"))}</span><span class="line">${pic}</span></div><div class="sign-date"><span>${escapeHtml(L("วันที่", "Date"))}</span><span>${escapeHtml(date)}</span></div></div>`;
}

/** Opens a standalone, print-only A4 document; no student data is sent to a server. */
export function printStudentDocument(student: Student): boolean {
  const popup = window.open("", "_blank");
  if (!popup) return false;

  const today = student.signedAt ? fd(student.signedAt) : fd(new Date());
  const logoUrl = new URL(logo.url, window.location.origin).href;
  const image = student.image && (/^data:image\/(?:png|jpeg|webp|gif);base64,/i.test(student.image) || /^https?:\/\//i.test(student.image))
    ? `<img class="student-photo" src="${escapeHtml(student.image)}" alt="${escapeHtml(L("รูปนักเรียน", "Student photo"))}" />`
    : `<div class="student-photo empty-photo"></div>`;
  const interests = student.interested.map(opt).join(", ");
  const nationality = student.nationality === "Other" ? student.nationalityOther : opt(student.nationality);

  popup.document.open();
  popup.document.write(`<!doctype html><html lang="${getLang()}"><head><meta charset="utf-8"/><title>${escapeHtml(student.code)} - YODO</title>
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
  .signature { width: 78mm; margin: auto 0 0 auto; font-size: 10pt; font-weight: 400; }
  .sign-line, .sign-date { display: flex; align-items: end; gap: 2mm; }
  .sign-line .line { flex: 1; height: 14mm; border-bottom: 1px solid #111; position: relative; }
  .sign-img { position: absolute; left: 50%; bottom: 0; transform: translateX(-50%); max-height: 16mm; max-width: 100%; object-fit: contain; }
  .sign-date { justify-content: center; gap: 3mm; padding: 1mm 0 0; }
  .student-photo { display: block; width: 43mm; height: 39mm; object-fit: cover; margin: 9mm auto 10mm; }
  .empty-photo { background: transparent; }
  table { border-collapse: collapse; width: 100%; table-layout: fixed; font-size: 9pt; line-height: 1.4; }
  col { width: 8.333333%; }
  th, td { border: 1px solid #171717; padding: 1.8mm 1.4mm; text-align: left; vertical-align: middle; font-weight: 400; }
  th span, td span { display: inline-block; white-space: nowrap; vertical-align: middle; transform-origin: left center; }
  @media screen { body { background: #eee; } .sheet { background: #fff; box-shadow: 0 2px 15px #bbb; margin: 10mm auto; } }
  @media print { html, body { width: 210mm; } .sheet { margin: 0; box-shadow: none; } }
</style></head><body>
<section class="sheet"><img class="logo" src="${escapeHtml(logoUrl)}" alt="YODO You Only Dance Once" />
<div class="terms"><p class="terms-title">${escapeHtml(L("ข้อตกลงและเงื่อนไขของโรงเรียน", "School terms and conditions"))}</p><ol>${terms().map((term) => `<li>${escapeHtml(term)}</li>`).join("")}</ol></div>
${signature(today, student.signature)}</section>
<section class="sheet"><img class="logo" src="${escapeHtml(logoUrl)}" alt="YODO You Only Dance Once" />
${image}
<table><colgroup>${Array.from({ length: 12 }, () => "<col/>").join("")}</colgroup><tbody>
<tr>${cell(L("ชื่อ", "First name"), prefixed(student.prefix, student.firstName))}${cell(L("นามสกุล", "Last name"), student.lastName)}${cell(L("ชื่อเล่น", "Nickname"), student.nickname)}</tr>
<tr>${cell(L("วันเกิด", "Date of birth"), displayDate(student.dob))}${cell(L("อายุ", "Age"), ageDetail(student.dob), 2, 6)}</tr>
<tr>${cell(L("เชื้อชาติ", "Ethnicity"), optOr(student.ethnicity, student.ethnicityOther))}${cell(L("สัญชาติ", "Nationality"), nationality)}${cell(L("ศาสนา", "Religion"), optOr(student.religion, student.religionOther))}</tr>
<tr>${cell(L("ที่อยู่", "Address"), student.address, 2, 10)}</tr>
<tr>${cell(L("เบอร์โทร", "Phone"), student.phone)}${cell("E-mail", student.email)}${cell("Line ID", student.lineId)}</tr>
<tr>${cell(L("ผู้ติดต่อฉุกเฉิน", "Emergency contact"), student.emergencyName, 3, 3)}${cell(L("เบอร์โทร", "Phone"), student.emergencyPhone, 2, 4)}</tr>
<tr>${cell(L("มีความสัมพันธ์เป็น", "Relationship"), student.relationship, 3, 9)}</tr>
<tr>${cell(L("คลาสเต้นที่สนใจ", "Interested dance classes"), interests, 3, 9)}</tr>
<tr>${cell(L("เคยเรียนเต้นมาก่อนหรือไม่", "Danced before?"), student.hasExperience ? L("เคย", "Yes") : L("ไม่เคย", "No"), 4, 2)}${cell(L("หากเคย โปรดระบุ", "If yes, please specify"), student.hasExperience ? student.experienceDetail : "", 3, 3)}</tr>
<tr>${cell(L("รู้จัก Y.O.D.O. จากช่องทางไหน", "How did you hear about Y.O.D.O.?"), splitList(student.source).map(opt).join(", "), 4, 2)}${cell(L("อื่นๆ โปรดระบุ", "Other, please specify"), splitList(student.source).includes("Other") ? student.sourceOther : "", 3, 3)}</tr>
</tbody></table>${signature(today, student.signature)}</section>
<script>
  window.addEventListener('load', async () => {
    try {
      await document.fonts.ready;
      await Promise.all(Array.from(document.images, img => img.decode().catch(() => {})));
      document.querySelectorAll('table th, table td').forEach(cell => {
        const text = cell.querySelector('span');
        if (!text) return;
        const available = cell.clientWidth - parseFloat(getComputedStyle(cell).paddingLeft) - parseFloat(getComputedStyle(cell).paddingRight);
        let size = 12;
        while (text.getBoundingClientRect().width > available && size > 8) {
          size -= 0.5;
          text.style.fontSize = size + 'px';
        }
        const width = text.getBoundingClientRect().width;
        if (width > available && available > 0) text.style.transform = 'scaleX(' + available / width + ')';
      });
    } finally { window.focus(); window.print(); }
  });
</script>
</body></html>`);
  popup.document.close();
  return true;
}