import { useEffect, useRef, useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Ban, ChevronLeft, Pencil, Printer, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { api, errorText } from "@/lib/api";
import { L, useLang, type Lang } from "@/lib/i18n";
import { useYodo, type Receipt } from "@/lib/yodo-store";
import { methodLabel, money, printReceipt, receiptHtml, type Company, type ReceiptStudent } from "@/lib/receipt-print";
import { DateField, Field, ReceiptUpload } from "@/components/yodo/ui";
import { Textarea } from "@/components/ui/textarea";
import { fd, getLang } from "@/lib/i18n";

export type ReceiptEmail = { id: string; to: string; lang: string; byName: string; createdAt: string };
export type Full = { receipt: Receipt; company: Company; student: ReceiptStudent; editable?: boolean; emails?: ReceiptEmail[] };

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
  const appLang = useLang();
  const [id, setId] = useState<string | null>(null);
  const [full, setFull] = useState<Full | null>(null);
  const [lang, setLang] = useState<Lang>(appLang);
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const on = (e: Event) => { setId((e as CustomEvent<string>).detail); setLang(appLang); };
    window.addEventListener(EVT, on);
    return () => window.removeEventListener(EVT, on);
  }, [appLang]);
  useEffect(() => {
    setFull(null);
    if (id) api<Full>(`/receipts/${id}`).then(setFull).catch((e) => { toast.error(errorText(e)); setId(null); });
    window.dispatchEvent(new CustomEvent(RECEIPT_OPEN, { detail: !!id }));
  }, [id]);
  useEffect(() => {
    const el = box.current;
    if (!el || !id) return;
    const fit = () => setScale(Math.min(1, (el.clientWidth - 24) / A4_W));
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [id, full]);

  // The A4 receipt only: back, its own TH/EN, print. Edit / delete / cancel live on the details page (owner 12/10/2026).
  return (
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
  );
}

