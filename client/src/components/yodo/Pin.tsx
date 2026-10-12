import { useEffect, useRef, useState, type ReactNode } from "react";
import { Delete, Loader2, Lock, ScanFace, Timer, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { NativeSelect } from "@/components/yodo/ui";
import { api, ApiError, errorText } from "@/lib/api";
import { addPasskey, cancelled, forgetPasskeyOnThisDevice, passkeyOnThisDevice, passkeyPossible, signInWithPasskey } from "@/lib/signin";
import { cn } from "@/lib/utils";
import { fdt, L } from "@/lib/i18n";

// PIN sign-in and app lock, copied from FinHR (owner's decision 12/10/2026): each person picks 4 or 6 digits,
// Face ID only after a PIN, auto-lock off unless the person turns it on. What this device remembers locally:
// that a PIN is on, its length (to finish without an OK key) and the auto-lock time.
const key = (k: string) => `yodo-${k}`;
const read = (k: string) => { try { return localStorage.getItem(key(k)); } catch { return null; } };
const write = (k: string, v: string | null) => { try { if (v === null) localStorage.removeItem(key(k)); else localStorage.setItem(key(k), v); } catch { /* private mode */ } };
export const pinLength = () => Number(read("pin-len")) || 0;
export const lockMinutes = () => { const v = read("lock"); return v === null ? -1 : Number(v); }; // -1 = never
const setLockMinutes = (m: number) => write("lock", m < 0 ? null : String(m));
export function markSignedOut() { write("fresh", "1"); }

// ---------- the pad ----------
export function PinPad({ title, sub, length, onDone, error, busy, onFace, footer }: {
  title: string; sub?: string; length: number; onDone: (pin: string) => void; error?: string | undefined; busy?: boolean; onFace?: (() => void) | undefined; footer?: ReactNode;
}) {
  const [pin, setPin] = useState("");
  const [shake, setShake] = useState(false);
  const max = length || 6;
  // The typed digits also live in a ref so fast taps never read an old value (owner 12/10/2026: the pad felt slow).
  const typed = useRef("");
  const put = (v: string) => { typed.current = v; setPin(v); };
  useEffect(() => { if (error) { put(""); setShake(true); const x = setTimeout(() => setShake(false), 400); return () => clearTimeout(x); }   return undefined; }, [error]);
  const press = (d: string) => {
    if (busy || typed.current.length >= max) return;
    const next = typed.current + d;
    put(next);
    if (length && next.length === length) setTimeout(() => { onDone(next); put(""); }, 80);
  };
  const back = () => put(typed.current.slice(0, -1));
  // Keys react when the finger touches (not when it lifts); a keyboard "click" (detail 0) still works.
  const tap = (fn: () => void) => ({
    onPointerDown: (e: React.PointerEvent) => { e.preventDefault(); fn(); },
    onClick: (e: React.MouseEvent) => { if (e.detail === 0) fn(); },
  });
  // A computer keyboard works too.
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (/^\d$/.test(e.key)) press(e.key);
      else if (e.key === "Backspace") back();
      else if (e.key === "Enter" && !length && pin.length >= 4) onDone(pin);
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  });
  const keyCls = "flex h-[76px] w-[76px] touch-manipulation select-none items-center justify-center rounded-full border border-border bg-card text-[28px] font-semibold active:scale-95 active:bg-accent [@media(hover:hover)]:hover:bg-accent";
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="text-center">
        <p className="text-lg font-semibold">{title}</p>
        {sub && <p className="text-sm text-muted-foreground">{sub}</p>}
      </div>
      <div className={cn("flex h-6 items-center gap-4 py-1", shake && "animate-[yodo-shake_0.4s]")} aria-label={L(`ใส่แล้ว ${pin.length} หลัก`, `${pin.length} digits entered`)}>
        {busy ? <Loader2 className="h-6 w-6 animate-spin text-primary" aria-label={L("กำลังตรวจ", "Checking")} />
          : Array.from({ length: max }, (_, i) => <i key={i} className={cn("h-4 w-4 rounded-full border-2 border-primary", i < pin.length && "bg-primary")} />)}
      </div>
      <p className="min-h-5 text-center text-sm text-destructive" role="alert">{error ?? ""}</p>
      <div className="grid grid-cols-3 gap-x-6 gap-y-4">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => <button key={d} type="button" className={keyCls} {...tap(() => press(d))}>{d}</button>)}
        {onFace ? <button type="button" className={cn(keyCls, "border-0 bg-transparent text-primary")} onClick={onFace} aria-label="Face ID"><ScanFace className="h-8 w-8" /></button>
          : !length && pin.length >= 4 ? <button type="button" className={cn(keyCls, "border-0 bg-transparent text-base text-primary")} onClick={() => onDone(pin)}>{L("ตกลง", "OK")}</button> : <span />}
        <button type="button" className={keyCls} {...tap(() => press("0"))}>0</button>
        <button type="button" className={cn(keyCls, "border-0 bg-transparent text-muted-foreground")} {...tap(back)} aria-label={L("ลบ", "Delete")}><Delete className="h-7 w-7" /></button>
      </div>
      {footer}
    </div>
  );
}

