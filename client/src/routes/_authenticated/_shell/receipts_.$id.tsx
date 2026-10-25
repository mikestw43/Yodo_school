import { useCallback, useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { FileText } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { BackButton, EmptyState } from "@/components/yodo/ui";
import { ReceiptActions, openReceipt, type Full } from "@/components/yodo/receipt";
import { EmailReceipt, ShareReceipt } from "@/components/yodo/receipt-send";
import { api, errorText } from "@/lib/api";
import { L, fd, fdt, getLang, prefixed } from "@/lib/i18n";
import { methodLabel, money } from "@/lib/receipt-print";
import { lengthText } from "@/lib/courses";

export const Route = createFileRoute("/_authenticated/_shell/receipts_/$id")({
  component: ReceiptDetailPage,
});

// Tapping a receipt opens its details first (owner 12/10/2026, mockup EDWWyApdMLcXxo59hcMiR3): who, what, how it was
// paid, the slip; Edit / Delete (this month's newest) or Cancel (older) and "View PDF / Print".
function ReceiptDetailPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const [full, setFull] = useState<Full | null>(null);
  const [missing, setMissing] = useState(false);
  const [slipOpen, setSlipOpen] = useState(false);
  const load = useCallback(async () => {
    try { setFull(await api<Full>(`/receipts/${id}`)); }
    catch (e) { setMissing(true); toast.error(errorText(e)); }
  }, [id]);
  useEffect(() => { void load(); }, [load]);
  if (missing) return <><BackButton /><EmptyState title={L("ไม่พบใบเสร็จ", "Receipt not found")} /></>;
  if (!full) return <p className="py-20 text-center text-sm text-muted-foreground">{L("กำลังโหลด...", "Loading...")}</p>;
  const r = full.receipt, s = full.student;
  const lines = r.lines?.length ? r.lines : [{ id: r.id, item: r.item, months: r.months, weeks: r.weeks ?? 0, startDate: r.startDate, expiryDate: r.expiryDate, price: r.price, discount: r.discount, discountType: "baht" as const, discountValue: r.discount, amount: r.amount }];
  const student = s ? `${prefixed(s.prefix, s.firstName)} ${s.lastName}`.trim() : "-";
  const off = (l: (typeof lines)[number]) => (l.discount ? (l.discountType === "pct" ? `${l.discountValue}%` : `${money(l.discount ?? 0)} ${L("บาท", "THB")}`) : "-");
  return (
    <div data-testid="receipt-detail">
      <BackButton />
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="font-display text-3xl font-semibold tracking-tight md:text-4xl">{L("ใบเสร็จ", "Receipt")} <span className="font-mono text-2xl md:text-3xl">{r.no}</span></h1>
            {r.cancelled
              ? <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-800">{L("ยกเลิกแล้ว", "Cancelled")}</span>
              : full.editable && <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">{L("ใบล่าสุดของเดือน", "Newest this month")}</span>}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{fd(r.date)} · {L("ออกโดย", "Issued by")} {r.receivedByName}</p>
          {(full.emails ?? []).slice(0, 3).map((e) => (
            <p key={e.id} className="mt-0.5 text-xs text-muted-foreground" data-testid="sent-email">{L(`ส่งอีเมลแล้ว ${fdt(e.createdAt)} ถึง ${e.to} (${e.lang.toUpperCase()}) โดย ${e.byName}`, `Emailed ${fdt(e.createdAt)} to ${e.to} (${e.lang.toUpperCase()}) by ${e.byName}`)}</p>
          ))}
          {r.cancelled && <p className="mt-1 text-sm text-red-700">{L("ยกเลิกโดย", "Cancelled by")} {r.cancelledBy}{r.cancelReason ? ` · ${r.cancelReason}` : ""}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ShareReceipt full={full} />
          {!r.cancelled && <EmailReceipt full={full} onSent={() => void load()} />}
          <Button className="order-last w-full rounded-full sm:order-none sm:w-auto" onClick={() => openReceipt(r.id)} data-testid="receipt-pdf"><FileText className="h-4 w-4" /> {L("ดู PDF / พิมพ์", "View PDF / Print")}</Button>
          <ReceiptActions full={full} onChanged={load} onDeleted={() => navigate({ to: "/receipts", replace: true })} />
        </div>
      </div>
      {/* Easier to read (owner 13/10/2026, mockup LvtGtwLMozBxzAzQ3G1wRX): the amount big with how it was paid, one row per
          class (name, period, discount, full price), totals top to bottom. Phones: amount first, then classes, then payment. */}
      <div className="grid items-start gap-5 lg:grid-cols-[1fr_340px]">
        <Card className={`order-2 gap-0 rounded-3xl p-5 lg:order-1 lg:p-6 ${r.cancelled ? "opacity-75" : ""}`}>
          <div className="grid gap-4 border-b border-border/70 pb-4 text-sm sm:grid-cols-2">
            <div><p className="text-xs text-muted-foreground">{L("นักเรียน", "Student")}</p>
              {s ? <Link to="/students" search={{ view: r.studentId }} className="text-base font-semibold text-primary hover:underline">{student}</Link> : "-"}
              {s && <p className="font-mono text-xs text-muted-foreground">{s.code}</p>}</div>
            <div><p className="text-xs text-muted-foreground">{L("ได้รับเงินจาก", "Received from")}</p><p className="text-base font-semibold">{r.payer || student}</p></div>
          </div>
          <div data-testid="receipt-lines">
            {lines.map((l) => (
              <div key={l.id} className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-0.5 border-b border-border/70 py-3.5 tabular-nums last:border-b-0">
                <p className="text-base font-bold">{l.item}{l.discount ? <span className="ml-2 inline-block rounded-full bg-accent/60 px-2 py-0.5 align-middle text-xs font-semibold text-primary">{L("ลด", "Off")} {off(l)}</span> : null}</p>
                <p className="text-right text-base font-bold">{money(l.amount ?? 0)}</p>
                <p className="text-sm text-muted-foreground">{lengthText(l.months ?? 0, l.weeks ?? 0)}{(l.months || l.weeks) && l.startDate ? " · " : ""}{l.startDate ? `${fd(l.startDate)} – ${fd(l.expiryDate)}` : ""}</p>
                <p className="text-right text-xs text-muted-foreground">{l.discount ? `${L("ราคาเต็ม", "Full price")} ${money(l.price ?? 0)}` : ""}</p>
              </div>
            ))}
          </div>
          <div className="ml-auto flex w-full max-w-xs flex-col gap-1.5 pt-3 text-sm tabular-nums">
            {r.discount ? <>
              <div className="flex justify-between gap-4"><span className="text-muted-foreground">{L("รวมราคาเต็ม", "Full price")}</span><span>{money(r.price)}</span></div>
              <div className="flex justify-between gap-4"><span className="text-muted-foreground">{L("ส่วนลด", "Discount")}</span><span>−{money(r.discount)}</span></div>
            </> : null}
            <div className="mt-1 flex items-baseline justify-between gap-4 border-t border-border/70 pt-2">
              <span className="font-bold">{L("ยอดชำระ (บาท)", "Total paid (THB)")}</span>
              <span className={`text-2xl font-bold text-primary ${r.cancelled ? "line-through" : ""}`} data-testid="receipt-detail-total">{money(r.amount)}</span>
            </div>
          </div>
        </Card>
        <Card className="order-1 gap-4 rounded-3xl p-5 text-sm lg:order-2">
          <div className="rounded-2xl bg-accent/40 px-4 py-3">
            <p className="text-xs text-muted-foreground">{L("ยอดที่รับ", "Amount received")}</p>
            <p className={`text-3xl font-bold text-primary tabular-nums ${r.cancelled ? "line-through" : ""}`}>{money(r.amount)} ฿</p>
          </div>
          <div className="flex flex-col gap-3 px-1">
            <div className="flex justify-between gap-3"><span className="text-muted-foreground">{L("วิธีชำระ", "Paid by")}</span><span className="font-semibold">{methodLabel(r.method, getLang())}</span></div>
            <div className="flex justify-between gap-3"><span className="text-muted-foreground">{L("วันที่ชำระ", "Payment date")}</span><span className="font-semibold tabular-nums">{fd(r.date)}</span></div>
            <div className="flex justify-between gap-3"><span className="shrink-0 text-muted-foreground">{L("หมายเหตุ", "Remark")}</span><span className="text-right font-semibold">{r.remark || "-"}</span></div>
          </div>
          {r.slip ? (
            <>
              <p className="text-xs text-muted-foreground">{L("สลิปโอน (กดดูใหญ่)", "Transfer slip (tap to enlarge)")}</p>
              <button type="button" onClick={() => setSlipOpen(true)} className="overflow-hidden rounded-2xl border border-border/60" aria-label={L("ดูสลิปใหญ่", "View the slip")}>
                <img src={r.slip} alt={L("สลิปโอน", "Transfer slip")} className="max-h-72 w-full object-contain" />
              </button>
            </>
          ) : r.method === "transfer" && <p className="text-xs text-muted-foreground">{L("ไม่มีรูปสลิป", "No slip picture")}</p>}
        </Card>
      </div>
      <Dialog open={slipOpen} onOpenChange={setSlipOpen}>
        <DialogContent className="w-auto max-w-[92vw] p-3 sm:max-w-2xl">
          <DialogTitle className="sr-only">{L("สลิปโอน", "Transfer slip")}</DialogTitle>
          <DialogDescription className="sr-only">{r.no}</DialogDescription>
          <img src={r.slip} alt={L("สลิปโอน", "Transfer slip")} className="max-h-[80vh] max-w-full rounded-2xl object-contain" />
        </DialogContent>
      </Dialog>
    </div>
  );
}
