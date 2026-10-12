import { useEffect, useState } from "react";
import { BellRing, CalendarHeart, CheckCircle2, Clock, Monitor, Smartphone, Trash2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Row } from "@/components/yodo/Pin";
import { api, errorText } from "@/lib/api";
import { L, fdt } from "@/lib/i18n";
import { isIos, isStandalone, pushAllowedHere, subscribePush } from "@/lib/push-client";

// "Notifications" card on the profile settings page (owner 12/10/2026): this device's state, my devices with a
// test, the kinds I want, and (SuperAdmin) how many days before a class ends the warning goes out.
type Device = { id: number; label: string; createdAt: string; lastOkAt: string | null };
type Kind = "enrollment" | "schedule" | "expiry";
type State = "unsupported" | "install" | "denied" | "off" | "on";

function deviceState(subscribed: boolean): State {
  if (isIos() && !isStandalone()) return "install";
  if (typeof Notification === "undefined" || !pushAllowedHere()) return "unsupported";
  if (Notification.permission === "denied") return "denied";
  return Notification.permission === "granted" && subscribed ? "on" : "off";
}

export function NoticeSettings({ superadmin }: { superadmin: boolean }) {
  const [devices, setDevices] = useState<Device[]>([]);
  const [off, setOff] = useState<Kind[]>([]);
  const [days, setDays] = useState(7);
  const [daysText, setDaysText] = useState("7");
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);
  const load = () => {
    api<Device[]>("/push/devices").then(setDevices).catch(() => null);
    api<{ off: Kind[]; expiryDays: number }>("/me/notices").then((r) => { setOff(r.off); setDays(r.expiryDays); setDaysText(String(r.expiryDays)); }).catch(() => null);
  };
  useEffect(() => {
    load();
    // Re-registers this device when permission was already given (also repairs a device the server lost).
    if (typeof Notification !== "undefined" && Notification.permission === "granted" && pushAllowedHere())
      subscribePush().then((ok) => { setSubscribed(ok); load(); }).catch(() => null);
  }, []);
  const state = deviceState(subscribed);

  // Straight from the tap: iPhone refuses a subscribe that is not.
  const turnOn = async () => {
    const p = await Notification.requestPermission();
    if (p !== "granted") { toast.error(L("การแจ้งเตือนถูกปิด เปิดได้ในการตั้งค่าเครื่อง", "Notifications are blocked. Turn them on in the device settings")); setSubscribed(false); return; }
    const ok = await subscribePush().catch(() => false);
    setSubscribed(ok); load();
    if (ok) toast.success(L("เปิดการแจ้งเตือนบนเครื่องนี้แล้ว", "Notifications are on for this device"));
  };
  const test = async () => {
    setBusy(true);
    try {
      const r = await api<{ devices: number; results: { label: string; ok: boolean }[] }>("/push/test", { body: {} });
      if (!r.devices) toast.error(L("ยังไม่มีเครื่องที่รับแจ้งเตือน", "No device receives notifications yet"));
      else if (r.results.every((x) => x.ok)) toast.success(L(`ส่งทดสอบแล้ว ${r.results.length} เครื่อง`, `Test sent to ${r.results.length} device(s)`));
      else toast.error(L("ส่งไม่ถึงบางเครื่อง: ", "Could not reach: ") + r.results.filter((x) => !x.ok).map((x) => x.label || "-").join(", "));
      load();
    } catch (e) { toast.error(errorText(e)); }
    setBusy(false);
  };
  const removeDevice = async (d: Device) => { try { await api(`/push/devices/${d.id}`, { method: "DELETE" }); load(); } catch (e) { toast.error(errorText(e)); } };
  const setKind = async (k: Kind, on: boolean) => {
    const next = on ? off.filter((x) => x !== k) : [...off, k];
    setOff(next);
    try { await api("/me/notices", { method: "PUT", body: { off: next } }); } catch (e) { toast.error(errorText(e)); load(); }
  };
  const saveDays = async () => {
    const n = Number(daysText);
    if (!Number.isInteger(n) || n < 1 || n > 60) { toast.error(L("ใส่จำนวนวัน 1-60", "Enter 1 to 60 days")); return; }
    try { await api("/settings/notices", { method: "PUT", body: { expiryDays: n } }); setDays(n); toast.success(L("บันทึกแล้ว", "Saved")); } catch (e) { toast.error(errorText(e)); }
  };

  const STATE: Record<State, { text: string; tone: string }> = {
    on: { text: L("เครื่องนี้รับแจ้งเตือนอยู่", "This device receives notifications"), tone: "bg-success/15 text-success" },
    off: { text: L("เครื่องนี้ยังไม่ได้เปิดรับแจ้งเตือน", "Notifications are off on this device"), tone: "bg-muted text-muted-foreground" },
    denied: { text: L("การแจ้งเตือนถูกปิดในการตั้งค่าเครื่อง เปิดได้ที่ การตั้งค่า → การแจ้งเตือน", "Notifications are blocked in the device settings. Turn them on under Settings → Notifications"), tone: "bg-destructive/10 text-destructive" },
    install: { text: L("iPhone: กดแชร์ → \"เพิ่มไปยังหน้าจอโฮม\" แล้วเปิด YODO จากไอคอนบนหน้าจอโฮม จึงจะรับแจ้งเตือนได้", "iPhone: tap Share → \"Add to Home Screen\", then open YODO from the Home Screen icon to get notifications"), tone: "bg-accent text-accent-foreground" },
    unsupported: { text: L("เครื่องนี้หรือที่อยู่นี้รับแจ้งเตือนไม่ได้ (ต้องเปิดผ่านที่อยู่ https)", "This device or address cannot receive notifications (it needs the https address)"), tone: "bg-muted text-muted-foreground" },
  };
  const KINDS: { k: Kind; icon: typeof UserPlus; title: string; sub: string }[] = [
    { k: "enrollment", icon: UserPlus, title: L("ลงทะเบียนคลาส", "Class enrollments"), sub: L("ลงใหม่ หรือแก้ไข", "New or changed") },
    { k: "schedule", icon: CalendarHeart, title: L("ตารางเรียนใหม่", "New class sessions"), sub: L("เมื่อเพิ่มคาบเรียน", "When a session is added") },
    { k: "expiry", icon: Clock, title: L("คลาสใกล้หมดอายุ", "Class ending soon"), sub: L(`ล่วงหน้า ${days} วัน`, `${days} days before`) },
  ];
  const s = STATE[state];
  return (
    <div className="flex flex-col">
      <div className={`mx-5 mb-2 mt-1 flex items-start gap-2 rounded-2xl px-3 py-2 text-sm ${s.tone}`}>
        {state === "on" ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <BellRing className="mt-0.5 h-4 w-4 shrink-0" />}
        <span className="flex-1">{s.text}</span>
      </div>
      <div className="flex flex-wrap gap-2 px-5 pb-3">
        {state === "off" && <Button size="sm" className="rounded-full" onClick={turnOn}><BellRing className="h-4 w-4" />{L("เปิดการแจ้งเตือนบนเครื่องนี้", "Turn on for this device")}</Button>}
        {devices.length > 0 && <Button size="sm" variant="outline" className="rounded-full" disabled={busy} onClick={test}>{L("ส่งทดสอบ", "Send a test")}</Button>}
      </div>
      {devices.map((d) => (
        <Row key={d.id} icon={/iphone|ipad|android/i.test(d.label) ? <Smartphone className="h-4 w-4" /> : <Monitor className="h-4 w-4" />} title={d.label || L("เครื่องนี้", "Device")}
          sub={d.lastOkAt ? L(`ส่งถึงล่าสุด ${fdt(d.lastOkAt)}`, `Last reached ${fdt(d.lastOkAt)}`) : L(`เพิ่มเมื่อ ${fdt(d.createdAt)}`, `Added ${fdt(d.createdAt)}`)}>
          <button type="button" aria-label={L("เอาเครื่องนี้ออก", "Remove this device")} className="rounded-full p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" onClick={() => removeDevice(d)}><Trash2 className="h-4 w-4" /></button>
        </Row>
      ))}
      <p className="border-t border-border px-5 pb-1 pt-3 text-xs font-semibold text-muted-foreground">{L("เรื่องที่อยากรับ", "What I want to hear about")}</p>
      {KINDS.map(({ k, icon: Icon, title, sub }) => (
        <Row key={k} icon={<Icon className="h-4 w-4" />} title={title} sub={sub}>
          <Switch checked={!off.includes(k)} onCheckedChange={(v) => void setKind(k, v)} aria-label={title} />
        </Row>
      ))}
      {superadmin && (
        <div className="flex flex-wrap items-center gap-2 border-t border-border px-5 py-3 text-sm">
          <span className="flex-1">{L("เตือนคลาสใกล้หมดอายุล่วงหน้า (ทั้งโรงเรียน)", "Warn before a class ends (whole school)")}</span>
          <Input id="expiry-days" inputMode="numeric" className="w-20" value={daysText} onChange={(e) => setDaysText(e.target.value.replace(/\D/g, "").slice(0, 2))} aria-label={L("จำนวนวัน", "Days")} />
          <span>{L("วัน", "days")}</span>
          <Button size="sm" className="rounded-full" disabled={String(days) === daysText} onClick={saveDays}>{L("บันทึก", "Save")}</Button>
        </div>
      )}
    </div>
  );
}
