// Dates are "YYYY-MM-DD" in Asia/Bangkok, whatever the server's own clock zone is.
export const todayBkk = () => new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
export function addDays(d: string, n: number) {
  const t = new Date(`${d}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
}
export const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));

/** The last `n` months up to this one in Bangkok, oldest first, as "YYYY-MM" (dashboard trend lines). */
export function lastMonths(n: number) {
  const [y0, m0] = todayBkk().slice(0, 7).split('-').map(Number) as [number, number];
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.UTC(y0, m0 - 1 - (n - 1 - i), 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  });
}
/** "YYYY-MM" of a moment, in Bangkok. */
export const monthBkk = (d: Date) => new Date(d.getTime() + 7 * 3600e3).toISOString().slice(0, 7);
