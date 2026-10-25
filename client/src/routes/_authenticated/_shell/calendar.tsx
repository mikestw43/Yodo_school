import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { addDays, addMonths, addWeeks, endOfMonth, endOfWeek, format, isSameMonth, parseISO, startOfMonth, startOfWeek } from "date-fns";
import { ChevronLeft, ChevronRight, Clock, UsersRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Avatar, NativeSelect, PageHeader } from "@/components/yodo/ui";
import { DaysBadge } from "@/components/yodo/courses";
import { classesOn, enrolledOn, type ClassSlot } from "@/lib/courses";
import { classColor, fullName, useYodo, type Student } from "@/lib/yodo-store";
import { cn } from "@/lib/utils";
import { L, dayName, dayShort, fDayMonth, fMonthYear, monthName } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/_shell/calendar")({
  head: () => ({
    meta: [
      { title: "YODO" },
      { name: "description", content: L("ตารางเรียนรายเดือนและรายสัปดาห์ของ YODO", "YODO monthly and weekly class schedule") },
      { property: "og:title", content: "YODO" },
      { property: "og:description", content: L("ตารางเรียนรายเดือนและรายสัปดาห์ของ YODO", "YODO monthly and weekly class schedule") },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CalendarPage,
});

// Monday first
const DOW_INDEX = [1, 2, 3, 4, 5, 6, 0];
type Slot = ClassSlot & { date: string };

function CalendarPage() {
  const { data } = useYodo();
  const [view, setView] = useState<"month" | "week">("month");
  const [cursor, setCursor] = useState(new Date());
  const [classFilter, setClassFilter] = useState("all");
  const today = format(new Date(), "yyyy-MM-dd");
  const [day, setDay] = useState(today); // phones: the day whose classes are listed
  const [selected, setSelected] = useState<Slot | null>(null);

  const days = useMemo(() => {
    const start = view === "month" ? startOfWeek(startOfMonth(cursor), { weekStartsOn: 1 }) : startOfWeek(cursor, { weekStartsOn: 1 });
    const end = view === "month" ? endOfWeek(endOfMonth(cursor), { weekStartsOn: 1 }) : endOfWeek(cursor, { weekStartsOn: 1 });
    const out: Date[] = [];
    for (let d = start; d <= end; d = addDays(d, 1)) out.push(d);
    return out;
  }, [view, cursor]);
  const on = (date: string) => classesOn(data.classes, date).filter((x) => classFilter === "all" || x.classId === classFilter).map((x) => ({ ...x, date }));

  const move = (n: number) => setCursor((c) => (view === "month" ? addMonths(c, n) : addWeeks(c, n)));
  const title = view === "month" ? fMonthYear(cursor) : `${fDayMonth(days[0]!, false)} – ${fDayMonth(days[6]!)}`;
  const noDays = data.classes.filter((c) => !c.disabled).every((c) => !(c.days ?? []).length);
  const dayLabelLong = (date: string) => { const d = parseISO(date); return `${dayName(d.getDay())} ${d.getDate()} ${monthName(d.getMonth())}`; };

  const Event = ({ s, compact }: { s: Slot; compact?: boolean }) => {
    const c = data.classes.find((x) => x.id === s.classId);
    const color = classColor(data.classes, s.classId);
    return (
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setSelected(s); }}
        className="w-full rounded-lg px-2 py-1 text-left text-[11px] leading-tight transition-opacity hover:opacity-80"
        style={{ background: `color-mix(in oklab, ${color} 18%, transparent)`, borderLeft: `3px solid ${color}` }}
        data-testid="cal-event"
      >
        <div className="flex min-w-0 items-center gap-1">
          {s.start && <span className="shrink-0 font-semibold">{s.start}</span>}
          <span className={cn("min-w-0 truncate", compact && "text-[11px]")}>{c?.name}</span>
        </div>
        {!compact && s.start && <p className="text-muted-foreground">{s.start}{s.end ? `–${s.end}` : ""}</p>}
      </button>
    );
  };
  const dayList = on(day);

  return (
    <>
      <PageHeader title={L("ปฏิทิน", "Calendar")} subtitle={L("คลาสในแต่ละวัน ตามวันและเวลาเรียนของคลาส", "Classes on each day, from each class's days and time")} />
      <Card className="mb-4 flex flex-row flex-wrap items-center gap-3 rounded-3xl p-4">
        <div className="flex items-center gap-1">
          <Button size="icon" variant="ghost" onClick={() => move(-1)} aria-label={L("ก่อนหน้า", "Previous")}><ChevronLeft className="h-4 w-4" /></Button>
          <Button size="sm" variant="outline" className="rounded-full" onClick={() => { setCursor(new Date()); setDay(today); }}>{L("วันนี้", "Today")}</Button>
          <Button size="icon" variant="ghost" onClick={() => move(1)} aria-label={L("ถัดไป", "Next")}><ChevronRight className="h-4 w-4" /></Button>
        </div>
        <h2 className="flex-1 font-display text-2xl font-semibold">{title}</h2>
        <NativeSelect value={classFilter} onValueChange={setClassFilter} className="w-52 rounded-full">
          <option value="all">{L("ทุกคลาส", "All classes")}</option>
          {data.classes.filter((c) => !c.disabled).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </NativeSelect>
        <div className="flex rounded-full bg-muted p-1">
          {(["month", "week"] as const).map((v) => (
            <button key={v} type="button" onClick={() => setView(v)} className={cn("rounded-full px-4 py-1 text-sm font-medium capitalize", view === v ? "bg-card shadow-sm" : "text-muted-foreground")}>{v === "month" ? L("เดือน", "Month") : L("สัปดาห์", "Week")}</button>
          ))}
        </div>
      </Card>
      {noDays && <p className="mb-3 rounded-2xl bg-accent/40 px-4 py-2.5 text-sm">{L("ยังไม่มีคลาสที่ตั้งวันเรียน: ใส่วันและเวลาเรียนได้ที่หน้าคลาส › แก้ไข", "No class has class days yet: set the days and time on the Classes page › Edit")}</p>}

      <Card className="rounded-3xl p-0">
        <div className="grid grid-cols-7 border-b border-border bg-muted/50">
          {DOW_INDEX.map((wd) => dayShort(wd)).map((d, i) => (
            <div key={d} className="px-0 py-2 text-center text-xs font-semibold text-muted-foreground md:px-3">
              {d} {view === "week" && <span className="ml-1 text-foreground">{format(days[i]!, "d")}</span>}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {days.map((d) => {
            const key = format(d, "yyyy-MM-dd");
            const events = on(key);
            const out = view === "month" && !isSameMonth(d, cursor);
            return (
              <div
                key={key}
                onClick={() => setDay(key)}
                data-testid="cal-day"
                data-date={key}
                className={cn("cursor-pointer space-y-1 border-b border-r border-border p-1 transition-colors hover:bg-muted/40 md:p-1.5", view === "month" ? "min-h-14 md:min-h-28" : "min-h-24 md:min-h-96", out && "bg-muted/30 opacity-50", key === day && "bg-accent/40 md:bg-transparent")}
              >
                <div className="flex flex-col items-center gap-0.5 md:items-start">
                  {view === "month" && (
                    <span className={cn("inline-flex h-5 w-5 items-center justify-center rounded-full text-xs md:h-6 md:w-6", key === today && "bg-primary font-semibold text-primary-foreground")}>{format(d, "d")}</span>
                  )}
                  {view === "week" && key === today && <div className="h-1 w-full rounded-full bg-primary" />}
                  {/* phones: how many classes that day */}
                  {events.length > 0 && <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground md:hidden" data-testid="cal-count">{events.length}</span>}
                </div>
                <div className="hidden space-y-1 md:block">
                  {(view === "month" ? events.slice(0, 3) : events).map((s) => <Event key={s.classId} s={s} compact={view === "month"} />)}
                  {view === "month" && events.length > 3 && (
                    <button type="button" className="px-1 text-[11px] text-muted-foreground hover:underline md:px-2" onClick={(e) => { e.stopPropagation(); setCursor(d); setView("week"); }}>{L(`+อีก ${events.length - 3}`, `+${events.length - 3} more`)}</button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Phones: the tapped day's classes, by time */}
      <Card className="mt-4 gap-0 rounded-3xl p-4 md:hidden" data-testid="cal-daylist">
        <p className="mb-1 font-semibold">{dayLabelLong(day)} · {L(`${dayList.length} คลาส`, `${dayList.length} ${dayList.length === 1 ? "class" : "classes"}`)}</p>
        {dayList.length === 0 && <p className="py-3 text-sm text-muted-foreground">{L("วันนี้ไม่มีคลาส", "No classes this day")}</p>}
        {dayList.map((s) => {
          const c = data.classes.find((x) => x.id === s.classId);
          const t = data.teachers.find((x) => x.id === c?.teacherId);
          return (
            <button key={s.classId} type="button" onClick={() => setSelected(s)} className="flex items-center gap-3 border-t border-border/70 py-3 text-left first:border-0" data-testid="cal-row">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: classColor(data.classes, s.classId) }} />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">{c?.name}</span>
                <span className="block truncate text-xs text-muted-foreground">{s.start ? `${s.start}${s.end ? `–${s.end}` : ""} · ` : ""}{t ? t.nickname : L("ไม่มีครู", "No teacher")} · {L(`${enrolledOn(data.enrollments, s.classId, day).length} คน`, `${enrolledOn(data.enrollments, s.classId, day).length} students`)}</span>
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
            </button>
          );
        })}
      </Card>

      <SlotDialog slot={selected} onClose={() => setSelected(null)} />
    </>
  );
}

/** A class on a day: time, teacher and the students whose class runs that day (owner 25/10/2026). */
function SlotDialog({ slot, onClose }: { slot: Slot | null; onClose: () => void }) {
  const { data } = useYodo();
  const c = data.classes.find((x) => x.id === slot?.classId);
  const t = data.teachers.find((x) => x.id === c?.teacherId);
  const rows = slot ? enrolledOn(data.enrollments, slot.classId, slot.date)
    .map((e) => ({ e, s: data.students.find((x) => x.id === e.studentId) }))
    .filter((r): r is { e: (typeof r)["e"]; s: Student } => !!r.s && r.s.status === "Active")
    .sort((a, b) => fullName(a.s).localeCompare(fullName(b.s))) : [];
  return (
    <Dialog open={!!slot} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[88vh] max-w-md overflow-y-auto" data-testid="cal-slot">
        {slot && c && (
          <>
            <DialogHeader>
              <DialogTitle className="font-display text-2xl">{c.name}</DialogTitle>
              <DialogDescription>{c.description}</DialogDescription>
            </DialogHeader>
            <div className="space-y-3 rounded-2xl bg-muted/50 p-4 text-sm">
              <p className="flex items-center gap-2"><Clock className="h-4 w-4 text-primary" /> {(() => { const d = parseISO(slot.date); return `${dayName(d.getDay())} ${d.getDate()} ${monthName(d.getMonth())} ${d.getFullYear()}`; })()}{slot.start ? ` · ${slot.start}${slot.end ? `–${slot.end}` : ""}` : ""}</p>
              <div className="flex items-center gap-2"><Avatar src={t?.image} name={t?.nickname ?? "?"} className="h-7 w-7 text-sm" /> {t ? `${t.nickname} (${fullName(t)})` : L("ไม่มีครู", "No teacher")}</div>
              <p className="flex items-center gap-2"><UsersRound className="h-4 w-4 text-primary" /> {L(`นักเรียน ${rows.length} คน`, `${rows.length} students`)}</p>
            </div>
            {rows.length === 0 && <p className="text-sm text-muted-foreground">{L("ยังไม่มีนักเรียนที่เรียนคลาสนี้ในวันนั้น", "No student has this class running that day")}</p>}
            <ul className="space-y-2" data-testid="cal-students">
              {rows.map(({ e, s }) => (
                <li key={e.id} className="flex items-center gap-2 text-sm">
                  <Avatar src={s.image} name={s.firstName} className="h-7 w-7 text-xs" />
                  <Link to="/students" search={{ view: s.id }} className="min-w-0 flex-1 truncate hover:underline">{fullName(s)}{s.nickname ? ` (${s.nickname})` : ""}</Link>
                  {e.expiryDate && <DaysBadge expiry={e.expiryDate} />}
                </li>
              ))}
            </ul>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
