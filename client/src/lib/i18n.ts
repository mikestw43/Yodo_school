// Thai / English (owner's decision 12/10/2026): every visible text is written as L("ไทย", "English"), both required.
// The whole page under the app shell is redrawn when the language changes (see __root.tsx), so L() can read the
// current language at render time anywhere: components, helpers, print documents. Never call L() at module top level
// (it would freeze the language of the first load); call it inside a component or function.
// Typed data (names, class names, remarks) is never translated. Dates are dd/mm/yyyy, Christian era, in both.
import { useSyncExternalStore } from "react";

export type Lang = "th" | "en";
const KEY = "yodo-lang";
const read = (): Lang => { try { return localStorage.getItem(KEY) === "th" ? "th" : "en"; } catch { return "en"; } };
let current: Lang = typeof window === "undefined" ? "en" : read();
const listeners = new Set<() => void>();
if (typeof document !== "undefined") document.documentElement.lang = current;

export const getLang = () => current;
export function setLang(l: Lang) {
  if (l === current) return;
  current = l;
  try { localStorage.setItem(KEY, l); } catch { /* private mode */ }
  document.documentElement.lang = l;
  listeners.forEach((f) => f());
}
export function useLang(): Lang {
  return useSyncExternalStore((f) => { listeners.add(f); return () => listeners.delete(f); }, getLang, getLang);
}

/** The text in the current language. */
export const L = (th: string, en: string) => (current === "en" ? en : th);

// ---------- dates (Christian era in both languages) ----------
const MONTHS = {
  th: ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"],
  en: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
};
const SHORT = {
  th: ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."],
  en: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
};
const DAYS = {
  th: ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์"],
  en: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
};
const DAYS_SHORT = { th: ["อา.", "จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส."], en: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] };
const p2 = (n: number) => String(n).padStart(2, "0");
const toDate = (v: string | Date) => (v instanceof Date ? v : /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(`${v}T00:00:00`) : new Date(v));

/** dd/mm/yyyy */
export const fd = (v: string | Date | null | undefined) => { if (!v) return "-"; const d = toDate(v); return Number.isNaN(d.getTime()) ? "-" : `${p2(d.getDate())}/${p2(d.getMonth() + 1)}/${d.getFullYear()}`; };
/** dd/mm/yyyy HH:mm */
export const fdt = (v: string | Date | null | undefined) => { if (!v) return "-"; const d = toDate(v); return Number.isNaN(d.getTime()) ? "-" : `${fd(d)} ${p2(d.getHours())}:${p2(d.getMinutes())}`; };
/** "ตุลาคม 2026" / "October 2026" */
export const fMonthYear = (v: string | Date) => { const d = toDate(v); return `${MONTHS[current][d.getMonth()]} ${d.getFullYear()}`; };
/** "12 ต.ค. 2026" / "12 Oct 2026" */
export const fDayMonth = (v: string | Date, withYear = true) => { const d = toDate(v); return `${d.getDate()} ${SHORT[current][d.getMonth()]}${withYear ? ` ${d.getFullYear()}` : ""}`; };
export const monthName = (m: number) => MONTHS[current][m]!;
export const dayName = (wd: number) => DAYS[current][wd]!;
export const dayShort = (wd: number) => DAYS_SHORT[current][wd]!;

// ---------- choice lists: the stored value stays as it is, only the label follows the language ----------
const OPTIONS: Record<string, [string, string]> = {
  "ด.ญ.": ["ด.ญ.", "Miss"], "ด.ช.": ["ด.ช.", "Master"], "นาย": ["นาย", "Mr."], "นางสาว": ["นางสาว", "Ms."], "นาง": ["นาง", "Mrs."],
  "ไทย": ["ไทย", "Thai"], "Singaporean": ["สิงคโปร์", "Singaporean"], "Other": ["อื่นๆ", "Other"],
  "พุทธ": ["พุทธ", "Buddhist"], "คริสต์": ["คริสต์", "Christian"], "อิสลาม": ["อิสลาม", "Islam"],
  "Friends": ["เพื่อนแนะนำ", "Friends"], "จีน": ["จีน", "Chinese"], "HipHop": ["Hip Hop", "Hip Hop"],
  "Active": ["ใช้งาน", "Active"], "Disabled": ["ปิดใช้งาน", "Disabled"], "Inactive": ["ไม่เปิดสอน", "Inactive"],
};
/** Label of a stored choice (prefix, nationality, religion, source, status). Unknown values are shown as typed. */
export const opt = (v: string) => { const o = OPTIONS[v]; return o ? (current === "en" ? o[1] : o[0]) : v; };
/** "ด.ญ. / Miss": the prefix list shows both languages (owner 12/10/2026). */
export const bothLang = (v: string) => { const o = OPTIONS[v]; return o && o[0] !== o[1] ? `${o[0]} / ${o[1]}` : v; };
const THAI = /[\u0E00-\u0E7F]/;
/** Prefix, a space, then the first name ("ด.ญ. มะลิ", "Miss Mali"). A Thai name keeps its Thai prefix in English too,
 *  so a name never mixes languages ("ด.ญ. ธริดา", never "Miss ธริดา"; owner 12/10/2026). */
export const prefixed = (prefix: string, first: string) => {
  if (!prefix) return first;
  const o = OPTIONS[prefix];
  return `${o && THAI.test(first) ? o[0] : opt(prefix)} ${first}`;
};

/** "Facebook, Friends" <-> ["Facebook", "Friends"] (the "how did you hear about us" choices). */
export const splitList = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);
/** A choice shown with its typed text when it is "Other". */
export const optOr = (v: string, other: string) => (v === "Other" ? other || opt(v) : v ? opt(v) : "");
/** How did you hear about us, for showing: the choices, with "Other" replaced by what was typed. */
export const sourceText = (source: string, other: string) => splitList(source).map((x) => optOr(x, other)).join(", ");
