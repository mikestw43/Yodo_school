import { useEffect, useRef, useState } from "react";
import { Mail, Share2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field } from "@/components/yodo/ui";
import { api, apiFile, errorText } from "@/lib/api";
import { L, getLang, type Lang } from "@/lib/i18n";
import type { Full } from "@/components/yodo/receipt";

// Send a receipt (owner 13/10/2026, mockup R4EUKR2FJGuQcf4Xjytzm8): "Share" hands the PDF to the phone's share sheet
// (LINE, mail apps...), "Send by email" mails it from the school's Gmail with a short professional message.

const isEmail = (v: string) => /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(v);

// Share (owner 25/10/2026: did nothing on computers). The PDF is fetched when the page opens, so the phone's share sheet
// opens straight from the tap (browsers refuse a share that comes after a slow download). Computers, and phones whose
// share fails, save the file instead.
const isPhone = () => typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches;
function saveFile(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  toast.success(L(`บันทึกไฟล์ ${name} แล้ว`, `Saved ${name}`));
}

export function ShareReceipt({ full }: { full: Full }) {
  return <SharePdf url={`/receipts/${full.receipt.id}/pdf?lang=${getLang()}`} name={`Receipt-${full.receipt.no}.pdf`}
    version={`${full.receipt.amount}|${full.receipt.cancelled}`} testId="receipt-share" />;
}

/** Share button for any PDF the server draws (receipts, salary certificates). `version` changes when the file does. */
export function SharePdf({ url, name, version, testId }: { url: string; name: string; version: string; testId: string }) {
  const [busy, setBusy] = useState(false);
  const pdf = useRef<{ key: string; blob: Blob } | null>(null);
  const key = `${url}|${version}`;
  const load = async () => {
    if (pdf.current?.key !== key) pdf.current = { key, blob: await apiFile(url) };
    return pdf.current.blob;
  };
  useEffect(() => { if (isPhone()) void load().catch(() => {}); }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  const share = async () => {
    const ready = pdf.current?.key === key ? pdf.current.blob : null;
    setBusy(true);
    try {
      const blob = ready ?? await load();
      const file = new File([blob], name, { type: "application/pdf" });
      const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
      if (isPhone() && nav.canShare?.({ files: [file] })) {
        try { await nav.share({ files: [file], title: name }); }
        catch (e) { if ((e as Error)?.name !== "AbortError") saveFile(blob, name); }
      } else saveFile(blob, name);
    } catch (e) { toast.error(errorText(e)); }
    setBusy(false);
  };
  return <Button variant="outline" className="rounded-full" disabled={busy} onClick={share} data-testid={testId}><Share2 className="h-4 w-4" /> {L("แชร์", "Share")}</Button>;
}

export function EmailReceipt({ full, onSent }: { full: Full; onSent: () => void }) {
  const [open, setOpen] = useState(false);
  const [to, setTo] = useState("");
  const [lang, setLang] = useState<Lang>(getLang());
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<{ subject: string; html: string } | null>(null);
  useEffect(() => { if (open) { setTo(full.student?.email ?? ""); setLang(getLang()); setNote(""); } }, [open, full.student?.email]);
  const list = to.split(/[,;\s]+/).map((x) => x.trim()).filter(Boolean);
  const ok = list.length > 0 && list.length <= 5 && list.every(isEmail);
  const showPreview = async () => {
    try { setPreview(await api<{ subject: string; html: string }>(`/receipts/${full.receipt.id}/email-preview?lang=${lang}&note=${encodeURIComponent(note)}`)); }
    catch (e) { toast.error(errorText(e)); }
  };
  const send = async () => {
    if (!ok) return void toast.error(L("กรุณาใส่อีเมลให้ถูกต้อง (ไม่เกิน 5 อีเมล คั่นด้วย ,)", "Please enter valid email addresses (up to 5, separated by commas)"));
    setBusy(true);
    try {
      await api(`/receipts/${full.receipt.id}/email`, { body: { to: list.join(", "), lang, note: note.trim() } });
      toast.success(L(`ส่งใบเสร็จไปที่ ${list.join(", ")} แล้ว`, `Receipt sent to ${list.join(", ")}`));
      setOpen(false); onSent();
    } catch (e) { toast.error(errorText(e)); }
    setBusy(false);
  };
  return (
    <>
      <Button variant="outline" className="rounded-full" onClick={() => setOpen(true)} data-testid="receipt-email"><Mail className="h-4 w-4" /> {L("ส่งทางอีเมล", "Send by email")}</Button>
      <Dialog open={open} onOpenChange={(o) => { if (!busy) setOpen(o); }}>
        <DialogContent className="sm:max-w-lg" data-testid="email-dialog">
          <DialogHeader>
            <DialogTitle>{L("ส่งใบเสร็จทางอีเมล", "Send the receipt by email")}</DialogTitle>
            <DialogDescription>{full.receipt.no} · {L("แนบไฟล์ PDF", "PDF attached")}</DialogDescription>
          </DialogHeader>
          <Field label={L("ถึง", "To")}>
            <Input type="email" multiple value={to} placeholder="parent@example.com" onChange={(e) => setTo(e.target.value)} data-testid="email-to" />
          </Field>
          <p className="-mt-2 text-xs text-muted-foreground">{L("ใส่ให้จากอีเมลของนักเรียน แก้ได้ · ส่งหลายคนคั่นด้วย ,", "Filled in from the student's email, you can change it · several: separate with ,")}</p>
          <div className="flex flex-wrap items-center gap-2 text-sm font-semibold">
            {L("ภาษาอีเมลและ PDF", "Email and PDF language")}
            <div className="inline-flex overflow-hidden rounded-full border border-border text-xs font-bold" role="group" aria-label={L("ภาษาอีเมล", "Email language")}>
              {(["th", "en"] as const).map((x) => (
                <button key={x} type="button" aria-pressed={lang === x} onClick={() => setLang(x)} className={`h-8 min-w-11 px-3 ${lang === x ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted"}`}>{x.toUpperCase()}</button>
              ))}
            </div>
          </div>
          <Field label={L("ข้อความเพิ่ม (ไม่บังคับ)", "Extra message (optional)")}>
            <Textarea rows={2} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} data-testid="email-note" />
          </Field>
          <DialogFooter className="items-center gap-2 sm:justify-between">
            <Button variant="ghost" className="text-primary" onClick={showPreview} data-testid="email-preview">{L("ดูตัวอย่างอีเมล", "Preview the email")}</Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setOpen(false)}>{L("ยกเลิก", "Cancel")}</Button>
              <Button disabled={busy || !ok} onClick={send} data-testid="email-send">{L("ส่ง", "Send")}</Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={!!preview} onOpenChange={(o) => { if (!o) setPreview(null); }}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{L("ตัวอย่างอีเมล", "Email preview")}</DialogTitle>
            <DialogDescription>{preview?.subject}</DialogDescription>
          </DialogHeader>
          {preview && <iframe title={L("ตัวอย่างอีเมล", "Email preview")} srcDoc={preview.html} className="h-[65vh] w-full rounded-2xl border border-border bg-white" data-testid="email-preview-frame" />}
        </DialogContent>
      </Dialog>
    </>
  );
}
