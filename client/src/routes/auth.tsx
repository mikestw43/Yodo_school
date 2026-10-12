import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, clearMeCache, errorText, getMe } from "@/lib/api";
import logoImg from "@/assets/yodo-logo.png";
import { useYodo } from "@/lib/yodo-store";
import loginImg from "@/assets/login-ballet.jpg";
import { PinLogin, markSignedOut } from "@/components/yodo/Pin";
import { loadGoogle } from "@/lib/signin";
import { getLang, L } from "@/lib/i18n";
import { LangToggle } from "@/components/yodo/LangToggle";

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
  const [pin, setPin] = useState<{ on: boolean; name?: string } | null>(null);
  const [usePassword, setUsePassword] = useState(false);
  const [googleId, setGoogleId] = useState("");
  const { reload } = useYodo();

  useEffect(() => {
    getMe().then(() => navigate({ to: "/", replace: true })).catch(() => null);
    api<{ needsSetup: boolean }>("/setup/status").then((r) => setNeedsSetup(r.needsSetup)).catch(() => null);
    api<{ on: boolean; name?: string }>("/auth/pin").then(setPin).catch(() => setPin({ on: false }));
    api<{ googleClientId: string }>("/auth/options").then((r) => setGoogleId(r.googleClientId)).catch(() => null);
  }, [navigate]);

  const signedIn = async () => { markSignedOut(); clearMeCache(); await reload(); navigate({ to: "/", replace: true }); };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setFormError("");
    const errs: typeof errors = {};
    if (!identifier.trim()) errs.identifier = L("กรุณากรอกชื่อผู้ใช้หรืออีเมล", "Please enter your username or email");
    if (!password) errs.password = L("กรุณากรอกรหัสผ่าน", "Please enter your password");
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
    await signedIn();
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-background">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <img src={loginImg} alt="" className="h-full w-full object-cover object-center" />
        <div className="absolute inset-0 bg-gradient-to-br from-background/85 via-background/55 to-primary/15" />
        <div className="absolute inset-0 bg-gradient-to-b from-background/40 via-transparent to-primary/10" />
      </div>

      <header className="absolute left-5 top-5 z-20 md:left-10 md:top-10">
        <img src={logoImg} alt="YODO You Only Dance Once" className="w-[150px] rounded-2xl bg-background/80 p-2 backdrop-blur-sm md:w-[220px] md:p-3" />
      </header>

      <div className="absolute right-5 top-5 z-20 md:right-10 md:top-10">
        <LangToggle signedIn={false} className="border border-white/50 bg-card/80 shadow-soft backdrop-blur-xl" />
      </div>

      <div className="relative z-10 flex min-h-screen items-center justify-center px-4 py-24">
        <div className="w-full max-w-[400px]">
          {needsSetup ? <SetupCard onDone={signedIn} /> : pin?.on && !usePassword ? (
            <Card className="rounded-3xl border border-white/50 bg-card/95 px-6 py-8 shadow-soft" /* no blur behind the PIN pad: it slowed taps on phones */>
              <PinLogin name={pin.name ?? ""} onPassword={() => setUsePassword(true)} onSignedIn={signedIn} />
            </Card>
          ) : (
          <Card className="gap-6 rounded-3xl border border-white/50 bg-card/80 p-8 shadow-soft backdrop-blur-xl">
            <div>
              <h1 className="font-display text-3xl font-bold">{L("ยินดีต้อนรับกลับ", "Welcome Back")}</h1>
              <p className="mt-1 text-sm text-muted-foreground">{L("เข้าสู่ระบบเพื่อใช้งาน YODO", "Sign in to continue to YODO")}</p>
            </div>
            <form onSubmit={submit} className="space-y-4" noValidate>
              <div className="space-y-2">
                <Label htmlFor="identifier">{L("ชื่อผู้ใช้ / อีเมล", "Username / Email")}</Label>
                <Input id="identifier" autoComplete="username" value={identifier} aria-invalid={!!errors.identifier} onChange={(e) => setIdentifier(e.target.value)} />
                {errors.identifier && <p className="text-xs text-destructive">{errors.identifier}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">{L("รหัสผ่าน", "Password")}</Label>
                <div className="relative">
                  <Input id="password" type={show ? "text" : "password"} autoComplete="current-password" className="pr-10" value={password} aria-invalid={!!errors.password} onChange={(e) => setPassword(e.target.value)} />
                  <button type="button" onClick={() => setShow((s) => !s)} aria-label={show ? L("ซ่อนรหัสผ่าน", "Hide password") : L("แสดงรหัสผ่าน", "Show password")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                    {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {errors.password && <p className="text-xs text-destructive">{errors.password}</p>}
              </div>
              <div className="flex items-center justify-between text-sm">
                <label className="flex cursor-pointer items-center gap-2">
                  <Checkbox checked={remember} onCheckedChange={(v) => setRemember(v === true)} /> {L("จดจำฉันไว้", "Remember me")}
                </label>
                <button type="button" className="text-primary hover:underline" onClick={() => toast.info(L("กรุณาติดต่อผู้ดูแลระบบเพื่อรีเซ็ตรหัสผ่าน", "Please ask an administrator to reset your password"))}>{L("ลืมรหัสผ่าน?", "Forgot password?")}</button>
              </div>
              {formError && <p className="rounded-2xl bg-destructive/10 px-3 py-2 text-sm text-destructive">{formError}</p>}
              <Button type="submit" className="w-full rounded-full" disabled={loading}>
                {loading && <Loader2 className="h-4 w-4 animate-spin" />} {L("เข้าสู่ระบบ", "Sign In")}
              </Button>
            </form>
            {googleId && <GoogleButton clientId={googleId} onSignedIn={signedIn} onError={setFormError} />}
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
    if (!f.code.trim() || !f.firstName.trim() || !f.username.trim()) { setErr(L("กรุณากรอกให้ครบ", "Please fill in every field")); return; }
    if (f.password.length < 6) { setErr(L("รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร", "The password needs at least 6 characters")); return; }
    if (f.password !== f.confirm) { setErr(L("ยืนยันรหัสผ่านไม่ตรงกัน", "The passwords do not match")); return; }
    setBusy(true);
    try {
      await api("/setup", { body: { code: f.code.trim(), firstName: f.firstName, lastName: f.lastName, username: f.username, password: f.password } });
      await onDone();
    } catch (x) { setErr(errorText(x)); setBusy(false); }
  };
  return (
    <Card className="gap-5 rounded-3xl border border-white/50 bg-card/80 p-8 shadow-soft backdrop-blur-xl">
      <div>
        <h1 className="font-display text-3xl font-bold">{L("ตั้งค่าครั้งแรก", "First-time setup")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{L("สร้างบัญชีผู้ดูแลระบบ (SuperAdmin) รหัสตั้งค่าอยู่ในไฟล์ setup-code.txt ในโฟลเดอร์ data บน NAS", "Create the administrator (SuperAdmin) account. The setup code is in the file setup-code.txt in the data folder on the NAS.")}</p>
      </div>
      <form onSubmit={submit} className="space-y-3" noValidate>
        <div className="space-y-2"><Label htmlFor="s-code">{L("รหัสตั้งค่า (8 หลัก)", "Setup code (8 digits)")}</Label><Input id="s-code" inputMode="numeric" value={f.code} onChange={(e) => set("code", e.target.value)} /></div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2"><Label htmlFor="s-first">{L("ชื่อ", "First name")}</Label><Input id="s-first" value={f.firstName} onChange={(e) => set("firstName", e.target.value)} /></div>
          <div className="space-y-2"><Label htmlFor="s-last">{L("นามสกุล", "Last name")}</Label><Input id="s-last" value={f.lastName} onChange={(e) => set("lastName", e.target.value)} /></div>
        </div>
        <div className="space-y-2"><Label htmlFor="s-user">{L("ชื่อผู้ใช้", "Username")}</Label><Input id="s-user" autoComplete="username" value={f.username} onChange={(e) => set("username", e.target.value)} /></div>
        <div className="space-y-2"><Label htmlFor="s-pw">{L("รหัสผ่าน", "Password")}</Label><Input id="s-pw" type="password" autoComplete="new-password" value={f.password} onChange={(e) => set("password", e.target.value)} /></div>
        <div className="space-y-2"><Label htmlFor="s-pw2">{L("ยืนยันรหัสผ่าน", "Confirm password")}</Label><Input id="s-pw2" type="password" autoComplete="new-password" value={f.confirm} onChange={(e) => set("confirm", e.target.value)} /></div>
        {err && <p className="rounded-2xl bg-destructive/10 px-3 py-2 text-sm text-destructive">{err}</p>}
        <Button type="submit" className="w-full rounded-full" disabled={busy}>{busy && <Loader2 className="h-4 w-4 animate-spin" />} {L("สร้างบัญชี", "Create account")}</Button>
      </form>
    </Card>
  );
}

// Google's own "Continue with Google" button; only shown when the SuperAdmin pasted the school's client ID.
function GoogleButton({ clientId, onSignedIn, onError }: { clientId: string; onSignedIn: () => Promise<void>; onError: (m: string) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    loadGoogle().then((g) => {
      if (!live || !box.current) return;
      g.accounts.id.initialize({
        client_id: clientId,
        callback: async ({ credential }) => {
          onError("");
          try { await api("/auth/google", { body: { credential } }); await onSignedIn(); }
          catch (e) { onError(errorText(e)); }
        },
      });
      g.accounts.id.renderButton(box.current, { theme: "outline", size: "large", shape: "pill", text: "continue_with", locale: getLang(), width: Math.min(336, box.current.clientWidth || 336) });
    }).catch(() => setFailed(true));
    return () => { live = false; };
  }, [clientId]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 text-xs text-muted-foreground"><span className="h-px flex-1 bg-border" />{L("หรือ", "or")}<span className="h-px flex-1 bg-border" /></div>
      <div ref={box} className="flex min-h-10 justify-center" />
      {failed && <p className="text-center text-xs text-muted-foreground">{L("โหลดปุ่ม Google ไม่ได้ ตรวจอินเทอร์เน็ตแล้วลองใหม่", "Could not load the Google button. Check the internet and try again.")}</p>}
    </div>
  );
}
