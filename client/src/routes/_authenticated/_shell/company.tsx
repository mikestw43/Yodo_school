import { useEffect, useRef, useState } from "react";
import { ImagePlus, Mail, PenLine, RotateCcw, Trash2 } from "lucide-react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SignCanvas, type SignCanvasHandle } from "@/components/yodo/student-document";
import { EmptyState, Field, PageHeader } from "@/components/yodo/ui";
import { api, errorText } from "@/lib/api";
import { L } from "@/lib/i18n";
import type { Company } from "@/lib/receipt-print";
import { useYodo } from "@/lib/yodo-store";
import { tidyImage } from "@/lib/tidyImage";

export const Route = createFileRoute("/_authenticated/_shell/company")({
  component: CompanyPage,
});

const EMPTY: Company = { name: "", nameEn: "", address: "", phone: "", email: "", taxId: "", branch: "", logo: "", sign: "", stamp: "", signName: "" };

// Company details printed on receipts (owner 12/10/2026, mockup board 4).
function CompanyPage() {
  const { can } = useYodo();
  const edit = can("company", "edit");
  const [f, setF] = useState<Company>(EMPTY);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (can("company")) api<Company>("/settings/company").then(setF).catch((e) => toast.error(errorText(e))); }, [can]);
  const set = <K extends keyof Company>(k: K, v: Company[K]) => setF((p) => ({ ...p, [k]: v }));
  if (!can("company")) return <EmptyState title={L("ไม่มีสิทธิ์เข้าถึงหน้านี้", "You don't have access to this page")} />;
  const taxOk = f.taxId === "" || /^\d{13}$/.test(f.taxId);
  const save = async () => {
    if (!taxOk) { toast.error(L("เลขผู้เสียภาษีต้องเป็นตัวเลข 13 หลัก", "The tax ID must be 13 digits")); return; }
    setBusy(true);
    try { setF(await api<Company>("/settings/company", { method: "PUT", body: f })); toast.success(L("บันทึกแล้ว", "Saved")); }
    catch (e) { toast.error(errorText(e)); }
    setBusy(false);
  };
  return (
    <>
      <PageHeader back title={L("ตั้งค่าบริษัท", "Company settings")} subtitle={L("ข้อมูลนี้ใช้ในใบเสร็จรับเงิน", "These details are printed on receipts")} />
      <div className="grid items-start gap-5 lg:grid-cols-[1fr_360px]">
        <div className="grid content-start gap-5">
        <Card className="grid content-start gap-x-4 gap-y-3 rounded-3xl p-6 sm:grid-cols-2">
          <Field label={L("ชื่อโรงเรียน / บริษัท (ตามจดทะเบียน)", "School / company name (as registered)")} className="sm:col-span-2"><Input disabled={!edit} value={f.name} onChange={(e) => set("name", e.target.value)} /></Field>
          <Field label={L("ชื่อภาษาอังกฤษ", "Name in English")} className="sm:col-span-2"><Input disabled={!edit} value={f.nameEn} onChange={(e) => set("nameEn", e.target.value)} /></Field>
          <Field label={L("ที่อยู่", "Address")} className="sm:col-span-2"><Textarea disabled={!edit} rows={2} value={f.address} onChange={(e) => set("address", e.target.value)} /></Field>
          <Field label={L("เบอร์โทร", "Phone")}><Input disabled={!edit} value={f.phone} onChange={(e) => set("phone", e.target.value)} /></Field>
          <Field label={L("อีเมล", "Email")}><Input disabled={!edit} type="email" value={f.email} onChange={(e) => set("email", e.target.value)} /></Field>
          <Field label={L("เลขประจำตัวผู้เสียภาษี (ถ้ามี)", "Tax ID (if any)")} error={taxOk ? undefined : L("ต้องเป็นตัวเลข 13 หลัก", "Must be 13 digits")}>
            <Input disabled={!edit} inputMode="numeric" maxLength={13} value={f.taxId} onChange={(e) => set("taxId", e.target.value.replace(/\D/g, ""))} />
          </Field>
          <Field label={L("สาขา", "Branch")}><Input disabled={!edit} placeholder={L("สำนักงานใหญ่", "Head office")} value={f.branch} onChange={(e) => set("branch", e.target.value)} /></Field>
          {edit && <div className="flex justify-end sm:col-span-2"><Button className="rounded-full" disabled={busy} onClick={save} data-testid="co-save">{L("บันทึก", "Save")}</Button></div>}
        </Card>
        <MailCard edit={edit} />
        </div>
        <div className="grid content-start gap-5">
          <Card className="rounded-3xl p-6">
            <p className="mb-1 text-sm font-semibold">{L("โลโก้ในใบเสร็จ", "Logo on receipts")}</p>
            <p className="mb-3 text-xs text-muted-foreground">{L("ไม่ใส่ = ใช้โลโก้ YODO · ตัดขอบว่างรอบรูปให้เอง", "Empty = the YODO logo · empty margins are cut off")}</p>
            <PicUpload testId="co-logo" crop edit={edit} value={f.logo} onChange={(v) => set("logo", v)} />
          </Card>
          <Card className="rounded-3xl p-6">
            <p className="mb-1 text-sm font-semibold">{L("ลายเซ็นผู้รับเงิน (ไม่บังคับ)", "Signature of the person receiving money (optional)")}</p>
            <p className="mb-3 text-xs text-muted-foreground">{L("ไม่ใส่ = เซ็นด้วยมือหลังพิมพ์", "Empty = sign by hand after printing")}</p>
            <PicUpload testId="co-sign" tidy draw edit={edit} value={f.sign} onChange={(v) => set("sign", v)} />
            {/* Typed name printed under the signature on receipts (owner 12/10/2026); empty = whoever issued the receipt. */}
            <Field label={L("ชื่อผู้รับเงิน (พิมพ์ในใบเสร็จ)", "Receiver's name (printed on the receipt)")} className="mt-4">
              <Input data-testid="co-sign-name" disabled={!edit} value={f.signName ?? ""} placeholder={L("ไม่ใส่ = ชื่อคนที่ออกใบเสร็จ", "Empty = the person who issued it")} onChange={(e) => set("signName", e.target.value)} />
            </Field>
          </Card>
          <Card className="rounded-3xl p-6">
            <p className="mb-1 text-sm font-semibold">{L("ตราประทับ (ไม่บังคับ)", "Stamp (optional)")}</p>
            <p className="mb-3 text-xs text-muted-foreground">{L("พิมพ์ข้างลายเซ็นผู้รับเงินในใบเสร็จ", "Printed beside the signature on receipts")}</p>
            <PicUpload testId="co-stamp" tidy edit={edit} value={f.stamp ?? ""} onChange={(v) => set("stamp", v)} />
          </Card>
        </div>
      </div>
    </>
  );
}

