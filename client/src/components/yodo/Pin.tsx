import { useEffect, useRef, useState, type ReactNode } from "react";
import { Delete, Lock, ScanFace, Timer, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { NativeSelect } from "@/components/yodo/ui";
import { api, ApiError, errorText } from "@/lib/api";
import { addPasskey, cancelled, forgetPasskeyOnThisDevice, passkeyOnThisDevice, passkeyPossible, signInWithPasskey } from "@/lib/signin";
import { cn } from "@/lib/utils";

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
  useEffect(() => { if (error) { setPin(""); setShake(true); const x = setTimeout(() => setShake(false), 400); return () => clearTimeout(x); }   return undefined; }, [error]);
  const press = (d: string) => {
    if (busy || pin.length >= max) return;
    const next = pin + d;
    setPin(next);
    if (length && next.length === length) setTimeout(() => { onDone(next); setPin(""); }, 120);
  };
  // A computer keyboard works too.
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (/^\d$/.test(e.key)) press(e.key);
      else if (e.key === "Backspace") setPin((p) => p.slice(0, -1));
      else if (e.key === "Enter" && !length && pin.length >= 4) onDone(pin);
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  });
  const keyCls = "flex h-16 w-16 items-center justify-center rounded-full border border-border bg-card text-2xl font-semibold transition-colors hover:bg-accent active:bg-accent";
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="text-center">
        <p className="font-semibold">{title}</p>
        {sub && <p className="text-sm text-muted-foreground">{sub}</p>}
      </div>
      <div className={cn("flex gap-3.5 py-1", shake && "animate-[yodo-shake_0.4s]")} aria-label={`ใส่แล้ว ${pin.length} หลัก`}>
        {Array.from({ length: max }, (_, i) => <i key={i} className={cn("h-3.5 w-3.5 rounded-full border-2 border-primary", i < pin.length && "bg-primary")} />)}
      </div>
      <p className="min-h-5 text-center text-sm text-destructive" role="alert">{error ?? ""}</p>
      <div className="grid grid-cols-3 gap-3">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => <button key={d} type="button" className={keyCls} onClick={() => press(d)}>{d}</button>)}
        {onFace ? <button type="button" className={cn(keyCls, "border-0 bg-transparent text-primary")} onClick={onFace} aria-label="Face ID"><ScanFace className="h-7 w-7" /></button>
          : !length && pin.length >= 4 ? <button type="button" className={cn(keyCls, "border-0 bg-transparent text-base text-primary")} onClick={() => onDone(pin)}>ตกลง</button> : <span />}
        <button type="button" className={keyCls} onClick={() => press("0")}>0</button>
        <button type="button" className={cn(keyCls, "border-0 bg-transparent text-muted-foreground")} onClick={() => setPin((p) => p.slice(0, -1))} aria-label="ลบ"><Delete className="h-6 w-6" /></button>
      </div>
      {footer}
    </div>
  );
}

