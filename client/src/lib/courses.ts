import { addDays, addMonths, addWeeks, differenceInCalendarDays, format, isValid, parseISO } from "date-fns";
import { L } from "@/lib/i18n";
import type { Enrollment } from "@/lib/yodo-store";

// Course dates (owner 12/10/2026, mockup WTr5LoqwQAEnSrKDuzZiMi). All dates are yyyy-MM-dd in Bangkok.

export const todayIso = () => new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
const iso = (d: Date) => format(d, "yyyy-MM-dd");

/** Start + n months − 1 day (12/10/2026 + 6 months = 11/04/2027). */
export function courseEnd(start: string, months: number) {
  const d = parseISO(start);
  if (!isValid(d)) return "";
  return iso(new Date(d.getFullYear(), d.getMonth() + months, d.getDate() - 1));
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
