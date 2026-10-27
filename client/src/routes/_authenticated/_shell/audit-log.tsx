import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { format } from "date-fns";
import { Eye, RefreshCw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DateField, EmptyState, NativeSelect, PageHeader, Pagination, usePagination } from "@/components/yodo/ui";
import { api, errorText } from "@/lib/api";
import { toast } from "sonner";
import { L } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/_shell/audit-log")({
  head: () => ({
    meta: [
      { title: "YODO" },
      { name: "description", content: L("ประวัติการเพิ่ม แก้ไข และลบข้อมูลในระบบ YODO", "History of what was added, edited and deleted in YODO") },
      { property: "og:title", content: "YODO" },
      { property: "og:description", content: L("ประวัติการเพิ่ม แก้ไข และลบข้อมูลในระบบ YODO", "History of what was added, edited and deleted in YODO") },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuditLogPage,
});

type Json = Record<string, unknown>;
interface Log {
  id: string; created_at: string; actor_id: string | null; actor_name: string; action: string; table_name: string;
  record_label: string; old_data: Json | null; new_data: Json | null;
}

const ACTION = (): Record<string, { label: string; cls: string }> => ({
  insert: { label: L("เพิ่ม", "Added"), cls: "bg-success/15 text-success" },
  update: { label: L("แก้ไข", "Edited"), cls: "bg-accent text-accent-foreground" },
  delete: { label: L("ลบ", "Deleted"), cls: "bg-destructive/15 text-destructive" },
  login: { label: L("เข้าสู่ระบบ", "Signed in"), cls: "bg-primary/15 text-primary" },
  logout: { label: L("ออกจากระบบ", "Signed out"), cls: "bg-muted text-muted-foreground" },
});
const TABLE = (): Record<string, string> => ({
  students: L("นักเรียน", "Students"), teachers: L("ครู", "Teachers"), classes: L("คลาส", "Classes"), enrollments: L("ลงทะเบียนคลาส", "Class enrolments"), schedules: L("ตารางเรียน", "Schedule"),
  schedule_students: L("นักเรียนในคาบ", "Students in a session"), positions: L("ตำแหน่ง", "Positions"), position_permissions: L("สิทธิ์", "Permissions"), profiles: L("ผู้ใช้ระบบ", "Users"),
  auth: L("การเข้าสู่ระบบ", "Sign-in"), settings: L("ตั้งค่า", "Settings"),
  employees: L("พนักงาน", "Staff"), salary_changes: L("ปรับเงินเดือน", "Salary changes"), salary_certs: L("หนังสือรับรองเงินเดือน", "Salary certificates"),
});
const FIELD = (): Record<string, string> => ({
  code: L("รหัส", "Code"), prefix: L("คำนำหน้า", "Title"), first_name: L("ชื่อ", "First name"), last_name: L("นามสกุล", "Last name"), nickname: L("ชื่อเล่น", "Nickname"), dob: L("วันเกิด", "Date of birth"),
  nationality: L("สัญชาติ", "Nationality"), nationality_other: L("สัญชาติ (อื่นๆ)", "Nationality (other)"), religion: L("ศาสนา", "Religion"), address: L("ที่อยู่", "Address"), phone: L("เบอร์โทร", "Phone"),
  email: L("อีเมล", "Email"), line_id: L("ไอดีไลน์", "Line ID"), emergency_name: L("ผู้ติดต่อฉุกเฉิน", "Emergency contact"), emergency_phone: L("เบอร์ฉุกเฉิน", "Emergency phone"), relationship: L("ความสัมพันธ์", "Relationship"),
  image: L("รูปภาพ", "Picture"), interested: L("คลาสที่สนใจ", "Interested classes"), has_experience: L("มีประสบการณ์", "Has experience"), experience_detail: L("รายละเอียดประสบการณ์", "Experience details"),
  source: L("รู้จักจาก", "Heard about us from"), source_other: L("รู้จักจาก (อื่นๆ)", "Heard about us from (other)"), status: L("สถานะ", "Status"), del_flg: L("ถูกลบ", "Deleted"), specializations: L("ความถนัด", "Specialities"),
  name: L("ชื่อ", "Name"), teacher_id: L("ครู", "Teacher"), description: L("รายละเอียด", "Description"), disabled: L("ปิดใช้งาน", "Disabled"), category: L("หมวด", "Category"), price: L("ราคา (บาท/เดือน)", "Price (baht/month)"),
  student_id: L("นักเรียน", "Student"), class_id: L("คลาส", "Class"), purchase_date: L("วันที่ซื้อ", "Purchase date"), start_date: L("วันเริ่มเรียน", "Start date"), expiry_date: L("วันหมดอายุ", "Expiry date"),
  remark: L("หมายเหตุ", "Remark"), receipt_image: L("รูปใบเสร็จ", "Receipt picture"), signature: L("ลายเซ็น", "Signature"), signed_at: L("วันที่เซ็น", "Signed on"), date: L("วันที่", "Date"), start_time: L("เวลาเริ่ม", "Start time"), end_time: L("เวลาเลิก", "End time"),
  schedule_id: L("คาบเรียน", "Session"), position_id: L("ตำแหน่ง", "Position"), menu_key: L("เมนู", "Menu"), can_view: L("ดู", "View"), can_add: L("เพิ่ม", "Add"), can_edit: L("แก้ไข", "Edit"),
  can_delete: L("ลบ", "Delete"), is_system: L("ตำแหน่งระบบ", "System position"), username: L("ชื่อผู้ใช้", "Username"), display_name: L("ชื่อที่แสดง", "Display name"), password: L("รหัสผ่าน", "Password"),
  notif_seen_at: L("เวลาอ่านแจ้งเตือน", "Notifications read at"), pin: "PIN", face_id: "Face ID", method: L("วิธีเข้าระบบ", "Sign-in method"), google_client_id: "Google Client ID", full_name: L("ชื่อ–นามสกุล", "Full name"), logged_in_at: L("เวลาเข้าสู่ระบบ", "Signed in at"), logged_out_at: L("เวลาออกจากระบบ", "Signed out at"),
});
const HIDDEN = new Set(["id"]);
const METHOD = (): Record<string, string> => ({ password: L("รหัสผ่าน", "Password"), pin: "PIN", google: "Google", face_id: "Face ID" });
const PIN_STATE = (): Record<string, string> => ({ on: L("เปิด", "On"), off: L("ปิด", "Off"), changed: L("เปลี่ยน PIN", "PIN changed") });

const thDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) ? v.split("-").reverse().join("/") : v;

