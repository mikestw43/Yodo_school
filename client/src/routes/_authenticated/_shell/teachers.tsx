import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { toast } from "sonner";
import { Ban, Mail, MessageCircle, Pencil, Phone, Plus, RotateCcw, Search, Music2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Avatar, ConfirmDialog, EmptyState, Field, ImageUpload, NativeSelect, PageHeader, Pagination, StatusBadge, onlyDigits10, usePagination } from "@/components/yodo/ui";
import { TEACHER_PREFIXES, fullName, useYodo, type Teacher, type TeacherInput } from "@/lib/yodo-store";


export const Route = createFileRoute("/_authenticated/_shell/teachers")({
  head: () => ({
    meta: [
      { title: "YODO" },
      { name: "description", content: "จัดการข้อมูลครูผู้สอนของ YODO" },
      { property: "og:title", content: "YODO" },
      { property: "og:description", content: "จัดการข้อมูลครูผู้สอนของ YODO" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TeachersPage,
});

const schema = z.object({
  prefix: z.string(),
  firstName: z.string().trim().max(100),
  lastName: z.string().trim().max(100),
  nickname: z.string().trim().max(50),
  phone: z.string().refine((v) => v === "" || /^\d{10}$/.test(v), "เบอร์โทรต้องเป็นตัวเลข 10 หลัก"),
  email: z.string().trim().max(255).refine((v) => v === "" || z.string().email().safeParse(v).success, "รูปแบบอีเมลไม่ถูกต้อง"),
  lineId: z.string().trim().max(50),
  image: z.string(),
  specializations: z.array(z.string()),
});

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

  const pg = usePagination(list, 6, `${q}|${status}`);

  const openAdd = () => { setEditing(null); setOpen(true); };

  return (
    <>
      <PageHeader title="Teachers" subtitle={`ครูทั้งหมด ${data.teachers.length} คน`} action={can("teachers", "add") && <Button className="rounded-full" onClick={openAdd}><Plus className="h-4 w-4" /> Add Teacher</Button>} />
      <Card className="mb-6 flex flex-row flex-wrap gap-3 rounded-3xl p-4">
        <div className="relative min-w-60 flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหาชื่อ, ความถนัด..." className="rounded-full pl-9" />
        </div>
        <NativeSelect value={status} onValueChange={setStatus} className="w-44 rounded-full">
          <option value="all">ทุกสถานะ</option>
          <option>Active</option>
          <option>Disabled</option>
        </NativeSelect>
      </Card>

      {list.length === 0 ? (
        <EmptyState title="ไม่พบครู" text="ลองเปลี่ยนคำค้นหา หรือเพิ่มครูใหม่" action={can("teachers", "add") && <Button className="rounded-full" onClick={openAdd}><Plus className="h-4 w-4" /> Add Teacher</Button>} />
      ) : (
        <>
          <div className="grid gap-7 sm:grid-cols-2 xl:grid-cols-3">
            {pg.pageItems.map((t) => {
              const classes = data.classes.filter((c) => c.teacherId === t.id && !c.disabled);
              return (
                <Card key={t.id} className={`flex flex-col gap-5 rounded-3xl p-7 ${t.status === "Disabled" ? "opacity-60" : ""}`}>
                  <div className="flex items-center gap-4">
                    <Avatar src={t.image} name={t.nickname} className="h-16 w-16 text-2xl" />
                    <div className="min-w-0 flex-1">
                      <p className="font-display text-xl font-semibold">{t.nickname}</p>
                      <p className="truncate text-sm text-muted-foreground">{fullName(t)}</p>
                    </div>
                    <StatusBadge status={t.status} />
                  </div>
                  <div className="space-y-2.5 rounded-2xl bg-accent/30 px-4 py-3.5 text-sm text-muted-foreground">
                    <p className="flex items-center gap-2.5"><Phone className="h-4 w-4 shrink-0 text-primary/70" /> {t.phone}</p>
                    <p className="flex items-center gap-2.5 truncate"><Mail className="h-4 w-4 shrink-0 text-primary/70" /> {t.email}</p>
                    <p className="flex items-center gap-2.5"><MessageCircle className="h-4 w-4 shrink-0 text-primary/70" /> {t.lineId || "-"}</p>
                  </div>
                  <p className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
                    <Music2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary/60" />
                    <span>สอน {classes.length} คลาส{classes.length ? `: ${classes.map((c) => c.name).join(", ")}` : ""}</span>
                  </p>
                  <div className="mt-auto flex gap-1 border-t border-border pt-4">
                    {can("teachers", "edit") && <Button size="icon" variant="ghost" className="h-8 w-8 rounded-full text-muted-foreground hover:text-foreground" title="แก้ไข" aria-label={`แก้ไข ${fullName(t)}`} onClick={() => { setEditing(t); setOpen(true); }}><Pencil strokeWidth={1.6} /></Button>}
                    {can("teachers", "edit") && (t.status === "Active" ? (
                      <Button size="icon" variant="ghost" className="h-8 w-8 rounded-full text-muted-foreground hover:text-destructive" title="ปิดใช้งาน" aria-label={`ปิดใช้งาน ${fullName(t)}`} onClick={() => setDisabling(t)}><Ban strokeWidth={1.6} /></Button>
                    ) : (
                      <Button size="icon" variant="ghost" className="h-8 w-8 rounded-full text-muted-foreground hover:text-foreground" title="เปิดใช้งาน" aria-label={`เปิดใช้งาน ${fullName(t)}`} onClick={() => { setTeacherStatus(t.id, "Active"); toast.success("เปิดใช้งานครูแล้ว"); }}><RotateCcw strokeWidth={1.6} /></Button>
                    ))}
                    {can("teachers", "delete") && <Button size="icon" variant="ghost" className="h-8 w-8 rounded-full text-muted-foreground hover:text-destructive" title="ลบ" aria-label={`ลบ ${fullName(t)}`} onClick={() => setDeleting(t)}><Trash2 strokeWidth={1.6} /></Button>}
                  </div>
                </Card>
              );
            })}
          </div>
          <Pagination page={pg.page} totalPages={pg.totalPages} onChange={pg.setPage} from={pg.from} to={pg.to} total={pg.total} unit="คน" />
        </>
      )}


      <TeacherForm open={open} onOpenChange={setOpen} editing={editing} />
      <ConfirmDialog open={!!disabling} onOpenChange={(o) => !o && setDisabling(null)} title="ปิดใช้งานครู?" text={`${disabling?.nickname ?? ""} จะไม่สามารถถูกเลือกในคลาสใหม่ได้`} confirmLabel="Disable" destructive onConfirm={() => { if (disabling) { setTeacherStatus(disabling.id, "Disabled"); toast.success("ปิดใช้งานครูแล้ว"); } }} />
      <ConfirmDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)} title="ลบครู?" text={deleting ? `ต้องการลบ ${fullName(deleting)} ใช่หรือไม่` : ""} confirmLabel="ลบ" destructive onConfirm={() => { if (deleting) { deleteTeacher(deleting.id); toast.success("ลบครูแล้ว"); } }} />
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
    const r = schema.safeParse(f);
    if (!r.success) {
      const e: Partial<Record<keyof TeacherInput, string>> = {};
      r.error.issues.forEach((i) => { const k = String(i.path[0]) as keyof TeacherInput; if (!e[k]) e[k] = i.message; });
      return setErrors(e);
    }
    const payload = { ...f, specializations: [] };
    if (editing) updateTeacher(editing.id, payload); else addTeacher(payload);
    toast.success(editing ? "บันทึกข้อมูลครูแล้ว" : "เพิ่มครูแล้ว");
    onOpenChange(false);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">{editing ? "แก้ไขครู" : "Add Teacher"}</DialogTitle>
          <DialogDescription>ข้อมูลครูผู้สอน</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Profile Image" className="sm:col-span-2"><ImageUpload value={f.image} onChange={(v) => set("image", v)} /></Field>
          <Field label="Prefix" error={errors.prefix}>
            <NativeSelect value={f.prefix} onValueChange={(value) => set("prefix", value)}>
              <option value="">เลือก</option>
              {TEACHER_PREFIXES.map((p) => <option key={p}>{p}</option>)}
            </NativeSelect>
          </Field>
          <Field label="Nickname" error={errors.nickname}><Input value={f.nickname} onChange={(e) => set("nickname", e.target.value)} /></Field>
          <Field label="First Name" error={errors.firstName}><Input value={f.firstName} onChange={(e) => set("firstName", e.target.value)} /></Field>
          <Field label="Last Name" error={errors.lastName}><Input value={f.lastName} onChange={(e) => set("lastName", e.target.value)} /></Field>
          <Field label="Phone" error={errors.phone}><Input inputMode="numeric" value={f.phone} onChange={(e) => set("phone", onlyDigits10(e.target.value))} /></Field>
          <Field label="Email" error={errors.email}><Input type="email" value={f.email} onChange={(e) => set("email", e.target.value)} /></Field>
          <Field label="Line ID" error={errors.lineId} className="sm:col-span-2"><Input value={f.lineId} onChange={(e) => set("lineId", e.target.value)} /></Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>ยกเลิก</Button>
          <Button onClick={submit}>บันทึก</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
