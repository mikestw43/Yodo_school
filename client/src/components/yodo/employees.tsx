import { useEffect, useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Ban, ChevronLeft, Eye, Printer } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DateField, Field, ImageUpload, NativeSelect, RowActions } from "@/components/yodo/ui";
import { SharePdf } from "@/components/yodo/receipt-send";
import { api, errorText } from "@/lib/api";
import { L, bothLang, getLang } from "@/lib/i18n";
import { todayIso } from "@/lib/courses";
import { certHtml, printCert } from "@/lib/cert-print";
import { certMoney, type CertData, type CertDoc } from "@/lib/cert-text";
import type { Company } from "@/lib/receipt-print";

// Office staff (owner 27/10/2026, mockup Fj7itm8uCcAiGSyo6rEeHw v2): records, salary history, salary certificates.
// Not the teachers. Only the Owner / SuperAdmin reach any of it.

export type Employee = {
  id: string; code: string; image: string; prefix: string; firstName: string; lastName: string; prefixEn: string; firstNameEn: string; lastNameEn: string;
  nickname: string; nationalIdLast4: string; birthDate: string; phone: string; email: string; address: string;
  emergencyName: string; emergencyPhone: string; emergencyRelation: string; position: string; positionEn: string; empType: string;
  startDate: string; salary: number; bankName: string; bankAccountLast4: string; endDate: string; endReason: string; note: string;
  status: "active" | "left"; nationalId?: string; bankAccount?: string;
};
export type SalaryChange = { id: string; effectiveFrom: string; amount: number; prevAmount: number; reason: string; createdBy: string; createdAt: string };
export type Cert = CertDoc & { id: string; employeeId: string; showId: boolean; createdBy: string; createdAt: string; cancelledAt: string; cancelledBy: string };
export type EmployeeFull = { employee: Employee; salaryChanges: SalaryChange[]; certs: Cert[] };

export const STAFF_PREFIXES = ["นาย", "นาง", "นางสาว"] as const;
const PREFIX_EN: Record<string, string> = { "นาย": "Mr.", "นาง": "Mrs.", "นางสาว": "Miss" };
export const PREFIXES_EN = ["Mr.", "Mrs.", "Ms.", "Miss"] as const;

export const staffName = (e: Pick<Employee, "prefix" | "firstName" | "lastName">) => [e.prefix, e.firstName, e.lastName].filter(Boolean).join(" ");
/** "1 ปี 3 เดือน" / "1 y 3 m" from the start date to today (or the last day). */
export function tenure(start: string, end = "") {
  if (!start) return "";
  const a = new Date(`${start}T00:00:00`), b = new Date(`${end && end < todayIso() ? end : todayIso()}T00:00:00`);
  let m = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
  if (b.getDate() < a.getDate()) m -= 1;
  if (m < 0) return L("ยังไม่เริ่มงาน", "Not started yet");
  const y = Math.floor(m / 12), mm = m % 12;
  if (!y && !mm) return L("ไม่ถึง 1 เดือน", "Under a month");
  return [y ? L(`${y} ปี`, `${y} y`) : "", mm ? L(`${mm} เดือน`, `${mm} m`) : ""].filter(Boolean).join(" ");
}
export const bahtText = (n: number) => `${certMoney(n)} ${L("บาท", "THB")}`;

// ---------- add / edit ----------
type Form = Omit<Employee, "id" | "code" | "nationalIdLast4" | "bankAccountLast4" | "status" | "salary"> & { nationalId: string; bankAccount: string; salary: string };
const EMPTY: Form = {
  image: "", prefix: "", firstName: "", lastName: "", prefixEn: "", firstNameEn: "", lastNameEn: "", nickname: "", nationalId: "", birthDate: "",
  phone: "", email: "", address: "", emergencyName: "", emergencyPhone: "", emergencyRelation: "", position: "", positionEn: "", empType: "full",
  startDate: "", bankName: "", bankAccount: "", endDate: "", endReason: "", note: "", salary: "",
};
const num = (v: string) => Number(v.replace(/,/g, ""));