/** Edit / Delete (this month's newest receipt) or Cancel (older ones) for the receipt details page. */
export function ReceiptActions({ full, onChanged, onDeleted }: { full: Full; onChanged: () => Promise<void>; onDeleted: () => void }) {
  const { can, reload } = useYodo();
  const [editOpen, setEditOpen] = useState(false);
  const [delOpen, setDelOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState("");
  const r = full.receipt;
  const canChange = !!full.editable && can("receipts", "edit");
  const canCancel = !canChange && !r.cancelled && can("receipts", "delete");
  const changed = async () => { window.dispatchEvent(new Event(RECEIPTS_CHANGED)); await onChanged(); void reload(); };
  const cancel = async () => {
    try {
      await api(`/receipts/${r.id}/cancel`, { body: { reason: reason.trim() } });
      toast.success(L("ยกเลิกใบเสร็จแล้ว", "Receipt cancelled"));
      setCancelOpen(false); setReason("");
      await changed();
    } catch (e) { toast.error(errorText(e)); }
  };
  const del = async () => {
    try {
      await api(`/receipts/${r.id}/delete`, { body: {} });
      toast.success(L(`ลบใบเสร็จ ${r.no} แล้ว`, `Receipt ${r.no} deleted`));
      setDelOpen(false);
      window.dispatchEvent(new Event(RECEIPTS_CHANGED));
      void reload();
      onDeleted();
    } catch (e) { toast.error(errorText(e)); }
  };
  const items = (r.lines ?? []).map((l) => l.item).join(", ");
  return (
    <>
      {canChange && <Button variant="outline" className="rounded-full" onClick={() => setEditOpen(true)} data-testid="receipt-edit"><Pencil className="h-4 w-4" /> {L("แก้ไข", "Edit")}</Button>}
      {canChange && <Button variant="outline" className="rounded-full text-destructive hover:text-destructive" onClick={() => setDelOpen(true)} data-testid="receipt-delete"><Trash2 className="h-4 w-4" /> {L("ลบ", "Delete")}</Button>}
      {canCancel && <Button variant="outline" className="rounded-full text-destructive hover:text-destructive" onClick={() => setCancelOpen(true)}><Ban className="h-4 w-4" /> {L("ยกเลิกใบเสร็จ", "Cancel receipt")}</Button>}
      <Dialog open={delOpen} onOpenChange={setDelOpen}>
        <DialogContent className="max-w-md rounded-3xl">
          <DialogHeader>
            <DialogTitle>{L(`ลบใบเสร็จ ${r.no}?`, `Delete receipt ${r.no}?`)}</DialogTitle>
            <DialogDescription asChild>
              <ul className="list-disc space-y-1 pl-5 text-sm">
                <li>{L("ใบเสร็จนี้หายไปจากรายการ และไม่นับยอด", "The receipt leaves the list and is not counted")}</li>
                <li>{L(`คลาสในใบนี้ (${items}) ถูกเอาออก วันหมดอายุกลับไปเหมือนก่อนซื้อ`, `Its classes (${items}) are taken back to before they were bought`)}</li>
                <li>{L(`เลข ${r.no} จะใช้กับใบเสร็จใบถัดไป`, `Number ${r.no} goes to the next receipt`)}</li>
                <li>{L("เก็บไว้ในประวัติการแก้ไขว่าใครลบ เมื่อไหร่", "The audit log keeps who deleted it and when")}</li>
              </ul>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDelOpen(false)}>{L("ไม่ลบ", "Keep it")}</Button>
            <Button variant="destructive" className="rounded-full" onClick={del}>{L("ลบใบเสร็จ", "Delete receipt")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {editOpen && <EditReceipt full={full} onClose={() => setEditOpen(false)} onSaved={async () => { setEditOpen(false); await changed(); }} />}
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

type EditLine = { id: string; item: string; startDate: string; expiryDate: string; price: string; discountType: "baht" | "pct"; discountValue: string };
const r2 = (n: number) => Math.round(n * 100) / 100;
const lineAmount = (l: EditLine) => {
  const price = Number(l.price) || 0, v = Number(l.discountValue) || 0;
  const discount = l.discountType === "pct" ? r2((price * v) / 100) : r2(v);
  return { amount: r2(price - discount), bad: l.discountType === "pct" ? v > 100 : v > price };
};

/** Edit this month's newest receipt (mockup RsAi2pW17acWGcTG5oKwRc board 2): money, method, date in the same month,
 *  payer, remark, slip. The courses and their dates stay (delete and buy again for that). */
function EditReceipt({ full, onClose, onSaved }: { full: Full; onClose: () => void; onSaved: () => Promise<void> }) {
  const r = full.receipt;
  const [lines, setLines] = useState<EditLine[]>(() => (r.lines ?? []).map((l) => ({
    id: l.id, item: l.item, startDate: l.startDate, expiryDate: l.expiryDate, price: String(l.price ?? 0),
    discountType: l.discountType ?? "baht", discountValue: l.discountValue ? String(l.discountValue) : "",
  })));
  const [date, setDate] = useState(r.date);
  const [method, setMethod] = useState(r.method);
  const [payer, setPayer] = useState(r.payer);
  const [remark, setRemark] = useState(r.remark);
  const [slip, setSlip] = useState(r.slip);
  const [busy, setBusy] = useState(false);
  const month = r.date.slice(0, 7);
  const monthEnd = (() => { const [y, m] = month.split("-").map(Number); return new Date(Date.UTC(y!, m!, 0)).toISOString().slice(0, 10); })();
  const total = lines.reduce((t, l) => t + lineAmount(l).amount, 0);
  const set = (id: string, patch: Partial<EditLine>) => setLines((ls) => ls.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  const save = async () => {
    if (lines.some((l) => lineAmount(l).bad)) return void toast.error(L("ส่วนลดมากกว่าราคา", "The discount is more than the price"));
    if (!date.startsWith(month)) return void toast.error(L("วันที่รับเงินต้องอยู่ในเดือนเดิมของใบเสร็จ", "The payment date must stay in the receipt's month"));
    setBusy(true);
    try {
      await api(`/receipts/${r.id}`, { method: "PUT", body: {
        date, method, slip: method === "transfer" ? slip : "", payer: payer.trim(), remark: remark.trim(),
        lines: lines.map((l) => ({ id: l.id, price: Number(l.price) || 0, discountType: l.discountType, discountValue: Number(l.discountValue) || 0 })),
      } });
      toast.success(L("บันทึกใบเสร็จแล้ว", "Receipt saved"));
      await onSaved();
    } catch (e) { toast.error(errorText(e)); }
    setBusy(false);
  };
  return (
    <Dialog open onOpenChange={(o) => { if (!o && !busy) onClose(); }}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-xl" data-testid="receipt-edit-dialog">
        <DialogHeader>
          <DialogTitle>{L(`แก้ไขใบเสร็จ ${r.no}`, `Edit receipt ${r.no}`)}</DialogTitle>
          <DialogDescription>{L("เลขที่เดิม ไม่เปลี่ยน", "The number stays the same")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          {lines.map((l) => (
            <div key={l.id} className="flex flex-wrap items-end gap-2 rounded-2xl border border-border/70 bg-background p-3" data-testid="edit-line">
              <div className="w-full min-w-0 sm:w-auto sm:flex-1"><p className="font-semibold">{l.item}</p><p className="text-xs text-muted-foreground">{fd(l.startDate)} – {fd(l.expiryDate)}</p></div>
              <Field label={L("ราคา", "Price")} className="w-28"><Input type="number" min={0} inputMode="decimal" value={l.price} onChange={(e) => set(l.id, { price: e.target.value })} /></Field>
              <Field label={L("ส่วนลด", "Discount")} className="w-40">
                <div className="flex gap-1">
                  <Input type="number" min={0} inputMode="decimal" placeholder="0" value={l.discountValue} onChange={(e) => set(l.id, { discountValue: e.target.value })} className="min-w-0" data-testid="edit-discount" />
                  <div className="flex shrink-0 overflow-hidden rounded-lg border border-border text-xs font-bold" role="group" aria-label={L("ส่วนลดเป็น", "Discount in")}>
                    {(["pct", "baht"] as const).map((t) => (
                      <button key={t} type="button" aria-pressed={l.discountType === t} onClick={() => set(l.id, { discountType: t })}
                        className={`px-2.5 ${l.discountType === t ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted"}`}>{t === "pct" ? "%" : L("บาท", "THB")}</button>
                    ))}
                  </div>
                </div>
              </Field>
              <p className="ml-auto pb-2 text-sm font-semibold">{money(lineAmount(l).amount)}</p>
            </div>
          ))}
          <p className="text-xs text-muted-foreground">{L("แก้ราคาและส่วนลดได้ · จะเปลี่ยนคลาสหรือวันที่เรียน ให้ลบใบนี้แล้วซื้อใหม่", "Price and discount can change · to change a class or its dates, delete this receipt and buy again")}</p>
          <p className="text-right text-lg font-bold text-primary">{L("ยอดชำระ", "Total")} <span data-testid="edit-total">{money(total)}</span> {L("บาท", "THB")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {(["cash", "transfer", "card"] as const).map((x) => (
            <button key={x} type="button" onClick={() => setMethod(x)} aria-pressed={method === x}
              className={`h-9 rounded-full px-4 text-sm transition-colors ${method === x ? "bg-primary text-primary-foreground" : "border border-border bg-background hover:bg-muted"}`}>{methodLabel(x, getLang())}</button>
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={L("วันที่รับเงิน (ในเดือนเดียวกัน)", "Payment date (same month)")}><DateField value={date} min={`${month}-01`} max={monthEnd} onChange={setDate} /></Field>
          <Field label={L("ชื่อผู้จ่าย (ในใบเสร็จ)", "Payer (on the receipt)")}><Input value={payer} placeholder={L("ไม่ใส่ = ชื่อนักเรียน", "Empty = the student's name")} onChange={(e) => setPayer(e.target.value)} /></Field>
        </div>
        <Field label={L("หมายเหตุ (พิมพ์ในใบเสร็จ)", "Remark (printed on the receipt)")}><Textarea rows={2} maxLength={500} value={remark} onChange={(e) => setRemark(e.target.value)} data-testid="edit-remark" /></Field>
        {method === "transfer" && <Field label={L("สลิปโอน", "Transfer slip")}><ReceiptUpload value={slip} onChange={setSlip} /></Field>}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{L("ยกเลิก", "Cancel")}</Button>
          <Button disabled={busy} onClick={save}>{L("บันทึก", "Save")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
