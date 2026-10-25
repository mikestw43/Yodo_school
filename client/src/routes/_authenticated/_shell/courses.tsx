import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { CalendarPlus, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Avatar, EmptyState, PageHeader, Pagination, SearchFilters, usePagination } from "@/components/yodo/ui";
import { DaysBadge, openBuy, openExtend, openStudentClasses } from "@/components/yodo/courses";
import { courseState, daysLeft } from "@/lib/courses";
import { fullName, teacherLabel, useYodo } from "@/lib/yodo-store";
import { L, fd } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/_shell/courses")({
  head: () => ({ meta: [{ title: "YODO" }, { name: "description", content: L("คลาสของนักเรียนและวันหมดอายุ", "Students' classes and when they end") }] }),
  // ?show=soon from the dashboard card and the expiry bell notices; otherwise "All" first (owner 13/10/2026)
  validateSearch: (s: Record<string, unknown>): { show?: Filter } => (["soon", "ended", "all"].includes(s["show"] as string) ? { show: s["show"] as Filter } : {}),
  component: CoursesPage,
});

type Filter = "soon" | "ended" | "all";

// Every student with their classes (owner 12/10/2026, mockup WTr5LoqwQAEnSrKDuzZiMi board 5; chips and order: owner 25/10/2026).
function CoursesPage() {
  const { data, can } = useYodo();
  const [filter, setFilter] = useState<Filter>(Route.useSearch().show ?? "all");
  const [q, setQ] = useState("");
  // When the class was last bought (newest purchase, else when the student joined): "All" shows the newest first.
  const rows = useMemo(() => data.enrollments.map((e) => {
    const bought = data.purchases.filter((p) => p.enrollmentId === e.id && p.kind === "buy" && !p.cancelled).reduce((m, p) => (p.createdAt > m ? p.createdAt : m), "") || e.joinedAt || e.purchaseDate;
    return { e, s: data.students.find((x) => x.id === e.studentId), c: data.classes.find((x) => x.id === e.classId), n: daysLeft(e.expiryDate), st: courseState(e.expiryDate, data.expiryDays), bought };
  }).filter((r) => r.s && r.c), [data]);
  // Three chips (owner 25/10/2026, mockup FFawaauS5UjgYce8FeYNg5): All = newest bought first, ending within n days =
  // soonest first (not the ended ones), Expired = most recently ended first.
  const count = { all: rows.length, soon: rows.filter((r) => r.st === "soon").length, ended: rows.filter((r) => r.st === "ended").length };
  const k = q.trim().toLowerCase();
  const list = rows
    .filter((r) => filter === "all" || r.st === filter)
    .filter((r) => !k || [r.s!.firstName, r.s!.lastName, r.s!.nickname, r.s!.code, r.s!.phone, r.c!.name].join(" ").toLowerCase().includes(k))
    .sort((a, b) => (filter === "all" ? b.bought.localeCompare(a.bought) : filter === "ended" ? b.e.expiryDate.localeCompare(a.e.expiryDate) : (a.e.expiryDate || "9999").localeCompare(b.e.expiryDate || "9999")));
  const pg = usePagination(list, 25, `${filter}|${k}`);
  const canBuy = can("students", "edit");
  const canExtend = can("courses", "edit");
  const chips: [Filter, string, number][] = [
    ["all", L("ทั้งหมด", "All"), count.all],
    ["soon", L(`หมดใน ${data.expiryDays} วัน`, `Expire in ${data.expiryDays} days`), count.soon],
    ["ended", L("หมดอายุแล้ว", "Expired"), count.ended],
  ];
  const actions = (r: (typeof rows)[number]) => (
    <div className="flex flex-wrap gap-1.5">
      {canBuy && r.s!.status === "Active" && <Button size="sm" className="h-8 rounded-full" onClick={() => openBuy(r.s!.id, r.c!.id)}><RefreshCw className="h-3.5 w-3.5" /> {L("ต่ออายุคลาส", "Renew")}</Button>}
      {canExtend && r.st !== "ended" && <Button size="sm" variant="outline" className="h-8 rounded-full" onClick={() => openExtend(r.e.id)}><CalendarPlus className="h-3.5 w-3.5" /> {L("ขยายเวลา", "Extend")}</Button>}
    </div>
  );
  const who = (r: (typeof rows)[number]) => (
    <button type="button" onClick={() => openStudentClasses(r.s!.id)} data-testid="course-student" className="flex min-w-0 items-center gap-3 text-left hover:text-primary">
      <Avatar src={r.s!.image} name={r.s!.firstName} className="h-9 w-9" />
      <span className="min-w-0"><span className="block truncate font-medium">{fullName(r.s!)}</span><span className="block font-mono text-xs text-muted-foreground">{r.s!.code}{r.s!.phone ? ` · ${r.s!.phone}` : ""}</span></span>
    </button>
  );
  return (
    <>
      <PageHeader title={L("วันหมดอายุ", "Expiry dates")} subtitle={L("นักเรียนทุกคนกับคลาสที่ซื้อ", "Every student's classes")} />
      <SearchFilters q={q} onQ={setQ} placeholder={L("ค้นหาชื่อ / คลาส", "Search name / class")} value={filter} onValue={(v: string) => setFilter(v as Filter)}
        chips={chips.map(([f, t, n]) => ({ value: f, label: t, count: n, ...(f === "soon" ? { tone: "warn" as const } : {}) }))} />
      {list.length === 0 ? <EmptyState title={filter === "soon" ? L("ไม่มีคลาสใกล้หมดอายุ", "No classes ending soon") : L("ไม่พบรายการ", "Nothing found")} /> : (
        <>
          <div className="space-y-3 md:hidden">
            {pg.pageItems.map((r) => (
              <Card key={r.e.id} className="gap-3 rounded-3xl p-4" data-testid="course-row" data-expiry={r.e.expiryDate} data-bought={r.bought}>
                <div className="flex items-start justify-between gap-2">{who(r)}<DaysBadge expiry={r.e.expiryDate} /></div>
                <p className="text-sm"><span className="font-semibold">{r.c!.name}</span> <span className="text-muted-foreground">· {teacherLabel(data.teachers.find((t) => t.id === r.c!.teacherId))} · {fd(r.e.startDate)} – {fd(r.e.expiryDate)}</span></p>
                {actions(r)}
              </Card>
            ))}
          </div>
          <Card className="hidden overflow-hidden rounded-3xl p-0 md:block">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50 [&>th]:h-12">
                  <TableHead className="text-left">{L("นักเรียน", "Student")}</TableHead>
                  <TableHead className="text-left">{L("คลาส", "Class")}</TableHead>
                  <TableHead className="text-left">{L("เริ่ม", "Start")}</TableHead>
                  <TableHead className="text-left">{L("หมดอายุ", "Expiry")}</TableHead>
                  <TableHead className="text-left">{L("เหลือ", "Left")}</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {pg.pageItems.map((r) => (
                  <TableRow key={r.e.id} className={`[&>td]:py-3 ${r.st === "ended" ? "text-muted-foreground" : ""}`} data-testid="course-row" data-expiry={r.e.expiryDate} data-bought={r.bought}>
                    <TableCell>{who(r)}</TableCell>
                    <TableCell><span className="block font-medium">{r.c!.name}</span><span className="block text-xs text-muted-foreground">{teacherLabel(data.teachers.find((t) => t.id === r.c!.teacherId))}</span></TableCell>
                    <TableCell>{fd(r.e.startDate)}</TableCell>
                    <TableCell>{fd(r.e.expiryDate)}</TableCell>
                    <TableCell><DaysBadge expiry={r.e.expiryDate} /></TableCell>
                    <TableCell>{actions(r)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
          <Pagination page={pg.page} totalPages={pg.totalPages} onChange={pg.setPage} from={pg.from} to={pg.to} total={pg.total} unit={L("รายการ", "rows")} />
        </>
      )}
      <p className="mt-4 text-xs text-muted-foreground">{L(`จำนวนวันใน "หมดใน ${data.expiryDays} วัน" ตั้งได้ที่ตั้งค่าการแจ้งเตือน`, `The days in "Expire in ${data.expiryDays} days" are set in the notification settings`)}</p>
    </>
  );
}
