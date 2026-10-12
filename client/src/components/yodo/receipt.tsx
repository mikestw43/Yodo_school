import { useEffect, useRef, useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Ban, ChevronLeft, Printer } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { api, errorText } from "@/lib/api";
import { L, useLang, type Lang } from "@/lib/i18n";
import { useYodo, type Receipt } from "@/lib/yodo-store";
import { printReceipt, receiptHtml, type Company, type ReceiptStudent } from "@/lib/receipt-print";

type Full = { receipt: Receipt; company: Company; student: ReceiptStudent };

// One receipt viewer for the whole app: any page calls openReceipt(id) (after closing its own window, so nothing
// underneath blocks scrolling) and <ReceiptHost/> in the shell shows it full screen.
const EVT = "yodo:open-receipt";
export const openReceipt = (id: string) => window.dispatchEvent(new CustomEvent(EVT, { detail: id }));
export const RECEIPTS_CHANGED = "yodo:receipts-changed";
/** Windows underneath hide while a receipt is open (a window under a full-screen one blocks scrolling). */
export const RECEIPT_OPEN = "yodo:receipt-open";
export function useReceiptOpen() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const on = (e: Event) => setOpen((e as CustomEvent<boolean>).detail);
    window.addEventListener(RECEIPT_OPEN, on);
    return () => window.removeEventListener(RECEIPT_OPEN, on);
  }, []);
  return open;
}

const A4_W = 794, A4_H = 1123;

export function ReceiptHost() {
  const { can } = useYodo();
  const appLang = useLang();
  const [id, setId] = useState<string | null>(null);
  const [full, setFull] = useState<Full | null>(null);
  const [lang, setLang] = useState<Lang>(appLang);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState("");
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const on = (e: Event) => { setId((e as CustomEvent<string>).detail); setLang(appLang); };
    window.addEventListener(EVT, on);
    return () => window.removeEventListener(EVT, on);
  }, [appLang]);
  const load = (rid: string) => api<Full>(`/receipts/${rid}`).then(setFull).catch((e) => { toast.error(errorText(e)); setId(null); });
  useEffect(() => { setFull(null); if (id) void load(id); window.dispatchEvent(new CustomEvent(RECEIPT_OPEN, { detail: !!id })); }, [id]);
  useEffect(() => {
    const el = box.current;
    if (!el || !id) return;
    const fit = () => setScale(Math.min(1, (el.clientWidth - 24) / A4_W));
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [id, full]);

  const cancel = async () => {
    if (!full) return;
    try {
      await api(`/receipts/${full.receipt.id}/cancel`, { body: { reason: reason.trim() } });
      toast.success(L("ยกเลิกใบเสร็จแล้ว", "Receipt cancelled"));
      setCancelOpen(false); setReason("");
      window.dispatchEvent(new Event(RECEIPTS_CHANGED));
      await load(full.receipt.id);
    } catch (e) { toast.error(errorText(e)); }
  };

  return (
    <>
      <Dialog open={!!id} onOpenChange={(o) => { if (!o) setId(null); }}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Content className="fixed inset-0 z-50 flex flex-col bg-[#5b4b50] outline-none" data-testid="receipt-view">
            <DialogPrimitive.Title className="sr-only">{L("ใบเสร็จรับเงิน", "Receipt")}</DialogPrimitive.Title>
            <DialogPrimitive.Description className="sr-only">{full?.receipt.no ?? ""}</DialogPrimitive.Description>
            <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border bg-background px-3 py-2.5 sm:px-5">
              <Button variant="outline" className="rounded-full" onClick={() => setId(null)}><ChevronLeft className="h-4 w-4" /> {L("กลับ", "Back")}</Button>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{L("ใบเสร็จรับเงิน", "Receipt")}</p>
                <p className="font-mono text-xs text-muted-foreground">{full?.receipt.no}</p>
              </div>
              <div className="inline-flex shrink-0 rounded-full border border-border bg-background p-0.5 text-xs font-bold" role="group" aria-label={L("ภาษาของใบเสร็จ", "Language of the receipt")}>
                {(["th", "en"] as const).map((x) => (
                  <button key={x} type="button" onClick={() => setLang(x)} aria-pressed={lang === x}
                    className={`h-8 min-w-10 rounded-full px-2 transition-colors ${lang === x ? "bg-primary text-primary-foreground" : "text-foreground/70 hover:bg-muted"}`}>{x.toUpperCase()}</button>
                ))}
              </div>
              {full && can("receipts", "delete") && !full.receipt.cancelled && (
                <Button variant="outline" className="rounded-full text-destructive hover:text-destructive" onClick={() => setCancelOpen(true)}><Ban className="h-4 w-4" /> {L("ยกเลิกใบเสร็จ", "Cancel receipt")}</Button>
              )}
              <Button className="rounded-full" disabled={!full} onClick={() => { if (full && !printReceipt({ ...full, lang })) toast.error(L("กรุณาอนุญาตหน้าต่างใหม่เพื่อพิมพ์", "Please allow pop-up windows to print")); }}>
                <Printer className="h-4 w-4" /> {L("พิมพ์ / บันทึกเป็น PDF", "Print / Save as PDF")}
              </Button>
            </div>
            <div ref={box} className="min-h-0 flex-1 overflow-auto p-3 sm:p-6">
              {full && (
                <div className="mx-auto" style={{ width: A4_W * scale, height: A4_H * scale }}>
                  <iframe title={full.receipt.no} srcDoc={receiptHtml({ ...full, lang })} data-testid="receipt-frame"
                    style={{ width: A4_W, height: A4_H, border: 0, background: "#fff", transform: `scale(${scale})`, transformOrigin: "0 0", boxShadow: "0 2px 15px rgba(0,0,0,.25)" }} />
                </div>
              )}
            </div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </Dialog>
      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent className="max-w-md rounded-3xl">
          <DialogHeader>
            <DialogTitle>{L("ยกเลิกใบเสร็จนี้?", "Cancel this receipt?")}</DialogTitle>
            <DialogDescription>{L("ใบเสร็จจะยังอยู่พร้อมเลขที่เดิม มีคำว่ายกเลิกกำกับ และไม่นับยอด ทำกลับไม่ได้", "The receipt stays with its number, marked cancelled, and is not counted. This cannot be undone.")}</DialogDescription>
          </DialogHeader>
          <Input placeholder={L("เหตุผล (ไม่บังคับ)", "Reason (optional)")} value={reason} onChange={(e) => setReason(e.target.value)} />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCancelOpen(false)}>{L("ไม่ยกเลิก", "Keep it")}</Button>
            <Button variant="destructive" className="rounded-full" onClick={cancel}>{L("ยกเลิกใบเสร็จ", "Cancel receipt")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
