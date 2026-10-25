import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { toast } from "sonner";
import { Ban, Clock, Mail, MessageCircle, Pencil, Phone, Plus, RotateCcw, Trash2, UserRound, UsersRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ConfirmDialog, EmptyState, Field, ImageUpload, NativeSelect, PageHeader, Pagination, StatusBadge, RowActions, SearchFilters, onlyDigits10, usePagination } from "@/components/yodo/ui";
import { TEACHER_PREFIXES, fullName, teacherLabel, useYodo, type YodoData, type Teacher, type TeacherInput } from "@/lib/yodo-store";
import { L, bothLang, opt } from "@/lib/i18n";
import { courseState, whenText } from "@/lib/courses";
import { cn } from "@/lib/utils";


export const Route = createFileRoute("/_authenticated/_shell/teachers")({
  head: () => ({
    meta: [
      { title: "YODO" },
      { name: "description", content: L("จัดการข้อมูลครูผู้สอนของ YODO", "Manage YODO teachers") },
      { property: "og:title", content: "YODO" },
      { property: "og:description", content: L("จัดการข้อมูลครูผู้สอนของ YODO", "Manage YODO teachers") },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TeachersPage,
});

// Built on use so the error messages follow the current language.
const makeSchema = () => z.object({
  prefix: z.string(),
  firstName: z.string().trim().min(1, L("กรุณากรอกชื่อ", "Please enter the first name")).max(100),
  lastName: z.string().trim().max(100),
  // Required (owner 25/10/2026): class cards and the calendar tell teachers apart by nickname.
  nickname: z.string().trim().min(1, L("กรุณากรอกชื่อเล่น", "Please enter the nickname")).max(50),
  phone: z.string().refine((v) => v === "" || /^\d{10}$/.test(v), L("เบอร์โทรต้องเป็นตัวเลข 10 หลัก", "Phone number must be 10 digits")),
  email: z.string().trim().max(255).refine((v) => v === "" || z.string().email().safeParse(v).success, L("รูปแบบอีเมลไม่ถูกต้อง", "Invalid email address")),
  lineId: z.string().trim().max(50),
  image: z.string(),
  specializations: z.array(z.string()),
});

// Photo cards (owner 26/10/2026, mockup GrduSa1HUD86DFK8N9vfYx: 3 a row on phones, 6 on computers, each teacher their own
// pastel colour, tap = details). Colours go round in the order teachers were added, so neighbours never share one.
const PASTELS = [
  "bg-[#fbd9e1] text-[#d58aa0] dark:bg-[#4a2a34] dark:text-[#c98097]",
  "bg-[#fde2cf] text-[#e0a57c] dark:bg-[#4a3424] dark:text-[#d39a70]",
  "bg-[#e6dcf7] text-[#a892dc] dark:bg-[#352c4a] dark:text-[#a48fd6]",
  "bg-[#d5f0e3] text-[#7fc4a3] dark:bg-[#22403a] dark:text-[#7cbf9f]",
  "bg-[#d7e8f8] text-[#83b0de] dark:bg-[#233648] dark:text-[#80abd8]",
  "bg-[#fbf0c9] text-[#d4b75a] dark:bg-[#453d22] dark:text-[#cdb25c]",
];
const pastel = (i: number) => PASTELS[Math.max(0, i) % PASTELS.length]!;

function TeacherPhoto({ t, className }: { t: Teacher; className?: string }) {
  const { data } = useYodo();
  return (
    <div className={cn("relative grid aspect-[1/1.08] max-w-full place-items-end overflow-hidden rounded-2xl", t.status === "Disabled" ? "bg-muted text-muted-foreground grayscale" : pastel(data.teachers.findIndex((x) => x.id === t.id)), className)}>
      {t.image
        ? <img src={t.image} alt={t.nickname} loading="lazy" decoding="async" className="absolute inset-0 h-full w-full object-cover" />
        : <UserRound className="mx-auto mb-[-8%] h-[78%] w-[78%]" strokeWidth={1.5} />}
    </div>
  );
}

/** Classes a teacher teaches (not switched off) with the students whose class has not ended. */
const classesOf = (data: YodoData, id: string) => data.classes.filter((c) => c.teacherId === id && !c.disabled).map((c) => ({
  c, students: data.enrollments.filter((e) => e.classId === c.id && courseState(e.expiryDate, data.expiryDays) !== "ended").length,
}));

const empty: TeacherInput = { image: "", prefix: "", firstName: "", lastName: "", nickname: "", phone: "", email: "", lineId: "", specializations: [] };

function TeachersPage() {
  const { data, setTeacherStatus, deleteTeacher, can } = useYodo();
  const [deleting, setDeleting] = useState<Teacher | null>(null);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Teacher | null>(null);
  const [disabling, setDisabling] = useState<Teacher | null>(null);

  const list = useMemo(() => {
    const k = q.trim().toLowerCase();
    return data.teachers
      .filter((t) => status === "all" || t.status === status)
      .filter((t) => !k || [t.firstName, t.lastName, t.nickname, t.phone, t.email, ...t.specializations].join(" ").toLowerCase().includes(k));
  }, [data.teachers, q, status]);

  const pg = usePagination(list, 18, `${q}|${status}`);
  const [viewId, setViewId] = useState<string | null>(null);
  const viewing = data.teachers.find((t) => t.id === viewId) ?? null;

  const openAdd = () => { setEditing(null); setOpen(true); };

  return (
    <>
      <PageHeader title={L("ครู", "Teachers")} subtitle={L(`ครูทั้งหมด ${data.teachers.length} คน`, `${data.teachers.length} teachers in total`)} action={can("teachers", "add") && <Button className="rounded-full" onClick={openAdd}><Plus className="h-4 w-4" /> {L("เพิ่มครู", "Add Teacher")}</Button>} />
      <SearchFilters q={q} onQ={setQ} placeholder={L("ค้นหาชื่อ ความถนัด", "Search name, speciality")} testPrefix="status"
        value={status} onValue={setStatus} chips={[
          { value: "all", label: L("ทั้งหมด", "All"), count: data.teachers.length },
          { value: "Active", label: opt("Active"), count: data.teachers.filter((t) => t.status === "Active").length },
          { value: "Disabled", label: opt("Disabled"), count: data.teachers.filter((t) => t.status === "Disabled").length },
        ]} />

      {list.length === 0 ? (
        <EmptyState title={L("ไม่พบครู", "No teachers found")} text={L("ลองเปลี่ยนคำค้นหา หรือเพิ่มครูใหม่", "Try another search, or add a new teacher")} action={can("teachers", "add") && <Button className="rounded-full" onClick={openAdd}><Plus className="h-4 w-4" /> {L("เพิ่มครู", "Add Teacher")}</Button>} />
      ) : (
        <>
          <div className="grid grid-cols-3 gap-x-2.5 gap-y-4 md:grid-cols-4 md:gap-x-4 md:gap-y-5 xl:grid-cols-6" data-testid="teacher-grid">
            {pg.pageItems.map((t) => {
              const n = classesOf(data, t.id).length;
              return (
                <button key={t.id} type="button" onClick={() => setViewId(t.id)} className="group min-w-0 rounded-2xl text-left outline-none focus-visible:ring-2 focus-visible:ring-ring" data-testid="teacher-card" aria-label={teacherLabel(t)}>
                  <TeacherPhoto t={t} className={cn("transition-transform group-hover:-translate-y-0.5", t.status === "Disabled" && "opacity-65")} />
                  <p className="mt-1.5 truncate text-[13.5px] font-extrabold md:text-[15px]">{teacherLabel(t)}</p>
                  <span className={cn("mt-0.5 inline-block rounded-full px-2 py-0.5 text-[10.5px] font-bold md:text-xs", t.status === "Disabled" ? "bg-muted text-muted-foreground" : "bg-accent text-accent-foreground")}>
                    {t.status === "Disabled" ? opt("Disabled") : L(`${n} คลาส`, n === 1 ? "1 class" : `${n} classes`)}
                  </span>
                </button>
              );
            })}
          </div>
          <Pagination page={pg.page} totalPages={pg.totalPages} onChange={pg.setPage} from={pg.from} to={pg.to} total={pg.total} unit={L("คน", "people")} />
        </>
      )}


      <TeacherForm open={open} onOpenChange={setOpen} editing={editing} />
      <Dialog open={!!viewing} onOpenChange={(o) => !o && setViewId(null)}>
        <DialogContent className="max-h-[92vh] overflow-y-auto rounded-3xl sm:max-w-md" data-testid="teacher-view">
          {viewing && (() => {
            const t = viewing;
            const cls = classesOf(data, t.id);
            const contact = [
              t.phone && { icon: <Phone />, text: t.phone },
              t.lineId && { icon: <MessageCircle />, text: `LINE: ${t.lineId}` },
              t.email && { icon: <Mail />, text: t.email },
            ].filter(Boolean) as { icon: React.ReactNode; text: string }[];
            return (
              <>
                <DialogHeader className="sr-only"><DialogTitle>{teacherLabel(t)}</DialogTitle><DialogDescription>{fullName(t)}</DialogDescription></DialogHeader>
                <div className="flex items-center gap-4 pr-6">
                  <TeacherPhoto t={t} className="w-28 shrink-0" />
                  <div className="min-w-0">
                    <p className="font-display text-3xl font-semibold leading-tight">{teacherLabel(t)}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{fullName(t)}</p>
                    <div className="mt-2"><StatusBadge status={t.status} /></div>
                  </div>
                </div>
                {contact.length > 0 && (
                  <div>
                    <p className="mb-1.5 text-xs font-extrabold uppercase tracking-wider text-muted-foreground">{L("ติดต่อ", "Contact")}</p>
                    <div className="divide-y divide-border rounded-2xl bg-muted px-3.5">
                      {contact.map((x) => <p key={x.text} className="flex items-center gap-2.5 py-2.5 text-sm [&>svg]:h-4 [&>svg]:w-4 [&>svg]:shrink-0 [&>svg]:text-primary">{x.icon}<span className="min-w-0 break-all">{x.text}</span></p>)}
                    </div>
                  </div>
                )}
                <div>
                  <p className="mb-1.5 text-xs font-extrabold uppercase tracking-wider text-muted-foreground">{L(`คลาสที่สอน (${cls.length})`, `Classes (${cls.length})`)}</p>
                  {cls.length === 0 ? <p className="text-sm text-muted-foreground">{L("ยังไม่มีคลาส", "No classes yet")}</p> : (
                    <div className="space-y-2">
                      {cls.map(({ c, students }) => (
                        <div key={c.id} className="flex items-center justify-between gap-3 rounded-2xl border border-border px-3.5 py-2.5" data-testid="teacher-class">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-bold">{c.name}</p>
                            {whenText(c) && <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground"><Clock className="h-3 w-3 shrink-0" />{whenText(c)}</p>}
                          </div>
                          <span className="flex shrink-0 items-center gap-1 text-sm font-extrabold" title={L("นักเรียนที่ยังไม่หมดอายุ", "Students not ended")}>{students}<UsersRound className="h-4 w-4 text-muted-foreground" /></span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                {(can("teachers", "edit") || can("teachers", "delete")) && (
                  <div className="flex items-center gap-2">
                    {can("teachers", "edit") && <Button className="h-11 flex-1 rounded-full" onClick={() => { setEditing(t); setOpen(true); setViewId(null); }} data-testid="teacher-edit"><Pencil className="h-4 w-4" /> {L("แก้ไข", "Edit")}</Button>}
                    <RowActions name={fullName(t)} items={[
                      can("teachers", "edit") && t.status === "Active" && { label: L("ปิดใช้งาน", "Disable"), icon: <Ban />, onSelect: () => { setViewId(null); setDisabling(t); } },
                      can("teachers", "edit") && t.status !== "Active" && { label: L("เปิดใช้งาน", "Enable"), icon: <RotateCcw />, onSelect: () => { setTeacherStatus(t.id, "Active"); toast.success(L("เปิดใช้งานครูแล้ว", "Teacher enabled")); } },
                      can("teachers", "delete") && { label: L("ลบ", "Delete"), icon: <Trash2 />, danger: true, onSelect: () => { setViewId(null); setDeleting(t); } },
                    ]} />
                  </div>
                )}
              </>
            );
          })()}
        </DialogContent>
      </Dialog>
      <ConfirmDialog open={!!disabling} onOpenChange={(o) => !o && setDisabling(null)} title={L("ปิดใช้งานครู?", "Disable teacher?")} text={L(`${disabling?.nickname ?? ""} จะไม่สามารถถูกเลือกในคลาสใหม่ได้`, `${disabling?.nickname ?? ""} can no longer be picked for new classes`)} confirmLabel={L("ปิดใช้งาน", "Disable")} destructive onConfirm={() => { if (disabling) { setTeacherStatus(disabling.id, "Disabled"); toast.success(L("ปิดใช้งานครูแล้ว", "Teacher disabled")); } }} />
      <ConfirmDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)} title={L("ลบครู?", "Delete teacher?")} text={deleting ? L(`ต้องการลบ ${fullName(deleting)} ใช่หรือไม่`, `Delete ${fullName(deleting)}?`) : ""} confirmLabel={L("ลบ", "Delete")} destructive onConfirm={() => { if (deleting) { deleteTeacher(deleting.id); toast.success(L("ลบครูแล้ว", "Teacher deleted")); } }} />
    </>
  );
}

function TeacherForm({ open, onOpenChange, editing }: { open: boolean; onOpenChange: (o: boolean) => void; editing: Teacher | null }) {
  const { addTeacher, updateTeacher } = useYodo();
  const [f, setF] = useState<TeacherInput>(empty);
  const [errors, setErrors] = useState<Partial<Record<keyof TeacherInput, string>>>({});
  const [lastOpen, setLastOpen] = useState(false);
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) {
      setErrors({});
      if (editing) { const { id: _i, status: _s, ...rest } = editing; setF(rest); } else setF(empty);
    }
  }
  const set = <K extends keyof TeacherInput>(k: K, v: TeacherInput[K]) => setF((p) => ({ ...p, [k]: v }));
  const submit = () => {
    const r = makeSchema().safeParse(f);
    if (!r.success) {
      const e: Partial<Record<keyof TeacherInput, string>> = {};
      r.error.issues.forEach((i) => { const k = String(i.path[0]) as keyof TeacherInput; if (!e[k]) e[k] = i.message; });
      return setErrors(e);
    }
    const payload = { ...f, specializations: [] };
    if (editing) updateTeacher(editing.id, payload); else addTeacher(payload);
    toast.success(editing ? L("บันทึกข้อมูลครูแล้ว", "Teacher saved") : L("เพิ่มครูแล้ว", "Teacher added"));
    onOpenChange(false);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">{editing ? L("แก้ไขครู", "Edit Teacher") : L("เพิ่มครู", "Add Teacher")}</DialogTitle>
          <DialogDescription>{L("ข้อมูลครูผู้สอน", "Teacher details")}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={L("รูปโปรไฟล์", "Profile Image")} className="sm:col-span-2"><ImageUpload value={f.image} onChange={(v) => set("image", v)} /></Field>
          <Field label={L("คำนำหน้า", "Prefix")} error={errors.prefix}>
            <NativeSelect value={f.prefix} onValueChange={(value) => set("prefix", value)}>
              <option value="">{L("เลือก", "Select")}</option>
              {TEACHER_PREFIXES.map((p) => <option key={p} value={p}>{bothLang(p)}</option>)}
            </NativeSelect>
          </Field>
          <Field label={L("ชื่อเล่น", "Nickname")} required error={errors.nickname}><Input value={f.nickname} onChange={(e) => set("nickname", e.target.value)} /></Field>
          <Field label={L("ชื่อ", "First Name")} required error={errors.firstName}><Input value={f.firstName} onChange={(e) => set("firstName", e.target.value)} /></Field>
          <Field label={L("นามสกุล", "Last Name")} error={errors.lastName}><Input value={f.lastName} onChange={(e) => set("lastName", e.target.value)} /></Field>
          <Field label={L("เบอร์โทร", "Phone")} error={errors.phone}><Input inputMode="numeric" value={f.phone} onChange={(e) => set("phone", onlyDigits10(e.target.value))} /></Field>
          <Field label={L("อีเมล", "Email")} error={errors.email}><Input type="email" value={f.email} onChange={(e) => set("email", e.target.value)} /></Field>
          <Field label={L("ไลน์ไอดี", "Line ID")} error={errors.lineId} className="sm:col-span-2"><Input value={f.lineId} onChange={(e) => set("lineId", e.target.value)} /></Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{L("ยกเลิก", "Cancel")}</Button>
          <Button onClick={submit}>{L("บันทึก", "Save")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