export function EmployeeForm({ open, onOpenChange, editing, onSaved }: { open: boolean; onOpenChange: (o: boolean) => void; editing: Employee | null; onSaved: (e: Employee) => void }) {
  const [f, setF] = useState<Form>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<Partial<Record<"firstName" | "startDate" | "nationalId" | "salary", string>>>({});
  useEffect(() => {
    if (!open) return;
    setErr({});
    setF(editing ? { ...EMPTY, ...editing, nationalId: editing.nationalId ?? "", bankAccount: editing.bankAccount ?? "", salary: String(editing.salary) } : { ...EMPTY, startDate: todayIso() });
  }, [open, editing]);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((p) => ({ ...p, [k]: v }));
  const save = async () => {
    const e: typeof err = {};
    if (!f.firstName.trim()) e.firstName = L("กรุณากรอกชื่อ", "Please enter the first name");
    if (!f.startDate) e.startDate = L("กรุณาเลือกวันเริ่มงาน", "Please pick the start date");
    const nid = f.nationalId.replace(/[\s-]/g, "");
    if (nid && !/^\d{13}$/.test(nid)) e.nationalId = L("ต้องเป็นตัวเลข 13 หลัก", "Must be 13 digits");
    if (!editing && !(num(f.salary) > 0)) e.salary = L("กรุณาใส่เงินเดือน", "Please enter the salary");
    setErr(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    try {
      const { salary, ...rest } = f;
      const body = editing ? rest : { ...rest, salary: num(salary) };
      const saved = await api<Employee>(editing ? `/employees/${editing.id}` : "/employees", { method: editing ? "PUT" : "POST", body });
      toast.success(editing ? L("บันทึกข้อมูลพนักงานแล้ว", "Staff record saved") : L(`เพิ่มพนักงาน ${saved.code} แล้ว`, `Added ${saved.code}`));
      onOpenChange(false);
      onSaved(saved);
    } catch (x) { toast.error(errorText(x)); }
    setBusy(false);
  };
  const sec = (t: string) => <p className="mt-2 text-xs font-extrabold uppercase tracking-wider text-muted-foreground sm:col-span-2">{t}</p>;
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!busy) onOpenChange(o); }}>
      <DialogContent className="max-h-[92vh] overflow-y-auto rounded-3xl sm:max-w-2xl" data-testid="employee-form">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">{editing ? L(`แก้ไขพนักงาน ${editing.code}`, `Edit ${editing.code}`) : L("เพิ่มพนักงาน", "Add staff")}</DialogTitle>
          <DialogDescription>{L("รหัสพนักงานให้อัตโนมัติ", "The staff code is given automatically")}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2">
          <Field label={L("รูป", "Photo")} className="sm:col-span-2"><ImageUpload value={f.image} onChange={(v) => set("image", v)} /></Field>
          {sec(L("ข้อมูลส่วนตัว", "Personal"))}
          <Field label={L("คำนำหน้า", "Title")}>
            <NativeSelect value={f.prefix} onValueChange={(v) => setF((p) => ({ ...p, prefix: v, prefixEn: p.prefixEn || PREFIX_EN[v] || "" }))}>
              <option value="">{L("เลือก", "Select")}</option>
              {STAFF_PREFIXES.map((p) => <option key={p} value={p}>{bothLang(p)}</option>)}
            </NativeSelect>
          </Field>
          <Field label={L("ชื่อเล่น", "Nickname")}><Input value={f.nickname} onChange={(e) => set("nickname", e.target.value)} data-testid="emp-nickname" /></Field>
          <Field label={L("ชื่อ", "First name")} required error={err.firstName}><Input value={f.firstName} onChange={(e) => set("firstName", e.target.value)} data-testid="emp-first" /></Field>
          <Field label={L("นามสกุล", "Last name")}><Input value={f.lastName} onChange={(e) => set("lastName", e.target.value)} data-testid="emp-last" /></Field>
          <Field label={L("คำนำหน้า (อังกฤษ)", "Title (English)")}>
            <NativeSelect value={f.prefixEn} onValueChange={(v) => set("prefixEn", v)}>
              <option value="">{L("เลือก", "Select")}</option>
              {PREFIXES_EN.map((p) => <option key={p} value={p}>{p}</option>)}
            </NativeSelect>
          </Field>
          <div className="hidden sm:block" />
          <Field label={L("ชื่อ (อังกฤษ)", "First name (English)")}><Input value={f.firstNameEn} onChange={(e) => set("firstNameEn", e.target.value)} data-testid="emp-first-en" /></Field>
          <Field label={L("นามสกุล (อังกฤษ)", "Last name (English)")}><Input value={f.lastNameEn} onChange={(e) => set("lastNameEn", e.target.value)} data-testid="emp-last-en" /></Field>
          <Field label={L("เลขบัตรประชาชน", "ID card number")} error={err.nationalId}><Input inputMode="numeric" maxLength={17} value={f.nationalId} onChange={(e) => set("nationalId", e.target.value.replace(/[^\d-\s]/g, ""))} data-testid="emp-nid" /></Field>
          <Field label={L("วันเกิด", "Date of birth")}><DateField value={f.birthDate} onChange={(v) => set("birthDate", v)} /></Field>
          <Field label={L("เบอร์โทร", "Phone")}><Input inputMode="tel" value={f.phone} onChange={(e) => set("phone", e.target.value)} /></Field>
          <Field label={L("อีเมล", "Email")}><Input type="email" value={f.email} onChange={(e) => set("email", e.target.value)} /></Field>
          <Field label={L("ที่อยู่", "Address")} className="sm:col-span-2"><Textarea rows={2} value={f.address} onChange={(e) => set("address", e.target.value)} /></Field>
          <Field label={L("ผู้ติดต่อฉุกเฉิน", "Emergency contact")}><Input value={f.emergencyName} onChange={(e) => set("emergencyName", e.target.value)} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={L("เบอร์", "Phone")}><Input inputMode="tel" value={f.emergencyPhone} onChange={(e) => set("emergencyPhone", e.target.value)} /></Field>
            <Field label={L("เกี่ยวข้องเป็น", "Relation")}><Input value={f.emergencyRelation} onChange={(e) => set("emergencyRelation", e.target.value)} /></Field>
          </div>
          {sec(L("งานและเงินเดือน", "Work and salary"))}
          <Field label={L("ตำแหน่ง", "Position")}><Input value={f.position} onChange={(e) => set("position", e.target.value)} data-testid="emp-position" /></Field>
          <Field label={L("ตำแหน่ง (อังกฤษ)", "Position (English)")}><Input value={f.positionEn} onChange={(e) => set("positionEn", e.target.value)} data-testid="emp-position-en" /></Field>
          <Field label={L("ประเภท", "Type")}>
            <NativeSelect value={f.empType} onValueChange={(v) => set("empType", v)}>
              <option value="full">{L("ประจำ", "Full-time")}</option>
              <option value="part">{L("พาร์ตไทม์", "Part-time")}</option>
            </NativeSelect>
          </Field>
          <Field label={L("วันเริ่มงาน", "Start date")} required error={err.startDate}><DateField value={f.startDate} onChange={(v) => set("startDate", v)} /></Field>
          {editing
            ? <p className="text-xs text-muted-foreground sm:col-span-2">{L(`เงินเดือนปัจจุบัน ${bahtText(editing.salary)} · เปลี่ยนด้วยปุ่ม "ปรับเงินเดือน" ในแท็บงาน/เงินเดือน`, `Current salary ${bahtText(editing.salary)} · change it with "Change salary" in the Work / salary tab`)}</p>
            : <Field label={L("เงินเดือน (บาท / เดือน)", "Salary (THB a month)")} required error={err.salary}><Input inputMode="decimal" value={f.salary} onChange={(e) => set("salary", e.target.value.replace(/[^\d.,]/g, ""))} data-testid="emp-salary" /></Field>}
          <div className="hidden sm:block" />
          <Field label={L("ธนาคาร", "Bank")}><Input value={f.bankName} onChange={(e) => set("bankName", e.target.value)} /></Field>
          <Field label={L("เลขบัญชี", "Account number")}><Input inputMode="numeric" value={f.bankAccount} onChange={(e) => set("bankAccount", e.target.value)} /></Field>
          {editing && <>
            <Field label={L("วันลาออก (ถ้ามี)", "Last day (if they left)")}><DateField value={f.endDate} onChange={(v) => set("endDate", v)} /></Field>
            <Field label={L("เหตุผลที่ลาออก", "Reason for leaving")}><Input disabled={!f.endDate} value={f.endReason} onChange={(e) => set("endReason", e.target.value)} /></Field>
          </>}
          <Field label={L("หมายเหตุ", "Note")} className="sm:col-span-2"><Textarea rows={2} value={f.note} onChange={(e) => set("note", e.target.value)} /></Field>
        </div>
        <DialogFooter>
          <Button variant="outline" className="rounded-full" onClick={() => onOpenChange(false)}>{L("ยกเลิก", "Cancel")}</Button>
          <Button className="rounded-full" disabled={busy} onClick={save} data-testid="emp-save">{L("บันทึก", "Save")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------- salary change ----------
export function SalaryDialog({ open, onOpenChange, e, onSaved }: { open: boolean; onOpenChange: (o: boolean) => void; e: Employee; onSaved: () => void }) {
  const [from, setFrom] = useState(todayIso());
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setFrom(todayIso()); setAmount(""); setReason(""); } }, [open]);
  const save = async () => {
    if (!(num(amount) > 0)) { toast.error(L("กรุณาใส่เงินเดือนใหม่", "Please enter the new salary")); return; }
    setBusy(true);
    try {
      await api(`/employees/${e.id}/salary`, { body: { effectiveFrom: from, amount: num(amount), reason } });
      toast.success(L("บันทึกการปรับเงินเดือนแล้ว", "Salary change saved"));
      onOpenChange(false);
      onSaved();
    } catch (x) { toast.error(errorText(x)); }
    setBusy(false);
  };
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!busy) onOpenChange(o); }}>
      <DialogContent className="rounded-3xl sm:max-w-md" data-testid="salary-dialog">
        <DialogHeader>
          <DialogTitle>{L("ปรับเงินเดือน", "Change salary")}</DialogTitle>
          <DialogDescription>{L(`ตอนนี้ ${bahtText(e.salary)} / เดือน`, `Now ${bahtText(e.salary)} a month`)}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <Field label={L("เงินเดือนใหม่ (บาท / เดือน)", "New salary (THB a month)")} required><Input inputMode="decimal" value={amount} onChange={(x) => setAmount(x.target.value.replace(/[^\d.,]/g, ""))} data-testid="salary-amount" /></Field>
          <Field label={L("มีผลตั้งแต่", "From")} required><DateField value={from} onChange={setFrom} /></Field>
          <Field label={L("เหตุผล", "Reason")}><Input value={reason} placeholder={L("เช่น ผ่านทดลองงาน, ครบ 1 ปี", "e.g. passed probation, one year")} onChange={(x) => setReason(x.target.value)} data-testid="salary-reason" /></Field>
        </div>
        <DialogFooter>
          <Button variant="outline" className="rounded-full" onClick={() => onOpenChange(false)}>{L("ยกเลิก", "Cancel")}</Button>
          <Button className="rounded-full" disabled={busy || !from} onClick={save} data-testid="salary-save">{L("บันทึก", "Save")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------- issue a salary certificate ----------
type Signer = { name: string; nameEn: string; title: string; titleEn: string };
const seg = (on: boolean) => `h-8 rounded-full px-4 text-xs font-bold transition-colors ${on ? "bg-primary text-primary-foreground" : "text-foreground/70 hover:bg-muted"}`;

function draftData(e: Employee, showId: boolean, c: Company, s: Signer): CertData {
  return {
    prefix: e.prefix, firstName: e.firstName, lastName: e.lastName, prefixEn: e.prefixEn, firstNameEn: e.firstNameEn, lastNameEn: e.lastNameEn,
    nationalId: showId ? (e.nationalId ?? "").replace(/[\s-]/g, "") : "", position: e.position, positionEn: e.positionEn || e.position,
    empType: e.empType, startDate: e.startDate,
    company: { name: c.name, nameEn: c.nameEn, address: c.address, phone: c.phone, email: c.email, taxId: c.taxId, branch: c.branch, logo: c.logo, sign: c.sign, stamp: c.stamp ?? "" },
    signer: s,
  };
}

export function IssueCertDialog({ open, onOpenChange, e, onIssued }: { open: boolean; onOpenChange: (o: boolean) => void; e: Employee; onIssued: (c: Cert) => void }) {
  const [lang, setLang] = useState<"th" | "en">("th");
  const [showId, setShowId] = useState(true);
  const [salary, setSalary] = useState("");
  const [signer, setSigner] = useState<Signer | null>(null);
  const [company, setCompany] = useState<Company | null>(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<CertDoc | null>(null);
  useEffect(() => {
    if (!open) return;
    setLang(getLang() === "en" ? "en" : "th"); setShowId(!!e.nationalIdLast4); setSalary(String(e.salary));
    api<Signer>("/settings/cert-signer").then(setSigner).catch(() => setSigner(null));
    api<Company>("/settings/company").then(setCompany).catch(() => setCompany(null));
  }, [open, e]);
  const signerText = signer ? [lang === "en" ? signer.nameEn || signer.name : signer.name || signer.nameEn, lang === "en" ? signer.titleEn || signer.title : signer.title || signer.titleEn].filter(Boolean).join(" · ") : "";
  const doc = (): CertDoc | null => company && signer ? { no: L("ตัวอย่าง", "PREVIEW"), date: todayIso(), lang, salary: num(salary), cancelled: false, cancelReason: "", data: draftData(e, showId, company, signer) } : null;
  const issue = async () => {
    setBusy(true);
    try {
      const c = await api<Cert>(`/employees/${e.id}/certs`, { body: { lang, showId, salary: num(salary) } });
      toast.success(L(`ออกหนังสือ ${c.no} แล้ว`, `Issued ${c.no}`));
      onOpenChange(false);
      onIssued(c);
    } catch (x) { toast.error(errorText(x)); }
    setBusy(false);
  };
  return (
    <>
      <Dialog open={open && !preview} onOpenChange={(o) => { if (!busy) onOpenChange(o); }}>
        <DialogContent className="rounded-3xl sm:max-w-md" data-testid="cert-issue">
          <DialogHeader>
            <DialogTitle>{L("ออกหนังสือรับรองเงินเดือน", "Issue a salary certificate")}</DialogTitle>
            <DialogDescription>{staffName(e)} · {e.code}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <Field label={L("ภาษาของหนังสือ", "Language")}>
              <div className="inline-flex w-fit rounded-full border border-border p-0.5" role="group">
                <button type="button" aria-pressed={lang === "th"} className={seg(lang === "th")} onClick={() => setLang("th")} data-testid="cert-lang-th">ไทย</button>
                <button type="button" aria-pressed={lang === "en"} className={seg(lang === "en")} onClick={() => setLang("en")} data-testid="cert-lang-en">English</button>
              </div>
              {lang === "en" && !e.firstNameEn && <p className="mt-1 text-xs text-orange-700 dark:text-orange-400">{L("ยังไม่มีชื่อภาษาอังกฤษ ใส่ในข้อมูลพนักงานก่อน", "No English name yet: add it to the staff record first")}</p>}
            </Field>
            <Field label={L("ใส่เลขบัตรประชาชน", "Show the ID card number")}>
              <div className="inline-flex w-fit rounded-full border border-border p-0.5" role="group">
                <button type="button" aria-pressed={showId} className={seg(showId)} onClick={() => setShowId(true)} disabled={!e.nationalIdLast4} data-testid="cert-id-yes">{L("ใส่", "Yes")}</button>
                <button type="button" aria-pressed={!showId} className={seg(!showId)} onClick={() => setShowId(false)} data-testid="cert-id-no">{L("ไม่ใส่", "No")}</button>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{e.nationalIdLast4 ? L("บางที่ (สถานทูต, ธนาคาร) ขอให้มี", "Some places (embassies, banks) ask for it") : L("ยังไม่มีเลขบัตรในข้อมูลพนักงาน", "No ID card number in the staff record yet")}</p>
            </Field>
            <Field label={L("เงินเดือนที่ระบุ (บาท / เดือน)", "Salary on the certificate (THB a month)")}>
              <Input inputMode="decimal" value={salary} onChange={(x) => setSalary(x.target.value.replace(/[^\d.,]/g, ""))} data-testid="cert-salary" />
              <p className="mt-1 text-xs text-muted-foreground">{L("ดึงจากเงินเดือนปัจจุบัน แก้เฉพาะในฉบับนี้ได้", "From the current salary; a change here is for this certificate only")}</p>
            </Field>
            <Field label={L("ผู้ลงนาม", "Signed by")}>
              <p className="rounded-xl bg-muted px-3 py-2 text-sm" data-testid="cert-signer">{signerText || L("ยังไม่ได้ตั้งผู้ลงนาม: ตั้งในหน้าตั้งค่าบริษัท (เว้นไว้ให้เซ็นมือได้)", "No signer set yet: set it on the Company settings page (or sign by hand)")}</p>
            </Field>
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" className="rounded-full" disabled={!company || !signer} onClick={() => setPreview(doc())} data-testid="cert-preview"><Eye className="h-4 w-4" /> {L("ดูตัวอย่าง", "Preview")}</Button>
            <Button className="rounded-full" disabled={busy || !(num(salary) > 0)} onClick={issue} data-testid="cert-issue-save">{L("ออกหนังสือ", "Issue")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <CertView doc={preview} onClose={() => setPreview(null)} />
    </>
  );
}

// ---------- full-screen certificate (like the receipt viewer) ----------
const A4_W = 794, A4_H = 1123;
export function CertView({ doc, cert, onClose, onCancelled }: { doc?: CertDoc | null; cert?: Cert | null; onClose: () => void; onCancelled?: () => void }) {
  const show = cert ?? doc ?? null;
  // a callback ref: the window's content mounts a moment after `show` is set, so measure when the box itself appears
  const [box, setBox] = useState<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(1);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState("");
  useEffect(() => {
    const el = box;
    if (!el || !show) return;
    const fit = () => setScale(Math.min(1, (el.clientWidth - 24) / A4_W));
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [box, show]);
  const cancel = async () => {
    if (!cert || !reason.trim()) return;
    try {
      await api(`/salary-certs/${cert.id}/cancel`, { body: { reason } });
      toast.success(L(`ยกเลิก ${cert.no} แล้ว`, `${cert.no} cancelled`));
      setCancelOpen(false); setReason("");
      onCancelled?.();
    } catch (x) { toast.error(errorText(x)); }
  };
  return (
    <Dialog open={!!show} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50" />
        <DialogPrimitive.Content className="fixed inset-0 z-50 flex flex-col bg-[#5b4b50] outline-none" data-testid="cert-view">
          <DialogPrimitive.Title className="sr-only">{L("หนังสือรับรองเงินเดือน", "Salary certificate")}</DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">{show?.no ?? ""}</DialogPrimitive.Description>
          <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border bg-background px-3 py-2.5 sm:px-5">
            <Button variant="outline" className="rounded-full" onClick={onClose} data-testid="cert-back"><ChevronLeft className="h-4 w-4" /> {L("กลับ", "Back")}</Button>
            <div className="min-w-0 flex-1" />
            {cert && <SharePdf url={`/salary-certs/${cert.id}/pdf`} name={`Salary-Certificate-${cert.no}.pdf`} version={String(cert.cancelled)} testId="cert-share" />}
            {show && (
              <Button className="rounded-full" onClick={() => { if (!printCert(show)) toast.error(L("กรุณาอนุญาตหน้าต่างใหม่เพื่อพิมพ์", "Please allow pop-up windows to print")); }} data-testid="cert-print">
                <Printer className="h-4 w-4" /> {L("พิมพ์", "Print")}
              </Button>
            )}
            {cert && !cert.cancelled && <RowActions name={cert.no} items={[{ label: L("ยกเลิกหนังสือ", "Cancel certificate"), icon: <Ban />, danger: true, onSelect: () => setCancelOpen(true) }]} />}
          </div>
          <div ref={setBox} className="min-h-0 flex-1 overflow-auto p-3 sm:p-6">
            {show && (
              <div className="mx-auto" style={{ width: A4_W * scale, height: A4_H * scale }}>
                <iframe title={show.no} srcDoc={certHtml(show)} data-testid="cert-frame"
                  style={{ width: A4_W, height: A4_H, border: 0, background: "#fff", transform: `scale(${scale})`, transformOrigin: "0 0", boxShadow: "0 2px 15px rgba(0,0,0,.25)" }} />
              </div>
            )}
          </div>
          <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
            <DialogContent className="rounded-3xl sm:max-w-md">
              <DialogHeader>
                <DialogTitle>{L(`ยกเลิก ${cert?.no ?? ""}?`, `Cancel ${cert?.no ?? ""}?`)}</DialogTitle>
                <DialogDescription>{L("หนังสือยังเก็บไว้ดูได้ (ขีดฆ่า) เลขนี้ไม่ถูกใช้ซ้ำ", "The certificate stays on file, struck through; its number is not used again")}</DialogDescription>
              </DialogHeader>
              <Field label={L("เหตุผล", "Reason")} required><Input value={reason} onChange={(x) => setReason(x.target.value)} data-testid="cert-cancel-reason" /></Field>
              <DialogFooter>
                <Button variant="outline" className="rounded-full" onClick={() => setCancelOpen(false)}>{L("ไม่ยกเลิก", "Keep it")}</Button>
                <Button variant="destructive" className="rounded-full" disabled={!reason.trim()} onClick={cancel} data-testid="cert-cancel-run">{L("ยกเลิกหนังสือ", "Cancel certificate")}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </Dialog>
  );
}
