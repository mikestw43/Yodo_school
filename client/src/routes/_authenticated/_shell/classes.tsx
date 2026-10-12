import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { format, parseISO } from "date-fns";
import { toast } from "sonner";
import { Ban, ChevronLeft, Eye, Pencil, Plus, RotateCcw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetClose, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Avatar, ClassCover, ConfirmDialog, EmptyState, Field, ImageUpload, NativeSelect, PageHeader, Pagination, StatusBadge, usePagination } from "@/components/yodo/ui";

import { ageText, classColor, fullName, useYodo, type ClassInput, type DanceClass } from "@/lib/yodo-store";
import { L, dayShort, fDayMonth, fd, opt } from "@/lib/i18n";
import { courseState } from "@/lib/courses";
import { DaysBadge } from "@/components/yodo/courses";
import type { YodoData } from "@/lib/yodo-store";

/** Bought (anyone who ever bought it), not ended yet, ending soon. */
function countsFor(data: YodoData, cid: string) {
  const en = data.enrollments.filter((e) => e.classId === cid);
  const bought = new Set([...data.purchases.filter((p) => p.classId === cid && p.kind === "buy" && !p.cancelled).map((p) => p.studentId), ...en.map((e) => e.studentId)]);
  const st = en.map((e) => courseState(e.expiryDate, data.expiryDays));
  return { bought: bought.size, active: st.filter((x) => x !== "ended").length, soon: st.filter((x) => x === "soon").length };
}