// ตารางอ้างอิง id → ชื่อจริง โหลดตอนเปิดหน้า
let LOOKUPS: Record<string, Record<string, string>> = {};
let ACTOR_NAMES: Record<string, string> = {};
const REF_KEYS = new Set(["class_id", "teacher_id", "student_id", "position_id", "schedule_id"]);

const actorName = (l: Log) => l.actor_id ? ACTOR_NAMES[l.actor_id] || "-" : L("ระบบ", "System");

function show(k: string, v: unknown): string {
  if (v === null || v === undefined || v === "") return "-";
  if (typeof v === "string" && v.startsWith("img:")) return L("มีรูป", "Has picture");
  if (typeof v === "boolean") return v ? L("ใช่", "Yes") : L("ไม่ใช่", "No");
  if (k === "method") return METHOD()[String(v)] ?? String(v);
  if (k === "pin") return PIN_STATE()[String(v)] ?? String(v);
  if (Array.isArray(v)) return v.length ? v.join(", ") : "-";
  const s = String(v);
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) {
    const d = new Date(s);
    return isNaN(d.getTime()) ? s : format(d, "dd/MM/yyyy HH:mm");
  }
  if (typeof s === "string" && s.length === 36 && REF_KEYS.has(k)) return LOOKUPS[k]?.[s] ?? L("รายการที่ลบแล้ว", "Deleted item");
  if (s.length === 36 && /^[0-9a-f-]+$/i.test(s)) return s.slice(0, 8) + "…";
  return thDate(s);
}