const readUrl = (b: Blob) => new Promise<string>((ok, fail) => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.onerror = fail; r.readAsDataURL(b); });

/** Picture box that keeps transparency (owner 12/10/2026: a signature came out black after the JPEG editor).
 *  Signature and stamp: paper made transparent and margins cut (`tidyImage`, PNG). Logo: only the empty margin cut. */
function PicUpload({ value, onChange, edit, tidy, crop, draw, testId }: { value: string; onChange: (v: string) => void; edit: boolean; tidy?: boolean; crop?: boolean; draw?: boolean; testId: string }) {
  const [drawing, setDrawing] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const pick = async (file?: File) => {
    if (!file) return;
    if (file.size > 8_000_000) { toast.error(L("ไฟล์ใหญ่เกิน 8 MB", "The file is larger than 8 MB")); return; }
    setBusy(true);
    try { onChange(await readUrl(tidy || crop ? await tidyImage(file, !tidy) : file)); }
    catch { toast.error(L("เปิดรูปนี้ไม่ได้", "This picture could not be opened")); }
    setBusy(false);
  };
  return (
    <div className="grid gap-3">
      <div className="flex h-28 items-center justify-center rounded-2xl border border-dashed border-border bg-white p-3">
        {value ? <img data-testid={`${testId}-img`} src={value} alt="" className="max-h-full max-w-full object-contain" /> : <span className="text-xs text-muted-foreground">{L("ยังไม่มีรูป", "No picture yet")}</span>}
      </div>
      {edit && (
        <div className="flex flex-wrap gap-2">
          <input ref={ref} data-testid={testId} type="file" accept="image/*" className="hidden" onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = ""; }} />
          <Button type="button" variant="outline" size="sm" className="rounded-full" disabled={busy} onClick={() => ref.current?.click()}>
            <ImagePlus className="mr-1 h-4 w-4" />{draw ? L("อัปโหลดรูป", "Upload a picture") : value ? L("เปลี่ยนรูป", "Change") : L("เลือกรูป", "Choose a picture")}
          </Button>
          {draw && <Button type="button" variant="outline" size="sm" className="rounded-full" disabled={busy} onClick={() => setDrawing(true)} data-testid={`${testId}-draw`}><PenLine className="mr-1 h-4 w-4" />{L("เซ็นเอง", "Sign here")}</Button>}
          {value && <Button type="button" variant="ghost" size="sm" className="rounded-full text-destructive" onClick={() => onChange("")}><Trash2 className="mr-1 h-4 w-4" />{L("ลบ", "Remove")}</Button>}
        </div>
      )}
      {draw && <DrawSign open={drawing} onClose={() => setDrawing(false)} onDone={(v) => { onChange(v); setDrawing(false); }} />}
    </div>
  );
}

