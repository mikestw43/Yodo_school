import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { addDays, addMonths, addWeeks, endOfMonth, endOfWeek, format, isSameMonth, parseISO, startOfMonth, startOfWeek } from "date-fns";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Clock, Plus, Trash2, UsersRound, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Avatar, DateField, Field, NativeSelect, PageHeader } from "@/components/yodo/ui";
import { classColor, fullName, useYodo, type Schedule, type Student } from "@/lib/yodo-store";
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

function CalendarPage() {
  const { data, can } = useYodo();
  const [view, setView] = useState<"month" | "week">("month");
  const [cursor, setCursor] = useState(new Date());
  const [classFilter, setClassFilter] = useState("all");
  const [selected, setSelected] = useState<Schedule | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [addDate, setAddDate] = useState("");

  const days = useMemo(() => {
    const start = view === "month" ? startOfWeek(startOfMonth(cursor), { weekStartsOn: 1 }) : startOfWeek(cursor, { weekStartsOn: 1 });
    const end = view === "month" ? endOfWeek(endOfMonth(cursor), { weekStartsOn: 1 }) : endOfWeek(cursor, { weekStartsOn: 1 });
    const out: Date[] = [];
    for (let d = start; d <= end; d = addDays(d, 1)) out.push(d);
    return out;
  }, [view, cursor]);

  const byDate = useMemo(() => {
    const m = new Map<string, Schedule[]>();
    data.schedules
      .filter((s) => classFilter === "all" || s.classId === classFilter)
      .filter((s) => !data.classes.find((c) => c.id === s.classId)?.disabled)
      .forEach((s) => m.set(s.date, [...(m.get(s.date) ?? []), s]));
    m.forEach((l) => l.sort((a, b) => a.start.localeCompare(b.start)));
    return m;
  }, [data, classFilter]);

  const move = (n: number) => setCursor((c) => (view === "month" ? addMonths(c, n) : addWeeks(c, n)));
  const today = format(new Date(), "yyyy-MM-dd");
  const title = view === "month" ? fMonthYear(cursor) : `${fDayMonth(days[0]!, false)} – ${fDayMonth(days[6]!)}`;

  const Event = ({ s, compact }: { s: Schedule; compact?: boolean }) => {
    const c = data.classes.find((x) => x.id === s.classId);
    const color = classColor(data.classes, s.classId);
    return (
      <button
        onClick={(e) => { e.stopPropagation(); setSelected(s); }}
        className="w-full rounded-lg px-2 py-1 text-left text-[11px] leading-tight transition-opacity hover:opacity-80"
        style={{ background: `color-mix(in oklab, ${color} 18%, transparent)`, borderLeft: `3px solid ${color}` }}
      >
        <div className="flex min-w-0 items-center gap-1">
          <span className="shrink-0 font-semibold">{s.start}</span>
          <span className={cn("min-w-0 truncate", compact && "text-[11px]")}>{c?.name}</span>
        </div>
        {!compact && <p className="text-muted-foreground">{s.start}–{s.end}</p>}
      </button>
    );
  };

  return (
    <>
      <PageHeader title={L("ปฏิทิน", "Calendar")} subtitle={L("ตารางเรียนทั้งหมด", "All class schedules")} />
      <Card className="mb-4 flex flex-row flex-wrap items-center gap-3 rounded-3xl p-4">
        <div className="flex items-center gap-1">
          <Button size="icon" variant="ghost" onClick={() => move(-1)}><ChevronLeft className="h-4 w-4" /></Button>
          <Button size="sm" variant="outline" className="rounded-full" onClick={() => setCursor(new Date())}>{L("วันนี้", "Today")}</Button>
          <Button size="icon" variant="ghost" onClick={() => move(1)}><ChevronRight className="h-4 w-4" /></Button>
        </div>
        <h2 className="flex-1 font-display text-2xl font-semibold">{title}</h2>
        <NativeSelect value={classFilter} onValueChange={setClassFilter} className="w-52 rounded-full">
          <option value="all">{L("ทุกคลาส", "All classes")}</option>
          {data.classes.filter((c) => !c.disabled).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </NativeSelect>
        <div className="flex rounded-full bg-muted p-1">
          {(["month", "week"] as const).map((v) => (
            <button key={v} onClick={() => setView(v)} className={cn("rounded-full px-4 py-1 text-sm font-medium capitalize", view === v ? "bg-card shadow-sm" : "text-muted-foreground")}>{v === "month" ? L("เดือน", "Month") : L("สัปดาห์", "Week")}</button>
          ))}
        </div>
      </Card>

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
            const events = byDate.get(key) ?? [];
            const out = view === "month" && !isSameMonth(d, cursor);
            return (
              <div
                key={key}
                onClick={() => { if (!can("calendar", "add")) return; setAddDate(key); setAddOpen(true); }}
                className={cn("cursor-pointer space-y-1 border-b border-r border-border p-1 transition-colors hover:bg-muted/40 md:p-1.5", view === "month" ? "min-h-16 md:min-h-28" : "min-h-96", out && "bg-muted/30 opacity-50")}
              >
                {view === "month" && (
                  <span className={cn("inline-flex h-5 w-5 items-center justify-center rounded-full text-xs md:h-6 md:w-6", key === today && "bg-primary font-semibold text-primary-foreground")}>{format(d, "d")}</span>
                )}
                {view === "week" && key === today && <div className="h-1 rounded-full bg-primary" />}
                {(view === "month" ? events.slice(0, 3) : events).map((s) => <Event key={s.id} s={s} compact={view === "month"} />)}
                {view === "month" && events.length > 3 && (
                  <button className="px-1 text-[11px] text-muted-foreground hover:underline md:px-2" onClick={(e) => { e.stopPropagation(); setCursor(d); setView("week"); }}>{L(`+อีก ${events.length - 3}`, `+${events.length - 3} more`)}</button>
                )}
              </div>
            );
          })}
        </div>
      </Card>
      <p className="mt-2 text-xs text-muted-foreground">{L("เคล็ดลับ: คลิกที่วันเพื่อเพิ่มตารางเรียน", "Tip: click a day to add a lesson")}</p>

      <EventDialog schedule={selected} onClose={() => setSelected(null)} />
      <AddScheduleDialog open={addOpen} onOpenChange={setAddOpen} defaultDate={addDate} defaultClass={classFilter !== "all" ? classFilter : ""} />
    </>
  );
}

