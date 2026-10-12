import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, ChevronRight, Check, KeyRound, Link2 } from "lucide-react";
import { Row, SecurityCard } from "@/components/yodo/Pin";
import { NoticeSettings } from "@/components/yodo/NoticeSettings";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Field, ImageUpload, onlyDigits10, PageHeader } from "@/components/yodo/ui";
import { api, errorText, getMe } from "@/lib/api";
import { ROLE_LABEL } from "@/lib/auth-utils";
import { L } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "YODO" },
      { name: "description", content: L("แก้ไขข้อมูลส่วนตัวและรูปโปรไฟล์ของบัญชีผู้ใช้ YODO ของคุณ", "Edit the personal details and profile picture of your YODO account") },
      { property: "og:title", content: "YODO" },
      { property: "og:description", content: L("แก้ไขข้อมูลส่วนตัวและรูปโปรไฟล์ของบัญชีผู้ใช้ YODO ของคุณ", "Edit the personal details and profile picture of your YODO account") },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SettingsPage,
});

type ProfileForm = { firstName: string; lastName: string; nickname: string; email: string; phone: string; image: string };
const empty: ProfileForm = { firstName: "", lastName: "", nickname: "", email: "", phone: "", image: "" };

function SettingsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [username, setUsername] = useState("");
  const [roleLabel, setRoleLabel] = useState("-");
  const [positionName, setPositionName] = useState("-");
  const [google, setGoogle] = useState({ linked: false, superadmin: false, clientId: "" });
  const [f, setF] = useState<ProfileForm>(empty);
  const [errors, setErrors] = useState<Partial<Record<keyof ProfileForm, string>>>({});
  const set = <K extends keyof ProfileForm>(k: K, v: ProfileForm[K]) => setF((p) => ({ ...p, [k]: v }));
  const [pwOpen, setPwOpen] = useState(false);
  const [pwStep, setPwStep] = useState<1 | 2>(1);
  const [pwSaving, setPwSaving] = useState(false);
  const [pw, setPw] = useState({ current: "", next: "", confirm: "" });
  const [pwErrors, setPwErrors] = useState<Partial<Record<"current" | "next" | "confirm", string>>>({});

  useEffect(() => {
    (async () => {
      const p = await getMe();
      setUsername(p.username);
      setF({ firstName: p.firstName, lastName: p.lastName, nickname: p.nickname, email: p.email, phone: p.phone, image: p.image });
      if (p.positionName) setPositionName(p.positionName);
      setRoleLabel(ROLE_LABEL[p.role] ?? p.role);
      const o = await api<{ googleClientId: string }>("/auth/options").catch(() => ({ googleClientId: "" }));
      setGoogle({ linked: !!(p as { googleLinked?: boolean }).googleLinked, superadmin: p.superadmin, clientId: o.googleClientId });
      setLoading(false);
    })();
  }, []);

  const save = async () => {
    const e: Partial<Record<keyof ProfileForm, string>> = {};
    if (f.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email)) e.email = L("อีเมลไม่ถูกต้อง", "The email is not valid");
    if (f.phone && !/^\d{10}$/.test(f.phone)) e.phone = L("เบอร์โทรต้องมี 10 หลัก", "The phone number needs 10 digits");
    setErrors(e);
    if (Object.keys(e).length) return;
    setSaving(true);
    try {
      await api("/me", { method: "PATCH", body: f });
    } catch (err) {
      setSaving(false);
      toast.error(L("บันทึกไม่สำเร็จ: ", "Could not save: ") + errorText(err));
      return;
    }
    setSaving(false);
    window.dispatchEvent(new Event("yodo:me-updated"));
    toast.success(L("บันทึกโปรไฟล์แล้ว", "Profile saved"));
  };

  const openPwDialog = () => {
    setPw({ current: "", next: "", confirm: "" });
    setPwErrors({});
    setPwStep(1);
    setPwOpen(true);
  };

  const verifyCurrent = async () => {
    if (!pw.current) { setPwErrors({ current: L("กรุณากรอกรหัสผ่านปัจจุบัน", "Please enter your current password") }); return; }
    setPwSaving(true);
    const ok = await api("/me/password/check", { body: { current: pw.current } }).then(() => true, () => false);
    setPwSaving(false);
    if (!ok) { setPwErrors({ current: L("รหัสผ่านปัจจุบันไม่ถูกต้อง", "The current password is wrong") }); return; }
    setPwErrors({});
    setPwStep(2);
  };

  const changePassword = async () => {
    const e: Partial<Record<"next" | "confirm", string>> = {};
    if (pw.next.length < 6) e.next = L("รหัสผ่านใหม่ต้องมีอย่างน้อย 6 ตัวอักษร", "The new password needs at least 6 characters");
    else if (pw.next === pw.current) e.next = L("รหัสผ่านใหม่ต้องไม่เหมือนรหัสผ่านเดิม", "The new password must be different from the old one");
    if (pw.confirm !== pw.next) e.confirm = L("ยืนยันรหัสผ่านไม่ตรงกัน", "The passwords do not match");
    setPwErrors(e);
    if (Object.keys(e).length) return;
    setPwSaving(true);
    try {
      await api("/me/password", { body: { current: pw.current, next: pw.next } });
    } catch (err) {
      setPwSaving(false);
      toast.error(L("เปลี่ยนรหัสผ่านไม่สำเร็จ: ", "Could not change the password: ") + errorText(err));
      return;
    }
    setPwSaving(false);
    setPwOpen(false);
    toast.success(L("เปลี่ยนรหัสผ่านเรียบร้อยแล้ว", "Password changed"));
  };

  if (loading) return <p className="py-20 text-center text-sm text-muted-foreground">{L("กำลังโหลด...", "Loading...")}</p>;

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <Button variant="ghost" onClick={() => router.history.back()} className="mb-4 -ml-2 gap-2 rounded-full text-muted-foreground">
        <ArrowLeft className="h-4 w-4" /> {L("ย้อนกลับ", "Back")}
      </Button>
      <PageHeader title={L("ตั้งค่าโปรไฟล์", "Profile settings")} subtitle={L("แก้ไขข้อมูลส่วนตัวและรูปโปรไฟล์ของคุณ", "Edit your personal details and profile picture")} />
      <Card className="flex flex-col gap-5 rounded-3xl p-7">
        <Field label={L("รูปโปรไฟล์", "Profile Image")}>
          <ImageUpload value={f.image} onChange={(v) => set("image", v)} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={L("ชื่อ", "First name")}><Input value={f.firstName} onChange={(e) => set("firstName", e.target.value)} /></Field>
          <Field label={L("นามสกุล", "Last name")}><Input value={f.lastName} onChange={(e) => set("lastName", e.target.value)} /></Field>
          <Field label={L("ชื่อเล่น", "Nickname")}><Input value={f.nickname} onChange={(e) => set("nickname", e.target.value)} /></Field>
          <Field label={L("เบอร์โทร", "Phone")} error={errors.phone}><Input inputMode="numeric" value={f.phone} onChange={(e) => set("phone", onlyDigits10(e.target.value))} /></Field>
          <Field label={L("อีเมล", "Email")} error={errors.email} className="sm:col-span-2"><Input type="email" value={f.email} onChange={(e) => set("email", e.target.value)} /></Field>
        </div>
        <div className="grid gap-4 rounded-2xl bg-accent/40 p-4 text-sm sm:grid-cols-3">
          <div><p className="text-xs text-muted-foreground">{L("ชื่อผู้ใช้", "Username")}</p><p className="font-medium">{username}</p></div>
          <div><p className="text-xs text-muted-foreground">{L("ตำแหน่ง", "Position")}</p><p className="font-medium">{positionName}</p></div>
          <div><p className="text-xs text-muted-foreground">{L("บทบาท", "Role")}</p><p className="font-medium">{roleLabel}</p></div>
        </div>
        <div className="flex items-center justify-end">
          <Button onClick={save} disabled={saving} className="rounded-full px-8">{saving ? L("กำลังบันทึก...", "Saving...") : L("บันทึก", "Save")}</Button>
        </div>
      </Card>
      <Card className="mt-6 gap-0 rounded-3xl py-2">
        <h2 className="px-5 pb-1 pt-3 font-semibold">{L("การเข้าสู่ระบบของฉัน", "My sign-in")}</h2>
        <SecurityCard>
          {google.clientId && (
            <Row icon={<Link2 className="h-4 w-4" />} title={L("บัญชี Google", "Google account")}
              sub={google.linked ? f.email || L("ผูกแล้ว", "Linked") : L("ยังไม่ผูก: ใส่อีเมล Gmail ด้านบน แล้วกด \"เข้าด้วย Google\" ที่หน้าเข้าสู่ระบบหนึ่งครั้ง", "Not linked yet: enter your Gmail address above, then tap \"Continue with Google\" on the sign-in page once.")}>
              {google.linked && <span className="inline-flex items-center gap-1 text-xs font-semibold text-success"><Check className="h-3.5 w-3.5" />{L("ผูกแล้ว", "Linked")}</span>}
            </Row>
          )}
          <button type="button" onClick={openPwDialog} className="w-full text-left hover:bg-muted/50">
            <Row icon={<KeyRound className="h-4 w-4" />} title={L("เปลี่ยนรหัสผ่าน", "Change password")}><ChevronRight className="h-4 w-4 text-muted-foreground" /></Row>
          </button>
        </SecurityCard>
      </Card>
      <Card className="mt-6 gap-0 rounded-3xl py-2">
        <h2 className="px-5 pb-1 pt-3 font-semibold">{L("การแจ้งเตือน", "Notifications")}</h2>
        <NoticeSettings superadmin={google.superadmin} />
      </Card>
      {google.superadmin && <GoogleSetupCard value={google.clientId} onSaved={(v) => setGoogle((g) => ({ ...g, clientId: v }))} />}
      <Dialog open={pwOpen} onOpenChange={setPwOpen}>
        <DialogContent className="max-w-md rounded-3xl">
          <DialogHeader>
            <DialogTitle>{L("เปลี่ยนรหัสผ่าน", "Change password")}</DialogTitle>
          </DialogHeader>
          {pwStep === 1 ? (
            <div className="flex flex-col gap-4">
              <p className="text-sm text-muted-foreground">{L("กรอกรหัสผ่านปัจจุบันเพื่อยืนยันตัวตนก่อนตั้งรหัสผ่านใหม่", "Enter your current password to confirm it is you before setting a new one.")}</p>
              <Field label={L("รหัสผ่านปัจจุบัน", "Current password")} error={pwErrors.current}>
                <Input
                  type="password"
                  value={pw.current}
                  onChange={(e) => setPw((p) => ({ ...p, current: e.target.value }))}
                  onKeyDown={(e) => { if (e.key === "Enter") verifyCurrent(); }}
                  autoComplete="current-password"

                />
              </Field>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setPwOpen(false)} className="rounded-full">{L("ยกเลิก", "Cancel")}</Button>
                <Button onClick={verifyCurrent} disabled={pwSaving} className="rounded-full px-6">{pwSaving ? L("กำลังตรวจสอบ...", "Checking...") : L("ถัดไป", "Next")}</Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <Field label={L("รหัสผ่านใหม่", "New password")} error={pwErrors.next}>
                <Input
                  type="password"
                  value={pw.next}
                  onChange={(e) => setPw((p) => ({ ...p, next: e.target.value }))}
                  onKeyDown={(e) => { if (e.key === "Enter") changePassword(); }}
                  autoComplete="new-password"

                />
              </Field>
              <Field label={L("ยืนยันรหัสผ่านใหม่", "Confirm new password")} error={pwErrors.confirm}>
                <Input
                  type="password"
                  value={pw.confirm}
                  onChange={(e) => setPw((p) => ({ ...p, confirm: e.target.value }))}
                  onKeyDown={(e) => { if (e.key === "Enter") changePassword(); }}
                  autoComplete="new-password"
                />
              </Field>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => { setPwStep(1); setPwErrors({}); }} className="rounded-full">{L("ย้อนกลับ", "Back")}</Button>
                <Button onClick={changePassword} disabled={pwSaving} className="rounded-full px-6">{pwSaving ? L("กำลังเปลี่ยน...", "Changing...") : L("ยืนยันเปลี่ยนรหัสผ่าน", "Change password")}</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// SuperAdmin only: the school's Google client ID (public; the client secret is never needed or asked for).