export const Route = createFileRoute("/_authenticated/_shell/classes")({
  head: () => ({
    meta: [
      { title: "YODO" },
      { name: "description", content: L("จัดการคลาสเต้น ครูผู้สอน และนักเรียนในแต่ละคลาส", "Manage dance classes, their teachers and students") },
      { property: "og:title", content: "YODO" },
      { property: "og:description", content: L("จัดการคลาสเต้น ครูผู้สอน และนักเรียนในแต่ละคลาส", "Manage dance classes, their teachers and students") },
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
  const classCounts = (cid: string) => countsFor(data, cid);

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
      <PageHeader title={L("คลาส", "Classes")} subtitle={L(`คลาสทั้งหมด ${data.classes.length} คลาส`, `${data.classes.length} classes in total`)} action={can("classes", "add") && <Button className="rounded-full" onClick={openAdd}><Plus className="h-4 w-4" /> {L("เพิ่มคลาส", "Add Class")}</Button>} />
      <Card className="mb-6 flex flex-row flex-wrap gap-3 rounded-3xl p-4">
        <div className="relative min-w-60 flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={L("ค้นหาชื่อคลาส หรือครู...", "Search class or teacher...")} className="rounded-full pl-9" />
        </div>
        <NativeSelect value={status} onValueChange={setStatus} className="w-44 rounded-full">
          <option value="all">{L("ทุกสถานะ", "All statuses")}</option>
          <option value="Active">{opt("Active")}</option>
          <option value="Inactive">{opt("Inactive")}</option>
          <option value="Disabled">{opt("Disabled")}</option>
        </NativeSelect>
      </Card>

      {list.length === 0 ? (
        <EmptyState title={L("ไม่พบคลาส", "No classes found")} text={L("ลองเปลี่ยนคำค้นหา หรือเพิ่มคลาสใหม่", "Try another search, or add a new class")} action={can("classes", "add") && <Button className="rounded-full" onClick={openAdd}><Plus className="h-4 w-4" /> {L("เพิ่มคลาส", "Add Class")}</Button>} />
      ) : (
        <>
          <div className="grid gap-7 sm:grid-cols-2 xl:grid-cols-3">
            {pg.pageItems.map((c) => {
              const t = data.teachers.find((x) => x.id === c.teacherId);
              const k = classCounts(c.id);
              return (
                <Card key={c.id} className={`gap-0 overflow-hidden rounded-3xl p-0 ${c.disabled ? "opacity-60" : ""}`}>
                   <div className="aspect-[12/5] w-full"><ClassCover src={c.image} name={c.name} color={classColor(data.classes, c.id)} /></div>
                  <div className="flex flex-1 flex-col gap-4 p-6">
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="font-display text-xl font-semibold leading-snug">{c.name}</h3>
                      <StatusBadge status={statusOf(c)} />
                    </div>
                    <p className="line-clamp-2 text-sm leading-relaxed text-muted-foreground">{c.description || "-"}</p>
                    <p className="text-sm font-semibold text-primary">{coursePrice(c)}</p>
                    <div className="flex items-center justify-between gap-3 rounded-2xl bg-accent/30 px-4 py-2.5 text-sm">
                      <span className="flex min-w-0 items-center gap-2.5"><Avatar src={t?.image} name={t?.nickname ?? "?"} className="h-8 w-8 text-sm" /><span className="truncate">{t ? t.nickname : L("ไม่มีครู", "No teacher")}</span></span>
                    </div>
                    {/* Bought / not ended / ending soon (owner 12/10/2026, mockup WTr5LoqwQAEnSrKDuzZiMi board 4) */}
                    <button type="button" onClick={() => setViewId(c.id)} className="grid grid-cols-3 gap-2 text-center" data-testid="class-counts" aria-label={L(`ดูนักเรียนใน ${c.name}`, `See the students of ${c.name}`)}>
                      <span className="rounded-2xl bg-muted/70 py-2"><span className="block text-xl font-bold">{k.bought}</span><span className="block text-[11px] text-muted-foreground">{L("เคยซื้อ", "Bought")}</span></span>
                      <span className="rounded-2xl bg-emerald-50 py-2 text-emerald-800"><span className="block text-xl font-bold">{k.active}</span><span className="block text-[11px]">{L("ยังไม่หมดอายุ", "Not ended")}</span></span>
                      <span className="rounded-2xl bg-orange-50 py-2 text-orange-800"><span className="block text-xl font-bold">{k.soon}</span><span className="block text-[11px]">{L("ใกล้หมด", "Ending soon")}</span></span>
                    </button>
                    <div className="mt-auto flex gap-1 border-t border-border pt-4">
                      <Button size="icon" variant="ghost" className="h-8 w-8 rounded-full text-muted-foreground hover:text-foreground" title={L("ดูข้อมูล", "View")} aria-label={L(`ดูข้อมูล ${c.name}`, `View ${c.name}`)} onClick={() => setViewId(c.id)}><Eye strokeWidth={1.6} /></Button>
                      {can("classes", "edit") && <Button size="icon" variant="ghost" className="h-8 w-8 rounded-full text-muted-foreground hover:text-foreground" title={L("แก้ไข", "Edit")} aria-label={L(`แก้ไข ${c.name}`, `Edit ${c.name}`)} onClick={() => { setEditing(c); setFormOpen(true); }}><Pencil strokeWidth={1.6} /></Button>}
                      {can("classes", "edit") && (c.disabled ? (
                        <Button size="icon" variant="ghost" className="h-8 w-8 rounded-full text-muted-foreground hover:text-foreground" title={L("เปิดใช้งาน", "Enable")} aria-label={L(`เปิดใช้งาน ${c.name}`, `Enable ${c.name}`)} onClick={() => { setClassDisabled(c.id, false); toast.success(L("เปิดใช้งานคลาสแล้ว", "Class enabled")); }}><RotateCcw strokeWidth={1.6} /></Button>
                      ) : (
                        <Button size="icon" variant="ghost" className="h-8 w-8 rounded-full text-muted-foreground hover:text-destructive" title={L("ปิดใช้งาน", "Disable")} aria-label={L(`ปิดใช้งาน ${c.name}`, `Disable ${c.name}`)} onClick={() => setDisabling(c)}><Ban strokeWidth={1.6} /></Button>
                      ))}
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
          <Pagination page={pg.page} totalPages={pg.totalPages} onChange={pg.setPage} from={pg.from} to={pg.to} total={pg.total} unit={L("คลาส", "classes")} />
        </>
      )}


      <ClassForm open={formOpen} onOpenChange={setFormOpen} editing={editing} />
      <ClassDetail classId={viewId} onClose={() => setViewId(null)} />
      <ConfirmDialog open={!!disabling} onOpenChange={(o) => !o && setDisabling(null)} title={L("ปิดใช้งานคลาส?", "Disable class?")} text={L(`${disabling?.name ?? ""} จะถูกซ่อนจากการลงทะเบียน (ข้อมูลยังอยู่)`, `${disabling?.name ?? ""} will be hidden from enrolment (its data is kept)`)} confirmLabel={L("ปิดใช้งาน", "Disable")} destructive onConfirm={() => { if (disabling) { setClassDisabled(disabling.id, true); toast.success(L("ปิดใช้งานคลาสแล้ว", "Class disabled")); } }} />
    </>
  );
}

const emptyClass: ClassInput = { name: "", teacherId: "", description: "", image: "", status: "Active", price: null, months: 1 };

/** "10,000 บาท / 6 เดือน" (owner 12/10/2026: the price is for the whole course). */
export const coursePrice = (c: { price: number | null; months: number }) =>
  c.price != null ? L(`${c.price.toLocaleString("th-TH")} บาท / ${c.months} เดือน`, `${c.price.toLocaleString("th-TH")} baht / ${c.months} ${c.months === 1 ? "month" : "months"}`) : "-";

function ClassForm({ open, onOpenChange, editing }: { open: boolean; onOpenChange: (o: boolean) => void; editing: DanceClass | null }) {
  const { data, addClass, updateClass } = useYodo();
  const [f, setF] = useState<ClassInput>(emptyClass);
  const [errors, setErrors] = useState<Partial<Record<"name" | "description", string>>>({});
  const [lastOpen, setLastOpen] = useState(false);
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) {
      setErrors({});
      setF(editing ? { name: editing.name, teacherId: editing.teacherId, description: editing.description, image: editing.image, status: editing.status, price: editing.price, months: editing.months || 1 } : emptyClass);
    }
  }
  const teachers = data.teachers.filter((t) => t.status === "Active" || t.id === f.teacherId);
  const submit = () => {
    const e: Partial<Record<"name" | "description", string>> = {};
    if (!f.name.trim()) e.name = L("กรุณากรอกชื่อคลาส", "Please enter the class name");
    else if (f.name.length > 100) e.name = L("ชื่อยาวเกินไป", "Name is too long");
    if (f.description.length > 1000) e.description = L("คำอธิบายยาวเกินไป", "Description is too long");
    setErrors(e);
    if (Object.keys(e).length) return;
    const clean = { ...f, name: f.name.trim(), description: f.description.trim() };
    if (editing) updateClass(editing.id, clean); else addClass(clean);
    toast.success(editing ? L("บันทึกคลาสแล้ว", "Class saved") : L("เพิ่มคลาสแล้ว", "Class added"));
    onOpenChange(false);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">{editing ? L("แก้ไขคลาส", "Edit Class") : L("เพิ่มคลาส", "Add Class")}</DialogTitle>
          <DialogDescription>{L("กรอกข้อมูลคลาส", "Fill in the class details")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <Field label={L("รูปคลาส", "Class Image")}><ImageUpload shape="wide" value={f.image} onChange={(v) => setF({ ...f, image: v })} /></Field>
          <Field label={L("ชื่อคลาส", "Class Name")} required error={errors.name}><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
          <Field label={L("ครูผู้สอน", "Teacher")}>
            <NativeSelect value={f.teacherId} onValueChange={(value) => setF({ ...f, teacherId: value })}>
              <option value="">{L("ไม่ระบุครูผู้สอน", "No teacher set")}</option>
              {teachers.map((t) => <option key={t.id} value={t.id}>{t.nickname} — {t.firstName} {t.lastName}</option>)}
            </NativeSelect>
          </Field>
          <Field label={L("คำอธิบาย", "Description")} error={errors.description}><Textarea rows={3} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
          <Field label={L("ราคาคอร์ส (บาท)", "Course price (baht)")}>
            <Input type="number" min={0} step="1" placeholder={L("เช่น 10000", "e.g. 10000")} value={f.price ?? ""} onChange={(e) => setF({ ...f, price: e.target.value === "" ? null : Math.max(0, Number(e.target.value)) })} />
          </Field>
          <Field label={L("อายุคอร์ส (เดือน)", "Course length (months)")}>
            <Input type="number" min={1} max={120} step="1" value={f.months} onChange={(e) => setF({ ...f, months: Math.min(120, Math.max(1, Math.round(Number(e.target.value) || 1))) })} />
          </Field>
          <Field label={L("สถานะคลาส", "Class Status")}>
            <NativeSelect value={f.status} onValueChange={(value) => setF({ ...f, status: value as ClassInput["status"] })}>
              <option value="Active">{opt("Active")}</option>
              <option value="Inactive">{opt("Inactive")}</option>
            </NativeSelect>
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{L("ยกเลิก", "Cancel")}</Button>
          <Button onClick={submit}>{L("บันทึก", "Save")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ClassDetail({ classId, onClose }: { classId: string | null; onClose: () => void }) {
  const { data } = useYodo();
  const c = data.classes.find((x) => x.id === classId);
  const t = data.teachers.find((x) => x.id === c?.teacherId);
  const [show, setShow] = useState<"active" | "ended" | "all">("active");
  const rows = data.enrollments.filter((e) => e.classId === classId)
    .map((e) => ({ e, s: data.students.find((x) => x.id === e.studentId), st: courseState(e.expiryDate, data.expiryDays) }))
    .filter((r) => !!r.s)
    .sort((a, b) => (a.e.expiryDate || "9999").localeCompare(b.e.expiryDate || "9999"));
  const counts = { active: rows.filter((r) => r.st !== "ended").length, ended: rows.filter((r) => r.st === "ended").length, all: rows.length };
  const students = rows.filter((r) => show === "all" || (show === "ended" ? r.st === "ended" : r.st !== "ended"));
  const today = format(new Date(), "yyyy-MM-dd");
  const upcoming = data.schedules.filter((s) => s.classId === classId && s.date >= today).sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start)).slice(0, 8);
  return (
    <Sheet open={!!c} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        {c && (
          <>
             <div className="relative -mx-6 -mt-6 aspect-[12/5]">
               <ClassCover src={c.image} name={c.name} color={classColor(data.classes, c.id)} />
               {/* Back button over the cover (owner 12/10/2026: on a phone the panel had no way back) */}
               <SheetClose asChild>
                 <Button variant="outline" className="absolute left-3 top-3 z-20 rounded-full bg-background/90 shadow-soft" data-testid="class-back"><ChevronLeft className="h-4 w-4" /> {L("กลับ", "Back")}</Button>
               </SheetClose>
             </div>
            <SheetHeader className="px-0">
              <SheetTitle className="font-display text-2xl">{c.name}</SheetTitle>
              <div><StatusBadge status={statusOf(c)} /></div>
              <p className="text-sm text-muted-foreground">{c.description}</p>
              <p className="text-sm font-semibold text-primary">{coursePrice(c)}</p>
            </SheetHeader>
            <div className="space-y-6">
              <div className="flex items-center gap-3 rounded-2xl bg-muted/60 p-3">
                <Avatar src={t?.image} name={t?.nickname ?? "?"} />
                <div>
                  <p className="text-xs text-muted-foreground">{L("ครูผู้สอน", "Teacher")}</p>
                  <p className="font-medium">{t ? `${t.nickname} (${fullName(t)})` : "-"}</p>
                </div>
              </div>
              <div>
                <p className="mb-2 font-semibold">{L("นักเรียนในคลาส", "Students in this class")}</p>
                <div className="mb-3 flex flex-wrap gap-1.5" role="group" aria-label={L("แสดง", "Show")}>
                  {([["active", L(`ยังไม่หมดอายุ ${counts.active}`, `Not ended ${counts.active}`)], ["ended", L(`หมดแล้ว ${counts.ended}`, `Ended ${counts.ended}`)], ["all", L(`ทั้งหมด ${counts.all}`, `All ${counts.all}`)]] as const).map(([k, t]) => (
                    <button key={k} type="button" aria-pressed={show === k} onClick={() => setShow(k)}
                      className={`h-8 rounded-full px-3 text-xs font-semibold ${show === k ? "bg-primary text-primary-foreground" : "border border-border bg-background hover:bg-muted"}`}>{t}</button>
                  ))}
                </div>
                {students.length === 0 ? <p className="text-sm text-muted-foreground">{L("ยังไม่มีนักเรียน", "No students yet")}</p> : (
                  <ul className="space-y-2" data-testid="class-students">
                    {students.map(({ e, s }) => s && (
                      <li key={e.id} className="flex items-center gap-3">
                        <Avatar src={s.image} name={s.firstName} className="h-8 w-8 text-sm" />
                        <span className="min-w-0 flex-1 text-sm"><span className="block truncate">{fullName(s)} <span className="text-muted-foreground">({s.nickname || "-"}, {ageText(s.dob)})</span></span><span className="block text-xs text-muted-foreground">{fd(e.startDate)} – {fd(e.expiryDate)}</span></span>
                        <DaysBadge expiry={e.expiryDate} />
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div>
                <p className="mb-2 font-semibold">{L("ตารางเรียนที่กำลังจะมาถึง", "Upcoming lessons")}</p>
                {upcoming.length === 0 ? <p className="text-sm text-muted-foreground">{L("ยังไม่มีตารางเรียน เพิ่มได้ที่หน้าปฏิทิน", "No lessons yet. Add them on the Calendar page")}</p> : (
                  <ul className="space-y-1.5">
                    {upcoming.map((s) => (
                      <li key={s.id} className="flex justify-between rounded-xl bg-muted/50 px-3 py-2 text-sm">
                        <span>{`${dayShort(parseISO(s.date).getDay())} ${fDayMonth(s.date)}`}</span>
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