function EventDialog({ schedule, onClose }: { schedule: Schedule | null; onClose: () => void }) {
  const { data, deleteSchedule, addScheduleStudent, removeScheduleStudent, can } = useYodo();
  const [studentId, setStudentId] = useState("");
  const c = data.classes.find((x) => x.id === schedule?.classId);
  const t = data.teachers.find((x) => x.id === c?.teacherId);
  const attendeeIds = data.scheduleStudents.filter((entry) => entry.scheduleId === schedule?.id).map((entry) => entry.studentId);
  const attendees = attendeeIds.map((id) => data.students.find((s) => s.id === id)).filter((s): s is Student => s !== undefined);
  const day = schedule?.date ?? "";
  const available = data.enrollments
    .filter((e) => e.classId === c?.id && (!e.startDate || e.startDate <= day) && (!e.expiryDate || e.expiryDate >= day))
    .map((e) => data.students.find((s) => s.id === e.studentId))
    .filter((s, i, arr): s is Student => s !== undefined && s.status === "Active" && !attendeeIds.includes(s.id) && arr.indexOf(s) === i);
  const close = () => { setStudentId(""); onClose(); };
  return (
    <Dialog open={!!schedule} onOpenChange={(o) => !o && close()}>
      <DialogContent className="max-w-md">
        {schedule && c && (
          <>
            <DialogHeader>
              <DialogTitle className="font-display text-2xl">{c.name}</DialogTitle>
              <DialogDescription>{c.description}</DialogDescription>
            </DialogHeader>
            <div className="space-y-3 rounded-2xl bg-muted/50 p-4 text-sm">
              <p className="flex items-center gap-2"><Clock className="h-4 w-4 text-primary" /> {(() => { const d = parseISO(schedule.date); return `${dayName(d.getDay())} ${d.getDate()} ${monthName(d.getMonth())} ${d.getFullYear()}`; })()} · {schedule.start}–{schedule.end}</p>
              <p className="flex items-center gap-2"><UsersRound className="h-4 w-4 text-primary" /> {L(`นักเรียน ${attendees.length} คน`, `${attendees.length} students`)}</p>
              <div className="flex items-center gap-2"><Avatar src={t?.image} name={t?.nickname ?? "?"} className="h-7 w-7 text-sm" /> {t ? `${t.nickname} (${fullName(t)})` : "-"}</div>
            </div>
            <div className="space-y-3">
              <p className="text-sm font-semibold">{L(`นักเรียนในคาบนี้ (${attendees.length})`, `Students in this lesson (${attendees.length})`)}</p>
              {attendees.length === 0 && <p className="text-sm text-muted-foreground">{L("ยังไม่มีนักเรียนในคาบนี้", "No students in this lesson yet")}</p>}
              <ul className="max-h-48 space-y-2 overflow-y-auto">
                {attendees.map((student) => (
                  <li key={student.id} className="flex items-center gap-2 text-sm">
                    <Avatar src={student.image} name={student.firstName} className="h-7 w-7 text-xs" />
                    <span className="min-w-0 flex-1 truncate">{fullName(student)} ({student.nickname})</span>
                    {can("calendar", "edit") && <Button size="icon" variant="ghost" className="h-8 w-8" title={L("นำออกจากคาบ", "Remove from lesson")} aria-label={L(`นำ ${fullName(student)} ออกจากคาบ`, `Remove ${fullName(student)} from the lesson`)} onClick={() => { removeScheduleStudent(schedule.id, student.id); toast.success(L("นำออกจากคาบแล้ว", "Removed from the lesson")); }}><X className="h-4 w-4" /></Button>}
                  </li>
                ))}
              </ul>
              {can("calendar", "edit") && <div className="flex items-end gap-2">
                <Field label={L("เพิ่มนักเรียน", "Add student")} className="min-w-0 flex-1">
                <NativeSelect value={available.some((s) => s.id === studentId) ? studentId : ""} onValueChange={setStudentId} className="min-w-0">
                  <option value="">{available.length ? L("เลือกนักเรียนที่ลงทะเบียนคลาส", "Pick a student enrolled in this class") : L("ไม่มีนักเรียนที่คอร์สยังไม่หมดอายุในวันนี้", "No students with a course still valid on this day")}</option>
                  {available.map((student) => <option key={student.id} value={student.id}>{fullName(student)} ({student.nickname})</option>)}
                </NativeSelect>
                </Field>
                <Button size="icon" title={L("เพิ่มนักเรียนเข้าคาบ", "Add student to lesson")} aria-label={L("เพิ่มนักเรียนเข้าคาบ", "Add student to lesson")} disabled={!available.some((s) => s.id === studentId)} onClick={() => { if (!available.some((s) => s.id === studentId)) return; addScheduleStudent(schedule.id, studentId); setStudentId(""); toast.success(L("เพิ่มนักเรียนเข้าคาบแล้ว", "Student added to the lesson")); }}><Plus className="h-4 w-4" /></Button>
              </div>}
            </div>
            <DialogFooter>
              {can("calendar", "delete") && <Button variant="ghost" className="text-destructive hover:text-destructive" onClick={() => { deleteSchedule(schedule.id); toast.success(L("ลบตารางเรียนแล้ว", "Lesson deleted")); close(); }}><Trash2 className="h-4 w-4" /> {L("ลบคาบนี้", "Delete this lesson")}</Button>}
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function AddScheduleDialog({ open, onOpenChange, defaultDate, defaultClass }: { open: boolean; onOpenChange: (o: boolean) => void; defaultDate: string; defaultClass: string }) {
  const { data, addSchedules } = useYodo();
  const [f, setF] = useState({ classId: "", date: "", start: "17:00", end: "18:00" });
  const [errors, setErrors] = useState<Partial<Record<"classId" | "date" | "end", string>>>({});
  const [lastOpen, setLastOpen] = useState(false);
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) { setErrors({}); setF({ classId: defaultClass, date: defaultDate, start: "17:00", end: "18:00" }); }
  }
  const classes = data.classes.filter((c) => c.status === "Active" && !c.disabled);
  const submit = () => {
    const e: Partial<Record<"classId" | "date" | "end", string>> = {};
    if (!classes.some((c) => c.id === f.classId)) e.classId = L("กรุณาเลือกคลาสที่เปิดอยู่", "Please pick an open class");
    if (!f.date) e.date = L("กรุณาเลือกวันที่", "Please pick a date");
    if (!f.start || !f.end) e.end = L("กรุณาระบุเวลา", "Please enter the times");
    else if (f.end <= f.start) e.end = L("เวลาสิ้นสุดต้องหลังเวลาเริ่ม", "End time must be after the start time");
    setErrors(e);
    if (Object.keys(e).length) return;
    addSchedules([{ classId: f.classId, date: f.date, start: f.start, end: f.end }]);
    toast.success(L("เพิ่มตารางเรียนแล้ว", "Lesson added"));
    onOpenChange(false);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">{L("เพิ่มตารางเรียน", "Add Schedule")}</DialogTitle>
          <DialogDescription>{L("สร้างคาบเรียนก่อน แล้วเพิ่มนักเรียนจากรายละเอียดคาบ", "Create the lesson first, then add students from the lesson details")}</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-4">
          <Field label={L("คลาส", "Class")} required error={errors.classId} className="col-span-2">
            <NativeSelect value={f.classId} onValueChange={(value) => setF({ ...f, classId: value })}>
              <option value="">{L("เลือกคลาส", "Pick a class")}</option>
              {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </NativeSelect>
          </Field>
          <Field label={L("วันที่", "Date")} required error={errors.date} className="col-span-2"><Input type="date" value={f.date} disabled={!!defaultDate} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
          <Field label={L("เริ่ม", "Start")} required><Input type="time" value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} /></Field>
          <Field label={L("สิ้นสุด", "End")} required error={errors.end}><Input type="time" value={f.end} onChange={(e) => setF({ ...f, end: e.target.value })} /></Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{L("ยกเลิก", "Cancel")}</Button>
          <Button onClick={submit}>{L("บันทึก", "Save")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