interface Row { k: string; old: unknown; new: unknown }
function detailRows(l: Log): Row[] {
  const o = { ...(l.old_data ?? {}) }, n = { ...(l.new_data ?? {}) };
  if (l.table_name === "auth") {
    delete o["username"];
    delete n["username"];
    n["full_name"] = actorName(l);
  }
  const keys = Array.from(new Set([...Object.keys(o), ...Object.keys(n)])).filter((k) => !HIDDEN.has(k));
  if (l.action === "update" && l.old_data && l.new_data)
    return keys.filter((k) => JSON.stringify(o[k]) !== JSON.stringify(n[k])).map((k) => ({ k, old: o[k], new: n[k] }));
  const src = l.action === "insert" ? n : (l.old_data ?? n);
  return keys.filter((k) => src[k] !== "" && src[k] !== null).map((k) => ({ k, old: undefined, new: src[k] }));
}

const isUpdate = (l: Log) => l.action === "update" && !!l.old_data && !!l.new_data;

function summarySide(l: Log, side: "old" | "new"): string {
  const rows = detailRows(l);
  const field = FIELD();
  const val = (r: Row) => {
    const v = r[side];
    const img = typeof v === "string" && v.startsWith("img:");
    if (r.k === "image" || r.k === "receipt_image" || r.k === "signature") {
      if (side === "old") return img ? L("รูปเดิม", "Old picture") : "-";
      return img ? L("เปลี่ยนรูป", "Picture changed") : L("ลบรูป", "Picture removed");
    }
    return show(r.k, v);
  };
  if (isUpdate(l))
    return rows.map((r) => `${field[r.k] ?? r.k}: ${val(r)}`).join(" · ");
  if (l.action === "insert" && side === "old") return "";
  if (l.action === "delete" && side === "new") return "";
  return rows.map((r) => `${field[r.k] ?? r.k} ${val(r)}`).join(" · ");
}

const oldSummary = (l: Log) => summarySide(l, "old") || "-";
const newSummary = (l: Log) => summarySide(l, "new") || "-";

