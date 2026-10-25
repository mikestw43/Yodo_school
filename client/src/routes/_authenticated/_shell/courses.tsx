import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { CalendarPlus, RefreshCw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Avatar, EmptyState, PageHeader, Pagination, usePagination } from "@/components/yodo/ui";
import { DaysBadge, openBuy, openExtend } from "@/components/yodo/courses";
import { courseState, daysLeft } from "@/lib/courses";
import { fullName, useYodo } from "@/lib/yodo-store";
import { L, fd } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/_shell/courses")({
  head: () => ({ meta: [{ title: "YODO" }, { name: "description", content: L("คลาสของนักเรียนและวันหมดอายุ", "Students' classes and when they end") }] }),
  // ?show=soon from the dashboard card and the expiry bell notices; otherwise "All" first (owner 13/10/2026)
  validateSearch: (s: Record<string, unknown>): { show?: Filter } => (["soon", "active", "ended", "all"].includes(s["show"] as string) ? { show: s["show"] as Filter } : {}),
  component: CoursesPage,
});

type Filter = "soon" | "active" | "ended" | "all";

// Every student with their courses, ending soonest first (owner 12/10/2026, mockup WTr5LoqwQAEnSrKDuzZiMi board 5).
function CoursesPage() {
  const { data, can } = useYodo();
  const [filter, setFilter] = useState<Filter>(Route.useSearch().show ?? "all");
  const [q, setQ] = useState("");
  const rows = useMemo(() => data.enrollments.map((e) => ({
    e, s: data.students.find((x) => x.id === e.studentId), c: data.classes.find((x) => x.id === e.classId),
    n: daysLeft(e.expiryDate), st: courseState(e.expiryDate, data.expiryDays),
  })).filter((r) => r.s && r.c), [data]);
  const count = {
    soon: rows.filter((r) => r.st === "soon").length,
    active: rows.filter((r) => r.st !== "ended").length,
    ended: rows.filter((r) => r.st === "ended" && (r.n ?? 0) >= -30).length,
    all: rows.length,
  };
  const k = q.trim().toLowerCase();
  const list = rows
    .filter((r) => filter === "all" || (filter === "soon" ? r.st === "soon" : filter === "active" ? r.st !== "ended" : r.st === "ended" && (r.n ?? 0) >= -30))
    .filter((r) => !k || [r.s!.firstName, r.s!.lastName, r.s!.nickname, r.s!.code, r.s!.phone, r.c!.name].join(" ").toLowerCase().includes(k))
    .sort((a, b) => (filter === "ended" ? (b.e.expiryDate).localeCompare(a.e.expiryDate) : (a.e.expiryDate || "9999").localeCompare(b.e.expiryDate || "9999")));
  const pg = usePagination(list, 25, `${filter}|${k}`);
  const canBuy = can("students", "edit");
  const canExtend = can("courses", "edit");
  const chips: [Filter, string][] = [
    ["all", L(`ทั้งหมด ${count.all}`, `All ${count.all}`)],
    ["soon", L(`ใกล้หมด (${data.expiryDays} วัน) ${count.soon}`, `Ending soon (${data.expiryDays} days) ${count.soon}`)],
    ["active", L(`ยังไม่หมดอายุ ${count.active}`, `Not ended ${count.active}`)],
    ["ended", L(`หมดแล้ว 30 วันล่าสุด ${count.ended}`, `Ended in the last 30 days ${count.ended}`)],
  ];
  const actions = (r: (typeof rows)[number]) => (
    <div className="flex flex-wrap gap-1.5">
      {canBuy && r.s!.status === "Active" && <Button size="sm" className="h-8 rounded-full" onClick={() => openBuy(r.s!.id, r.c!.id)}><RefreshCw className="h-3.5 w-3.5" /> {L("ต่อคลาส", "Renew")}</Button>}
      {canExtend && r.st !== "ended" && <Button size="sm" variant="outline" className="h-8 rounded-full" onClick={() => openExtend(r.e.id)}><CalendarPlus className="h-3.5 w-3.5" /> {L("ขยายเวลา", "Extend")}</Button>}
    </div>
  );
  const who = (r: (typeof rows)[number]) => (
    <Link to="/students" search={{ view: r.s!.id }} className="flex min-w-0 items-center gap-3 text-left hover:text-primary">
      <Avatar src={r.s!.image} name={r.s!.firstName} className="h-9 w-9" />
      <span className="min-w-0"><span className="block truncate font-medium">{fullName(r.s!)}</span><span className="block font-mono text-xs text-muted-foreground">{r.s!.code}{r.s!.phone ? ` · ${r.s!.phone}` : ""}</span></span>
    </Link>
  );
  return (
    <>
      <PageHeader title={L("วันหมดอายุ", "Expiry dates")} subtitle={L("นักเรียนทุกคนกับคลาสที่ซื้อ เรียงจากใกล้หมดก่อน", "Every student's classes, ending soonest first")} />
      <div className="mb-4 flex flex-wrap items-center gap-2" role="group" aria-label={L("แสดง", "Show")}>
        {chips.map(([f, t]) => (
          <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)} data-testid={`filter-${f}`}
            className={`h-9 rounded-full px-4 text-sm font-semibold transition-colors ${filter === f ? (f === "soon" ? "bg-orange-700 text-white" : "bg-primary text-primary-foreground") : "border border-border bg-background hover:bg-muted"}`}>{t}</button>
        ))}
        <div className="relative ml-auto w-full sm:w-64">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={L("ค้นหาชื่อ / คลาส", "Search name / class")} className="rounded-full pl-9" />
        </div>
      </div>
      {list.length === 0 ? <EmptyState title={filter === "soon" ? L("ไม่มีคลาสใกล้หมดอายุ", "No classes ending soon") : L("ไม่พบรายการ", "Nothing found")} /> : (
        <>
          <div className="space-y-3 md:hidden">
            {pg.pageItems.map((r) => (
              <Card key={r.e.id} className="gap-3 rounded-3xl p-4" data-testid="course-row">
                <div className="flex items-start justify-between gap-2">{who(r)}<DaysBadge expiry={r.e.expiryDate} /></div>
                <p className="text-sm"><span className="font-semibold">{r.c!.name}</span> <span className="text-muted-foreground">· {fd(r.e.startDate)} – {fd(r.e.expiryDate)}</span></p>
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
                  <TableRow key={r.e.id} className={`[&>td]:py-3 ${r.st === "ended" ? "text-muted-foreground" : ""}`} data-testid="course-row">
                    <TableCell>{who(r)}</TableCell>
                    <TableCell className="font-medium">{r.c!.name}</TableCell>
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
      <p className="mt-4 text-xs text-muted-foreground">{L(`"ใกล้หมด" ใช้จำนวนวันจากตั้งค่าการแจ้งเตือน (ตอนนี้ ${data.expiryDays} วัน)`, `"Ending soon" uses the days set in the notification settings (now ${data.expiryDays})`)}</p>
    </>
  );
}
