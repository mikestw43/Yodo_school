import { addDays, addMonths, addWeeks, differenceInCalendarDays, format, isValid, parseISO } from "date-fns";
import { L } from "@/lib/i18n";
import type { Enrollment } from "@/lib/yodo-store";

// Course dates (owner 12/10/2026, mockup WTr5LoqwQAEnSrKDuzZiMi). All dates are yyyy-MM-dd in Bangkok.

export const todayIso = () => new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
const iso = (d: Date) => format(d, "yyyy-MM-dd");

/** Start + n months + w weeks − 1 day (12/10/2026 + 6 months = 11/04/2027; owner 25/10/2026 added weeks). */
export function courseEnd(start: string, months: number, weeks = 0) {
  const d = parseISO(start);
  if (!isValid(d)) return "";
  return iso(new Date(d.getFullYear(), d.getMonth() + months, d.getDate() + weeks * 7 - 1));
}

/** "3 เดือน 2 สัปดาห์" / "3 months 2 weeks". */
export function lengthText(months: number, weeks = 0) {
  return [
    months ? L(`${months} เดือน`, `${months} ${months === 1 ? "month" : "months"}`) : "",
    weeks ? L(`${weeks} สัปดาห์`, `${weeks} ${weeks === 1 ? "week" : "weeks"}`) : "",
  ].filter(Boolean).join(" ");
}

export const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
export const dayLabel = (d: string) => ({ mon: L("จ", "Mon"), tue: L("อ", "Tue"), wed: L("พ", "Wed"), thu: L("พฤ", "Thu"), fri: L("ศ", "Fri"), sat: L("ส", "Sat"), sun: L("อา", "Sun") } as Record<string, string>)[d] ?? d;
/** "จ, พ, ส · 17:00–18:00", "" when nothing is set. */
export function whenText(c: { days?: string[]; startTime?: string; endTime?: string }) {
  const days = (c.days ?? []).map(dayLabel).join(", ");
  const time = c.startTime ? `${c.startTime}${c.endTime ? `–${c.endTime}` : ""}` : "";
  return [days, time].filter(Boolean).join(" · ");
}

/** A renewal starts the day after the course still running ends (no days lost), else today (owner's choice). */
export function nextStart(e?: Enrollment | null) {
  const today = todayIso();
  return e?.expiryDate && e.expiryDate >= today ? iso(addDays(parseISO(e.expiryDate), 1)) : today;
}

export type PeriodUnit = "day" | "week" | "month";
export function addPeriod(date: string, n: number, unit: PeriodUnit) {
  const d = parseISO(date);
  if (!isValid(d) || !n) return date;
  return iso(unit === "month" ? addMonths(d, n) : unit === "week" ? addWeeks(d, n) : addDays(d, n));
}
export const daysBetween = (a: string, b: string) => differenceInCalendarDays(parseISO(b), parseISO(a));

/** Days until the expiry date (0 = today is the last day, below 0 = ended), null = no expiry date. */
export function daysLeft(expiry: string) {
  if (!expiry || !isValid(parseISO(expiry))) return null;
  return daysBetween(todayIso(), expiry);
}
export type CourseState = "none" | "ok" | "soon" | "ended";
/** "soon" = the warning days set in the notification settings, or fewer. */
export function courseState(expiry: string, soonDays: number): CourseState {
  const n = daysLeft(expiry);
  if (n === null) return "none";
  if (n < 0) return "ended";
  return n <= soonDays ? "soon" : "ok";
}
export function daysText(n: number | null) {
  if (n === null) return L("ไม่มีวันหมดอายุ", "No expiry date");
  if (n < 0) return L(`หมด ${-n} วันแล้ว`, -n === 1 ? "Ended 1 day ago" : `Ended ${-n} days ago`);
  if (n === 0) return L("วันนี้วันสุดท้าย", "Last day today");
  return L(`เหลือ ${n} วัน`, n === 1 ? "1 day left" : `${n} days left`);
}

// Calendar from the class days (owner 25/10/2026, mockup FdcxhSow1MpxYu8V4CK2nT): no sessions to add one by one.
const DOW_KEY = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
export type ClassSlot = { classId: string; start: string; end: string };
/** Classes held on a yyyy-MM-dd date, by start time (open classes with that weekday ticked). */
export function classesOn(classes: { id: string; disabled: boolean; days?: string[]; startTime?: string; endTime?: string }[], date: string): ClassSlot[] {
  const d = parseISO(date);
  if (!isValid(d)) return [];
  const key = DOW_KEY[d.getDay()]!;
  return classes.filter((c) => !c.disabled && (c.days ?? []).includes(key))
    .map((c) => ({ classId: c.id, start: c.startTime ?? "", end: c.endTime ?? "" }))
    .sort((a, b) => (a.start || "99").localeCompare(b.start || "99"));
}
/** Enrollments of a class that cover the date (bought, not ended that day). */
export function enrolledOn(enrollments: Enrollment[], classId: string, date: string) {
  return enrollments.filter((e) => e.classId === classId && (!e.startDate || e.startDate <= date) && (!e.expiryDate || e.expiryDate >= date));
}
type LessonData = { classes: Parameters<typeof classesOn>[0]; enrollments: Enrollment[]; students: { id: string; status: string }[] };
/** Active students whose class runs on the date. */
export function studentsOn(data: LessonData, classId: string, date: string) {
  return enrolledOn(data.enrollments, classId, date).filter((e) => data.students.some((s) => s.id === e.studentId && s.status === "Active"));
}
/** The calendar's lessons: a class on its days, only on the days someone is in it (owner 25/10/2026: an empty
 *  Saturday must not show the class). */
export function lessonsOn(data: LessonData, date: string): ClassSlot[] {
  return classesOn(data.classes, date).filter((x) => studentsOn(data, x.classId, date).length > 0);
}