function AuditLogPage() {
  const [logs, setLogs] = useState<Log[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [action, setAction] = useState("all");
  const [table, setTable] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [viewing, setViewing] = useState<Log | null>(null);
  const ACT = ACTION(), TBL = TABLE();

  const load = async () => {
    setLoading(true);
    // โหลดตารางอ้างอิงเพื่อแปลง id เป็นชื่อจริง
    try {
      const r = await api<{ logs: Log[]; lookups: typeof LOOKUPS; actors: typeof ACTOR_NAMES }>("/audit-log");
      LOOKUPS = r.lookups;
      ACTOR_NAMES = r.actors;
      setLogs(r.logs);
    } catch (e) { toast.error(errorText(e)); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const summaries = useMemo(
    () => new Map<string, { old: string; new: string }>(logs.map((l) => [l.id, { old: oldSummary(l), new: newSummary(l) }])),
    [logs],
  );
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return logs.filter((l) => {
      const d = l.created_at.slice(0, 10);
      const sum = summaries.get(l.id);
      return (action === "all" || l.action === action) && (table === "all" || l.table_name === table) &&
        (!from || d >= from) && (!to || d <= to) &&
        (!s || `${l.table_name === "auth" ? "" : l.record_label} ${actorName(l)} ${sum?.old ?? ""} ${sum?.new ?? ""}`.toLowerCase().includes(s));
    });
  }, [logs, summaries, q, action, table, from, to]);
  const pg = usePagination(filtered, 20, `${q}|${action}|${table}|${from}|${to}`);

  return (
    <>
      <PageHeader back title={L("ประวัติการแก้ไข", "Audit Log")} subtitle={L("ประวัติการเพิ่ม แก้ไข และลบข้อมูล", "History of additions, edits and deletions")} action={<Button variant="outline" onClick={load}><RefreshCw className="h-4 w-4" /> {L("รีเฟรช", "Refresh")}</Button>} />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative min-w-60 flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={L("ค้นหารายการ หรือผู้ทำ", "Search items or who did it")} className="rounded-full pl-9" />
        </div>
        <div className="w-36"><NativeSelect value={action} onValueChange={setAction}>
          <option value="all">{L("ทุกประเภท", "All types")}</option>
          {Object.entries(ACT).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </NativeSelect></div>
        <div className="w-44"><NativeSelect value={table} onValueChange={setTable}>
          <option value="all">{L("ทุกหมวด", "All sections")}</option>
          {Object.entries(TBL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </NativeSelect></div>
        <div className="w-40"><DateField value={from} onChange={setFrom} /></div>
        <span className="text-sm text-muted-foreground">{L("ถึง", "to")}</span>
        <div className="w-40"><DateField value={to} min={from || undefined} onChange={setTo} /></div>
      </div>

      {loading ? <p className="text-sm text-muted-foreground">{L("กำลังโหลด...", "Loading...")}</p> : filtered.length === 0 ? (
        <EmptyState title={L("ยังไม่มีประวัติ", "No history yet")} text={L("เมื่อมีการเพิ่ม แก้ไข หรือลบข้อมูล จะแสดงที่นี่", "Additions, edits and deletions will show here")} />
      ) : (
        <>
        <div className="space-y-3 md:hidden">
          {pg.pageItems.map((l) => (
            <Card key={l.id} className="rounded-3xl p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground">{format(new Date(l.created_at), "dd/MM/yyyy HH:mm")}</p>
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${ACT[l.action]?.cls ?? ""}`}>{ACT[l.action]?.label ?? l.action}</span>
              </div>
              <p className="mt-2 text-sm font-medium">{actorName(l)} · {TBL[l.table_name] ?? l.table_name}</p>
              {(() => { const s = summaries.get(l.id); if (!s) return null; return (
                <>
                  {s.old !== "-" && <p className="mt-1 line-clamp-2 text-sm text-muted-foreground"><span className="font-medium text-foreground">{L("เก่า:", "Old:")}</span> {s.old}</p>}
                  {s.new !== "-" && <p className="mt-1 line-clamp-2 text-sm text-muted-foreground"><span className="font-medium text-foreground">{L("ใหม่:", "New:")}</span> {s.new}</p>}
                  {s.old === "-" && s.new === "-" && <p className="mt-1 text-sm text-muted-foreground">-</p>}
                </>
              ); })()}
              <div className="mt-3 flex justify-end border-t border-border/60 pt-3">
                <Button size="sm" variant="ghost" className="rounded-full" onClick={() => setViewing(l)}><Eye className="h-4 w-4" /> {L("ดูรายละเอียด", "View details")}</Button>
              </div>
            </Card>
          ))}
        </div>
        <Card className="hidden overflow-x-auto rounded-3xl p-0 md:block">
          <table className="w-full text-center text-sm">
            <thead className="bg-muted/50 text-center text-xs text-muted-foreground">
              <tr>
                <th className="px-5 py-3">{L("วันเวลา", "Date & time")}</th><th className="px-3 py-3">{L("ผู้ทำ", "By")}</th><th className="px-3 py-3">{L("ประเภท", "Type")}</th>
                <th className="px-3 py-3">{L("หมวด", "Section")}</th>
                <th className="px-3 py-3 text-center">{L("รายการเก่า", "Before")}</th>
                <th className="px-3 py-3 text-center">{L("รายการใหม่", "After")}</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody>
              {pg.pageItems.map((l) => (
                <tr key={l.id} className="border-t border-border">
                  <td className="whitespace-nowrap px-5 py-3">{format(new Date(l.created_at), "dd/MM/yyyy HH:mm")}</td>
                  <td className="px-3 py-3">{actorName(l)}</td>
                  <td className="px-3 py-3"><span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${ACT[l.action]?.cls ?? ""}`}>{ACT[l.action]?.label ?? l.action}</span></td>
                  <td className="px-3 py-3">{TBL[l.table_name] ?? l.table_name}</td>
                  <td className="max-w-[15rem] px-3 py-3 text-center"><span className="line-clamp-2 whitespace-normal text-muted-foreground">{summaries.get(l.id)?.old ?? "-"}</span></td>
                  <td className="max-w-[15rem] px-3 py-3 text-center"><span className="line-clamp-2 whitespace-normal">{summaries.get(l.id)?.new ?? "-"}</span></td>
                  <td className="px-5 py-3">
                    <Button size="icon" variant="ghost" className="h-8 w-8 rounded-full" title={L("ดูรายละเอียด", "View details")} aria-label={L("ดูรายละเอียด", "View details")} onClick={() => setViewing(l)}><Eye className="h-4 w-4" /></Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        </>
      )}
      <div className="mt-4"><Pagination page={pg.page} totalPages={pg.totalPages} onChange={pg.setPage} from={pg.from} to={pg.to} total={pg.total} /></div>
      <LogDialog log={viewing} onClose={() => setViewing(null)} />
    </>
  );
}

function LogDialog({ log, onClose }: { log: Log | null; onClose: () => void }) {
  const [kept, setKept] = useState<Log | null>(null);
  if (log && kept !== log) setKept(log);
  const l = log ?? kept;
  const rows = useMemo(() => (l ? detailRows(l) : []), [l]);
  const isUpdate = l?.action === "update" && !!l.old_data && !!l.new_data;
  const ACT = ACTION(), TBL = TABLE(), field = FIELD();

  return (
    <Dialog open={!!log} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{l ? L(`${ACT[l.action]?.label ?? l.action}${TBL[l.table_name] ?? l.table_name}`, `${ACT[l.action]?.label ?? l.action}: ${TBL[l.table_name] ?? l.table_name}`) : ""}</DialogTitle>
          <DialogDescription>{l ? `${l.table_name === "auth" ? actorName(l) : (l.record_label || "-")} · ${L("โดย", "by")} ${actorName(l)} · ${format(new Date(l.created_at), "dd/MM/yyyy HH:mm")}` : ""}</DialogDescription>
        </DialogHeader>
        {rows.length === 0 ? <p className="text-sm text-muted-foreground">{L("ไม่มีรายละเอียด", "No details")}</p> : (
          <div className="overflow-hidden rounded-2xl border border-border">
            <table className="w-full text-center text-sm">
              <thead className="bg-muted/50 text-center text-xs text-muted-foreground">
                <tr><th className="px-4 py-2">{L("ช่อง", "Field")}</th>{isUpdate && <th className="px-4 py-2">{L("ข้อมูลเก่า", "Before")}</th>}<th className="px-4 py-2">{isUpdate ? L("ข้อมูลใหม่", "After") : L("ข้อมูล", "Value")}</th></tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const img = typeof r.new === "string" && r.new.startsWith("img:") || typeof r.old === "string" && r.old.startsWith("img:");
                  return (
                    <tr key={r.k} className="border-t border-border align-top">
                      <td className="px-4 py-2 font-medium">{field[r.k] ?? r.k}</td>
                      {isUpdate && <td className="px-4 py-2 text-muted-foreground line-through decoration-destructive/40">{img ? (r.old ? L("รูปเดิม", "Old picture") : "-") : show(r.k, r.old)}</td>}
                      <td className="px-4 py-2">{isUpdate && img ? (r.new ? L("เปลี่ยนรูป", "Picture changed") : L("ลบรูป", "Picture removed")) : show(r.k, r.new)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
