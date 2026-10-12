// Dates are "YYYY-MM-DD" in Asia/Bangkok, whatever the server's own clock zone is.
export const todayBkk = () => new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
export function addDays(d: string, n: number) {
  const t = new Date(`${d}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
}
export const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));