// Pen choices for drawing the receiver's signature (owner 13/10/2026, mockup YR8QPLjiGoo5pySRiGDaqL: black or blue + line width).
const INKS = [{ v: "#111111", th: "ดำ", en: "Black" }, { v: "#1f3a93", th: "น้ำเงิน", en: "Blue" }] as const;
const WIDTHS = [{ v: 1.6, th: "บาง", en: "Thin" }, { v: 2.6, th: "กลาง", en: "Medium" }, { v: 4, th: "หนา", en: "Thick" }] as const;

/** Draw the signature with a finger or the mouse; saved like an upload (transparent PNG, empty margins cut). */
function DrawSign({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: (v: string) => void }) {
  const ref = useRef<SignCanvasHandle>(null);
  const [ink, setInk] = useState<string>(INKS[0].v);
  const [width, setWidth] = useState<number>(WIDTHS[1].v);
  const [dirty, setDirty] = useState(false);
  const [key, setKey] = useState(0);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setDirty(false); setKey((k) => k + 1); } }, [open]);
  const use = async () => {
    if (!ref.current?.isDirty()) return;
    setBusy(true);
    try { const blob = await (await fetch(ref.current.toDataURL())).blob(); onDone(await readUrl(await tidyImage(blob))); }
    catch { toast.error(L("บันทึกลายเซ็นไม่ได้ ลองใหม่อีกครั้ง", "The signature could not be saved, please try again")); }
    setBusy(false);
  };
  const chip = (on: boolean) => `inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold ${on ? "border-primary bg-primary/10 text-primary" : "border-border bg-background"}`;
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !busy) onClose(); }}>
      <DialogContent className="sm:max-w-lg" data-testid="sign-draw">
        <DialogHeader>
          <DialogTitle>{L("เซ็นชื่อผู้รับเงิน", "Sign as the receiver")}</DialogTitle>
          <DialogDescription>{L("เซ็นในกรอบด้วยนิ้วหรือเมาส์", "Sign in the box with your finger or the mouse")}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <div className="flex items-center gap-1.5" role="group" aria-label={L("สีหมึก", "Ink colour")}>
            <span className="text-xs text-muted-foreground">{L("สี", "Colour")}</span>
            {INKS.map((x) => (
              <button key={x.v} type="button" aria-pressed={ink === x.v} className={chip(ink === x.v)} onClick={() => setInk(x.v)}>
                <span className="h-3.5 w-3.5 rounded-full" style={{ background: x.v }} />{L(x.th, x.en)}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1.5" role="group" aria-label={L("ความหนาเส้น", "Line width")}>
            <span className="text-xs text-muted-foreground">{L("เส้น", "Line")}</span>
            {WIDTHS.map((x) => (
              <button key={x.v} type="button" aria-pressed={width === x.v} className={chip(width === x.v)} onClick={() => setWidth(x.v)}>
                <span className="w-4 rounded-full" style={{ height: x.v, background: ink }} />{L(x.th, x.en)}
              </button>
            ))}
          </div>
        </div>
        <div key={key} className="relative h-48 rounded-2xl border border-border bg-white" data-testid="sign-draw-pad">
          <div className="pointer-events-none absolute inset-x-6 bottom-10 border-b border-dashed border-border" />
          {!dirty && <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">{L("เซ็นที่นี่", "Sign here")}</span>}
          <SignCanvas ref={ref} color={ink} width={width} onDirty={() => setDirty(true)} />
        </div>
        <DialogFooter className="items-center gap-2 sm:justify-between">
          <Button type="button" variant="outline" className="rounded-full" disabled={!dirty} onClick={() => { setDirty(false); setKey((k) => k + 1); }}><RotateCcw className="mr-1 h-4 w-4" />{L("เซ็นใหม่", "Clear")}</Button>
          <div className="flex gap-2">
            <Button type="button" variant="outline" className="rounded-full" onClick={onClose}>{L("ยกเลิก", "Cancel")}</Button>
            <Button type="button" className="rounded-full" disabled={!dirty || busy} onClick={use} data-testid="sign-draw-use">{L("ใช้ลายเซ็นนี้", "Use this signature")}</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type MailSettings = { user: string; fromName: string; passSet: boolean; passLast4: string };

/** The school's Gmail for sending receipts (owner 13/10/2026, mockup R4EUKR2FJGuQcf4Xjytzm8 board 3). The app password
 *  is typed here by the owner, kept encrypted on the NAS and never shown again (only its last 4 characters). */
function MailCard({ edit }: { edit: boolean }) {
  const [m, setM] = useState<MailSettings | null>(null);
  const [user, setUser] = useState("");
  const [fromName, setFromName] = useState("");
  const [pass, setPass] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api<MailSettings>("/settings/mail").then((x) => { setM(x); setUser(x.user); setFromName(x.fromName); }).catch(() => setM(null));
  }, []);
  const save = async () => {
    setBusy(true);
    try { const x = await api<MailSettings>("/settings/mail", { method: "PUT", body: { user: user.trim(), fromName: fromName.trim(), pass } }); setM(x); setPass(""); toast.success(L("บันทึกแล้ว", "Saved")); }
    catch (e) { toast.error(errorText(e)); }
    setBusy(false);
  };
  const test = async () => {
    setBusy(true);
    try { await api("/settings/mail/test", { body: {} }); toast.success(L(`ส่งอีเมลทดลองไปที่ ${m?.user} แล้ว`, `Test email sent to ${m?.user}`)); }
    catch (e) { toast.error(errorText(e)); }
    setBusy(false);
  };
  if (!m) return null;
  const ready = !!m.user && m.passSet;
  return (
    <Card className="gap-3 rounded-3xl p-6" data-testid="mail-card">
      <div className="flex items-center gap-2">
        <Mail className="h-4 w-4 text-primary" />
        <p className="text-sm font-semibold">{L("ส่งใบเสร็จทางอีเมล (Gmail)", "Send receipts by email (Gmail)")}</p>
        <span className={`ml-auto rounded-full px-2.5 py-0.5 text-xs font-semibold ${ready ? "bg-emerald-100 text-emerald-800" : "bg-muted text-muted-foreground"}`}>{ready ? L("ตั้งค่าแล้ว", "Set up") : L("ยังไม่ได้ตั้งค่า", "Not set up")}</span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={L("อีเมล Gmail ที่ใช้ส่ง", "Gmail address to send from")}><Input disabled={!edit} type="email" value={user} placeholder="school@gmail.com" onChange={(e) => setUser(e.target.value)} data-testid="mail-user" /></Field>
        <Field label={L("ชื่อผู้ส่งที่ผู้รับเห็น", "Sender name people see")}><Input disabled={!edit} value={fromName} placeholder={L("ไม่ใส่ = ชื่อบริษัท", "Empty = the company name")} onChange={(e) => setFromName(e.target.value)} /></Field>
      </div>
      {edit && (
        <Field label={L("รหัสผ่านสำหรับแอป (App password 16 ตัว)", "App password (16 characters)")}>
          <Input type="password" autoComplete="new-password" value={pass} placeholder={m.passSet ? L(`ตั้งไว้แล้ว ลงท้ายด้วย ${m.passLast4} (ไม่ใส่ = ใช้อันเดิม)`, `Set, ends with ${m.passLast4} (empty = keep it)`) : "xxxx xxxx xxxx xxxx"} onChange={(e) => setPass(e.target.value)} data-testid="mail-pass" />
        </Field>
      )}
      <p className="rounded-2xl bg-muted/60 p-3 text-xs leading-relaxed text-muted-foreground">
        {L("วิธีสร้าง: บัญชี Google › ความปลอดภัย › เปิด \"การยืนยัน 2 ขั้นตอน\" › \"รหัสผ่านสำหรับแอป\" › ตั้งชื่อ YODO › คัดลอกรหัส 16 ตัวมาวางที่นี่ เก็บแบบเข้ารหัสในเครื่อง NAS และแสดงแค่ 4 ตัวท้าย ไม่ต้องบอกใคร",
          "How: Google Account › Security › turn on \"2-Step Verification\" › \"App passwords\" › name it YODO › paste the 16 characters here. It is kept encrypted on the NAS and only its last 4 characters are shown. Never share it.")}
      </p>
      {edit && (
        <div className="flex flex-wrap justify-between gap-2">
          <Button variant="outline" className="rounded-full" disabled={busy || !ready} onClick={test}>{L("ทดลองส่งหาตัวเอง", "Send a test to myself")}</Button>
          <Button className="rounded-full" disabled={busy} onClick={save} data-testid="mail-save">{L("บันทึก", "Save")}</Button>
        </div>
      )}
    </Card>
  );
}
