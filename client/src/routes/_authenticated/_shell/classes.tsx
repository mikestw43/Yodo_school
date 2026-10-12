import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { format, parseISO } from "date-fns";
import { toast } from "sonner";
import { Ban, Eye, Pencil, Plus, RotateCcw, Search, UsersRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Avatar, ClassCover, ConfirmDialog, EmptyState, Field, ImageUpload, NativeSelect, PageHeader, Pagination, StatusBadge, usePagination } from "@/components/yodo/ui";

import { ageText, classColor, fullName, useYodo, type ClassInput, type DanceClass } from "@/lib/yodo-store";

export const Route = createFileRoute("/_authenticated/_shell/classes")({
  head: () => ({
    meta: [
      { title: "YODO" },
      { name: "description", content: "จัดการคลาสเต้น ครูผู้สอน และนักเรียนในแต่ละคลาส" },
      { property: "og:title", content: "YODO" },
      { property: "og:description", content: "จัดการคลาสเต้น ครูผู้สอน และนักเรียนในแต่ละคลาส" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ClassesPage,
});

const statusOf = (c: DanceClass) => (c.disabled ? "Disabled" : c.status);

function ClassesPage() {
  const { data, setClassDisabled, can } = useYodo();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<DanceClass | null>(null);
  const [viewId, setViewId] = useState<string | null>(null);
  const [disabling, setDisabling] = useState<DanceClass | null>(null);

  const list = useMemo(() => {
    const k = q.trim().toLowerCase();
    return data.classes
      .filter((c) => status === "all" || statusOf(c) === status)
      .filter((c) => {
        const t = data.teachers.find((x) => x.id === c.teacherId);
        return !k || [c.name, c.description, t?.firstName, t?.nickname].join(" ").toLowerCase().includes(k);
      });
  }, [data, q, status]);

  const pg = usePagination(list, 6, `${q}|${status}`);

  const openAdd = () => { setEditing(null); setFormOpen(true); };


  return (
    <>
      <PageHeader title="Classes" subtitle={`คลาสทั้งหมด ${data.classes.length} คลาส`} action={can("classes", "add") && <Button className="rounded-full" onClick={openAdd}><Plus className="h-4 w-4" /> Add Class</Button>} />
      <Card className="mb-6 flex flex-row flex-wrap gap-3 rounded-3xl p-4">
        <div className="relative min-w-60 flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหาชื่อคลาส หรือครู..." className="rounded-full pl-9" />
        </div>
        <NativeSelect value={status} onValueChange={setStatus} className="w-44 rounded-full">
          <option value="all">ทุกสถานะ</option>
          <option>Active</option>
          <option>Inactive</option>
          <option>Disabled</option>
        </NativeSelect>
      </Card>

      {list.length === 0 ? (
        <EmptyState title="ไม่พบคลาส" text="ลองเปลี่ยนคำค้นหา หรือเพิ่มคลาสใหม่" action={can("classes", "add") && <Button className="rounded-full" onClick={openAdd}><Plus className="h-4 w-4" /> Add Class</Button>} />
      ) : (
        <>
          <div className="grid gap-7 sm:grid-cols-2 xl:grid-cols-3">
            {pg.pageItems.map((c) => {
              const t = data.teachers.find((x) => x.id === c.teacherId);
              const count = data.enrollments.filter((e) => e.classId === c.id).length;
              return (
                <Card key={c.id} className={`gap-0 overflow-hidden rounded-3xl p-0 ${c.disabled ? "opacity-60" : ""}`}>
                   <div className="aspect-[12/5] w-full"><ClassCover src={c.image} name={c.name} color={classColor(data.classes, c.id)} /></div>
                  <div className="flex flex-1 flex-col gap-4 p-6">
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="font-display text-xl font-semibold leading-snug">{c.name}</h3>
                      <StatusBadge status={statusOf(c)} />
                    </div>
                    <p className="line-clamp-2 text-sm leading-relaxed text-muted-foreground">{c.description || "-"}</p>
                    <p className="text-sm font-semibold text-primary">{c.price != null ? `${c.price.toLocaleString("th-TH")} บาท/เดือน` : "-"}</p>
                    <div className="flex items-center justify-between gap-3 rounded-2xl bg-accent/30 px-4 py-2.5 text-sm">
                      <span className="flex min-w-0 items-center gap-2.5"><Avatar src={t?.image} name={t?.nickname ?? "?"} className="h-8 w-8 text-sm" /><span className="truncate">{t ? t.nickname : "ไม่มีครู"}</span></span>
                      <span className="flex shrink-0 items-center gap-1.5 text-muted-foreground"><UsersRound className="h-4 w-4 text-primary/70" /> {count}</span>
                    </div>
                    <div className="mt-auto flex gap-1 border-t border-border pt-4">
                      <Button size="icon" variant="ghost" className="h-8 w-8 rounded-full text-muted-foreground hover:text-foreground" title="ดูข้อมูล" aria-label={`ดูข้อมูล ${c.name}`} onClick={() => setViewId(c.id)}><Eye strokeWidth={1.6} /></Button>
                      {can("classes", "edit") && <Button size="icon" variant="ghost" className="h-8 w-8 rounded-full text-muted-foreground hover:text-foreground" title="แก้ไข" aria-label={`แก้ไข ${c.name}`} onClick={() => { setEditing(c); setFormOpen(true); }}><Pencil strokeWidth={1.6} /></Button>}
                      {can("classes", "edit") && (c.disabled ? (
                        <Button size="icon" variant="ghost" className="h-8 w-8 rounded-full text-muted-foreground hover:text-foreground" title="เปิดใช้งาน" aria-label={`เปิดใช้งาน ${c.name}`} onClick={() => { setClassDisabled(c.id, false); toast.success("เปิดใช้งานคลาสแล้ว"); }}><RotateCcw strokeWidth={1.6} /></Button>
                      ) : (
                        <Button size="icon" variant="ghost" className="h-8 w-8 rounded-full text-muted-foreground hover:text-destructive" title="ปิดใช้งาน" aria-label={`ปิดใช้งาน ${c.name}`} onClick={() => setDisabling(c)}><Ban strokeWidth={1.6} /></Button>
                      ))}
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
          <Pagination page={pg.page} totalPages={pg.totalPages} onChange={pg.setPage} from={pg.from} to={pg.to} total={pg.total} unit="คลาส" />
        </>
      )}


      <ClassForm open={formOpen} onOpenChange={setFormOpen} editing={editing} />
      <ClassDetail classId={viewId} onClose={() => setViewId(null)} />
      <ConfirmDialog open={!!disabling} onOpenChange={(o) => !o && setDisabling(null)} title="ปิดใช้งานคลาส?" text={`${disabling?.name ?? ""} จะถูกซ่อนจากการลงทะเบียน (ข้อมูลยังอยู่)`} confirmLabel="Disable" destructive onConfirm={() => { if (disabling) { setClassDisabled(disabling.id, true); toast.success("ปิดใช้งานคลาสแล้ว"); } }} />
    </>
  );
}

const emptyClass: ClassInput = { name: "", teacherId: "", description: "", image: "", status: "Active", price: null };

function ClassForm({ open, onOpenChange, editing }: { open: boolean; onOpenChange: (o: boolean) => void; editing: DanceClass | null }) {
  const { data, addClass, updateClass } = useYodo();
  const [f, setF] = useState<ClassInput>(emptyClass);
  const [errors, setErrors] = useState<Partial<Record<"name" | "description", string>>>({});
  const [lastOpen, setLastOpen] = useState(false);
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) {
      setErrors({});
      setF(editing ? { name: editing.name, teacherId: editing.teacherId, description: editing.description, image: editing.image, status: editing.status, price: editing.price } : emptyClass);
    }
  }
  const teachers = data.teachers.filter((t) => t.status === "Active" || t.id === f.teacherId);
  const submit = () => {
    const e: Partial<Record<"name" | "description", string>> = {};
    if (!f.name.trim()) e.name = "กรุณากรอกชื่อคลาส";
    else if (f.name.length > 100) e.name = "ชื่อยาวเกินไป";
    if (f.description.length > 1000) e.description = "คำอธิบายยาวเกินไป";
    setErrors(e);
    if (Object.keys(e).length) return;
    const clean = { ...f, name: f.name.trim(), description: f.description.trim() };
    if (editing) updateClass(editing.id, clean); else addClass(clean);
    toast.success(editing ? "บันทึกคลาสแล้ว" : "เพิ่มคลาสแล้ว");
    onOpenChange(false);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">{editing ? "แก้ไขคลาส" : "Add Class"}</DialogTitle>
          <DialogDescription>กรอกข้อมูลคลาส</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <Field label="Class Image"><ImageUpload shape="wide" value={f.image} onChange={(v) => setF({ ...f, image: v })} /></Field>
          <Field label="Class Name" required error={errors.name}><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
          <Field label="Teacher">
            <NativeSelect value={f.teacherId} onValueChange={(value) => setF({ ...f, teacherId: value })}>
              <option value="">ไม่ระบุครูผู้สอน</option>
              {teachers.map((t) => <option key={t.id} value={t.id}>{t.nickname} — {t.firstName} {t.lastName}</option>)}
            </NativeSelect>
          </Field>
          <Field label="Description" error={errors.description}><Textarea rows={3} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
          <Field label="ราคา (บาท/เดือน)">
            <Input type="number" min={0} step="1" placeholder="เช่น 5000" value={f.price ?? ""} onChange={(e) => setF({ ...f, price: e.target.value === "" ? null : Math.max(0, Number(e.target.value)) })} />
          </Field>
          <Field label="Class Status">
            <NativeSelect value={f.status} onValueChange={(value) => setF({ ...f, status: value as ClassInput["status"] })}>
              <option>Active</option>
              <option>Inactive</option>
            </NativeSelect>
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>ยกเลิก</Button>
          <Button onClick={submit}>บันทึก</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ClassDetail({ classId, onClose }: { classId: string | null; onClose: () => void }) {
  const { data } = useYodo();
  const c = data.classes.find((x) => x.id === classId);
  const t = data.teachers.find((x) => x.id === c?.teacherId);
  const students = data.enrollments.filter((e) => e.classId === classId).map((e) => data.students.find((s) => s.id === e.studentId)).filter((s) => !!s);
  const today = format(new Date(), "yyyy-MM-dd");
  const upcoming = data.schedules.filter((s) => s.classId === classId && s.date >= today).sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start)).slice(0, 8);
  return (
    <Sheet open={!!c} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        {c && (
          <>
             <div className="-mx-6 -mt-6 aspect-[12/5]"><ClassCover src={c.image} name={c.name} color={classColor(data.classes, c.id)} /></div>
            <SheetHeader className="px-0">
              <SheetTitle className="font-display text-2xl">{c.name}</SheetTitle>
              <div><StatusBadge status={statusOf(c)} /></div>
              <p className="text-sm text-muted-foreground">{c.description}</p>
              <p className="text-sm font-semibold text-primary">{c.price != null ? `${c.price.toLocaleString("th-TH")} บาท/เดือน` : "-"}</p>
            </SheetHeader>
            <div className="space-y-6">
              <div className="flex items-center gap-3 rounded-2xl bg-muted/60 p-3">
                <Avatar src={t?.image} name={t?.nickname ?? "?"} />
                <div>
                  <p className="text-xs text-muted-foreground">ครูผู้สอน</p>
                  <p className="font-medium">{t ? `${t.nickname} (${fullName(t)})` : "-"}</p>
                </div>
              </div>
              <div>
                <p className="mb-2 font-semibold">นักเรียนในคลาส · {students.length} คน</p>
                {students.length === 0 ? <p className="text-sm text-muted-foreground">ยังไม่มีนักเรียน</p> : (
                  <ul className="space-y-2">
                    {students.map((s) => (
                      <li key={s.id} className="flex items-center gap-3">
                        <Avatar src={s.image} name={s.firstName} className="h-8 w-8 text-sm" />
                        <span className="flex-1 text-sm">{fullName(s)} <span className="text-muted-foreground">({s.nickname}, {ageText(s.dob)})</span></span>
                        <StatusBadge status={s.status} />
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div>
                <p className="mb-2 font-semibold">ตารางเรียนที่กำลังจะมาถึง</p>
                {upcoming.length === 0 ? <p className="text-sm text-muted-foreground">ยังไม่มีตารางเรียน เพิ่มได้ที่หน้า Calendar</p> : (
                  <ul className="space-y-1.5">
                    {upcoming.map((s) => (
                      <li key={s.id} className="flex justify-between rounded-xl bg-muted/50 px-3 py-2 text-sm">
                        <span>{format(parseISO(s.date), "EEE d MMM yyyy")}</span>
                        <span className="font-medium">{s.start}–{s.end}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