function GoogleSetupCard({ value, onSaved }: { value: string; onSaved: (v: string) => void }) {
  const [v, setV] = useState(value);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try { await api("/settings/google", { method: "PUT", body: { googleClientId: v.trim() } }); onSaved(v.trim()); toast.success(v.trim() ? L("บันทึกแล้ว ปุ่มเข้าด้วย Google จะขึ้นที่หน้าเข้าสู่ระบบ", "Saved. The Google button will show on the sign-in page") : L("ปิดการเข้าด้วย Google แล้ว", "Google sign-in turned off")); }
    catch (e) { toast.error(errorText(e)); }
    setBusy(false);
  };
  return (
    <Card className="mt-6 flex flex-col gap-3 rounded-3xl p-7">
      <div>
        <h2 className="font-semibold">{L("เข้าด้วย Google (ทั้งโรงเรียน)", "Sign in with Google (whole school)")}</h2>
        <p className="text-xs text-muted-foreground">{L("เห็นเฉพาะ SuperAdmin · วาง Client ID จาก Google (ใช้ตัวเดียวกับ FinHR ได้) เว้นว่าง = ปิดปุ่ม Google", "Only SuperAdmin sees this · paste the Client ID from Google (the same one as FinHR works). Leave it empty to turn the Google button off.")}</p>
      </div>
      <Field label="Google Client ID"><Input value={v} placeholder="xxxx.apps.googleusercontent.com" onChange={(e) => setV(e.target.value)} /></Field>
      <div className="flex justify-end"><Button onClick={save} disabled={busy || v.trim() === value} className="rounded-full px-8">{L("บันทึก", "Save")}</Button></div>
    </Card>
  );
}
