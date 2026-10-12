import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, ChevronRight, Check, KeyRound, Link2 } from "lucide-react";
import { Row, SecurityCard } from "@/components/yodo/Pin";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Field, ImageUpload, onlyDigits10, PageHeader } from "@/components/yodo/ui";
import { api, errorText, getMe } from "@/lib/api";
import { ROLE_LABEL } from "@/lib/auth-utils";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "YODO" },
      { name: "description", content: "แก้ไขข้อมูลส่วนตัวและรูปโปรไฟล์ของบัญชีผู้ใช้ YODO ของคุณ" },
      { property: "og:title", content: "YODO" },
      { property: "og:description", content: "แก้ไขข้อมูลส่วนตัวและรูปโปรไฟล์ของบัญชีผู้ใช้ YODO ของคุณ" },
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
    if (f.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email)) e.email = "อีเมลไม่ถูกต้อง";
    if (f.phone && !/^\d{10}$/.test(f.phone)) e.phone = "เบอร์โทรต้องมี 10 หลัก";
    setErrors(e);
    if (Object.keys(e).length) return;
    setSaving(true);
    try {
      await api("/me", { method: "PATCH", body: f });
    } catch (err) {
      setSaving(false);
      toast.error("บันทึกไม่สำเร็จ: " + errorText(err));
      return;
    }
    setSaving(false);
    window.dispatchEvent(new Event("yodo:me-updated"));
    toast.success("บันทึกโปรไฟล์แล้ว");
  };

  const openPwDialog = () => {
    setPw({ current: "", next: "", confirm: "" });
    setPwErrors({});
    setPwStep(1);
    setPwOpen(true);
  };

  const verifyCurrent = async () => {
    if (!pw.current) { setPwErrors({ current: "กรุณากรอกรหัสผ่านปัจจุบัน" }); return; }
    setPwSaving(true);
    const ok = await api("/me/password/check", { body: { current: pw.current } }).then(() => true, () => false);
    setPwSaving(false);
    if (!ok) { setPwErrors({ current: "รหัสผ่านปัจจุบันไม่ถูกต้อง" }); return; }
    setPwErrors({});
    setPwStep(2);
  };

  const changePassword = async () => {
    const e: Partial<Record<"next" | "confirm", string>> = {};
    if (pw.next.length < 6) e.next = "รหัสผ่านใหม่ต้องมีอย่างน้อย 6 ตัวอักษร";
    else if (pw.next === pw.current) e.next = "รหัสผ่านใหม่ต้องไม่เหมือนรหัสผ่านเดิม";
    if (pw.confirm !== pw.next) e.confirm = "ยืนยันรหัสผ่านไม่ตรงกัน";
    setPwErrors(e);
    if (Object.keys(e).length) return;
    setPwSaving(true);
    try {
      await api("/me/password", { body: { current: pw.current, next: pw.next } });
    } catch (err) {
      setPwSaving(false);
      toast.error("เปลี่ยนรหัสผ่านไม่สำเร็จ: " + errorText(err));
      return;
    }
    setPwSaving(false);
    setPwOpen(false);
    toast.success("เปลี่ยนรหัสผ่านเรียบร้อยแล้ว");
  };

  if (loading) return <p className="py-20 text-center text-sm text-muted-foreground">กำลังโหลด...</p>;

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <Button variant="ghost" onClick={() => router.history.back()} className="mb-4 -ml-2 gap-2 rounded-full text-muted-foreground">
        <ArrowLeft className="h-4 w-4" /> ย้อนกลับ
      </Button>
      <PageHeader title="ตั้งค่าโปรไฟล์" subtitle="แก้ไขข้อมูลส่วนตัวและรูปโปรไฟล์ของคุณ" />
      <Card className="flex flex-col gap-5 rounded-3xl p-7">
        <Field label="Profile Image">
          <ImageUpload value={f.image} onChange={(v) => set("image", v)} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="ชื่อ"><Input value={f.firstName} onChange={(e) => set("firstName", e.target.value)} /></Field>
          <Field label="นามสกุล"><Input value={f.lastName} onChange={(e) => set("lastName", e.target.value)} /></Field>
          <Field label="ชื่อเล่น"><Input value={f.nickname} onChange={(e) => set("nickname", e.target.value)} /></Field>
          <Field label="เบอร์โทร" error={errors.phone}><Input inputMode="numeric" value={f.phone} onChange={(e) => set("phone", onlyDigits10(e.target.value))} /></Field>
          <Field label="อีเมล" error={errors.email} className="sm:col-span-2"><Input type="email" value={f.email} onChange={(e) => set("email", e.target.value)} /></Field>
        </div>
        <div className="grid gap-4 rounded-2xl bg-accent/40 p-4 text-sm sm:grid-cols-3">
          <div><p className="text-xs text-muted-foreground">Username</p><p className="font-medium">{username}</p></div>
          <div><p className="text-xs text-muted-foreground">ตำแหน่ง</p><p className="font-medium">{positionName}</p></div>
          <div><p className="text-xs text-muted-foreground">บทบาท</p><p className="font-medium">{roleLabel}</p></div>
        </div>
        <div className="flex items-center justify-end">
          <Button onClick={save} disabled={saving} className="rounded-full px-8">{saving ? "กำลังบันทึก..." : "บันทึก"}</Button>
        </div>
      </Card>
      <Card className="mt-6 gap-0 rounded-3xl py-2">
        <h2 className="px-5 pb-1 pt-3 font-semibold">การเข้าสู่ระบบของฉัน</h2>
        <SecurityCard>
          {google.clientId && (
            <Row icon={<Link2 className="h-4 w-4" />} title="บัญชี Google"
              sub={google.linked ? f.email || "ผูกแล้ว" : "ยังไม่ผูก: ใส่อีเมล Gmail ด้านบน แล้วกด \"เข้าด้วย Google\" ที่หน้าเข้าสู่ระบบหนึ่งครั้ง"}>
              {google.linked && <span className="inline-flex items-center gap-1 text-xs font-semibold text-success"><Check className="h-3.5 w-3.5" />ผูกแล้ว</span>}
            </Row>
          )}
          <button type="button" onClick={openPwDialog} className="w-full text-left hover:bg-muted/50">
            <Row icon={<KeyRound className="h-4 w-4" />} title="เปลี่ยนรหัสผ่าน"><ChevronRight className="h-4 w-4 text-muted-foreground" /></Row>
          </button>
        </SecurityCard>
      </Card>
      {google.superadmin && <GoogleSetupCard value={google.clientId} onSaved={(v) => setGoogle((g) => ({ ...g, clientId: v }))} />}
      <Dialog open={pwOpen} onOpenChange={setPwOpen}>
        <DialogContent className="max-w-md rounded-3xl">
          <DialogHeader>
            <DialogTitle>เปลี่ยนรหัสผ่าน</DialogTitle>
          </DialogHeader>
          {pwStep === 1 ? (
            <div className="flex flex-col gap-4">
              <p className="text-sm text-muted-foreground">กรอกรหัสผ่านปัจจุบันเพื่อยืนยันตัวตนก่อนตั้งรหัสผ่านใหม่</p>
              <Field label="รหัสผ่านปัจจุบัน" error={pwErrors.current}>
                <Input
                  type="password"
                  value={pw.current}
                  onChange={(e) => setPw((p) => ({ ...p, current: e.target.value }))}
                  onKeyDown={(e) => { if (e.key === "Enter") verifyCurrent(); }}
                  autoComplete="current-password"

                />
              </Field>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setPwOpen(false)} className="rounded-full">ยกเลิก</Button>
                <Button onClick={verifyCurrent} disabled={pwSaving} className="rounded-full px-6">{pwSaving ? "กำลังตรวจสอบ..." : "ถัดไป"}</Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <Field label="รหัสผ่านใหม่" error={pwErrors.next}>
                <Input
                  type="password"
                  value={pw.next}
                  onChange={(e) => setPw((p) => ({ ...p, next: e.target.value }))}
                  onKeyDown={(e) => { if (e.key === "Enter") changePassword(); }}
                  autoComplete="new-password"

                />
              </Field>
              <Field label="ยืนยันรหัสผ่านใหม่" error={pwErrors.confirm}>
                <Input
                  type="password"
                  value={pw.confirm}
                  onChange={(e) => setPw((p) => ({ ...p, confirm: e.target.value }))}
                  onKeyDown={(e) => { if (e.key === "Enter") changePassword(); }}
                  autoComplete="new-password"
                />
              </Field>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => { setPwStep(1); setPwErrors({}); }} className="rounded-full">ย้อนกลับ</Button>
                <Button onClick={changePassword} disabled={pwSaving} className="rounded-full px-6">{pwSaving ? "กำลังเปลี่ยน..." : "ยืนยันเปลี่ยนรหัสผ่าน"}</Button>
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
    try { await api("/settings/google", { method: "PUT", body: { googleClientId: v.trim() } }); onSaved(v.trim()); toast.success(v.trim() ? "บันทึกแล้ว ปุ่มเข้าด้วย Google จะขึ้นที่หน้าเข้าสู่ระบบ" : "ปิดการเข้าด้วย Google แล้ว"); }
    catch (e) { toast.error(errorText(e)); }
    setBusy(false);
  };
  return (
    <Card className="mt-6 flex flex-col gap-3 rounded-3xl p-7">
      <div>
        <h2 className="font-semibold">เข้าด้วย Google (ทั้งโรงเรียน)</h2>
        <p className="text-xs text-muted-foreground">เห็นเฉพาะ SuperAdmin · วาง Client ID จาก Google (ใช้ตัวเดียวกับ FinHR ได้) เว้นว่าง = ปิดปุ่ม Google</p>
      </div>
      <Field label="Google Client ID"><Input value={v} placeholder="xxxx.apps.googleusercontent.com" onChange={(e) => setV(e.target.value)} /></Field>
      <div className="flex justify-end"><Button onClick={save} disabled={busy || v.trim() === value} className="rounded-full px-8">บันทึก</Button></div>
    </Card>
  );
}
