import { useEffect, useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Avatar, EmptyState, PageHeader, Pagination, SearchFilters, usePagination } from "@/components/yodo/ui";
import { EmployeeForm, staffName, tenure, type Employee } from "@/components/yodo/employees";
import { api, errorText } from "@/lib/api";
import { L } from "@/lib/i18n";
import { useYodo } from "@/lib/yodo-store";

export const Route = createFileRoute("/_authenticated/_shell/employees")({
  component: EmployeesPage,
});

// Office staff list (owner 27/10/2026, mockup Fj7itm8uCcAiGSyo6rEeHw v2): Owner / SuperAdmin only.
function EmployeesPage() {
  const { data } = useYodo();
  const navigate = useNavigate();
  const [rows, setRows] = useState<Employee[] | null>(null);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("active");
  const [adding, setAdding] = useState(false);
  useEffect(() => { if (data.owner) api<Employee[]>("/employees").then(setRows).catch((e) => toast.error(errorText(e))); }, [data.owner]);
  const all = rows ?? [];
  const list = useMemo(() => {
    const k = q.trim().toLowerCase();
    return all
      .filter((e) => status === "all" || e.status === status)
      .filter((e) => !k || [e.code, e.firstName, e.lastName, e.nickname, e.firstNameEn, e.lastNameEn, e.position, e.positionEn, e.phone].join(" ").toLowerCase().includes(k));
  }, [all, q, status]);
  const pg = usePagination(list, 25, `${q}|${status}`);
  if (!data.owner) return <EmptyState title={L("ไม่มีสิทธิ์เข้าถึงหน้านี้", "You don't have access to this page")} text={L("หน้านี้สำหรับ Owner เท่านั้น", "This page is for the Owner only")} />;
  const active = all.filter((e) => e.status === "active").length;
  return (
    <>
      <PageHeader back title={L("พนักงาน", "Staff")} subtitle={L(`ทำงานอยู่ ${active} คน`, `${active} working`)}
        action={<Button className="rounded-full" onClick={() => setAdding(true)} data-testid="emp-add"><Plus className="h-4 w-4" /> {L("เพิ่มพนักงาน", "Add staff")}</Button>} />
      <SearchFilters q={q} onQ={setQ} placeholder={L("ค้นหาชื่อ ตำแหน่ง รหัส", "Search name, position, code")} testPrefix="emp"
        value={status} onValue={setStatus} chips={[
          { value: "active", label: L("ทำงานอยู่", "Working"), count: active },
          { value: "left", label: L("ลาออกแล้ว", "Left"), count: all.length - active },
          { value: "all", label: L("ทั้งหมด", "All"), count: all.length },
        ]} />
      {rows && list.length === 0 ? (
        <EmptyState title={all.length ? L("ไม่พบพนักงาน", "No staff found") : L("ยังไม่มีพนักงาน", "No staff yet")}
          text={all.length ? L("ลองเปลี่ยนคำค้นหา", "Try another search") : L("เพิ่มพนักงานคนแรก เช่น รีเซปชั่น แม่บ้าน", "Add the first person, e.g. a receptionist")}
          action={<Button className="rounded-full" onClick={() => setAdding(true)}><Plus className="h-4 w-4" /> {L("เพิ่มพนักงาน", "Add staff")}</Button>} />
      ) : (
        <>
          <div className="grid gap-2.5 lg:grid-cols-2" data-testid="emp-list">
            {pg.pageItems.map((e) => (
              <button key={e.id} type="button" onClick={() => navigate({ to: "/employees/$id", params: { id: e.id } })} data-testid="emp-row"
                className="flex min-w-0 items-center gap-3 rounded-2xl border border-border bg-card px-3.5 py-3 text-left transition-shadow hover:shadow-soft">
                <Avatar src={e.image} name={e.firstName} className="h-12 w-12" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold">{staffName(e)}{e.nickname ? ` (${e.nickname})` : ""}</p>
                  <p className="truncate text-xs text-muted-foreground"><span className="font-mono">{e.code}</span>{e.position ? ` · ${e.position}` : ""} · {tenure(e.startDate, e.endDate)}</p>
                </div>
                <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-bold ${e.status === "active" ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300" : "bg-muted text-muted-foreground"}`}>
                  {e.status === "active" ? L("ทำงานอยู่", "Working") : L("ลาออกแล้ว", "Left")}
                </span>
              </button>
            ))}
          </div>
          <Pagination page={pg.page} totalPages={pg.totalPages} onChange={pg.setPage} from={pg.from} to={pg.to} total={pg.total} unit={L("คน", "people")} />
        </>
      )}
      <EmployeeForm open={adding} onOpenChange={setAdding} editing={null} onSaved={(e) => navigate({ to: "/employees/$id", params: { id: e.id } })} />
    </>
  );
}