// ---------- signed out on a device with a PIN: the pad first ----------
export function PinLogin({ name, onPassword, onSignedIn }: { name: string; onPassword: () => void; onSignedIn: () => void | Promise<void> }) {
  const [err, setErr] = useState<string>();
  const [busy, setBusy] = useState(false);
  const face = passkeyPossible() && passkeyOnThisDevice();
  const tried = useRef(false);
  const tryFace = async () => {
    setErr(undefined);
    try { await signInWithPasskey(); onSignedIn(); }
    catch (e) { if (!cancelled(e)) setErr(errorText(e)); }
  };
  // Face ID straight away (an iPhone may want one tap on the Face ID key first).
  useEffect(() => { if (face && !tried.current) { tried.current = true; void tryFace(); } }); // eslint-disable-line react-hooks/exhaustive-deps
  const done = async (pin: string) => {
    setBusy(true); setErr(undefined);
    try { await api("/auth/pin", { body: { pin } }); await onSignedIn(); }
    catch (e) {
      const code = e instanceof ApiError ? e.code : "";
      if (code === "pin_locked" || code === "pin_off") { write("pin-len", null); onPassword(); toast.error(errorText(e)); }
      else setErr(errorText(e));
    } finally { setBusy(false); }
  };
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="mb-1 flex h-14 w-14 items-center justify-center rounded-full bg-accent font-display text-2xl font-bold text-accent-foreground">{name.slice(0, 1).toUpperCase()}</div>
      <PinPad title={L(`สวัสดีคุณ ${name}`, `Hello, ${name}`)} sub={L("ใส่ PIN เพื่อเข้าใช้งาน", "Enter your PIN to sign in")} length={pinLength()} onDone={done} error={err} busy={busy} onFace={face ? tryFace : undefined}
        footer={<button type="button" className="mt-1 text-sm text-primary hover:underline" onClick={onPassword}>{L("เข้าด้วยชื่อผู้ใช้และรหัสผ่าน", "Sign in with username and password")}</button>} />
    </div>
  );
}

