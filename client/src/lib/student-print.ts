import { format, parseISO, isValid } from "date-fns";
import type { Student } from "@/lib/yodo-store";
import logoUrlRaw from "@/assets/yodo-logo.png";
const logo = { url: logoUrlRaw };

export const terms = [
  "ข้าพเจ้าขอให้คำรับรองว่า ข้อความรายละเอียดต่างๆ ที่กรอกไว้ในใบสมัครข้างต้นนี้ถูกต้องตามความเป็นจริงทุกประการ หากข้อความใดเป็นเท็จ หรือมีการตรวจพบภายหลัง ข้าพเจ้าจะเป็นผู้รับผิดชอบในทุกกรณี",
  "ข้าพเจ้าขอยอมรับว่าโรงเรียน You Only Dance Once (Y.O.D.O) มีสิทธิ์ในการพิจารณารับหรือไม่รับในการสมัครแต่ละวิชาหรือถอดสิทธิ์การเป็นนักเรียนหากทำผิดกฎของทางโรงเรียน",
  "ข้าพเจ้าขอรับรองว่า หากมีอันตรายและหรือความเสียหายใดๆ ที่เกิดขึ้นกับข้าพเจ้าโดยเหตุสุดวิสัย หรืออุปกรณ์ของข้าพเจ้า ผู้ปกครองข้าพเจ้าจะเป็นผู้รับผิดชอบแต่เพียงผู้เดียว",
  "ข้าพเจ้าอนุญาตให้คุณครูมีสิทธิ์ในการพิจารณาคัดเลือกระดับชั้นเรียนที่เหมาะสมให้กับข้าพเจ้า",
  "นักเรียนมีความจำเป็นที่จะต้องทำการสอบเพื่อประเมินศักยภาพ สำหรับการเลื่อนระดับชั้นในทุกๆ ปี",
  "ค่าเรียนในแต่ละ course จะต้องใช้ให้ครบภายในระยะเวลาที่ทางโรงเรียนกำหนดเท่านั้น (ยกเว้นในกรณีที่มีใบรับรองแพทย์)",
  "ทางโรงเรียนสามารถใช้รูปภาพหรือวิดีโอ (ระหว่างการเรียน แสดง แข่ง) ของนักเรียนในการสื่อสารและโปรโมททางช่องทางออนไลน์และออฟไลน์ (หากไม่สะดวกกรุณาแจ้งทางโรงเรียน)",
  "ข้าพเจ้าขอยอมรับว่า โรงเรียน You Only Dance Once (Y.O.D.O) มีสิทธิ์ในการไม่คืนเงินในทุกกรณี",
  "ในกรณีที่เกิดการบาดเจ็บหรือป่วย ทางโรงเรียนสามารถผ่อนปรนระยะเวลาในการเรียนได้เฉพาะในกรณีที่มีใบรับรองแพทย์จากทางโรงพยาบาลเท่านั้น",
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
  return years > 0 ? `${years} ปี ${months} เดือน` : `${months} เดือน`;
}

function cell(label: string, value: string | number | null | undefined, labelSpan = 2, valueSpan = 2) {
  return `<th colspan="${labelSpan}"><span>${escapeHtml(label)}</span></th><td colspan="${valueSpan}"><span>${escapeHtml(value)}</span></td>`;
}

function signature(date: string, img = "") {
  const pic = /^data:image\/png;base64,/i.test(img) ? `<img class="sign-img" src="${escapeHtml(img)}" alt="ลายเซ็น" />` : "";
  return `<div class="signature"><div class="sign-line"><span>ลายเซ็นต์</span><span class="line">${pic}</span></div><div class="sign-date"><span>วันที่</span><span>${escapeHtml(date)}</span></div></div>`;
}

/** Opens a standalone, print-only A4 document; no student data is sent to a server. */
export function printStudentDocument(student: Student): boolean {
  const popup = window.open("", "_blank");
  if (!popup) return false;

  const today = student.signedAt ? student.signedAt.split("-").reverse().join("/") : format(new Date(), "dd/MM/yyyy");
  const logoUrl = new URL(logo.url, window.location.origin).href;
  const image = student.image && (/^data:image\/(?:png|jpeg|webp|gif);base64,/i.test(student.image) || /^https?:\/\//i.test(student.image))
    ? `<img class="student-photo" src="${escapeHtml(student.image)}" alt="รูปนักเรียน" />`
    : `<div class="student-photo empty-photo"></div>`;
  const interests = student.interested.join(", ");
  const nationality = student.nationality === "Other" ? student.nationalityOther : student.nationality;

  popup.document.open();
  popup.document.write(`<!doctype html><html lang="th"><head><meta charset="utf-8"/><title>${escapeHtml(student.code)} - YODO</title>
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
<div class="terms"><p class="terms-title">ข้อตกลงและเงื่อนไขของโรงเรียน</p><ol>${terms.map((term) => `<li>${escapeHtml(term)}</li>`).join("")}</ol></div>
${signature(today, student.signature)}</section>
<section class="sheet"><img class="logo" src="${escapeHtml(logoUrl)}" alt="YODO You Only Dance Once" />
${image}
<table><colgroup>${Array.from({ length: 12 }, () => "<col/>").join("")}</colgroup><tbody>
<tr>${cell("ชื่อ", `${student.prefix} ${student.firstName}`)}${cell("นามสกุล", student.lastName)}${cell("ชื่อเล่น", student.nickname)}</tr>
<tr>${cell("วันเกิด", displayDate(student.dob))}${cell("อายุ", ageDetail(student.dob), 2, 6)}</tr>
<tr>${cell("เชื้อชาติ", "")}${cell("สัญชาติ", nationality)}${cell("ศาสนา", student.religion)}</tr>
<tr>${cell("ที่อยู่", student.address, 2, 10)}</tr>
<tr>${cell("เบอร์โทร", student.phone)}${cell("E-mail", student.email)}${cell("Line ID", student.lineId)}</tr>
<tr>${cell("ผู้ติดต่อฉุกเฉิน", student.emergencyName, 3, 3)}${cell("เบอร์โทร", student.emergencyPhone, 2, 4)}</tr>
<tr>${cell("มีความสัมพันธ์เป็น", student.relationship, 3, 9)}</tr>
<tr>${cell("คลาสเต้นที่สนใจ", interests, 3, 9)}</tr>
<tr>${cell("เคยเรียนเต้นมาก่อนหรือไม่", student.hasExperience ? "เคย" : "ไม่เคย", 4, 2)}${cell("หากเคย โปรดระบุ", student.hasExperience ? student.experienceDetail : "", 3, 3)}</tr>
<tr>${cell("รู้จัก Y.O.D.O. จากช่องทางไหน", student.source, 4, 2)}${cell("อื่นๆ โปรดระบุ", student.source === "Other" ? student.sourceOther : "", 3, 3)}</tr>
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