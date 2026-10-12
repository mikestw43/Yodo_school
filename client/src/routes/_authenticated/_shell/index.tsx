import { createFileRoute, Link } from "@tanstack/react-router";
import { addDays, format, startOfWeek } from "date-fns";
import { CalendarHeart, Crown, Music4, PersonStanding } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Avatar, PageHeader } from "@/components/yodo/ui";
import { ageText, classColor, fullName, useYodo } from "@/lib/yodo-store";

export const Route = createFileRoute("/_authenticated/_shell/")({
  head: () => ({
    meta: [
      { title: "YODO" },
      { name: "description", content: "ภาพรวมนักเรียน คลาส ครู และตารางเรียนของ YODO" },
      { property: "og:title", content: "YODO" },
      { property: "og:description", content: "ภาพรวมนักเรียน คลาส ครู และตารางเรียนของ YODO" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const { data } = useYodo();
  const today = format(new Date(), "yyyy-MM-dd");
  const ws = startOfWeek(new Date(), { weekStartsOn: 1 });
  const weekDates = new Set(Array.from({ length: 7 }, (_, i) => format(addDays(ws, i), "yyyy-MM-dd")));
  const liveClasses = data.classes.filter((c) => !c.disabled);
  const stats = [
    { label: "นักเรียน Active", value: data.students.filter((s) => s.status === "Active").length, icon: PersonStanding, to: "/students" as const },
    { label: "คลาสที่เปิดอยู่", value: liveClasses.filter((c) => c.status === "Active").length, icon: Music4, to: "/classes" as const },
    { label: "ครูผู้สอน", value: data.teachers.filter((t) => t.status === "Active").length, icon: Crown, to: "/teachers" as const },
    { label: "คาบเรียนสัปดาห์นี้", value: data.schedules.filter((s) => weekDates.has(s.date)).length, icon: CalendarHeart, to: "/calendar" as const },

  ];
  const todays = data.schedules.filter((s) => s.date === today).sort((a, b) => a.start.localeCompare(b.start));
  const recent = [...data.students].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 5);
  const maxCount = Math.max(1, ...liveClasses.map((c) => data.enrollments.filter((e) => e.classId === c.id).length));

  return (
    <>
      <PageHeader title="Dashboard" subtitle={`สวัสดี! วันนี้ ${format(new Date(), "d MMM yyyy")}`} />

      <div className="relative mb-8 overflow-hidden rounded-[2rem] bg-accent px-8 py-10">
        <svg viewBox="0 0 600 160" className="absolute inset-0 h-full w-full text-primary/25" preserveAspectRatio="none" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M-20 120 C 120 10, 220 170, 360 70 S 560 30, 620 110" />
          <path d="M-20 140 C 140 40, 240 190, 380 95 S 560 60, 620 140" opacity="0.5" />
        </svg>
        <div className="relative">
          <p className="text-xs uppercase tracking-[0.3em] text-accent-foreground">YODO Dance Academy</p>
          <h2 className="mt-2 max-w-lg font-display text-3xl font-semibold leading-tight md:text-4xl">Every step tells a story.</h2>
        </div>
      </div>

      <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map((s) => (
          <Link key={s.label} to={s.to}>
            <Card className="gap-2 rounded-3xl border-border/60 p-5 transition-shadow hover:shadow-soft">
              <s.icon className="h-5 w-5 text-primary" />
              <p className="font-display text-4xl font-semibold">{s.value}</p>
              <p className="text-xs text-muted-foreground">{s.label}</p>
            </Card>
          </Link>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="rounded-3xl p-6 lg:col-span-2">
          <h3 className="font-display text-xl font-semibold">ตารางเรียนวันนี้</h3>
          {todays.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">วันนี้ไม่มีคลาสเรียน 🩰</p>
          ) : (
            <ul className="space-y-2">
              {todays.map((s) => {
                const c = data.classes.find((x) => x.id === s.classId);
                const t = data.teachers.find((x) => x.id === c?.teacherId);
                return (
                  <li key={s.id} className="flex items-center gap-4 rounded-2xl bg-muted/60 p-3">
                    <span className="h-10 w-1.5 rounded-full" style={{ background: classColor(data.classes, s.classId) }} />
                    <div className="w-24 text-sm font-semibold">{s.start}–{s.end}</div>
                    <div className="flex-1">
                      <p className="font-medium">{c?.name}</p>
                      <p className="text-xs text-muted-foreground">{t ? t.nickname : "-"} · {data.scheduleStudents.filter((entry) => entry.scheduleId === s.id).length} นักเรียน</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card className="rounded-3xl p-6">
          <h3 className="font-display text-xl font-semibold">นักเรียนล่าสุด</h3>
          <ul className="space-y-3">
            {recent.map((s) => (
              <li key={s.id} className="flex items-center gap-3">
                <Avatar src={s.image} name={s.firstName} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{fullName(s)}</p>
                  <p className="text-xs text-muted-foreground">{s.code} · {ageText(s.dob)}</p>
                </div>
              </li>
            ))}
          </ul>
        </Card>

        <Card className="rounded-3xl p-6 lg:col-span-3">
          <h3 className="font-display text-xl font-semibold">จำนวนนักเรียนต่อคลาส</h3>
          <div className="space-y-3">
            {liveClasses.map((c) => {
              const n = data.enrollments.filter((e) => e.classId === c.id).length;
              return (
                <div key={c.id} className="flex items-center gap-4">
                  <span className="w-48 truncate text-sm">{c.name}</span>
                  <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full" style={{ width: `${(n / maxCount) * 100}%`, background: classColor(data.classes, c.id) }} />
                  </div>
                  <span className="w-8 text-right text-sm font-semibold">{n}</span>
                </div>
              );
            })}
          </div>
        </Card>
      </div>
    </>
  );
}