// ---------- signed in: set a PIN (enter twice) ----------
function PinSetup({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const [len, setLen] = useState(4);
  const [first, setFirst] = useState("");
  const [err, setErr] = useState<string>();
  useEffect(() => { if (open) { setFirst(""); setErr(undefined); } }, [open]);
  const done = async (pin: string) => {
    if (!first) { setFirst(pin); setErr(undefined); return; }
    if (pin !== first) { setFirst(""); setErr(L("PIN ไม่ตรงกัน เริ่มใหม่อีกครั้ง", "The PINs do not match. Please start again")); return; }
    try { await api("/me/pin", { body: { pin } }); write("pin-len", String(pin.length)); onDone(); }
    catch (e) { setFirst(""); setErr(errorText(e)); }
  };
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm rounded-3xl">
        <DialogHeader>
          <DialogTitle className="text-center">{L("ตั้ง PIN สำหรับเครื่องนี้", "Set a PIN for this device")}</DialogTitle>
          <DialogDescription className="text-center">{L("ครั้งหน้าเปิดแอปบนเครื่องนี้ ใส่ PIN แทนรหัสผ่านได้ PIN ใช้ได้เฉพาะเครื่องนี้ เครื่องอื่นต้องตั้งเอง", "Next time you open the app on this device, you can enter the PIN instead of your password. The PIN works only on this device; other devices need their own.")}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col items-center gap-3">
          {!first && (
            <div className="flex rounded-full bg-muted p-1" role="radiogroup" aria-label={L("จำนวนหลัก", "Number of digits")}>
              {[4, 6].map((n) => (
                <button key={n} type="button" role="radio" aria-checked={len === n} onClick={() => setLen(n)}
                  className={cn("rounded-full px-5 py-1 text-sm", len === n ? "bg-card font-semibold shadow-sm" : "text-muted-foreground")}>{L(`${n} หลัก`, `${n} digits`)}</button>
              ))}
            </div>
          )}
          <PinPad key={`${len}-${first ? 2 : 1}`} title={first ? L("กด PIN อีกครั้งเพื่อยืนยัน", "Enter the PIN again to confirm") : L(`ตั้ง PIN ${len} หลัก`, `Set a ${len}-digit PIN`)} length={len} onDone={done} error={err} />
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---------- Settings: "การเข้าสู่ระบบของฉัน" ----------
type Pk = { id: number; deviceName: string; createdAt: string; lastUsedAt: string | null };

export function Row({ icon, title, sub, children }: { icon: ReactNode; title: string; sub?: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex items-center gap-3 border-t border-border px-5 py-3 first:border-t-0">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground">{icon}</span>
      <div className="min-w-0 flex-1"><p className="text-sm font-medium">{title}</p>{sub && <div className="text-xs text-muted-foreground">{sub}</div>}</div>
      {children}
    </div>
  );
}

export function SecurityCard({ children }: { children?: ReactNode }) {
  const [on, setOn] = useState<boolean | null>(null);
  const [pks, setPks] = useState<Pk[]>([]);
  const [setup, setSetup] = useState(false);
  const [face, setFace] = useState(passkeyOnThisDevice());
  const [lock, setLock] = useState(lockMinutes());
  const load = () => {
    api<{ on: boolean }>("/me/pin").then((r) => setOn(r.on)).catch(() => setOn(false));
    api<Pk[]>("/me/passkeys").then(setPks).catch(() => null);
  };
  useEffect(load, []);
  const fail = (e: unknown) => { if (!cancelled(e)) toast.error(errorText(e)); };
  const pinOff = async () => {
    try {
      await api("/me/pin", { method: "DELETE" }); write("pin-len", null); setLockMinutes(-1); setLock(-1);
      forgetPasskeyOnThisDevice(); setFace(false); // Face ID needs a PIN (owner's rule)
      setOn(false); toast.success(L("ปิด PIN บนเครื่องนี้แล้ว", "PIN turned off on this device"));
    } catch (e) { fail(e); }
  };
  const faceOn = async () => { try { await addPasskey(); setFace(true); load(); toast.success(L("เปิด Face ID แล้ว", "Face ID turned on")); } catch (e) { fail(e); } };
  const faceOff = () => { forgetPasskeyOnThisDevice(); setFace(false); toast.success(L("ปิด Face ID บนเครื่องนี้แล้ว", "Face ID turned off on this device")); };
  const remove = async (p: Pk) => { try { await api(`/me/passkeys/${p.id}`, { method: "DELETE" }); load(); } catch (e) { fail(e); } };
  const len = pinLength();
  return (
    <div className="flex flex-col">
      <Row icon={<Lock className="h-4 w-4" />} title={L("PIN บนเครื่องนี้", "PIN on this device")} sub={on ? <>{L("เปิดอยู่", "On")}{len ? ` · ${L(`${len} หลัก`, `${len} digits`)}` : ""} · <button type="button" className="text-primary hover:underline" onClick={() => setSetup(true)}>{L("เปลี่ยน PIN", "Change PIN")}</button></> : L("ใส่ตัวเลขแทนรหัสผ่าน", "Enter numbers instead of a password")}>
        <Switch checked={!!on} disabled={on === null} onCheckedChange={(v) => (v ? setSetup(true) : void pinOff())} aria-label={L("PIN บนเครื่องนี้", "PIN on this device")} />
      </Row>
      {passkeyPossible() && (
        <Row icon={<ScanFace className="h-4 w-4" />} title={L("Face ID / สแกนนิ้ว", "Face ID / fingerprint")} sub={on ? L("บนเครื่องนี้", "On this device") : L("เปิดได้หลังตั้ง PIN", "Available after you set a PIN")}>
          <Switch checked={face && !!on} disabled={!on} onCheckedChange={(v) => (v ? void faceOn() : faceOff())} aria-label="Face ID" />
        </Row>
      )}
      {on && (
        <Row icon={<Timer className="h-4 w-4" />} title={L("ล็อกแอปอัตโนมัติ", "Auto-lock")}>
          <div className="w-40"><NativeSelect value={String(lock)} onValueChange={(v) => { const m = Number(v); setLockMinutes(m); setLock(m); }}>
            {[-1, 0, 1, 5, 15, 30, 60].map((m) => <option key={m} value={String(m)}>{m < 0 ? L("ไม่ล็อก", "Never") : m === 0 ? L("เมื่อออกจากแอป", "When I leave the app") : L(`หลัง ${m} นาที`, m === 1 ? "After 1 minute" : `After ${m} minutes`)}</option>)}
          </NativeSelect></div>
        </Row>
      )}
      {pks.length > 0 && (
        <div className="border-t border-border px-5 py-3">
          <p className="mb-1 text-xs text-muted-foreground">{L("เครื่องที่เปิด Face ID ไว้", "Devices with Face ID on")}</p>
          {pks.map((p) => (
            <div key={p.id} className="flex items-center gap-2 py-1 text-sm">
              <ScanFace className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1"><span className="font-medium">{p.deviceName || "-"}</span>
                <span className="block text-xs text-muted-foreground">{p.lastUsedAt ? L(`ใช้ล่าสุด ${fdt(p.lastUsedAt)}`, `Last used ${fdt(p.lastUsedAt)}`) : L(`เพิ่มเมื่อ ${fdt(p.createdAt)}`, `Added ${fdt(p.createdAt)}`)}</span></span>
              <button type="button" className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs text-destructive hover:bg-destructive/10" onClick={() => remove(p)}><Trash2 className="h-3.5 w-3.5" />{L("ลบ", "Remove")}</button>
            </div>
          ))}
        </div>
      )}
      {children}
      <PinSetup open={setup} onClose={() => setSetup(false)} onDone={() => { setSetup(false); setOn(true); toast.success(L("ตั้ง PIN แล้ว", "PIN set")); }} />
    </div>
  );
}

// ---------- auto-lock ----------
// Leaving the app notes the time; coming back after the chosen minutes shows the PIN pad over everything.
// "When I leave the app" still allows 15 seconds, so taking a photo of a receipt does not lock the app.
export function AutoLock({ name, onLogout }: { name: string; onLogout: () => void }) {
  const [on, setOn] = useState(false);
  const [locked, setLocked] = useState(false);
  const [err, setErr] = useState<string>();
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (pinLength()) api<{ on: boolean }>("/me/pin").then((r) => setOn(r.on)).catch(() => null); }, []);
  useEffect(() => {
    if (!on) return;
    const due = () => {
      const m = lockMinutes(), at = Number(read("away-at"));
      return m >= 0 && at > 0 && Date.now() - at >= Math.max(15e3, m * 60e3);
    };
    // The lock is remembered on the device, so reloading or reopening the app cannot skip it.
    const lock = () => { write("locked", "1"); setLocked(true); };
    if (read("fresh") === "1") { write("fresh", null); write("locked", null); write("away-at", null); } // just signed in
    else if (read("locked") === "1" || due()) lock();
    const vis = () => {
      if (read("locked") === "1") return;
      if (document.visibilityState === "hidden") write("away-at", String(Date.now()));
      else { if (due()) lock(); write("away-at", null); }
    };
    const gone = () => { if (read("locked") !== "1") write("away-at", String(Date.now())); };
    document.addEventListener("visibilitychange", vis);
    window.addEventListener("pagehide", gone);
    return () => { document.removeEventListener("visibilitychange", vis); window.removeEventListener("pagehide", gone); };
  }, [on]);
  if (!locked) return null;
  const unlock = () => { write("locked", null); write("away-at", null); setLocked(false); setErr(undefined); };
  const done = async (p: string) => {
    setBusy(true);
    try { await api("/me/pin/check", { body: { pin: p } }); unlock(); }
    catch (e) {
      const code = e instanceof ApiError ? e.code : "";
      if (code === "pin_locked" || code === "unauthenticated") { write("pin-len", null); write("locked", null); window.location.assign("/auth"); return; }
      setErr(errorText(e));
    } finally { setBusy(false); }
  };
  const face = passkeyPossible() && passkeyOnThisDevice()
    ? async () => { try { await signInWithPasskey(); unlock(); } catch (e) { if (!cancelled(e)) setErr(errorText(e)); } }
    : undefined;
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background px-4" role="dialog" aria-modal="true" aria-label={L("แอปถูกล็อก", "App locked")}>
      <PinPad title={L(`แอปถูกล็อก คุณ ${name}`, `App locked, ${name}`)} sub={L("ใส่ PIN เพื่อใช้งานต่อ", "Enter your PIN to continue")} length={pinLength()} onDone={done} error={err} busy={busy} onFace={face}
        footer={<button type="button" className="mt-1 text-sm text-primary hover:underline" onClick={() => { write("locked", null); onLogout(); }}>{L("ออกจากระบบ", "Sign out")}</button>} />
    </div>
  );
}