// ---------- signed out on a device with a PIN: the pad first ----------
export function PinLogin({ name, onPassword, onSignedIn }: { name: string; onPassword: () => void; onSignedIn: () => void }) {
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
    try { await api("/auth/pin", { body: { pin } }); onSignedIn(); }
    catch (e) {
      const code = e instanceof ApiError ? e.code : "";
      if (code === "pin_locked" || code === "pin_off") { write("pin-len", null); onPassword(); toast.error(errorText(e)); }
      else setErr(errorText(e));
    } finally { setBusy(false); }
  };
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="mb-1 flex h-14 w-14 items-center justify-center rounded-full bg-accent font-display text-2xl font-bold text-accent-foreground">{name.slice(0, 1).toUpperCase()}</div>
      <PinPad title={`สวัสดีคุณ ${name}`} sub="ใส่ PIN เพื่อเข้าใช้งาน" length={pinLength()} onDone={done} error={err} busy={busy} onFace={face ? tryFace : undefined}
        footer={<button type="button" className="mt-1 text-sm text-primary hover:underline" onClick={onPassword}>เข้าด้วย Username และรหัสผ่าน</button>} />
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
    if (pin !== first) { setFirst(""); setErr("PIN ไม่ตรงกัน เริ่มใหม่อีกครั้ง"); return; }
    try { await api("/me/pin", { body: { pin } }); write("pin-len", String(pin.length)); onDone(); }
    catch (e) { setFirst(""); setErr(errorText(e)); }
  };
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm rounded-3xl">
        <DialogHeader>
          <DialogTitle className="text-center">ตั้ง PIN สำหรับเครื่องนี้</DialogTitle>
          <DialogDescription className="text-center">ครั้งหน้าเปิดแอปบนเครื่องนี้ ใส่ PIN แทนรหัสผ่านได้ PIN ใช้ได้เฉพาะเครื่องนี้ เครื่องอื่นต้องตั้งเอง</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col items-center gap-3">
          {!first && (
            <div className="flex rounded-full bg-muted p-1" role="radiogroup" aria-label="จำนวนหลัก">
              {[4, 6].map((n) => (
                <button key={n} type="button" role="radio" aria-checked={len === n} onClick={() => setLen(n)}
                  className={cn("rounded-full px-5 py-1 text-sm", len === n ? "bg-card font-semibold shadow-sm" : "text-muted-foreground")}>{n} หลัก</button>
              ))}
            </div>
          )}
          <PinPad key={`${len}-${first ? 2 : 1}`} title={first ? "กด PIN อีกครั้งเพื่อยืนยัน" : `ตั้ง PIN ${len} หลัก`} length={len} onDone={done} error={err} />
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---------- Settings: "การเข้าสู่ระบบของฉัน" ----------
type Pk = { id: number; deviceName: string; createdAt: string; lastUsedAt: string | null };
const d2 = (n: number) => String(n).padStart(2, "0");
const fdt = (s: string) => { const d = new Date(s); return `${d2(d.getDate())}/${d2(d.getMonth() + 1)}/${d.getFullYear()} ${d2(d.getHours())}:${d2(d.getMinutes())}`; };

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
      setOn(false); toast.success("ปิด PIN บนเครื่องนี้แล้ว");
    } catch (e) { fail(e); }
  };
  const faceOn = async () => { try { await addPasskey(); setFace(true); load(); toast.success("เปิด Face ID แล้ว"); } catch (e) { fail(e); } };
  const faceOff = () => { forgetPasskeyOnThisDevice(); setFace(false); toast.success("ปิด Face ID บนเครื่องนี้แล้ว"); };
  const remove = async (p: Pk) => { try { await api(`/me/passkeys/${p.id}`, { method: "DELETE" }); load(); } catch (e) { fail(e); } };
  const len = pinLength();
  return (
    <div className="flex flex-col">
      <Row icon={<Lock className="h-4 w-4" />} title="PIN บนเครื่องนี้" sub={on ? <>เปิดอยู่{len ? ` · ${len} หลัก` : ""} · <button type="button" className="text-primary hover:underline" onClick={() => setSetup(true)}>เปลี่ยน PIN</button></> : "ใส่ตัวเลขแทนรหัสผ่าน"}>
        <Switch checked={!!on} disabled={on === null} onCheckedChange={(v) => (v ? setSetup(true) : void pinOff())} aria-label="PIN บนเครื่องนี้" />
      </Row>
      {passkeyPossible() && (
        <Row icon={<ScanFace className="h-4 w-4" />} title="Face ID / สแกนนิ้ว" sub={on ? "บนเครื่องนี้" : "เปิดได้หลังตั้ง PIN"}>
          <Switch checked={face && !!on} disabled={!on} onCheckedChange={(v) => (v ? void faceOn() : faceOff())} aria-label="Face ID" />
        </Row>
      )}
      {on && (
        <Row icon={<Timer className="h-4 w-4" />} title="ล็อกแอปอัตโนมัติ">
          <div className="w-40"><NativeSelect value={String(lock)} onValueChange={(v) => { const m = Number(v); setLockMinutes(m); setLock(m); }}>
            {[-1, 0, 1, 5, 15, 30, 60].map((m) => <option key={m} value={String(m)}>{m < 0 ? "ไม่ล็อก" : m === 0 ? "เมื่อออกจากแอป" : `หลัง ${m} นาที`}</option>)}
          </NativeSelect></div>
        </Row>
      )}
      {pks.length > 0 && (
        <div className="border-t border-border px-5 py-3">
          <p className="mb-1 text-xs text-muted-foreground">เครื่องที่เปิด Face ID ไว้</p>
          {pks.map((p) => (
            <div key={p.id} className="flex items-center gap-2 py-1 text-sm">
              <ScanFace className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1"><span className="font-medium">{p.deviceName || "-"}</span>
                <span className="block text-xs text-muted-foreground">{p.lastUsedAt ? `ใช้ล่าสุด ${fdt(p.lastUsedAt)}` : `เพิ่มเมื่อ ${fdt(p.createdAt)}`}</span></span>
              <button type="button" className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs text-destructive hover:bg-destructive/10" onClick={() => remove(p)}><Trash2 className="h-3.5 w-3.5" />ลบ</button>
            </div>
          ))}
        </div>
      )}
      {children}
      <PinSetup open={setup} onClose={() => setSetup(false)} onDone={() => { setSetup(false); setOn(true); toast.success("ตั้ง PIN แล้ว"); }} />
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
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background px-4" role="dialog" aria-modal="true" aria-label="แอปถูกล็อก">
      <PinPad title={`แอปถูกล็อก คุณ ${name}`} sub="ใส่ PIN เพื่อใช้งานต่อ" length={pinLength()} onDone={done} error={err} busy={busy} onFace={face}
        footer={<button type="button" className="mt-1 text-sm text-primary hover:underline" onClick={() => { write("locked", null); onLogout(); }}>ออกจากระบบ</button>} />
    </div>
  );
}
