import { api } from "@/lib/api";

// Push needs https (or localhost) and a service worker. iPhone: only when opened from the Home Screen.
export function pushAllowedHere(): boolean {
  if (typeof window === "undefined" || !import.meta.env.PROD) return false;
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return false;
  try { if (window.self !== window.top) return false; } catch { return false; }
  return window.isSecureContext;
}

export const isIos = () => typeof navigator !== "undefined" && /iphone|ipad|ipod/i.test(navigator.userAgent);
export const isStandalone = () =>
  typeof window !== "undefined" && (window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true);

const toKey = (b64: string) => {
  const s = atob((b64 + "=".repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
};

const deviceLabel = () => {
  const ua = navigator.userAgent;
  return /iphone/i.test(ua) ? "iPhone" : /ipad/i.test(ua) ? "iPad" : /android/i.test(ua) ? "Android" : /mac/i.test(ua) ? "Mac" : /windows/i.test(ua) ? "Windows" : "";
};

// The worker is registered and the key fetched beforehand, so the tap can call subscribe() straight
// away (iPhone refuses a subscribe that is not directly from the tap).
let ready: Promise<{ reg: ServiceWorkerRegistration; key: string }> | null = null;
export function preparePush() {
  if (!pushAllowedHere()) return null;
  ready ??= Promise.all([navigator.serviceWorker.register("/sw.js", { scope: "/" }), api<{ key: string }>("/push/key")])
    .then(([reg, k]) => ({ reg, key: k.key }));
  ready.catch(() => { ready = null; });
  return ready;
}

export async function subscribePush() {
  const p = preparePush();
  if (!p) return false;
  const { reg, key } = await p;
  const sub = (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toKey(key) }));
  const j = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
  await api("/push/subscribe", { body: { endpoint: j.endpoint, keys: j.keys, label: deviceLabel() } });
  return true;
}
