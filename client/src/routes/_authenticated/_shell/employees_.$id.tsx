import { useCallback, useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Award, Ban, Pencil, Plus, Trash2, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Avatar, BackButton, ConfirmDialog, EmptyState, RowActions } from "@/components/yodo/ui";
import { CertView, EmployeeForm, IssueCertDialog, SalaryDialog, bahtText, staffName, tenure, type Cert, type EmployeeFull } from "@/components/yodo/employees";
import { api, errorText } from "@/lib/api";
import { L, fd } from "@/lib/i18n";
import { useYodo } from "@/lib/yodo-store";
import { todayIso } from "@/lib/courses";

export const Route = createFileRoute("/_authenticated/_shell/employees_/$id")({
  component: EmployeePage,
});

function Info({ label, value }: { label: string; value?: string | undefined }) {
  return (
    <div className="flex justify-between gap-4 py-2.5 text-sm">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 break-words text-right font-semibold">{value || "-"}</span>
    </div>
  );
}

// One staff member (owner 27/10/2026): personal / work + salary / salary certificates.
function EmployeePage() {
  const { id } = Route.useParams();
  const { data } = useYodo();
  const navigate = useNavigate();
  const [full, setFull] = useState<EmployeeFull | null>(null);
  const [missing, setMissing] = useState(false);
  const [tab, setTab] = useState<"info" | "work" | "certs">("info");
  const [editOpen, setEditOpen] = useState(false);
  const [salaryOpen, setSalaryOpen] = useState(false);
  const [issueOpen, setIssueOpen] = useState(false);
  const [delOpen, setDelOpen] = useState(false);
  const [viewing, setViewing] = useState<Cert | null>(null);
  const load = useCallback(async () => {
    try { setFull(await api<EmployeeFull>(`/employees/${id}`)); } catch (e) { setMissing(true); toast.error(errorText(e)); }
  }, [id]);
  useEffect(() => { if (data.owner) void load(); }, [data.owner, load]);
  if (!data.owner) return <EmptyState title={L("ไม่มีสิทธิ์เข้าถึงหน้านี้", "You don't have access to this page")} />;
  if (missing) return <EmptyState title={L("ไม่พบพนักงาน", "Staff member not found")} />;
  if (!full) return null;
  const e = full.employee;
  const removeChange = async (cid: string) => {
    try { await api(`/employees/${e.id}/salary/${cid}`, { method: "DELETE" }); toast.success(L("ลบรายการแล้ว", "Entry removed")); await load(); }
    catch (x) { toast.error(errorText(x)); }
  };
  const del = async () => {
    try { await api(`/employees/${e.id}`, { method: "DELETE" }); toast.success(L("ลบพนักงานแล้ว", "Staff member deleted")); navigate({ to: "/employees" }); }
    catch (x) { toast.error(errorText(x)); }
  };
  const issueBtn = e.status === "active" && (
    <Button className="h-11 w-full rounded-full" onClick={() => setIssueOpen(true)} data-testid="cert-open"><Award className="h-4 w-4" /> {L("ออกหนังสือรับรองเงินเดือน", "Issue a salary certificate")}</Button>
  );
  const tabs = [["info", L("ข้อมูลส่วนตัว", "Personal")], ["work", L("งาน/เงินเดือน", "Work / salary")], ["certs", L(`หนังสือรับรอง (${full.certs.length})`, `Certificates (${full.certs.length})`)]] as const;
  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4 flex items-center justify-between gap-2">
        <BackButton />
        <RowActions name={staffName(e)} items={[
          { label: L("แก้ไข", "Edit"), icon: <Pencil />, onSelect: () => setEditOpen(true) },
          { label: L("ลบ", "Delete"), icon: <Trash2 />, danger: true, onSelect: () => setDelOpen(true) },
        ]} />
      </div>
      <div className="flex items-center gap-4">
        <Avatar src={e.image} name={e.firstName} className="h-20 w-20 text-2xl" />
        <div className="min-w-0">
          <h1 className="font-display text-3xl font-semibold leading-tight" data-testid="emp-title">{e.nickname || e.firstName}</h1>
          <p className="text-sm text-muted-foreground">{staffName(e)} · <span className="font-mono">{e.code}</span></p>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            {e.position && <span>{e.position}</span>}
            <span>{L("เริ่มงาน", "Started")} {fd(e.startDate)}</span>
            <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${e.status === "active" ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300" : "bg-muted text-muted-foreground"}`}>
              {e.status === "active" ? L("ทำงานอยู่", "Working") : L("ลาออกแล้ว", "Left")}
            </span>
          </p>
        </div>
      </div>
      <div className="my-5 flex gap-1 overflow-x-auto border-b border-border text-sm font-semibold" role="tablist">
        {tabs.map(([k, t]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)} data-testid={`emp-tab-${k}`}
            className={`-mb-px shrink-0 border-b-2 px-4 py-2 transition-colors ${tab === k ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>{t}</button>
        ))}
      </div>

      {tab === "info" && (
        <div className="divide-y divide-border rounded-2xl border border-border bg-card px-4" data-testid="emp-info">
          <Info label={L("ชื่อ-นามสกุล", "Name")} value={staffName(e)} />
          <Info label={L("ชื่อภาษาอังกฤษ", "Name in English")} value={[e.prefixEn, e.firstNameEn, e.lastNameEn].filter(Boolean).join(" ")} />
          <Info label={L("ชื่อเล่น", "Nickname")} value={e.nickname} />
          <Info label={L("เลขบัตรประชาชน", "ID card number")} value={e.nationalId} />
          <Info label={L("วันเกิด", "Date of birth")} value={e.birthDate ? fd(e.birthDate) : ""} />
          <Info label={L("เบอร์โทร", "Phone")} value={e.phone} />
          <Info label={L("อีเมล", "Email")} value={e.email} />
          <Info label={L("ที่อยู่", "Address")} value={e.address} />
          <Info label={L("ผู้ติดต่อฉุกเฉิน", "Emergency contact")} value={[e.emergencyName, e.emergencyRelation && `(${e.emergencyRelation})`, e.emergencyPhone].filter(Boolean).join(" ")} />
          {e.note && <Info label={L("หมายเหตุ", "Note")} value={e.note} />}
        </div>
      )}

      {tab === "work" && (
        <div className="grid gap-4">
          <div className="divide-y divide-border rounded-2xl border border-border bg-card px-4" data-testid="emp-work">
            <Info label={L("ตำแหน่ง", "Position")} value={[e.position, e.positionEn && e.positionEn !== e.position ? `(${e.positionEn})` : ""].filter(Boolean).join(" ")} />
            <Info label={L("ประเภท", "Type")} value={e.empType === "part" ? L("พาร์ตไทม์", "Part-time") : L("ประจำ", "Full-time")} />
            <Info label={L("วันเริ่มงาน", "Start date")} value={fd(e.startDate)} />
            <Info label={L("อายุงาน", "Time with us")} value={tenure(e.startDate, e.endDate)} />
            <Info label={L("เงินเดือนปัจจุบัน", "Current salary")} value={bahtText(e.salary)} />
            <Info label={L("บัญชีรับเงิน", "Bank account")} value={[e.bankName, e.bankAccount].filter(Boolean).join(" · ")} />
            {e.endDate && <Info label={L("วันลาออก", "Last day")} value={`${fd(e.endDate)}${e.endReason ? ` · ${e.endReason}` : ""}`} />}
          </div>
          <div className="flex items-center justify-between">
            <p className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground">{L("ประวัติเงินเดือน", "Salary history")}</p>
            <Button variant="outline" size="sm" className="rounded-full" onClick={() => setSalaryOpen(true)} data-testid="salary-open"><TrendingUp className="h-4 w-4" /> {L("ปรับเงินเดือน", "Change salary")}</Button>
          </div>
          <div className="relative space-y-3 pl-6 before:absolute before:bottom-2 before:left-[7px] before:top-2 before:w-0.5 before:bg-border" data-testid="salary-history">
            {full.salaryChanges.map((c, i) => {
              const first = i === full.salaryChanges.length - 1;
              const later = c.effectiveFrom > todayIso();
              return (
                <div key={c.id} className="relative flex items-start justify-between gap-3" data-testid="salary-row">
                  <span className={`absolute -left-[22px] top-1 h-3 w-3 rounded-full ring-4 ring-background ${first ? "bg-primary" : "bg-emerald-600"}`} />
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">{L("มีผล", "From")} {fd(c.effectiveFrom)}{later ? ` · ${L("ยังไม่ถึง", "upcoming")}` : ""}</p>
                    <p className="font-bold">{first ? L(`เริ่มงาน ${bahtText(c.amount)}`, `Started at ${bahtText(c.amount)}`) : `${bahtText(c.prevAmount)} → ${bahtText(c.amount)}`}</p>
                    {c.reason && <p className="text-sm text-muted-foreground">{c.reason}</p>}
                  </div>
                  {!first && <RowActions name={fd(c.effectiveFrom)} items={[{ label: L("ลบรายการนี้", "Remove this entry"), icon: <Trash2 />, danger: true, onSelect: () => void removeChange(c.id) }]} />}
                </div>
              );
            })}
          </div>
          {issueBtn}
        </div>
      )}

      {tab === "certs" && (
        <div className="grid gap-2.5">
          {full.certs.length === 0 && <p className="py-4 text-center text-sm text-muted-foreground">{L("ยังไม่เคยออกหนังสือรับรองเงินเดือน", "No salary certificate yet")}</p>}
          {full.certs.map((c) => (
            <button key={c.id} type="button" onClick={() => setViewing(c)} data-testid="cert-row"
              className="flex items-center gap-3 rounded-2xl border border-border bg-card px-3.5 py-3 text-left transition-shadow hover:shadow-soft">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent text-accent-foreground">{c.cancelled ? <Ban className="h-4 w-4" /> : <Award className="h-4 w-4" />}</span>
              <div className="min-w-0 flex-1">
                <p className={`font-mono text-sm font-bold ${c.cancelled ? "text-muted-foreground line-through" : ""}`}>{c.no}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {fd(c.date)} · {c.lang === "en" ? "English" : "ไทย"} · {bahtText(c.salary)}{c.cancelled ? ` · ${L("ยกเลิกแล้ว", "Cancelled")}${c.cancelReason ? `: ${c.cancelReason}` : ""}` : ""}
                </p>
              </div>
            </button>
          ))}
          {e.status === "active" && <Button className="mt-2 h-11 w-full rounded-full" onClick={() => setIssueOpen(true)} data-testid="cert-open-2"><Plus className="h-4 w-4" /> {L("ออกฉบับใหม่", "Issue a new one")}</Button>}
        </div>
      )}

      <EmployeeForm open={editOpen} onOpenChange={setEditOpen} editing={e} onSaved={() => void load()} />
      <SalaryDialog open={salaryOpen} onOpenChange={setSalaryOpen} e={e} onSaved={() => void load()} />
      <IssueCertDialog open={issueOpen} onOpenChange={setIssueOpen} e={e} onIssued={(c) => { setTab("certs"); void load(); setViewing(c); }} />
      <CertView cert={viewing} onClose={() => setViewing(null)} onCancelled={async () => { await load(); setViewing(null); }} />
      <ConfirmDialog open={delOpen} onOpenChange={setDelOpen} title={L("ลบพนักงาน?", "Delete this staff member?")}
        text={L(`ลบ ${staffName(e)} (${e.code}) ออกจากรายชื่อ รหัสนี้จะไม่ถูกใช้ซ้ำ ถ้าแค่ลาออก ให้ใส่วันลาออกในหน้าแก้ไขแทน`, `Remove ${staffName(e)} (${e.code}). The code is not used again. If they only left, set the last day in Edit instead.`)}
        confirmLabel={L("ลบ", "Delete")} destructive onConfirm={() => void del()} />
    </div>
  );
}
