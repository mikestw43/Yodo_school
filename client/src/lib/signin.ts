import { startAuthentication, startRegistration, browserSupportsWebAuthn } from "@simplewebauthn/browser";
import { api, ApiError } from "@/lib/api";

// Face ID / fingerprint (passkeys), copied from FinHR. The Face ID key is only shown on a device where
// the person turned it on, remembered in this browser.
const FLAG = "yodo-passkey";
export const passkeyPossible = () => typeof window !== "undefined" && window.isSecureContext && browserSupportsWebAuthn();
export const passkeyOnThisDevice = () => { try { return localStorage.getItem(FLAG) === "1"; } catch { return false; } };
const setFlag = (on: boolean) => { try { if (on) localStorage.setItem(FLAG, "1"); else localStorage.removeItem(FLAG); } catch { /* private mode */ } };

export function deviceName() {
  const ua = navigator.userAgent;
  if (/iPhone/.test(ua)) return "iPhone";
  if (/iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return "iPad";
  if (/Macintosh/.test(ua)) return "Mac";
  if (/Android/.test(ua)) return "Android";
  if (/Windows/.test(ua)) return "Windows";
  return "Browser";
}

type RegOpts = Parameters<typeof startRegistration>[0]["optionsJSON"];
type AuthOpts = Parameters<typeof startAuthentication>[0]["optionsJSON"];

export async function addPasskey() {
  const optionsJSON = await api<RegOpts>("/me/passkeys/options", { body: {} });
  const response = await startRegistration({ optionsJSON });
  await api("/me/passkeys", { body: { response, deviceName: deviceName() } });
  setFlag(true);
}

export async function signInWithPasskey() {
  const optionsJSON = await api<AuthOpts>("/auth/passkey/options", { body: {} });
  const response = await startAuthentication({ optionsJSON });
  try { await api("/auth/passkey", { body: { response } }); }
  catch (e) { if (e instanceof ApiError && e.code === "passkey_unknown") setFlag(false); throw e; }
}

export const forgetPasskeyOnThisDevice = () => setFlag(false);

// The person cancelled the Face ID prompt: not worth an error message.
export const cancelled = (e: unknown) => e instanceof Error && (e.name === "NotAllowedError" || e.name === "AbortError");

// ---- Google Identity Services (Google's own button) ----
type Gsi = { accounts: { id: {
  initialize(o: { client_id: string; callback: (r: { credential: string }) => void; ux_mode?: string }): void;
  renderButton(el: HTMLElement, o: Record<string, unknown>): void;
} } };
let gsi: Promise<Gsi> | null = null;
export function loadGoogle(): Promise<Gsi> {
  gsi ??= new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.onload = () => resolve((window as unknown as { google: Gsi }).google);
    s.onerror = () => { gsi = null; reject(new Error("gsi")); };
    document.head.appendChild(s);
  });
  return gsi;
}
