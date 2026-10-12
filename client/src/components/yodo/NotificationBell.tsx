import { useCallback, useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Bell, BellRing, Share, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "sonner";
import { api, errorText } from "@/lib/api";
import { fdt, L } from "@/lib/i18n";
import { isIos, isStandalone, preparePush, pushAllowedHere, subscribePush } from "@/lib/push-client";

interface Notif { id: number; created_at: string; kind: string; title: string; body: string; link: string; read: boolean }

function setBadge(n: number) {
  try {
    const nav = navigator as Navigator & { setAppBadge?: (n: number) => Promise<void>; clearAppBadge?: () => Promise<void> };
    if (n > 0) void nav.setAppBadge?.(n);
    else void nav.clearAppBadge?.();
  } catch { /* unsupported platform */ }
}

// Remove delivered notifications from the phone's tray once the app is open.
async function clearSystemNotifications() {
  try {
    const reg = await navigator.serviceWorker?.getRegistration("/");
    const list = (await reg?.getNotifications()) ?? [];
    list.forEach((n) => n.close());
  } catch { /* unsupported */ }
}

// Read state is kept on the server per account, so reading on one device clears it on all of them.
export function NotificationBell({ className = "" }: { className?: string }) {
  const [items, setItems] = useState<Notif[]>([]);
  const [unread, setUnread] = useState(0);
  const [perm, setPerm] = useState<string>("default");

  const load = useCallback(async () => {
    try {
      const r = await api<{ unread: number; items: Notif[] }>("/notices");
      setItems((prev) => {
        const known = new Set(prev.map((n) => n.id));
        // A new one while the app is open: a small popup too.
        if (prev.length) r.items.filter((n) => !known.has(n.id) && !n.read).slice(0, 3).forEach((n) => toast(n.title, { description: n.body }));
        return r.items;
      });
      setUnread(r.unread);
    } catch { /* signed out or offline */ }
  }, []);

  useEffect(() => {
    if (typeof Notification !== "undefined") setPerm(Notification.permission);
    void load();
    void clearSystemNotifications();
    preparePush();
    const refresh = () => { if (document.visibilityState === "visible") { void load(); void clearSystemNotifications(); } };
    const onMsg = (e: MessageEvent) => { if (e.data?.type === "yodo:refresh-notifications") void load(); };
    const timer = setInterval(refresh, 60_000);
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("focus", refresh);
    navigator.serviceWorker?.addEventListener("message", onMsg);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("focus", refresh);
      navigator.serviceWorker?.removeEventListener("message", onMsg);
    };
  }, [load]);

  useEffect(() => setBadge(unread), [unread]);

  const markOne = (id: number) => {
    setItems((p) => p.map((n) => (n.id === id ? { ...n, read: true } : n)));
    api<{ unread: number }>("/notices/read", { body: { ids: [id] } }).then((r) => setUnread(r.unread)).catch(() => null);
  };
  // Removed from my bell only (removed = read); the enrollment or session itself stays.
  const removeOne = (id: number) => {
    setItems((p) => p.filter((n) => n.id !== id));
    api<{ unread: number }>("/notices/delete", { body: { ids: [id] } }).then((r) => setUnread(r.unread)).catch(() => null);
  };
  const removeRead = () => {
    setItems((p) => p.filter((n) => !n.read));
    api<{ unread: number }>("/notices/delete", { body: { read: true } }).then((r) => setUnread(r.unread)).catch(() => null);
  };
  const markAll = () => {
    setItems((p) => p.map((n) => ({ ...n, read: true })));
    setUnread(0);
    api("/notices/read", { body: { all: true } }).catch(() => null);
  };

  const [subscribed, setSubscribed] = useState(false);
  useEffect(() => {
    if (perm === "granted" && pushAllowedHere()) subscribePush().then(setSubscribed).catch(() => setSubscribed(false));
  }, [perm]);

  // Called straight from the tap (iPhone requires it).
  const askPerm = async () => {
    if (typeof Notification === "undefined") { toast.error(L("อุปกรณ์นี้ไม่รองรับการแจ้งเตือน", "This device does not support notifications")); return; }
    const p = await Notification.requestPermission();
    setPerm(p);
    if (p === "granted") {
      const ok = await subscribePush().catch(() => false);
      setSubscribed(ok);
      toast.success(ok ? L("เปิดการแจ้งเตือนบนอุปกรณ์นี้แล้ว", "Notifications are on for this device") : L("อนุญาตแล้ว (แจ้งเตือนนอกแอปต้องเปิดผ่านที่อยู่ https)", "Allowed (notifications outside the app need the https address)"));
    } else if (p === "denied") toast.error(L("การแจ้งเตือนถูกปิด กรุณาเปิดในการตั้งค่าเครื่อง", "Notifications are blocked. Please turn them on in the device settings"));
  };
  const runTest = async () => {
    try {
      const r = await api<{ devices: number; results: { ok: boolean }[] }>("/push/test", { body: {} });
      if (!r.devices) toast.error(L("อุปกรณ์นี้ยังไม่ได้ลงทะเบียนรับแจ้งเตือน", "This device is not signed up for notifications yet"));
      else if (r.results.some((x) => x.ok)) toast.success(L("ส่งทดสอบแล้ว และบันทึกในกระดิ่ง", "Test sent, and saved in the bell"));
      else toast.error(L("ส่งไม่สำเร็จ ลองปิดแล้วเปิดแอปใหม่", "Could not send. Try closing and reopening the app"));
      void load();
    } catch (e) { toast.error(L("ส่งทดสอบไม่สำเร็จ: ", "Test failed: ") + errorText(e)); }
  };
  const [iosHint, setIosHint] = useState(false);
  useEffect(() => { setIosHint(isIos() && !isStandalone()); }, []);

  return (
    <Popover onOpenChange={(o) => { if (o) { void clearSystemNotifications(); void load(); } }}>
      <PopoverTrigger asChild>
        <button aria-label={L("การแจ้งเตือน", "Notifications")} className={`relative rounded-full p-2 text-foreground transition-colors hover:bg-muted ${className}`}>
          <Bell className="h-5 w-5" />
          {unread > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 rounded-2xl p-0">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <p className="text-sm font-semibold">{L("การแจ้งเตือน", "Notifications")}</p>
          <div className="flex items-center gap-3">
            {unread > 0 && <button onClick={markAll} className="text-xs text-primary">{L("อ่านแล้วทั้งหมด", "Mark all as read")}</button>}
            {items.some((n) => n.read) && <button onClick={removeRead} className="text-xs text-primary">{L("ลบที่อ่านแล้ว", "Remove read")}</button>}
          </div>
        </div>
        {iosHint ? (
          <div className="flex items-start gap-2 border-b border-border bg-muted/50 px-4 py-2.5 text-xs">
            <Share className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <span>{L("iPhone: กด \"แชร์\" แล้วเลือก \"เพิ่มไปยังหน้าจอโฮม\" จากนั้นเปิดแอป YODO จากหน้าจอโฮมเพื่อรับแจ้งเตือน", "iPhone: tap \"Share\", choose \"Add to Home Screen\", then open YODO from the Home Screen to get notifications.")}</span>
          </div>
        ) : perm === "granted" ? (
          <div className="flex items-center justify-between gap-2 border-b border-border bg-muted/50 px-4 py-2.5 text-xs">
            <span className="text-muted-foreground">{subscribed ? L("อุปกรณ์นี้รับแจ้งเตือนแล้ว", "This device gets notifications") : L("อนุญาตแจ้งเตือนแล้ว", "Notifications allowed")}</span>
            {subscribed && <button onClick={runTest} className="font-medium text-primary">{L("ทดสอบแจ้งเตือน", "Send a test")}</button>}
          </div>
        ) : perm === "denied" ? (
          <p className="border-b border-border bg-muted/50 px-4 py-2.5 text-xs text-muted-foreground">{L("การแจ้งเตือนถูกปิด เปิดได้ในการตั้งค่าเครื่อง", "Notifications are blocked. Turn them on in the device settings.")}</p>
        ) : (
          <button onClick={askPerm} className="flex w-full items-center gap-2 border-b border-border bg-primary/10 px-4 py-3 text-left text-sm font-medium text-primary">
            <BellRing className="h-4 w-4 shrink-0" /> {L("เปิดการแจ้งเตือนบนอุปกรณ์นี้", "Turn on notifications on this device")}
          </button>
        )}
        <div className="max-h-96 overflow-y-auto">
          {items.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">{L("ยังไม่มีการแจ้งเตือน", "No notifications yet")}</p>
          ) : items.map((n) => (
            <div key={n.id} className={`flex items-start border-b border-border last:border-0 ${!n.read ? "bg-primary/5" : ""}`}>
              <Link to={n.link || "/"} onClick={() => markOne(n.id)} className="block min-w-0 flex-1 py-3 pl-4 hover:bg-muted">
                <div className="flex items-start gap-2">
                  {!n.read && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{n.title}</p>
                    <p className="truncate text-xs text-muted-foreground">{n.body}</p>
                    <p className="mt-1 text-[11px] text-muted-foreground">{fdt(n.created_at)}</p>
                  </div>
                </div>
              </Link>
              <button type="button" onClick={() => removeOne(n.id)} aria-label={L("ลบการแจ้งเตือนนี้", "Remove this notification")} className="m-2 rounded-full p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"><X className="h-4 w-4" /></button>
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
