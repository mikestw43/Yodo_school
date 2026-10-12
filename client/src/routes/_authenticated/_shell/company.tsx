import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState, Field, ImageUpload, PageHeader } from "@/components/yodo/ui";
import { api, errorText } from "@/lib/api";
import { L } from "@/lib/i18n";
import type { Company } from "@/lib/receipt-print";
import { useYodo } from "@/lib/yodo-store";

export const Route = createFileRoute("/_authenticated/_shell/company")({
  component: CompanyPage,
});

const EMPTY: Company = { name: "", nameEn: "", address: "", phone: "", email: "", taxId: "", branch: "", logo: "", sign: "" };

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
      <PageHeader title={L("ตั้งค่าบริษัท", "Company settings")} subtitle={L("ข้อมูลนี้ใช้ในใบเสร็จรับเงิน", "These details are printed on receipts")} />
      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        <Card className="grid gap-4 rounded-3xl p-6 sm:grid-cols-2">
          <Field label={L("ชื่อโรงเรียน / บริษัท (ตามจดทะเบียน)", "School / company name (as registered)")} className="sm:col-span-2"><Input disabled={!edit} value={f.name} onChange={(e) => set("name", e.target.value)} /></Field>
          <Field label={L("ชื่อภาษาอังกฤษ", "Name in English")} className="sm:col-span-2"><Input disabled={!edit} value={f.nameEn} onChange={(e) => set("nameEn", e.target.value)} /></Field>
          <Field label={L("ที่อยู่", "Address")} className="sm:col-span-2"><Textarea disabled={!edit} rows={3} value={f.address} onChange={(e) => set("address", e.target.value)} /></Field>
          <Field label={L("เบอร์โทร", "Phone")}><Input disabled={!edit} value={f.phone} onChange={(e) => set("phone", e.target.value)} /></Field>
          <Field label={L("อีเมล", "Email")}><Input disabled={!edit} type="email" value={f.email} onChange={(e) => set("email", e.target.value)} /></Field>
          <Field label={L("เลขประจำตัวผู้เสียภาษี (ถ้ามี)", "Tax ID (if any)")} error={taxOk ? undefined : L("ต้องเป็นตัวเลข 13 หลัก", "Must be 13 digits")}>
            <Input disabled={!edit} inputMode="numeric" maxLength={13} value={f.taxId} onChange={(e) => set("taxId", e.target.value.replace(/\D/g, ""))} />
          </Field>
          <Field label={L("สาขา", "Branch")}><Input disabled={!edit} placeholder={L("สำนักงานใหญ่", "Head office")} value={f.branch} onChange={(e) => set("branch", e.target.value)} /></Field>
          {edit && <div className="flex justify-end sm:col-span-2"><Button className="rounded-full" disabled={busy} onClick={save}>{L("บันทึก", "Save")}</Button></div>}
        </Card>
        <div className="grid content-start gap-5">
          <Card className="rounded-3xl p-6">
            <p className="mb-1 text-sm font-semibold">{L("โลโก้ในใบเสร็จ", "Logo on receipts")}</p>
            <p className="mb-3 text-xs text-muted-foreground">{L("ไม่ใส่ = ใช้โลโก้ YODO", "Empty = the YODO logo")}</p>
            {edit ? <ImageUpload shape="wide" value={f.logo} onChange={(v) => set("logo", v)} /> : f.logo ? <img src={f.logo} alt="" className="max-h-24" /> : null}
          </Card>
          <Card className="rounded-3xl p-6">
            <p className="mb-1 text-sm font-semibold">{L("ลายเซ็นผู้รับเงิน (ไม่บังคับ)", "Signature of the person receiving money (optional)")}</p>
            <p className="mb-3 text-xs text-muted-foreground">{L("ไม่ใส่ = เซ็นด้วยมือหลังพิมพ์", "Empty = sign by hand after printing")}</p>
            {edit ? <ImageUpload shape="wide" value={f.sign} onChange={(v) => set("sign", v)} /> : f.sign ? <img src={f.sign} alt="" className="max-h-20" /> : null}
          </Card>
        </div>
      </div>
    </>
  );
}
