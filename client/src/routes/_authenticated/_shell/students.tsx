import { useMemo, useState } from "react";
import { differenceInCalendarMonths, format, parseISO } from "date-fns";
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { toast } from "sonner";
import { Ban, ChevronLeft, FileText, PenLine, Pencil, Plus, Printer, RotateCcw, Search, Trash2, UserRoundPlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Avatar, ChipSelect, ConfirmDialog, DateField, EmptyState, Field, ImageUpload, NativeSelect, ReceiptUpload, PageHeader, Pagination, SectionTitle, StatusBadge, onlyDigits10, usePagination } from "@/components/yodo/ui";

import { printReceipt } from "@/lib/receipt-print";
import { SignBox, StudentDocument, useSignCanvas } from "@/components/yodo/student-document";
import {
  DANCE_TYPES, ETHNICITIES, NATIONALITIES, PREFIXES, RELIGIONS, SOURCES, ageText, fullName, nextStudentCode, useYodo,
  type Enrollment, type EnrollmentInput, type Student, type StudentInput,
} from "@/lib/yodo-store";
import { printStudentDocument } from "@/lib/student-print";
import { L, fd, opt, optOr, sourceText, splitList } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/_shell/students")({
  head: () => ({
    meta: [
      { title: "YODO" },
      { name: "description", content: L("จัดการรายชื่อนักเรียนของโรงเรียนสอนเต้น YODO", "Manage the students of the YODO dance school") },
      { property: "og:title", content: "YODO" },
      { property: "og:description", content: L("จัดการรายชื่อนักเรียนของโรงเรียนสอนเต้น YODO", "Manage the students of the YODO dance school") },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: StudentsPage,
});

const schema = () => {
  const phone = z.string().regex(/^\d{10}$/, L("เบอร์โทรต้องเป็นตัวเลข 10 หลัก", "Phone number must be 10 digits"));
  return z
  .object({
    prefix: z.string().min(1, L("กรุณาเลือกคำนำหน้า", "Please choose a prefix")),
    firstName: z.string().trim().min(1, L("กรุณากรอกชื่อ", "Please enter the first name")).max(100),
    lastName: z.string().trim().min(1, L("กรุณากรอกนามสกุล", "Please enter the last name")).max(100),
    nickname: z.string().trim().max(50),
    dob: z.string().min(1, L("กรุณาเลือกวันเกิด", "Please choose the date of birth")).refine((v) => new Date(v) <= new Date(), L("วันเกิดต้องไม่เกินวันนี้", "Date of birth cannot be after today")),
    nationality: z.string().min(1, L("กรุณาเลือกสัญชาติ", "Please choose a nationality")),
    nationalityOther: z.string().trim().max(50),
    religion: z.string().min(1, L("กรุณาเลือกศาสนา", "Please choose a religion")),
    religionOther: z.string().trim().max(100),
    ethnicity: z.string(),
    ethnicityOther: z.string().trim().max(100),
    address: z.string().trim().max(500),
    phone,
    email: z.string().trim().min(1, L("กรุณากรอกอีเมล", "Please enter an email")).email(L("รูปแบบอีเมลไม่ถูกต้อง", "Invalid email address")).max(255),
    lineId: z.string().trim().max(50),
    emergencyName: z.string().trim().min(1, L("กรุณากรอกชื่อผู้ติดต่อฉุกเฉิน", "Please enter the emergency contact name")).max(100),
    emergencyPhone: phone,
    relationship: z.string().trim().min(1, L("กรุณาระบุความสัมพันธ์", "Please enter the relationship")).max(50),
    image: z.string(),
    interested: z.array(z.string()),
    hasExperience: z.boolean(),
    experienceDetail: z.string().trim().max(500),
    source: z.string(),
    sourceOther: z.string().trim().max(100),
  })
  .superRefine((v, ctx) => {
    if (v.nationality === "Other" && !v.nationalityOther) ctx.addIssue({ code: "custom", path: ["nationalityOther"], message: L("กรุณาระบุสัญชาติ", "Please specify the nationality") });
    if (v.religion === "Other" && !v.religionOther) ctx.addIssue({ code: "custom", path: ["religionOther"], message: L("กรุณาระบุศาสนา", "Please specify the religion") });
    if (v.ethnicity === "Other" && !v.ethnicityOther) ctx.addIssue({ code: "custom", path: ["ethnicityOther"], message: L("กรุณาระบุเชื้อชาติ", "Please specify the ethnicity") });
    if (splitList(v.source).includes("Other") && !v.sourceOther) ctx.addIssue({ code: "custom", path: ["sourceOther"], message: L("กรุณาระบุช่องทาง", "Please specify how you heard about us") });
  });
};

const empty: StudentInput = {
  prefix: "", firstName: "", lastName: "", nickname: "", dob: "", nationality: "ไทย", nationalityOther: "", religion: "", religionOther: "",
  ethnicity: "", ethnicityOther: "",
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

  const pg = usePagination(list, 25, `${q}|${status}`);
  const canManage = can("students", "edit") || can("students", "delete");


  return (
    <>
      <PageHeader
        title={L("นักเรียน", "Students")}
        subtitle={L(`นักเรียนทั้งหมด ${data.students.length} คน`, `${data.students.length} students in total`)}
        action={can("students", "add") && <Button className="rounded-full" onClick={() => { setEditing(null); setFormOpen(true); }}><Plus className="h-4 w-4" /> {L("เพิ่มนักเรียน", "Add Student")}</Button>}
      />
      <Card className="mb-4 flex flex-row flex-wrap gap-3 rounded-3xl p-4">
        <div className="relative min-w-60 flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={L("ค้นหาด้วยชื่อ, ชื่อเล่น, รหัส, เบอร์โทร...", "Search by name, nickname, ID, phone...")} className="rounded-full pl-9" />
        </div>
        <NativeSelect value={status} onValueChange={setStatus} className="w-44 rounded-full">
          <option value="all">{L("ทุกสถานะ", "All statuses")}</option>
          <option value="Active">{opt("Active")}</option>
          <option value="Disabled">{opt("Disabled")}</option>
        </NativeSelect>
      </Card>

      {list.length === 0 ? (
        <EmptyState title={L("ไม่พบนักเรียน", "No students found")} text={q || status !== "all" ? L("ลองเปลี่ยนคำค้นหาหรือตัวกรอง", "Try a different search or filter") : L("เริ่มต้นเพิ่มนักเรียนคนแรกของคุณ", "Start by adding your first student")} action={can("students", "add") && <Button className="rounded-full" onClick={() => { setEditing(null); setFormOpen(true); }}><Plus className="h-4 w-4" /> {L("เพิ่มนักเรียน", "Add Student")}</Button>} />
      ) : (
        <>
          <div className="space-y-3 md:hidden">
            {pg.pageItems.map((s) => (
              <Card key={s.id} role="button" tabIndex={0} onClick={() => setViewing(s)} onKeyDown={(e) => { if (e.key === "Enter") setViewing(s); }} className={`cursor-pointer rounded-3xl p-4 transition-colors hover:bg-muted/40 ${s.status === "Disabled" ? "opacity-60" : ""}`}>
                <div className="flex items-center gap-3">
                  <Avatar src={s.image} name={s.firstName} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{fullName(s)}</p>
                    <p className="font-mono text-xs text-muted-foreground">{s.code}</p>
                  </div>
                  <StatusBadge status={s.status} />
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 text-center text-sm">
                  <div><p className="text-xs text-muted-foreground">{L("ชื่อเล่น", "Nickname")}</p><p>{s.nickname || "-"}</p></div>
                  <div><p className="text-xs text-muted-foreground">{L("อายุ", "Age")}</p><p>{ageText(s.dob)}</p></div>
                  <div><p className="text-xs text-muted-foreground">{L("เบอร์โทร", "Phone")}</p><p>{s.phone}</p></div>
                </div>
                {canManage && <div className="mt-3 flex justify-center gap-1.5 border-t border-border/60 pt-3" onClick={(e) => e.stopPropagation()}>
                  {can("students", "edit") && (s.status === "Active" ? (
                    <>
                      <Button size="icon" variant="ghost" className="h-8 w-8 rounded-full text-muted-foreground hover:text-foreground" title={L("เพิ่มเข้าคลาส", "Add to class")} aria-label={L(`เพิ่ม ${fullName(s)} เข้าคลาส`, `Add ${fullName(s)} to a class`)} onClick={() => setEnrolling(s)}><UserRoundPlus strokeWidth={1.6} /></Button>
                      <Button size="icon" variant="ghost" className="h-8 w-8 rounded-full text-muted-foreground hover:text-destructive" title={L("ปิดใช้งาน", "Disable")} aria-label={L(`ปิดใช้งาน ${fullName(s)}`, `Disable ${fullName(s)}`)} onClick={() => setDisabling(s)}><Ban strokeWidth={1.6} /></Button>
                    </>
                  ) : (
                    <Button size="icon" variant="ghost" className="h-8 w-8 rounded-full text-muted-foreground hover:text-foreground" title={L("เปิดใช้งาน", "Enable")} aria-label={L(`เปิดใช้งาน ${fullName(s)}`, `Enable ${fullName(s)}`)} onClick={() => { setStudentStatus(s.id, "Active"); toast.success(L("เปิดใช้งานนักเรียนแล้ว", "Student enabled")); }}><RotateCcw strokeWidth={1.6} /></Button>
                  ))}
                  {can("students", "delete") && <Button size="icon" variant="ghost" className="h-8 w-8 rounded-full text-muted-foreground hover:text-destructive" title={L("ลบ", "Delete")} aria-label={L(`ลบ ${fullName(s)}`, `Delete ${fullName(s)}`)} onClick={() => setDeleting(s)}><Trash2 strokeWidth={1.6} /></Button>}
                </div>}
              </Card>
            ))}
          </div>
          <Card className="hidden overflow-hidden rounded-3xl p-0 md:block">
            <Table className="text-center">
              <TableHeader>
                <TableRow className="bg-muted/50 [&>th]:h-12">
                  <TableHead className="text-left">{L("นักเรียน", "Student")}</TableHead>
                  <TableHead>{L("ชื่อเล่น", "Nickname")}</TableHead>
                  <TableHead>{L("อายุ", "Age")}</TableHead>
                  <TableHead>{L("เบอร์โทร", "Phone")}</TableHead>
                  <TableHead>{L("สถานะ", "Status")}</TableHead>
                  {canManage && <TableHead>{L("จัดการ", "Actions")}</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {pg.pageItems.map((s) => (
                  <TableRow key={s.id} onClick={() => setViewing(s)} className={`cursor-pointer [&>td]:py-4 ${s.status === "Disabled" ? "opacity-60" : ""}`}>
                    <TableCell className="text-left">
                      <div className="flex items-center gap-3.5">
                        <Avatar src={s.image} name={s.firstName} />
                        <div className="min-w-0">
                          <p className="font-medium">{fullName(s)}</p>
                          <p className="font-mono text-xs text-muted-foreground">{s.code}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>{s.nickname || "-"}</TableCell>
                    <TableCell>{ageText(s.dob)}</TableCell>
                    <TableCell>{s.phone}</TableCell>
                    <TableCell><StatusBadge status={s.status} /></TableCell>
                    {canManage && (
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <div className="flex justify-center gap-1.5">
                          {can("students", "edit") && (s.status === "Active" ? (
                            <>
                              <Button size="icon" variant="ghost" className="h-8 w-8 rounded-full text-muted-foreground hover:text-foreground" title={L("เพิ่มเข้าคลาส", "Add to class")} aria-label={L(`เพิ่ม ${fullName(s)} เข้าคลาส`, `Add ${fullName(s)} to a class`)} onClick={() => setEnrolling(s)}><UserRoundPlus strokeWidth={1.6} /></Button>
                              <Button size="icon" variant="ghost" className="h-8 w-8 rounded-full text-muted-foreground hover:text-destructive" title={L("ปิดใช้งาน", "Disable")} aria-label={L(`ปิดใช้งาน ${fullName(s)}`, `Disable ${fullName(s)}`)} onClick={() => setDisabling(s)}><Ban strokeWidth={1.6} /></Button>
                            </>
                          ) : (
                            <Button size="icon" variant="ghost" className="h-8 w-8 rounded-full text-muted-foreground hover:text-foreground" title={L("เปิดใช้งาน", "Enable")} aria-label={L(`เปิดใช้งาน ${fullName(s)}`, `Enable ${fullName(s)}`)} onClick={() => { setStudentStatus(s.id, "Active"); toast.success(L("เปิดใช้งานนักเรียนแล้ว", "Student enabled")); }}><RotateCcw strokeWidth={1.6} /></Button>
                          ))}
                          {can("students", "delete") && <Button size="icon" variant="ghost" className="h-8 w-8 rounded-full text-muted-foreground hover:text-destructive" title={L("ลบ", "Delete")} aria-label={L(`ลบ ${fullName(s)}`, `Delete ${fullName(s)}`)} onClick={() => setDeleting(s)}><Trash2 strokeWidth={1.6} /></Button>}
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
          <Pagination page={pg.page} totalPages={pg.totalPages} onChange={pg.setPage} from={pg.from} to={pg.to} total={pg.total} unit={L("คน", "students")} />
        </>
      )}


      <StudentForm open={formOpen} onOpenChange={setFormOpen} editing={editing} />
      <StudentView student={viewing} onClose={() => setViewing(null)} onEdit={(s) => { setViewing(null); setEditing(s); setFormOpen(true); }} />
      <EnrollDialog student={enrolling} onClose={() => setEnrolling(null)} />
      <ConfirmDialog
        open={!!disabling}
        onOpenChange={(o) => !o && setDisabling(null)}
        title={L("ปิดใช้งานนักเรียน?", "Disable student?")}
        text={disabling ? L(`${fullName(disabling)} จะถูกเปลี่ยนสถานะเป็นปิดใช้งาน (ข้อมูลยังคงอยู่ในระบบ)`, `${fullName(disabling)} will be set to Disabled (the data stays in the system)`) : ""}
        confirmLabel={L("ปิดใช้งาน", "Disable")}
        destructive
        onConfirm={() => { if (disabling) { setStudentStatus(disabling.id, "Disabled"); toast.success(L("ปิดใช้งานนักเรียนแล้ว", "Student disabled")); } }}
      />
      <ConfirmDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)} title={L("ลบนักเรียน?", "Delete student?")} text={deleting ? L(`ต้องการลบ ${fullName(deleting)} ใช่หรือไม่`, `Delete ${fullName(deleting)}?`) : ""} confirmLabel={L("ลบ", "Delete")} destructive onConfirm={() => { if (deleting) { deleteStudent(deleting.id); toast.success(L("ลบนักเรียนแล้ว", "Student deleted")); } }} />
    </>
  );
}

function StudentForm({ open, onOpenChange, editing }: { open: boolean; onOpenChange: (o: boolean) => void; editing: Student | null }) {
  const { data, addStudent, updateStudent } = useYodo();
  const sig = useSignCanvas();
  const [f, setF] = useState<StudentInput>(empty);
  const [errors, setErrors] = useState<Partial<Record<keyof StudentInput, string>>>({});
  const [lastOpen, setLastOpen] = useState(false);
  // Interested classes: the fixed list, plus anything typed under "Other" (kept as extra items in the same list).
  const [otherOn, setOtherOn] = useState(false);
  const [otherText, setOtherText] = useState("");
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) {
      setErrors({});
      sig.reset();
      if (editing) {
        const { id: _i, code: _c, status: _s, createdAt: _d, ...rest } = editing;
        const typed = rest.interested.filter((x) => !(DANCE_TYPES as readonly string[]).includes(x));
        setF({ ...rest });
        setOtherOn(typed.length > 0); setOtherText(typed.join(", "));
      } else { setF(empty); setOtherOn(false); setOtherText(""); }
    }
  }
  const set = <K extends keyof StudentInput>(k: K, v: StudentInput[K]) => setF((p) => ({ ...p, [k]: v }));
  const age = f.dob ? ageText(f.dob) : null;
  const setInterested = (fixed: string[], typed: string) => set("interested", [...fixed, ...splitList(typed).filter((x) => !fixed.includes(x))]);

  const submit = () => {
    const r = schema().safeParse(f);
    if (!r.success) {
      const e: Partial<Record<keyof StudentInput, string>> = {};
      r.error.issues.forEach((i) => { const k = String(i.path[0]) as keyof StudentInput; if (!e[k]) e[k] = i.message; });
      setErrors(e);
      toast.error(L("กรุณาตรวจสอบข้อมูลให้ครบถ้วน", "Please check that everything is filled in"));
      return;
    }
    const img = sig.exportSignature();
    const sign = img ? { signature: img, signedAt: format(new Date(), "yyyy-MM-dd") } : undefined;
    if (editing) { updateStudent(editing.id, f, sign); toast.success(L("บันทึกข้อมูลแล้ว", "Saved")); }
    else { const s = addStudent(f, sign); toast.success(L(`เพิ่มนักเรียนแล้ว (${s.code})`, `Student added (${s.code})`)); }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">{editing ? L("แก้ไขนักเรียน", "Edit Student") : L("เพิ่มนักเรียน", "Add Student")}</DialogTitle>
          <DialogDescription>{L("กรอกข้อมูลของนักเรียนให้ครบถ้วน", "Fill in all of the student's details")}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={L("รูปโปรไฟล์", "Profile Image")} className="sm:col-span-2"><ImageUpload value={f.image} onChange={(v) => set("image", v)} /></Field>
          <SectionTitle>{L("ข้อมูลส่วนตัว", "Personal Information")}</SectionTitle>
          <Field label={L("รหัสนักเรียน", "Student ID")}>
            <Input value={editing ? editing.code : nextStudentCode(data.students, data.deletedStudentCodes)} readOnly disabled className="font-mono" />
          </Field>
          <Field label={L("คำนำหน้า", "Prefix")} required error={errors.prefix}>
            <NativeSelect value={f.prefix} onValueChange={(value) => set("prefix", value)}>
              <option value="">{L("เลือกคำนำหน้า", "Choose a prefix")}</option>
              {PREFIXES.map((p) => <option key={p} value={p}>{opt(p)}</option>)}
            </NativeSelect>
          </Field>
          <Field label={L("ชื่อเล่น", "Nickname")} error={errors.nickname}><Input value={f.nickname} onChange={(e) => set("nickname", e.target.value)} /></Field>
          <Field label={L("ชื่อ", "First Name")} required error={errors.firstName}><Input value={f.firstName} onChange={(e) => set("firstName", e.target.value)} /></Field>
          <Field label={L("นามสกุล", "Last Name")} required error={errors.lastName}><Input value={f.lastName} onChange={(e) => set("lastName", e.target.value)} /></Field>
          <Field label={L("วันเกิด", "Date of Birth")} required error={errors.dob}><DateField value={f.dob} max={new Date().toISOString().slice(0, 10)} onChange={(v) => set("dob", v)} /></Field>
          <Field label={L("อายุ", "Age")}><Input value={age !== null ? age : ""} placeholder={L("เลือกวันเกิด", "Choose the date of birth")} readOnly disabled /></Field>
          <Field label={L("สัญชาติ", "Nationality")} required error={errors.nationality}>
            <NativeSelect value={f.nationality} onValueChange={(value) => set("nationality", value)}>
              {NATIONALITIES.map((n) => <option key={n} value={n}>{opt(n)}</option>)}
            </NativeSelect>
          </Field>
          <Field label={L("ศาสนา", "Religion")} required error={errors.religion}>
            <NativeSelect value={f.religion} onValueChange={(value) => set("religion", value)}>
              <option value="">{L("เลือกศาสนา", "Choose a religion")}</option>
              {RELIGIONS.map((n) => <option key={n} value={n}>{opt(n)}</option>)}
            </NativeSelect>
          </Field>
          {f.nationality === "Other" ? (
            <Field label={L("ระบุสัญชาติ", "Specify nationality")} required error={errors.nationalityOther}><Input value={f.nationalityOther} onChange={(e) => set("nationalityOther", e.target.value)} /></Field>
          ) : null}
          {f.religion === "Other" ? (
            <Field label={L("ระบุศาสนา", "Specify religion")} required error={errors.religionOther}><Input value={f.religionOther} onChange={(e) => set("religionOther", e.target.value)} /></Field>
          ) : null}
          <Field label={L("เชื้อชาติ", "Ethnicity")} error={errors.ethnicity}>
            <NativeSelect value={f.ethnicity} onValueChange={(value) => set("ethnicity", value)}>
              <option value="">{L("เลือกเชื้อชาติ", "Choose an ethnicity")}</option>
              {ETHNICITIES.map((n) => <option key={n} value={n}>{opt(n)}</option>)}
            </NativeSelect>
          </Field>
          {f.ethnicity === "Other" ? (
            <Field label={L("ระบุเชื้อชาติ", "Specify ethnicity")} required error={errors.ethnicityOther}><Input value={f.ethnicityOther} onChange={(e) => set("ethnicityOther", e.target.value)} /></Field>
          ) : null}
          <Field label={L("เบอร์โทร", "Phone Number")} required error={errors.phone}><Input inputMode="numeric" value={f.phone} placeholder="0812345678" onChange={(e) => set("phone", onlyDigits10(e.target.value))} /></Field>
          <Field label={L("อีเมล", "Email")} required error={errors.email}><Input type="email" value={f.email} onChange={(e) => set("email", e.target.value)} /></Field>
          <Field label="Line ID" error={errors.lineId}><Input value={f.lineId} onChange={(e) => set("lineId", e.target.value)} /></Field>
          <Field label={L("ที่อยู่", "Address")} error={errors.address} className="sm:col-span-2"><Textarea rows={2} value={f.address} onChange={(e) => set("address", e.target.value)} /></Field>

          <SectionTitle>{L("ผู้ติดต่อฉุกเฉิน", "Emergency Contact")}</SectionTitle>
          <Field label={L("ชื่อผู้ติดต่อฉุกเฉิน", "Emergency Contact Name")} required error={errors.emergencyName}><Input value={f.emergencyName} onChange={(e) => set("emergencyName", e.target.value)} /></Field>
          <Field label={L("เบอร์โทรผู้ติดต่อฉุกเฉิน", "Emergency Contact Phone")} required error={errors.emergencyPhone}><Input inputMode="numeric" value={f.emergencyPhone} onChange={(e) => set("emergencyPhone", onlyDigits10(e.target.value))} /></Field>
          <Field label={L("ความสัมพันธ์", "Relationship")} required error={errors.relationship} className="sm:col-span-2"><Input value={f.relationship} placeholder={L("เช่น แม่, พ่อ", "e.g. Mother, Father")} onChange={(e) => set("relationship", e.target.value)} /></Field>

          <SectionTitle>{L("ข้อมูลเพิ่มเติม", "Additional Information")}</SectionTitle>
           <Field label={L("คลาสที่สนใจ (เลือกได้หลายอัน)", "Interested Classes (choose any)")} className="sm:col-span-2">
             <ChipSelect options={[...DANCE_TYPES, "Other"]} label={(o) => (o === "Other" ? L("อื่นๆ", "Other") : opt(o))}
               value={[...f.interested.filter((x) => (DANCE_TYPES as readonly string[]).includes(x)), ...(otherOn ? ["Other"] : [])]}
               onChange={(v) => { setOtherOn(v.includes("Other")); setInterested(v.filter((x) => x !== "Other"), v.includes("Other") ? otherText : ""); }} />
             {otherOn && <Input className="mt-2" placeholder={L("พิมพ์คลาสอื่นที่สนใจ (คั่นด้วย ,)", "Type other classes (separate with ,)")} value={otherText}
               onChange={(e) => { setOtherText(e.target.value); setInterested(f.interested.filter((x) => (DANCE_TYPES as readonly string[]).includes(x)), e.target.value); }} />}
           </Field>
          <Field label={L("ประสบการณ์เรียนเต้น", "Previous Dance Experience")} className="sm:col-span-2">
            <div className="flex gap-4 text-sm">
              <label className="flex items-center gap-2"><input type="radio" className="accent-primary" checked={!f.hasExperience} onChange={() => set("hasExperience", false)} /> {L("ไม่มี", "None")}</label>
              <label className="flex items-center gap-2"><input type="radio" className="accent-primary" checked={f.hasExperience} onChange={() => set("hasExperience", true)} /> {L("มีประสบการณ์", "Has experience")}</label>
            </div>
            {f.hasExperience && (
              <div className="mt-2 space-y-1.5">
                <p className="text-sm font-medium">Please specify</p>
                <Textarea rows={2} placeholder={L("เช่น เคยเรียน Ballet 2 ปี", "e.g. 2 years of ballet")} value={f.experienceDetail} onChange={(e) => set("experienceDetail", e.target.value)} />
              </div>
            )}
          </Field>
          <Field label={L("รู้จักเราจากช่องทางไหน (เลือกได้หลายอัน)", "How did you hear about us? (choose any)")} className="sm:col-span-2">
            <ChipSelect options={SOURCES} label={opt} value={splitList(f.source)} onChange={(v) => set("source", SOURCES.filter((x) => v.includes(x)).join(", "))} />
          </Field>
          {splitList(f.source).includes("Other") && <Field label={L("ระบุช่องทาง", "Specify")} required error={errors.sourceOther} className="sm:col-span-2"><Input value={f.sourceOther} onChange={(e) => set("sourceOther", e.target.value)} /></Field>}
          <div className="border-t border-border/60 pt-4 sm:col-span-2">
            <SignBox sig={sig} current={editing?.signature} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{L("ยกเลิก", "Cancel")}</Button>
          <Button onClick={submit}>{editing ? L("บันทึก", "Save") : L("เพิ่มนักเรียน", "Add Student")}</Button>
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
  const [viewPdf, setViewPdf] = useState(false);
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
              <Info label={L("วันเกิด", "Date of birth")} value={s.dob ? fd(s.dob) : ""} />
              <Info label={L("อายุ", "Age")} value={ageText(s.dob)} />
              <Info label={L("สัญชาติ", "Nationality")} value={s.nationality === "Other" ? s.nationalityOther : opt(s.nationality)} />
              <Info label={L("ศาสนา", "Religion")} value={optOr(s.religion, s.religionOther)} />
              <Info label={L("เชื้อชาติ", "Ethnicity")} value={optOr(s.ethnicity, s.ethnicityOther)} />
              <Info label={L("เบอร์โทร", "Phone")} value={s.phone} />
              <Info label={L("อีเมล", "Email")} value={s.email} />
              <Info label="Line ID" value={s.lineId} />
              <div className="col-span-2"><Info label={L("ที่อยู่", "Address")} value={s.address} /></div>
            </div>
            <div className="grid grid-cols-2 gap-4 rounded-2xl bg-muted/50 p-4 sm:grid-cols-3">
              <Info label={L("ผู้ติดต่อฉุกเฉิน", "Emergency contact")} value={s.emergencyName} />
              <Info label={L("เบอร์ฉุกเฉิน", "Emergency phone")} value={s.emergencyPhone} />
              <Info label={L("ความสัมพันธ์", "Relationship")} value={s.relationship} />
              <Info label={L("คลาสที่สนใจ", "Interested classes")} value={s.interested.map(opt).join(", ")} />
              <Info label={L("ประสบการณ์", "Experience")} value={s.hasExperience ? L(`มี — ${s.experienceDetail || ""}`, `Yes — ${s.experienceDetail || ""}`) : L("ไม่มี", "None")} />
              <Info label={L("รู้จักจาก", "Heard about us from")} value={sourceText(s.source, s.sourceOther)} />
            </div>
            <div>
              <p className="mb-2 text-sm font-semibold">{L(`คลาสที่ลงทะเบียน (${classes.length})`, `Enrolled classes (${classes.length})`)}</p>
              <div className="flex flex-wrap gap-2">
                {classes.length === 0 && <p className="text-sm text-muted-foreground">{L("ยังไม่ได้ลงคลาส", "Not in any class yet")}</p>}
                {classes.map(({ en, cls }) => cls && (
                  <button type="button" key={en.id} disabled={!canEdit} onClick={() => setEditEn(en)} title={L("แก้ไขการลงทะเบียน", "Edit enrollment")} className="inline-flex flex-wrap items-center gap-1.5 rounded-full bg-accent px-3 py-1 text-xs text-accent-foreground transition-colors hover:bg-primary/15">
                    <span className="font-medium">{cls.name}</span>
                    {en.startDate && (
                      <span className="text-muted-foreground">
                        {fd(en.startDate)}{en.expiryDate ? ` – ${fd(en.expiryDate)}` : ""}
                      </span>
                    )}
                    {en.remark && <span className="text-muted-foreground">· {en.remark}</span>}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-muted/40 p-3 text-sm">
              {s.signedAt && s.signature ? (
                <><img src={s.signature} alt={L("ลายเซ็น", "Signature")} className="h-10 rounded bg-background px-2" /><span>{L(`เซ็นแล้วเมื่อ ${fd(s.signedAt)}`, `Signed on ${fd(s.signedAt)}`)}</span></>
              ) : <span className="text-muted-foreground">{L("ยังไม่ได้เซ็นเอกสาร", "Document not signed yet")}</span>}
            </div>
            <DialogFooter>
              {canEdit && <Button variant="outline" onClick={() => setSigning(true)}><PenLine className="h-4 w-4" /> {s.signature ? L("เซ็นใหม่", "Sign again") : L("เซ็นเอกสาร", "Sign document")}</Button>}
              <Button variant="outline" onClick={() => setViewPdf(true)}><FileText className="h-4 w-4" /> {L("ดู PDF", "View PDF")}</Button>
              {canEdit && <Button variant="outline" onClick={() => onEdit(s)}><Pencil className="h-4 w-4" /> {L("แก้ไข", "Edit")}</Button>}
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
    <EnrollDialog student={editEn ? s : null} enrollment={editEn} onClose={() => setEditEn(null)} />
    <Dialog open={signing} onOpenChange={setSigning}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader><DialogTitle>{s?.signature ? L("เซ็นใหม่", "Sign again") : L("เซ็นเอกสาร", "Sign document")}</DialogTitle><DialogDescription>{s ? `${fullName(s)} · ${s.code}` : ""}</DialogDescription></DialogHeader>
        {signing && s && <SignDocumentBody student={s} onDone={() => setSigning(false)} />}
      </DialogContent>
    </Dialog>
    {/* View the application in the app, print only on request (owner 12/10/2026) */}
    <Dialog open={viewPdf} onOpenChange={setViewPdf}>
      <DialogPrimitive.Portal>
      <DialogPrimitive.Content className="fixed inset-0 z-50 flex flex-col bg-[#5b4b50] outline-none">
        <DialogPrimitive.Title className="sr-only">{L("ใบสมัคร", "Application")}</DialogPrimitive.Title>
        <DialogPrimitive.Description className="sr-only">{s ? `${fullName(s)} · ${s.code}` : ""}</DialogPrimitive.Description>
        <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-border bg-background px-3 py-2.5 sm:px-5">
          <Button variant="outline" className="rounded-full" onClick={() => setViewPdf(false)}><ChevronLeft className="h-4 w-4" /> {L("กลับ", "Back")}</Button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{L("ใบสมัคร", "Application")} · {s ? fullName(s) : ""}</p>
            <p className="font-mono text-xs text-muted-foreground">{s?.code}</p>
          </div>
          <Button className="rounded-full" onClick={() => { if (s && !printStudentDocument(s)) toast.error(L("กรุณาอนุญาตหน้าต่างใหม่เพื่อพิมพ์ PDF", "Please allow pop-up windows to print the PDF")); }}><Printer className="h-4 w-4" /> {L("พิมพ์ / บันทึกเป็น PDF", "Print / Save as PDF")}</Button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto p-3 sm:p-6" data-testid="pdf-view">
          {viewPdf && s && <StudentDocument student={s} />}
        </div>
      </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </Dialog>
    </>
  );
}

function SignDocumentBody({ student, onDone }: { student: Student; onDone: () => void }) {
  const { signStudent } = useYodo();
  const sig = useSignCanvas();
  const save = () => {
    const img = sig.exportSignature();
    if (!img) return;
    signStudent(student.id, img, format(new Date(), "yyyy-MM-dd"));
    onDone();
    toast.success(L("บันทึกลายเซ็นแล้ว", "Signature saved"));
  };
  return (
    <>
      <SignBox sig={sig} current={student.signature} />
      <DialogFooter className="pt-2">
        <Button variant="outline" onClick={onDone}>{L("ยกเลิก", "Cancel")}</Button>
        <Button disabled={!sig.hasSignature} onClick={save}>{L("บันทึกลายเซ็น", "Save signature")}</Button>
      </DialogFooter>
    </>
  );
}

const enrollSchema = () => z
  .object({
    classId: z.string().min(1, L("กรุณาเลือกคลาส", "Please choose a class")),
    purchaseDate: z.string().min(1, L("กรุณาเลือกวันที่ซื้อ", "Please choose the purchase date")),
    startDate: z.string().min(1, L("กรุณาเลือกวันเริ่มเรียน", "Please choose the start date")),
    expiryDate: z.string(),
    remark: z.string().trim().max(500),
    receiptImage: z.string(),
  })
  .superRefine((v, ctx) => {
    if (v.expiryDate && v.startDate && v.expiryDate < v.startDate)
      ctx.addIssue({ code: "custom", path: ["expiryDate"], message: L("วันหมดอายุต้องไม่ก่อนวันเริ่มเรียน", "Expiry date cannot be before the start date") });
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
    const r = enrollSchema().safeParse(f);
    if (!r.success) {
      const e: Partial<Record<keyof EnrollmentInput, string>> = {};
      r.error.issues.forEach((i) => { const k = String(i.path[0]) as keyof EnrollmentInput; if (!e[k]) e[k] = i.message; });
      setErrors(e);
      toast.error(L("กรุณาตรวจสอบข้อมูลให้ครบถ้วน", "Please check that everything is filled in"));
      return;
    }
    if (!options.some((c) => c.id === f.classId)) return setErrors({ classId: L("กรุณาเลือกคลาสที่เปิดอยู่", "Please choose an open class") });
    if (enrollment) { updateEnrollment(enrollment.id, f); toast.success(L("บันทึกการลงทะเบียนแล้ว", "Enrollment saved")); }
    else { enroll(student.id, f); toast.success(L("เพิ่มเข้าคลาสแล้ว", "Added to class")); }
    close();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) close(); }}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{enrollment ? L("แก้ไขการลงทะเบียน", "Edit enrollment") : L("เพิ่มเข้าคลาส", "Add to class")}</DialogTitle>
          <DialogDescription>{student && fullName(student)}</DialogDescription>
        </DialogHeader>
        {options.length === 0 ? (
          <p className="text-sm text-muted-foreground">{L("ไม่มีคลาสที่เปิดอยู่ให้เลือก (หรือลงครบทุกคลาสแล้ว)", "No open classes to choose from (or already in every class)")}</p>
        ) : (
          <div className="grid gap-4">
            <Field label={L("คลาส", "Class")} required error={errors.classId}>
              <NativeSelect value={f.classId} onValueChange={(value) => set("classId", value)}>
                <option value="">{L("เลือกคลาส", "Choose a class")}</option>
                {options.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </NativeSelect>
            </Field>
            {selectedClass?.price != null && (
              <p className="-mt-2 text-sm text-muted-foreground">{L("ราคา", "Price")} <span className="font-semibold text-primary">{L(`${selectedClass.price.toLocaleString("th-TH")} บาท/เดือน`, `${selectedClass.price.toLocaleString("th-TH")} baht/month`)}</span></p>
            )}
            <Field label={L("วันที่ซื้อ", "Purchase date")} required error={errors.purchaseDate}>
              <DateField value={f.purchaseDate} onChange={(v) => set("purchaseDate", v)} />
            </Field>
            <Field label={L("วันเริ่มเรียน", "Start date")} required error={errors.startDate}>
              <DateField value={f.startDate} onChange={(v) => set("startDate", v)} />
            </Field>
            <Field label={L("วันหมดอายุ", "Expiry date")} error={errors.expiryDate}>
              <DateField value={f.expiryDate} min={f.startDate || undefined} onChange={(v) => set("expiryDate", v)} />
            </Field>
            {total != null && (
              <div className="rounded-2xl border border-border/60 bg-accent/30 px-4 py-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{L("ระยะเวลา", "Period")}</span>
                  <span className="flex items-center gap-2">
                    {format(parseISO(f.startDate!), "dd/MM/yyyy")} – {format(parseISO(f.expiryDate!), "dd/MM/yyyy")}
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">{L(`${months} เดือน`, `${months} ${months === 1 ? "month" : "months"}`)}</span>
                  </span>
                </div>
                <div className="mt-1.5 flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{L("ราคาต่อเดือน", "Price per month")}</span>
                  <span>{L(`${selectedClass!.price!.toLocaleString("th-TH")} บาท`, `${selectedClass!.price!.toLocaleString("th-TH")} baht`)}</span>
                </div>
                <div className="mt-2.5 flex items-center justify-between border-t border-border/60 pt-2.5">
                  <span className="text-sm font-medium">{L("ยอดรวม", "Total")}</span>
                  <span className="font-display text-lg font-semibold text-primary">{L(`${total.toLocaleString("th-TH")} บาท`, `${total.toLocaleString("th-TH")} baht`)}</span>
                </div>
              </div>
            )}
            <Field label={L("หมายเหตุ", "Remark")} error={errors.remark}>
              <Textarea rows={2} value={f.remark} onChange={(e) => set("remark", e.target.value)} />
            </Field>
            <Field label={L("รูปใบเสร็จ", "Receipt photo")}>
              <ReceiptUpload value={f.receiptImage} onChange={(v) => set("receiptImage", v)} />
            </Field>
          </div>
        )}
        <DialogFooter className="gap-2 sm:justify-between">
          {enrollment ? (
            <Button variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setConfirmRemove(true)}><Trash2 className="h-4 w-4" /> {L("นำออกจากคลาส", "Remove from class")}</Button>
          ) : <span />}
          <div className="flex flex-wrap gap-2">
            {enrollment && student && (
              <Button variant="outline" onClick={() => {
                const ok = printReceipt({ student, enrollmentId: enrollment.id, className: selectedClass?.name ?? "-", price: selectedClass?.price, purchaseDate: f.purchaseDate, startDate: f.startDate, expiryDate: f.expiryDate, remark: f.remark, months, total });
                if (!ok) toast.error(L("เบราว์เซอร์บล็อกหน้าต่างใบเสร็จ กรุณาอนุญาตหน้าต่างใหม่", "The browser blocked the receipt window. Please allow pop-ups."));
              }}>{L("พิมพ์ใบเสร็จ", "Print receipt")}</Button>
            )}
            <Button variant="outline" onClick={close}>{L("ยกเลิก", "Cancel")}</Button>
            <Button disabled={options.length === 0} onClick={submit}>{enrollment ? L("บันทึก", "Save") : L("เพิ่ม", "Add")}</Button>
          </div>
        </DialogFooter>
      </DialogContent>
      <ConfirmDialog
        open={confirmRemove}
        onOpenChange={setConfirmRemove}
        title={L("นำออกจากคลาส?", "Remove from class?")}
        text={L("ข้อมูลการลงทะเบียนและการเข้าคาบของคลาสนี้จะถูกลบ", "The enrollment and attendance records for this class will be deleted")}
        destructive
        onConfirm={() => { if (student && enrollment) { unenroll(student.id, enrollment.classId); toast.success(L("นำออกจากคลาสแล้ว", "Removed from class")); } setConfirmRemove(false); close(); }}
      />
    </Dialog>
  );
}
