import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowDown, ArrowUp } from "lucide-react";
import { Card } from "@/components/ui/card";
import { api, pageCache } from "@/lib/api";
import { L, fMonthYear, monthName, monthShort } from "@/lib/i18n";
import { money } from "@/lib/receipt-print";
import { cn } from "@/lib/utils";

// Dashboard money card with a small trend line (owner 26/10/2026, mockup Wh5svK5kTkob1JMvMAqqjf option A, "the chart
// does not need to be big, just the trend"): this month's money in, the change from last month, 6 / 12 months, a thin
// line; tapping/pointing at the line shows that month's total.

type Point = { month: string; total: number };

// Last answer per address, kept between visits: coming back to the dashboard (or a language switch, which redraws
// every page) shows the cards at once and refreshes them quietly (owner 26/10/2026: the two charts vanished for a
// moment and popped back in).
function useCached<T>(url: string) {
  // undefined = still waiting, null = could not load (card hidden, as before)
  const [value, setValue] = useState<T | null | undefined>(() => pageCache.get(url) as T | undefined);
  useEffect(() => {
    let live = true;
    api<T>(url).then((v) => { pageCache.set(url, v); if (live) setValue(v); })
      .catch(() => { if (live) setValue((old) => old ?? null); });
    return () => { live = false; };
  }, [url]);
  return value;
}

/** Same size as a loaded card, so nothing jumps on the very first load. */
function CardWaiting({ testId }: { testId: string }) {
  return <Card className="h-[236px] animate-pulse gap-0 rounded-3xl bg-muted/40 p-5" data-testid={`${testId}-waiting`} aria-hidden />;
}

const short = (m: string) => monthShort(Number(m.slice(5, 7)) - 1);

/** Blue for the students line, so it is never mixed up with the pink money line (validated pair, both themes). */
const BLUE = "text-[#5b7bb8] dark:text-[#6a90e6]";

function TrendLine({ points, label, value, testId, className }: { points: Point[]; label: string; value: (n: number) => string; testId: string; className?: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(300);
  const [hover, setHover] = useState<number | null>(null);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth || 300));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const H = 76, pt = 8, pb = 16, pl = 4, pr = 6;
  const max = Math.max(1, ...points.map((p) => p.total));
  const n = points.length;
  const x = (i: number) => pl + ((w - pl - pr) * i) / Math.max(1, n - 1);
  const y = (v: number) => pt + (H - pt - pb) * (1 - v / max);
  const line = points.map((p, i) => `${i ? "L" : "M"}${x(i)},${y(p.total)}`).join("");
  const area = `${line}L${x(n - 1)},${y(0)}L${x(0)},${y(0)}Z`;
  const pick = (clientX: number) => {
    const r = box.current!.getBoundingClientRect();
    setHover(Math.max(0, Math.min(n - 1, Math.round(((clientX - r.left - pl) / (w - pl - pr)) * (n - 1)))));
  };
  const every = n > 6 ? 3 : 1;
  const h = hover === null ? null : points[hover]!;
  return (
    <div ref={box} className={cn("relative mt-2 text-primary", className)} data-testid={`${testId}-trend`}>
      <svg width={w} height={H} viewBox={`0 0 ${w} ${H}`} className="block touch-none overflow-visible" role="img"
        aria-label={label}
        onPointerMove={(e) => pick(e.clientX)} onPointerDown={(e) => pick(e.clientX)} onPointerLeave={() => setHover(null)}>
        <line x1={pl} x2={w - pr} y1={y(0)} y2={y(0)} className="stroke-border" strokeWidth={1} />
        <path d={area} fill="currentColor" opacity={0.1} />
        <path d={line} fill="none" stroke="currentColor" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={x(n - 1)} cy={y(points[n - 1]!.total)} r={4} fill="currentColor" className="stroke-card" strokeWidth={2} />
        {points.map((p, i) => (i % every === 0 || i === n - 1) && (
          <text key={p.month} x={x(i)} y={H - 3} fontSize={9.5} textAnchor={i === 0 ? "start" : i === n - 1 ? "end" : "middle"} className="fill-muted-foreground">{short(p.month)}</text>
        ))}
        {h && hover !== null && (
          <>
            <line x1={x(hover)} x2={x(hover)} y1={pt} y2={y(0)} className="stroke-muted-foreground" strokeWidth={1} opacity={0.5} />
            <circle cx={x(hover)} cy={y(h.total)} r={4} fill="currentColor" className="stroke-card" strokeWidth={2} />
          </>
        )}
      </svg>
      {h && hover !== null && (
        <div className="pointer-events-none absolute -top-9 whitespace-nowrap rounded-xl bg-foreground px-2.5 py-1 text-xs text-background"
          style={{ left: Math.max(0, Math.min(w - 130, x(hover) - 65)) }} data-testid={`${testId}-tip`}>
          <b>{monthName(Number(h.month.slice(5, 7)) - 1)} {h.month.slice(0, 4)}</b> · {value(h.total)}
        </div>
      )}
    </div>
  );
}

