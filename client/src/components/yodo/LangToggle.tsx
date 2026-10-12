import { api } from "@/lib/api";
import { setLang, useLang } from "@/lib/i18n";
import { cn } from "@/lib/utils";

// One tap switches Thai / English (owner 12/10/2026). Signed in: kept with the account, so other devices follow.
export function LangToggle({ className = "", signedIn = true }: { className?: string; signedIn?: boolean }) {
  const lang = useLang();
  const next = lang === "en" ? "th" : "en";
  return (
    <button
      type="button"
      onClick={() => { setLang(next); if (signedIn) api("/me/lang", { method: "PATCH", body: { lang: next } }).catch(() => null); }}
      aria-label={lang === "en" ? "เปลี่ยนเป็นภาษาไทย" : "Switch to English"}
      title={lang === "en" ? "ภาษาไทย" : "English"}
      className={cn("inline-flex h-9 min-w-9 items-center justify-center rounded-full px-2 text-xs font-bold tracking-wide text-foreground transition-colors hover:bg-muted", className)}
    >
      {lang === "en" ? "EN" : "TH"}
    </button>
  );
}
