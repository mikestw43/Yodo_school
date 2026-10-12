import { useMemo, useState } from "react";
import { differenceInCalendarMonths, format, parseISO } from "date-fns";
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { toast } from "sonner";
import { Ban, Eye, PenLine, Pencil, Plus, Printer, RotateCcw, Search, Trash2, UserRoundPlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Avatar, ChipSelect, ConfirmDialog, DateField, EmptyState, Field, ImageUpload, NativeSelect, ReceiptUpload, PageHeader, Pagination, SectionTitle, StatusBadge, onlyDigits10, usePagination } from "@/components/yodo/ui";

import { printReceipt } from "@/lib/receipt-print";
import { StudentDocument, useSignCanvases } from "@/components/yodo/student-document";
import {
  NATIONALITIES, PREFIXES, RELIGIONS, SOURCES, ageText, fullName, nextStudentCode, useYodo,
  type Enrollment, type EnrollmentInput, type Student, type StudentInput,
} from "@/lib/yodo-store";
import { printStudentDocument } from "@/lib/student-print";

export const Route = createFileRoute("/_authenticated/_shell/students")({
  head: () => ({
    meta: [
      { title: "YODO" },
      { name: "description", content: "จัดการรายชื่อนักเรียนของโรงเรียนสอนเต้น YODO" },
      { property: "og:title", content: "YODO" },
      { property: "og:description", content: "จัดการรายชื่อนักเรียนของโรงเรียนสอนเต้น YODO" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: StudentsPage,
});

const phone = z.string().regex(/^\d{10}$/, "เบอร์โทรต้องเป็นตัวเลข 10 หลัก");
const schema = z
  .object({
    prefix: z.string().min(1, "กรุณาเลือกคำนำหน้า"),
    firstName: z.string().trim().min(1, "กรุณากรอกชื่อ").max(100),
    lastName: z.string().trim().min(1, "กรุณากรอกนามสกุล").max(100),
    nickname: z.string().trim().max(50),
    dob: z.string().min(1, "กรุณาเลือกวันเกิด").refine((v) => new Date(v) <= new Date(), "วันเกิดต้องไม่เกินวันนี้"),
    nationality: z.string().min(1, "กรุณาเลือกสัญชาติ"),
    nationalityOther: z.string().trim().max(50),
    religion: z.string().min(1, "กรุณาเลือกศาสนา"),
    address: z.string().trim().max(500),
    phone,
    email: z.string().trim().min(1, "กรุณากรอกอีเมล").email("รูปแบบอีเมลไม่ถูกต้อง").max(255),
    lineId: z.string().trim().max(50),
    emergencyName: z.string().trim().min(1, "กรุณากรอกชื่อผู้ติดต่อฉุกเฉิน").max(100),
    emergencyPhone: phone,
    relationship: z.string().trim().min(1, "กรุณาระบุความสัมพันธ์").max(50),
    image: z.string(),
    interested: z.array(z.string()),
    hasExperience: z.boolean(),
    experienceDetail: z.string().trim().max(500),
    source: z.string(),
    sourceOther: z.string().trim().max(100),
  })
  .superRefine((v, ctx) => {
    if (v.nationality === "Other" && !v.nationalityOther) ctx.addIssue({ code: "custom", path: ["nationalityOther"], message: "กรุณาระบุสัญชาติ" });
    if (v.source === "Other" && !v.sourceOther) ctx.addIssue({ code: "custom", path: ["sourceOther"], message: "กรุณาระบุช่องทาง" });
  });

const empty: StudentInput = {
  prefix: "", firstName: "", lastName: "", nickname: "", dob: "", nationality: "ไทย", nationalityOther: "", religion: "",
  address: "", phone: "", email: "", lineId: "", emergencyName: "", emergencyPhone: "", relationship: "", image: "",
  interested: [], hasExperience: false, experienceDetail: "", source: "", sourceOther: "",
};

function StudentsPage() {
  const { data, setStudentStatus, deleteStudent, can } = useYodo();
  const [deleting, setDeleting] = useState<Student | null>(null);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Student | null>(null);
  const [viewing, setViewing] = useState<Student | null>(null);
  const [disabling, setDisabling] = useState<Student | null>(null);
  const [enrolling, setEnrolling] = useState<Student | null>(null);

  const list = useMemo(() => {
    const k = q.trim().toLowerCase();
    return data.students
      .filter((s) => status === "all" || s.status === status)
      .filter((s) => !k || [s.code, s.firstName, s.lastName, s.nickname, s.phone, s.email].join(" ").toLowerCase().includes(k))
      .sort((a, b) => b.code.localeCompare(a.code));
  }, [data.students, q, status]);

  const pg = usePagination(list, 10, `${q}|${status}`);
  const canManage = can("students", "edit") || can("students", "delete");


  return (
    <>
      <PageHeader
        title="Students"
        subtitle={`นักเรียนทั้งหมด ${data.students.length} คน`}
        action={can("students", "add") && <Button className="rounded-full" onClick={() => { setEditing(null); setFormOpen(true); }}><Plus className="h-4 w-4" /> Add Student</Button>}
      />
      <Card className="mb-4 flex flex-row flex-wrap gap-3 rounded-3xl p-4">
        <div className="relative min-w-60 flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหาด้วยชื่อ, ชื่อเล่น, รหัส, เบอร์โทร..." className="rounded-full pl-9" />
        </div>
        <NativeSelect value={status} onValueChange={setStatus} className="w-44 rounded-full">
          <option value="all">ทุกสถานะ</option>
          <option value="Active">Active</option>
          <option value="Disabled">Disabled</option>
        </NativeSelect>
      </Card>

      {list.length === 0 ? (
        <EmptyState title="ไม่พบนักเรียน" text={q || status !== "all" ? "ลองเปลี่ยนคำค้นหาหรือตัวกรอง" : "เริ่มต้นเพิ่มนักเรียนคนแรกของคุณ"} action={can("students", "add") && <Button className="rounded-full" onClick={() => { setEditing(null); setFormOpen(true); }}><Plus className="h-4 w-4" /> Add Student</Button>} />
      ) : (
        <>
          <div className="space-y-3 md:hidden">
            {pg.pageItems.map((s) => (
              <Card key={s.id} className={`rounded-3xl p-4 ${s.status === "Disabled" ? "opacity-60" : ""}`}>
                <div className="flex items-center gap-3">
                  <Avatar src={s.image} name={s.firstName} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{fullName(s)}</p>
                    <p className="font-mono text-xs text-muted-foreground">{s.code}</p>
                  </div>
                  <StatusBadge status={s.status} />
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 text-center text-sm">
                  <div><p className="text-xs text-muted-foreground">ชื่อเล่น</p><p>{s.nickname || "-"}</p></div>
                  <div><p className="text-xs text-muted-foreground">อายุ</p><p>{ageText(s.dob)}</p></div>
                  <div><p className="text-xs text-muted-foreground">เบอร์โทร</p><p>{s.phone}</p></div>
                </div>
                <div className="mt-3 flex justify-center gap-1.5 border-t border-border/60 pt-3">
                  <Button size="icon" variant="ghost" className="h-8 w-8 rounded-full text-muted-foreground hover:text-foreground" title="ดูข้อมูล" aria-label={`ดูข้อมูล ${fullName(s)}`} onClick={() => setViewing(s)}><Eye strokeWidth={1.6} /></Button>
                  {can("students", "edit") && (s.status === "Active" ? (
                    <>
                      <Button size="icon" variant="ghost" className="h-8 w-8 rounded-full text-muted-foreground hover:text-foreground" title="เพิ่มเข้าคลาส" aria-label={`เพิ่ม ${fullName(s)} เข้าคลาส`} onClick={() => setEnrolling(s)}><UserRoundPlus strokeWidth={1.6} /></Button>
                      <Button size="icon" variant="ghost" className="h-8 w-8 rounded-full text-muted-foreground hover:text-destructive" title="ปิดใช้งาน" aria-label={`ปิดใช้งาน ${fullName(s)}`} onClick={() => setDisabling(s)}><Ban strokeWidth={1.6} /></Button>
                    </>
                  ) : (
                    <Button size="icon" variant="ghost" className="h-8 w-8 rounded-full text-muted-foreground hover:text-foreground" title="เปิดใช้งาน" aria-label={`เปิดใช้งาน ${fullName(s)}`} onClick={() => { setStudentStatus(s.id, "Active"); toast.success("เปิดใช้งานนักเรียนแล้ว"); }}><RotateCcw strokeWidth={1.6} /></Button>
                  ))}
                  {can("students", "delete") && <Button size="icon" variant="ghost" className="h-8 w-8 rounded-full text-muted-foreground hover:text-destructive" title="ลบ" aria-label={`ลบ ${fullName(s)}`} onClick={() => setDeleting(s)}><Trash2 strokeWidth={1.6} /></Button>}
                </div>
              </Card>
            ))}
          </div>
          <Card className="hidden overflow-hidden rounded-3xl p-0 md:block">
            <Table className="text-center">
              <TableHeader>
                <TableRow className="bg-muted/50 [&>th]:h-12">
                  <TableHead className="text-left">นักเรียน</TableHead>
                  <TableHead>Student ID</TableHead>
                  <TableHead>ชื่อเล่น</TableHead>
                  <TableHead>อายุ</TableHead>
                  <TableHead>เบอร์โทร</TableHead>
                  <TableHead>สถานะ</TableHead>
                  {canManage && <TableHead>จัดการ</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {pg.pageItems.map((s) => (
                  <TableRow key={s.id} className={`[&>td]:py-4 ${s.status === "Disabled" ? "opacity-60" : ""}`}>
                    <TableCell className="text-left">
                      <div className="flex items-center gap-3.5">
                        <Avatar src={s.image} name={s.firstName} />
                        <span className="font-medium">{fullName(s)}</span>
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{s.code}</TableCell>
                    <TableCell>{s.nickname || "-"}</TableCell>
                    <TableCell>{ageText(s.dob)}</TableCell>
                    <TableCell>{s.phone}</TableCell>
                    <TableCell><StatusBadge status={s.status} /></TableCell>
                    {canManage && (
                      <TableCell>
                        <div className="flex justify-center gap-1.5">
                          <Button size="icon" variant="ghost" className="h-8 w-8 rounded-full text-muted-foreground hover:text-foreground" title="ดูข้อมูล" aria-label={`ดูข้อมูล ${fullName(s)}`} onClick={() => setViewing(s)}><Eye strokeWidth={1.6} /></Button>
                          {can("students", "edit") && (s.status === "Active" ? (
                            <>
                              <Button size="icon" variant="ghost" className="h-8 w-8 rounded-full text-muted-foreground hover:text-foreground" title="เพิ่มเข้าคลาส" aria-label={`เพิ่ม ${fullName(s)} เข้าคลาส`} onClick={() => setEnrolling(s)}><UserRoundPlus strokeWidth={1.6} /></Button>
                              <Button size="icon" variant="ghost" className="h-8 w-8 rounded-full text-muted-foreground hover:text-destructive" title="ปิดใช้งาน" aria-label={`ปิดใช้งาน ${fullName(s)}`} onClick={() => setDisabling(s)}><Ban strokeWidth={1.6} /></Button>
                            </>
                          ) : (
                            <Button size="icon" variant="ghost" className="h-8 w-8 rounded-full text-muted-foreground hover:text-foreground" title="เปิดใช้งาน" aria-label={`เปิดใช้งาน ${fullName(s)}`} onClick={() => { setStudentStatus(s.id, "Active"); toast.success("เปิดใช้งานนักเรียนแล้ว"); }}><RotateCcw strokeWidth={1.6} /></Button>
                          ))}
                          {can("students", "delete") && <Button size="icon" variant="ghost" className="h-8 w-8 rounded-full text-muted-foreground hover:text-destructive" title="ลบ" aria-label={`ลบ ${fullName(s)}`} onClick={() => setDeleting(s)}><Trash2 strokeWidth={1.6} /></Button>}
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
          <Pagination page={pg.page} totalPages={pg.totalPages} onChange={pg.setPage} from={pg.from} to={pg.to} total={pg.total} unit="คน" />
        </>
      )}


      <StudentForm open={formOpen} onOpenChange={setFormOpen} editing={editing} />
      <StudentView student={viewing} onClose={() => setViewing(null)} onEdit={(s) => { setViewing(null); setEditing(s); setFormOpen(true); }} />
      <EnrollDialog student={enrolling} onClose={() => setEnrolling(null)} />
      <ConfirmDialog
        open={!!disabling}
        onOpenChange={(o) => !o && setDisabling(null)}
        title="ปิดใช้งานนักเรียน?"
        text={disabling ? `${fullName(disabling)} จะถูกเปลี่ยนสถานะเป็น Disabled (ข้อมูลยังคงอยู่ในระบบ)` : ""}
        confirmLabel="Disable"
        destructive
        onConfirm={() => { if (disabling) { setStudentStatus(disabling.id, "Disabled"); toast.success("ปิดใช้งานนักเรียนแล้ว"); } }}
      />
      <ConfirmDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)} title="ลบนักเรียน?" text={deleting ? `ต้องการลบ ${fullName(deleting)} ใช่หรือไม่` : ""} confirmLabel="ลบ" destructive onConfirm={() => { if (deleting) { deleteStudent(deleting.id); toast.success("ลบนักเรียนแล้ว"); } }} />
    </>
  );
}

// จับคู่ค่าที่นำเข้าจาก Excel (เช่น "Ballet") เข้ากับชื่อคลาสจริง (เช่น "Ballet Foundation")
function mapInterested(values: string[], classNames: string[]): string[] {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9ก-๙]+/g, " ").trim();
  const out: string[] = [];
  for (const v of values) {
    const nv = norm(v);
    const hit = classNames.find((c) => norm(c) === nv) ?? classNames.find((c) => { const nc = norm(c); return nc.includes(nv) || nv.includes(nc); });
    const mapped = hit ?? v;
    if (!out.includes(mapped)) out.push(mapped);
  }
  return out;
}

function StudentForm({ open, onOpenChange, editing }: { open: boolean; onOpenChange: (o: boolean) => void; editing: Student | null }) {
  const { data, addStudent, updateStudent } = useYodo();
  const classNames = data.classes.filter((c) => !c.disabled && c.status === "Active").map((c) => c.name);
  const [f, setF] = useState<StudentInput>(empty);
  const [errors, setErrors] = useState<Partial<Record<keyof StudentInput, string>>>({});
  const [lastOpen, setLastOpen] = useState(false);
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) {
      setErrors({});
      if (editing) {
        const { id: _i, code: _c, status: _s, createdAt: _d, ...rest } = editing;
        setF({ ...rest, interested: mapInterested(rest.interested, classNames) });
      } else setF(empty);
    }
  }
  const set = <K extends keyof StudentInput>(k: K, v: StudentInput[K]) => setF((p) => ({ ...p, [k]: v }));
  const age = f.dob ? ageText(f.dob) : null;

  const submit = () => {
    const r = schema.safeParse(f);
    if (!r.success) {
      const e: Partial<Record<keyof StudentInput, string>> = {};
      r.error.issues.forEach((i) => { const k = String(i.path[0]) as keyof StudentInput; if (!e[k]) e[k] = i.message; });
      setErrors(e);
      toast.error("กรุณาตรวจสอบข้อมูลให้ครบถ้วน");
      return;
    }
    if (editing) { updateStudent(editing.id, f); toast.success("บันทึกข้อมูลแล้ว"); }
    else { const s = addStudent(f); toast.success(`เพิ่มนักเรียนแล้ว (${s.code})`); }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">{editing ? "แก้ไขนักเรียน" : "Add Student"}</DialogTitle>
          <DialogDescription>กรอกข้อมูลของนักเรียนให้ครบถ้วน</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Profile Image" className="sm:col-span-2"><ImageUpload value={f.image} onChange={(v) => set("image", v)} /></Field>
          <SectionTitle>ข้อมูลส่วนตัว</SectionTitle>
          <Field label="Student ID (สร้างอัตโนมัติ)">
            <Input value={editing ? editing.code : nextStudentCode(data.students, data.deletedStudentCodes)} readOnly disabled className="font-mono" />
          </Field>
          <Field label="Prefix" required error={errors.prefix}>
            <NativeSelect value={f.prefix} onValueChange={(value) => set("prefix", value)}>
              <option value="">เลือกคำนำหน้า</option>
              {PREFIXES.map((p) => <option key={p}>{p}</option>)}
            </NativeSelect>
          </Field>
          <Field label="Nickname" error={errors.nickname}><Input value={f.nickname} onChange={(e) => set("nickname", e.target.value)} /></Field>
          <Field label="First Name" required error={errors.firstName}><Input value={f.firstName} onChange={(e) => set("firstName", e.target.value)} /></Field>
          <Field label="Last Name" required error={errors.lastName}><Input value={f.lastName} onChange={(e) => set("lastName", e.target.value)} /></Field>
          <Field label="Date of Birth" required error={errors.dob}><DateField value={f.dob} max={new Date().toISOString().slice(0, 10)} onChange={(v) => set("dob", v)} /></Field>
          <Field label="Age (คำนวณอัตโนมัติ)"><Input value={age !== null ? age : ""} placeholder="เลือกวันเกิด" readOnly disabled /></Field>
          <Field label="Nationality" required error={errors.nationality}>
            <NativeSelect value={f.nationality} onValueChange={(value) => set("nationality", value)}>
              {NATIONALITIES.map((n) => <option key={n}>{n}</option>)}
            </NativeSelect>
          </Field>
          <Field label="Religion" required error={errors.religion}>
            <NativeSelect value={f.religion} onValueChange={(value) => set("religion", value)}>
              <option value="">เลือกศาสนา</option>
              {RELIGIONS.map((n) => <option key={n}>{n}</option>)}
            </NativeSelect>
          </Field>
          {f.nationality === "Other" ? (
            <Field label="ระบุสัญชาติ" required error={errors.nationalityOther} className="sm:col-span-2"><Input value={f.nationalityOther} onChange={(e) => set("nationalityOther", e.target.value)} /></Field>
          ) : null}
          <Field label="Phone Number" required error={errors.phone}><Input inputMode="numeric" value={f.phone} placeholder="0812345678" onChange={(e) => set("phone", onlyDigits10(e.target.value))} /></Field>
          <Field label="Email" required error={errors.email}><Input type="email" value={f.email} onChange={(e) => set("email", e.target.value)} /></Field>
          <Field label="Line ID" error={errors.lineId}><Input value={f.lineId} onChange={(e) => set("lineId", e.target.value)} /></Field>
          <Field label="Address" error={errors.address} className="sm:col-span-2"><Textarea rows={2} value={f.address} onChange={(e) => set("address", e.target.value)} /></Field>

          <SectionTitle>Emergency Contact</SectionTitle>
          <Field label="Emergency Contact Name" required error={errors.emergencyName}><Input value={f.emergencyName} onChange={(e) => set("emergencyName", e.target.value)} /></Field>
          <Field label="Emergency Contact Phone" required error={errors.emergencyPhone}><Input inputMode="numeric" value={f.emergencyPhone} onChange={(e) => set("emergencyPhone", onlyDigits10(e.target.value))} /></Field>
          <Field label="Relationship" required error={errors.relationship} className="sm:col-span-2"><Input value={f.relationship} placeholder="เช่น แม่, พ่อ" onChange={(e) => set("relationship", e.target.value)} /></Field>

          <SectionTitle>Additional Information</SectionTitle>
           <Field label="Interested Classes" className="sm:col-span-2">
             {classNames.length ? <ChipSelect options={classNames} value={f.interested} onChange={(v) => set("interested", v)} /> : <p className="text-sm text-muted-foreground">ยังไม่มีคลาสที่เปิดอยู่</p>}
           </Field>
          <Field label="Previous Dance Experience" className="sm:col-span-2">
            <div className="flex gap-4 text-sm">
              <label className="flex items-center gap-2"><input type="radio" className="accent-primary" checked={!f.hasExperience} onChange={() => set("hasExperience", false)} /> ไม่มี</label>
              <label className="flex items-center gap-2"><input type="radio" className="accent-primary" checked={f.hasExperience} onChange={() => set("hasExperience", true)} /> มีประสบการณ์</label>
            </div>
            {f.hasExperience && <Textarea rows={2} className="mt-2" placeholder="รายละเอียด เช่น เคยเรียน Ballet 2 ปี" value={f.experienceDetail} onChange={(e) => set("experienceDetail", e.target.value)} />}
          </Field>
          <Field label="How did you hear about us?" className="sm:col-span-2">
            <NativeSelect value={f.source} onValueChange={(value) => set("source", value)}>
              <option value="">เลือก</option>
              {SOURCES.map((n) => <option key={n}>{n}</option>)}
            </NativeSelect>
          </Field>
          {f.source === "Other" && <Field label="ระบุช่องทาง" required error={errors.sourceOther} className="sm:col-span-2"><Input value={f.sourceOther} onChange={(e) => set("sourceOther", e.target.value)} /></Field>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>ยกเลิก</Button>
          <Button onClick={submit}>{editing ? "บันทึก" : "เพิ่มนักเรียน"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Info({ label, value }: { label: string; value?: string | number | null }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-medium">{value || "-"}</p>
    </div>
  );
}

function StudentView({ student, onClose, onEdit }: { student: Student | null; onClose: () => void; onEdit: (s: Student) => void }) {
  const { data, can, signStudent } = useYodo();
  const canEdit = can("students", "edit");
  const [signing, setSigning] = useState(false);
  const [editEn, setEditEn] = useState<Enrollment | null>(null);
  const [kept, setKept] = useState<Student | null>(null);
  if (student && kept !== student) setKept(student);
  const base = student ?? kept;
  const s = base ? data.students.find((x) => x.id === base.id) ?? base : null;
  const classes = s ? data.enrollments.filter((e) => e.studentId === s.id).map((e) => ({ en: e, cls: data.classes.find((c) => c.id === e.classId) })).filter((x) => x.cls) : [];
  return (
    <>
    <Dialog open={!!student} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        {s && (
          <>
            <div className="flex items-center gap-4">
              <Avatar src={s.image} name={s.firstName} className="h-20 w-20 text-3xl" />
              <div>
                <DialogTitle className="font-display text-2xl">{fullName(s)}</DialogTitle>
                <p className="text-sm text-muted-foreground">{s.nickname} · <span className="font-mono">{s.code}</span></p>
                <div className="mt-1"><StatusBadge status={s.status} /></div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4 rounded-2xl bg-muted/50 p-4 sm:grid-cols-3">
              <Info label="วันเกิด" value={s.dob} />
              <Info label="อายุ" value={ageText(s.dob)} />
              <Info label="สัญชาติ" value={s.nationality === "Other" ? s.nationalityOther : s.nationality} />
              <Info label="ศาสนา" value={s.religion} />
              <Info label="เบอร์โทร" value={s.phone} />
              <Info label="Email" value={s.email} />
              <Info label="Line ID" value={s.lineId} />
              <div className="col-span-2"><Info label="ที่อยู่" value={s.address} /></div>
            </div>
            <div className="grid grid-cols-2 gap-4 rounded-2xl bg-muted/50 p-4 sm:grid-cols-3">
              <Info label="ผู้ติดต่อฉุกเฉิน" value={s.emergencyName} />
              <Info label="เบอร์ฉุกเฉิน" value={s.emergencyPhone} />
              <Info label="ความสัมพันธ์" value={s.relationship} />
              <Info label="คลาสที่สนใจ" value={s.interested.join(", ")} />
              <Info label="ประสบการณ์" value={s.hasExperience ? `มี — ${s.experienceDetail || ""}` : "ไม่มี"} />
              <Info label="รู้จักจาก" value={s.source === "Other" ? s.sourceOther : s.source} />
            </div>
            <div>
              <p className="mb-2 text-sm font-semibold">คลาสที่ลงทะเบียน ({classes.length})</p>
              <div className="flex flex-wrap gap-2">
                {classes.length === 0 && <p className="text-sm text-muted-foreground">ยังไม่ได้ลงคลาส</p>}
                {classes.map(({ en, cls }) => cls && (
                  <button type="button" key={en.id} disabled={!canEdit} onClick={() => setEditEn(en)} title="แก้ไขการลงทะเบียน" className="inline-flex flex-wrap items-center gap-1.5 rounded-full bg-accent px-3 py-1 text-xs text-accent-foreground transition-colors hover:bg-primary/15">
                    <span className="font-medium">{cls.name}</span>
                    {en.startDate && (
                      <span className="text-muted-foreground">
                        {en.startDate.split("-").reverse().join("/")}{en.expiryDate ? ` – ${en.expiryDate.split("-").reverse().join("/")}` : ""}
                      </span>
                    )}
                    {en.remark && <span className="text-muted-foreground">· {en.remark}</span>}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-muted/40 p-3 text-sm">
              {s.signedAt && s.signature ? (
                <><img src={s.signature} alt="ลายเซ็น" className="h-10 rounded bg-background px-2" /><span>เซ็นแล้วเมื่อ {s.signedAt.split("-").reverse().join("/")}</span></>
              ) : <span className="text-muted-foreground">ยังไม่ได้เซ็นเอกสาร</span>}
            </div>
            <DialogFooter>
              {canEdit && <Button variant="outline" onClick={() => setSigning(true)}><PenLine className="h-4 w-4" /> {s.signature ? "เซ็นใหม่" : "เซ็นเอกสาร"}</Button>}
              <Button variant="outline" onClick={() => { if (!printStudentDocument(s)) toast.error("กรุณาอนุญาตหน้าต่างใหม่เพื่อพิมพ์ PDF"); }}><Printer className="h-4 w-4" /> พิมพ์ PDF</Button>
              {canEdit && <Button variant="outline" onClick={() => onEdit(s)}><Pencil className="h-4 w-4" /> แก้ไข</Button>}
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
    <EnrollDialog student={editEn ? s : null} enrollment={editEn} onClose={() => setEditEn(null)} />
    <Dialog open={signing} onOpenChange={setSigning}>
      <DialogContent className="flex max-h-[92vh] max-w-3xl flex-col overflow-hidden">
        <DialogHeader><DialogTitle>เซ็นเอกสาร</DialogTitle><DialogDescription>เลื่อนอ่านเอกสารแล้วเซ็นลงบนเส้นลายเซ็นของแต่ละหน้าได้เลย ลายเซ็นและวันที่จะถูกบันทึกลงเอกสาร PDF</DialogDescription></DialogHeader>
        {signing && s && <SignDocumentBody student={s} onDone={() => setSigning(false)} />}
      </DialogContent>
    </Dialog>
    </>
  );
}

function SignDocumentBody({ student, onDone }: { student: Student; onDone: () => void }) {
  const { signStudent } = useYodo();
  const { refs, clear, exportSignature, markActive, hasSignature, resetKey, showOld } = useSignCanvases();
  const save = () => {
    const img = exportSignature();
    if (!img) return;
    signStudent(student.id, img, format(new Date(), "yyyy-MM-dd"));
    onDone();
    toast.success("บันทึกลายเซ็นแล้ว");
  };
  return (
    <>
      <div className="min-h-0 flex-1 overflow-y-auto rounded-2xl bg-muted/60 p-3 sm:p-5">
        <StudentDocument student={student} signMode resetKey={resetKey} showOld={showOld} canvasRefs={[refs[0], refs[1]]} onDirty={markActive} />
      </div>
      <DialogFooter className="pt-3">
        <Button variant="outline" onClick={clear}>ล้างลายเซ็น</Button>
        <Button variant="outline" onClick={onDone}>ยกเลิก</Button>
        <Button disabled={!hasSignature} onClick={save}>บันทึกลายเซ็น</Button>
      </DialogFooter>
    </>
  );
}

const enrollSchema = z
  .object({
    classId: z.string().min(1, "กรุณาเลือกคลาส"),
    purchaseDate: z.string().min(1, "กรุณาเลือกวันที่ซื้อ"),
    startDate: z.string().min(1, "กรุณาเลือกวันเริ่มเรียน"),
    expiryDate: z.string(),
    remark: z.string().trim().max(500),
    receiptImage: z.string(),
  })
  .superRefine((v, ctx) => {
    if (v.expiryDate && v.startDate && v.expiryDate < v.startDate)
      ctx.addIssue({ code: "custom", path: ["expiryDate"], message: "วันหมดอายุต้องไม่ก่อนวันเริ่มเรียน" });
  });

const enrollEmpty: EnrollmentInput = { classId: "", purchaseDate: "", startDate: "", expiryDate: "", remark: "", receiptImage: "" };

function EnrollDialog({ student: studentProp, enrollment: enrollmentProp, onClose }: { student: Student | null; enrollment?: Enrollment | null; onClose: () => void }) {
  const { data, enroll, updateEnrollment, unenroll } = useYodo();
  const open = !!studentProp;
  // Keep the last shown values while the close animation plays, so the form doesn't collapse.
  const [kept, setKept] = useState<{ s: Student | null; e: Enrollment | null }>({ s: null, e: null });
  if (studentProp && (kept.s !== studentProp || kept.e !== (enrollmentProp ?? null))) setKept({ s: studentProp, e: enrollmentProp ?? null });
  const student = studentProp ?? kept.s;
  const enrollment = studentProp ? (enrollmentProp ?? null) : kept.e;
  const [f, setF] = useState<EnrollmentInput>(enrollEmpty);
  const [errors, setErrors] = useState<Partial<Record<keyof EnrollmentInput, string>>>({});
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [loadedId, setLoadedId] = useState<string | null>(null);
  const openKey = studentProp ? (enrollmentProp?.id ?? `new-${studentProp.id}`) : loadedId;
  if (openKey !== loadedId) {
    setLoadedId(openKey);
    if (enrollment) {
      const { classId, purchaseDate, startDate, expiryDate, remark, receiptImage } = enrollment;
      setF({ classId, purchaseDate, startDate, expiryDate, remark, receiptImage });
    } else setF(enrollEmpty);
    setErrors({});
  }
  const options = student
    ? data.classes.filter((c) =>
        (c.id === enrollment?.classId) ||
        (c.id === f.classId) ||
        (c.status === "Active" && !c.disabled && !data.enrollments.some((e) => e.studentId === student.id && e.classId === c.id)))
    : [];
  const set = <K extends keyof EnrollmentInput>(k: K, v: EnrollmentInput[K]) => setF((p) => ({ ...p, [k]: v }));
  const selectedClass = data.classes.find((c) => c.id === f.classId);
  const months = useMemo(() => {
    if (!f.startDate || !f.expiryDate || f.expiryDate < f.startDate) return 0;
    const s = parseISO(f.startDate);
    const e = parseISO(f.expiryDate);
    return Math.max(1, differenceInCalendarMonths(e, s) + (e.getDate() > s.getDate() ? 1 : 0));
  }, [f.startDate, f.expiryDate]);
  const total = selectedClass?.price != null && months > 0 ? selectedClass.price * months : null;
  const close = () => { onClose(); setErrors({}); };

  const submit = () => {
    if (!student) return;
    const r = enrollSchema.safeParse(f);
    if (!r.success) {
      const e: Partial<Record<keyof EnrollmentInput, string>> = {};
      r.error.issues.forEach((i) => { const k = String(i.path[0]) as keyof EnrollmentInput; if (!e[k]) e[k] = i.message; });
      setErrors(e);
      toast.error("กรุณาตรวจสอบข้อมูลให้ครบถ้วน");
      return;
    }
    if (!options.some((c) => c.id === f.classId)) return setErrors({ classId: "กรุณาเลือกคลาสที่เปิดอยู่" });
    if (enrollment) { updateEnrollment(enrollment.id, f); toast.success("บันทึกการลงทะเบียนแล้ว"); }
    else { enroll(student.id, f); toast.success("เพิ่มเข้าคลาสแล้ว"); }
    close();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) close(); }}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{enrollment ? "แก้ไขการลงทะเบียน" : "เพิ่มเข้า Class"}</DialogTitle>
          <DialogDescription>{student && fullName(student)}</DialogDescription>
        </DialogHeader>
        {options.length === 0 ? (
          <p className="text-sm text-muted-foreground">ไม่มีคลาสที่เปิดอยู่ให้เลือก (หรือลงครบทุกคลาสแล้ว)</p>
        ) : (
          <div className="grid gap-4">
            <Field label="Class" required error={errors.classId}>
              <NativeSelect value={f.classId} onValueChange={(value) => set("classId", value)}>
                <option value="">เลือกคลาส</option>
                {options.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </NativeSelect>
            </Field>
            {selectedClass?.price != null && (
              <p className="-mt-2 text-sm text-muted-foreground">ราคา <span className="font-semibold text-primary">{selectedClass.price.toLocaleString("th-TH")} บาท/เดือน</span></p>
            )}
            <Field label="Purchase date" required error={errors.purchaseDate}>
              <DateField value={f.purchaseDate} onChange={(v) => set("purchaseDate", v)} />
            </Field>
            <Field label="Start date" required error={errors.startDate}>
              <DateField value={f.startDate} onChange={(v) => set("startDate", v)} />
            </Field>
            <Field label="Expiry date" error={errors.expiryDate}>
              <DateField value={f.expiryDate} min={f.startDate || undefined} onChange={(v) => set("expiryDate", v)} />
            </Field>
            {total != null && (
              <div className="rounded-2xl border border-border/60 bg-accent/30 px-4 py-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">ระยะเวลา</span>
                  <span className="flex items-center gap-2">
                    {format(parseISO(f.startDate!), "dd/MM/yyyy")} – {format(parseISO(f.expiryDate!), "dd/MM/yyyy")}
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">{months} เดือน</span>
                  </span>
                </div>
                <div className="mt-1.5 flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">ราคาต่อเดือน</span>
                  <span>{selectedClass!.price!.toLocaleString("th-TH")} บาท</span>
                </div>
                <div className="mt-2.5 flex items-center justify-between border-t border-border/60 pt-2.5">
                  <span className="text-sm font-medium">ยอดรวม</span>
                  <span className="font-display text-lg font-semibold text-primary">{total.toLocaleString("th-TH")} บาท</span>
                </div>
              </div>
            )}
            <Field label="Remark" error={errors.remark}>
              <Textarea rows={2} value={f.remark} onChange={(e) => set("remark", e.target.value)} />
            </Field>
            <Field label="Receipt photo">
              <ReceiptUpload value={f.receiptImage} onChange={(v) => set("receiptImage", v)} />
            </Field>
          </div>
        )}
        <DialogFooter className="gap-2 sm:justify-between">
          {enrollment ? (
            <Button variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setConfirmRemove(true)}><Trash2 className="h-4 w-4" /> นำออกจากคลาส</Button>
          ) : <span />}
          <div className="flex flex-wrap gap-2">
            {enrollment && student && (
              <Button variant="outline" onClick={() => {
                const ok = printReceipt({ student, enrollmentId: enrollment.id, className: selectedClass?.name ?? "-", price: selectedClass?.price, purchaseDate: f.purchaseDate, startDate: f.startDate, expiryDate: f.expiryDate, remark: f.remark, months, total });
                if (!ok) toast.error("เบราว์เซอร์บล็อกหน้าต่างใบเสร็จ กรุณาอนุญาต pop-up");
              }}>พิมพ์ใบเสร็จ</Button>
            )}
            <Button variant="outline" onClick={close}>ยกเลิก</Button>
            <Button disabled={options.length === 0} onClick={submit}>{enrollment ? "บันทึก" : "เพิ่ม"}</Button>
          </div>
        </DialogFooter>
      </DialogContent>
      <ConfirmDialog
        open={confirmRemove}
        onOpenChange={setConfirmRemove}
        title="นำออกจากคลาส?"
        text="ข้อมูลการลงทะเบียนและการเข้าคาบของคลาสนี้จะถูกลบ"
        destructive
        onConfirm={() => { if (student && enrollment) { unenroll(student.id, enrollment.classId); toast.success("นำออกจากคลาสแล้ว"); } setConfirmRemove(false); close(); }}
      />
    </Dialog>
  );
}