function Periods({ value, onChange, testPrefix }: { value: 6 | 12; onChange: (m: 6 | 12) => void; testPrefix: string }) {
  return (
    <div className="mt-3 flex gap-1.5" role="group" aria-label={L("ช่วงเวลา", "Period")}>
      {([6, 12] as const).map((m) => (
        <button key={m} type="button" aria-pressed={value === m} onClick={() => onChange(m)} data-testid={`${testPrefix}-${m}`}
          className={cn("h-7 rounded-full px-3 text-xs font-bold transition-colors", value === m ? "bg-primary text-primary-foreground" : "border border-border bg-background hover:bg-muted")}>
          {L(`${m} เดือน`, `${m} months`)}
        </button>
      ))}
    </div>
  );
}

export function IncomeCard({ showReceipts }: { showReceipts: boolean }) {
  const [months, setMonths] = useState<6 | 12>(6);
  const points = useCached<Point[]>("/receipts/trend?months=12");
  const sum = useCached<{ total: number; count: number }>("/receipts/summary");
  if (points === undefined || sum === undefined) return <CardWaiting testId="money-card" />;
  if (!points || !sum) return null;
  const count = sum.count;
  const shown = points.slice(-months);
  const now = points[points.length - 1]!.total, before = points[points.length - 2]!.total;
  const pct = before > 0 ? Math.round(((now - before) / before) * 100) : null;
  return (
    <Card className="flex flex-col gap-0 rounded-3xl p-5" data-testid="money-card">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{L(`รับเงิน ${fMonthYear(new Date())}`, `Money in, ${fMonthYear(new Date())}`)}</p>
          <p className="font-display text-3xl font-semibold">{money(now)} {L("บาท", "THB")}</p>
          {pct !== null && (
            <p className={cn("mt-0.5 flex items-center gap-1 text-xs font-semibold", pct >= 0 ? "text-emerald-700 dark:text-emerald-400" : "text-orange-700 dark:text-orange-400")} data-testid="income-change">
              {pct >= 0 ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />}
              {pct >= 0 ? L(`เพิ่มขึ้น ${pct}% จากเดือนก่อน`, `Up ${pct}% from last month`) : L(`ลดลง ${-pct}% จากเดือนก่อน`, `Down ${-pct}% from last month`)}
            </p>
          )}
        </div>
        {showReceipts && <Link to="/receipts" className="shrink-0 rounded-full bg-accent px-3.5 py-1.5 text-xs font-semibold text-primary hover:bg-accent/70">{L(`${count} ใบเสร็จ`, `${count} receipts`)}</Link>}
      </div>
      <div className="mt-auto">
        <Periods value={months} onChange={setMonths} testPrefix="trend" />
        <TrendLine points={shown} testId="income" label={L("กราฟรายรับรายเดือน", "Monthly money in")} value={(n) => `${money(n)} ${L("บาท", "THB")}`} />
      </div>
    </Card>
  );
}

// New students per month (owner 26/10/2026, mockup L5xM6S1kDZLP5gn1Cve9qF option A: its own card beside the money card;
// counted by the day the student was added; everyone who may see students).
export function NewStudentsCard() {
  const [months, setMonths] = useState<6 | 12>(6);
  const points = useCached<Point[]>("/students/trend?months=12");
  if (points === undefined) return <CardWaiting testId="students-card" />;
  if (!points) return null;
  const now = points[points.length - 1]!.total, diff = now - points[points.length - 2]!.total;
  const people = (n: number) => L(`${n} คน`, n === 1 ? "1 student" : `${n} students`);
  return (
    <Card className="flex flex-col gap-0 rounded-3xl p-5" data-testid="students-card">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{L(`นักเรียนสมัครใหม่ ${fMonthYear(new Date())}`, `New students, ${fMonthYear(new Date())}`)}</p>
          <p className="font-display text-3xl font-semibold">{people(now)}</p>
          {diff !== 0 && (
            <p className={cn("mt-0.5 flex items-center gap-1 text-xs font-semibold", diff > 0 ? "text-emerald-700 dark:text-emerald-400" : "text-orange-700 dark:text-orange-400")} data-testid="students-change">
              {diff > 0 ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />}
              {diff > 0 ? L(`มากกว่าเดือนก่อน ${diff} คน`, `${diff} more than last month`) : L(`น้อยกว่าเดือนก่อน ${-diff} คน`, `${-diff} fewer than last month`)}
            </p>
          )}
        </div>
        <Link to="/students" className="shrink-0 rounded-full bg-accent px-3.5 py-1.5 text-xs font-semibold text-primary hover:bg-accent/70">{L("ดูนักเรียน", "See students")}</Link>
      </div>
      <div className="mt-auto">
        <Periods value={months} onChange={setMonths} testPrefix="students-trend" />
        <TrendLine points={points.slice(-months)} testId="students" className={BLUE} label={L("กราฟนักเรียนสมัครใหม่รายเดือน", "New students per month")} value={people} />
      </div>
    </Card>
  );
}
