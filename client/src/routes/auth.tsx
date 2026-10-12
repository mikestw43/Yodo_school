import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, errorText, getMe } from "@/lib/api";
import { useYodo } from "@/lib/yodo-store";
import loginImg from "@/assets/login-ballet.jpg";

export const Route = createFileRoute("/auth")({
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [remember, setRemember] = useState(true);
  const [errors, setErrors] = useState<{ identifier?: string; password?: string }>({});
  const [formError, setFormError] = useState("");
  const [loading, setLoading] = useState(false);
  const [needsSetup, setNeedsSetup] = useState(false);
  const { reload } = useYodo();

  useEffect(() => {
    getMe().then(() => navigate({ to: "/", replace: true })).catch(() => null);
    api<{ needsSetup: boolean }>("/setup/status").then((r) => setNeedsSetup(r.needsSetup)).catch(() => null);
  }, [navigate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setFormError("");
    const errs: typeof errors = {};
    if (!identifier.trim()) errs.identifier = "กรุณากรอก Username หรือ Email";
    if (!password) errs.password = "กรุณากรอก Password";
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setLoading(true);
    try {
      await api("/auth/login", { body: { identifier: identifier.trim(), password, remember } });
    } catch (err) {
      setLoading(false);
      setFormError(errorText(err));
      return;
    }
    await reload();
    navigate({ to: "/", replace: true });
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-background">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <img src={loginImg} alt="" className="h-full w-full object-cover object-center" />
        <div className="absolute inset-0 bg-gradient-to-br from-background/85 via-background/55 to-primary/15" />
        <div className="absolute inset-0 bg-gradient-to-b from-background/40 via-transparent to-primary/10" />
      </div>

      <header className="absolute left-5 top-5 z-20 flex items-center gap-3 md:left-10 md:top-10 md:gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary font-display text-2xl font-bold text-primary-foreground md:h-14 md:w-14">Y</div>
        <div className="min-w-0">
          <p className="font-display text-3xl font-bold leading-none tracking-wide md:text-4xl">YODO</p>
          <p className="mt-1 text-[10px] uppercase tracking-[0.2em] text-muted-foreground md:text-xs">Dance Academy Management System</p>
        </div>
      </header>

      <div className="relative z-10 flex min-h-screen items-center justify-center px-4 py-24">
        <div className="w-full max-w-[400px]">
          {needsSetup ? <SetupCard onDone={async () => { await reload(); navigate({ to: "/", replace: true }); }} /> : (
          <Card className="gap-6 rounded-3xl border border-white/50 bg-card/80 p-8 shadow-soft backdrop-blur-xl">
            <div>
              <h1 className="font-display text-3xl font-bold">Welcome Back</h1>
              <p className="mt-1 text-sm text-muted-foreground">Sign in to continue to YODO</p>
            </div>
            <form onSubmit={submit} className="space-y-4" noValidate>
              <div className="space-y-2">
                <Label htmlFor="identifier">Username / Email</Label>
                <Input id="identifier" autoComplete="username" value={identifier} aria-invalid={!!errors.identifier} onChange={(e) => setIdentifier(e.target.value)} />
                {errors.identifier && <p className="text-xs text-destructive">{errors.identifier}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Input id="password" type={show ? "text" : "password"} autoComplete="current-password" className="pr-10" value={password} aria-invalid={!!errors.password} onChange={(e) => setPassword(e.target.value)} />
                  <button type="button" onClick={() => setShow((s) => !s)} aria-label={show ? "ซ่อนรหัสผ่าน" : "แสดงรหัสผ่าน"} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                    {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {errors.password && <p className="text-xs text-destructive">{errors.password}</p>}
              </div>
              <div className="flex items-center justify-between text-sm">
                <label className="flex cursor-pointer items-center gap-2">
                  <Checkbox checked={remember} onCheckedChange={(v) => setRemember(v === true)} /> Remember me
                </label>
                <button type="button" className="text-primary hover:underline" onClick={() => toast.info("กรุณาติดต่อผู้ดูแลระบบเพื่อรีเซ็ตรหัสผ่าน")}>Forgot password?</button>
              </div>
              {formError && <p className="rounded-2xl bg-destructive/10 px-3 py-2 text-sm text-destructive">{formError}</p>}
              <Button type="submit" className="w-full rounded-full" disabled={loading}>
                {loading && <Loader2 className="h-4 w-4 animate-spin" />} Sign In
              </Button>
            </form>
          </Card>
          )}
        </div>
      </div>
    </div>
  );
}

// First start only: the owner creates the first (SuperAdmin) account with the code from the NAS data folder.
function SetupCard({ onDone }: { onDone: () => Promise<void> }) {
  const [f, setF] = useState({ code: "", firstName: "", lastName: "", username: "", password: "", confirm: "" });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    if (!f.code.trim() || !f.firstName.trim() || !f.username.trim()) { setErr("กรุณากรอกให้ครบ"); return; }
    if (f.password.length < 6) { setErr("รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร"); return; }
    if (f.password !== f.confirm) { setErr("ยืนยันรหัสผ่านไม่ตรงกัน"); return; }
    setBusy(true);
    try {
      await api("/setup", { body: { code: f.code.trim(), firstName: f.firstName, lastName: f.lastName, username: f.username, password: f.password } });
      await onDone();
    } catch (x) { setErr(errorText(x)); setBusy(false); }
  };
  return (
    <Card className="gap-5 rounded-3xl border border-white/50 bg-card/80 p-8 shadow-soft backdrop-blur-xl">
      <div>
        <h1 className="font-display text-3xl font-bold">ตั้งค่าครั้งแรก</h1>
        <p className="mt-1 text-sm text-muted-foreground">สร้างบัญชีผู้ดูแลระบบ (SuperAdmin) รหัสตั้งค่าอยู่ในไฟล์ setup-code.txt ในโฟลเดอร์ data บน NAS</p>
      </div>
      <form onSubmit={submit} className="space-y-3" noValidate>
        <div className="space-y-2"><Label htmlFor="s-code">รหัสตั้งค่า (8 หลัก)</Label><Input id="s-code" inputMode="numeric" value={f.code} onChange={(e) => set("code", e.target.value)} /></div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2"><Label htmlFor="s-first">ชื่อ</Label><Input id="s-first" value={f.firstName} onChange={(e) => set("firstName", e.target.value)} /></div>
          <div className="space-y-2"><Label htmlFor="s-last">นามสกุล</Label><Input id="s-last" value={f.lastName} onChange={(e) => set("lastName", e.target.value)} /></div>
        </div>
        <div className="space-y-2"><Label htmlFor="s-user">Username</Label><Input id="s-user" autoComplete="username" value={f.username} onChange={(e) => set("username", e.target.value)} /></div>
        <div className="space-y-2"><Label htmlFor="s-pw">Password</Label><Input id="s-pw" type="password" autoComplete="new-password" value={f.password} onChange={(e) => set("password", e.target.value)} /></div>
        <div className="space-y-2"><Label htmlFor="s-pw2">ยืนยัน Password</Label><Input id="s-pw2" type="password" autoComplete="new-password" value={f.confirm} onChange={(e) => set("confirm", e.target.value)} /></div>
        {err && <p className="rounded-2xl bg-destructive/10 px-3 py-2 text-sm text-destructive">{err}</p>}
        <Button type="submit" className="w-full rounded-full" disabled={busy}>{busy && <Loader2 className="h-4 w-4 animate-spin" />} สร้างบัญชี</Button>
      </form>
    </Card>
  );
}
