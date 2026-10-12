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
import { fdt } from "@/lib/i18n";
import { api, errorText } from "@/lib/api";
import { L, fd, getLang, prefixed } from "@/lib/i18n";
import { methodLabel, money } from "@/lib/receipt-print";

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
  const lines = r.lines?.length ? r.lines : [{ id: r.id, item: r.item, months: r.months, startDate: r.startDate, expiryDate: r.expiryDate, price: r.price, discount: r.discount, discountType: "baht" as const, discountValue: r.discount, amount: r.amount }];
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
        <div className="flex flex-wrap gap-2">
          <ReceiptActions full={full} onChanged={load} onDeleted={() => navigate({ to: "/receipts", replace: true })} />
          <ShareReceipt full={full} />
          {!r.cancelled && <EmailReceipt full={full} onSent={() => void load()} />}
          <Button className="rounded-full" onClick={() => openReceipt(r.id)} data-testid="receipt-pdf"><FileText className="h-4 w-4" /> {L("ดู PDF / พิมพ์", "View PDF / Print")}</Button>
        </div>
      </div>
      <div className="grid items-start gap-5 lg:grid-cols-[1fr_340px]">
        <Card className={`gap-4 rounded-3xl p-5 ${r.cancelled ? "opacity-75" : ""}`}>
          <div className="grid gap-3 text-sm sm:grid-cols-2">
            <div><p className="text-xs text-muted-foreground">{L("นักเรียน", "Student")}</p>
              {s ? <Link to="/students" search={{ view: r.studentId }} className="font-semibold text-primary hover:underline">{student} · <span className="font-mono">{s.code}</span></Link> : "-"}</div>
            <div><p className="text-xs text-muted-foreground">{L("ได้รับเงินจาก", "Received from")}</p><p className="font-semibold">{r.payer || student}</p></div>
          </div>
          <div className="overflow-hidden rounded-2xl border border-border/70 text-sm" data-testid="receipt-lines">
            <div className="hidden grid-cols-[1.6fr_1.6fr_1fr_1fr] gap-2 bg-muted/50 px-4 py-2 text-xs font-semibold text-muted-foreground sm:grid">
              <span>{L("คลาส", "Class")}</span><span>{L("ช่วงเวลา", "Period")}</span><span>{L("ส่วนลด", "Discount")}</span><span className="text-right">{L("จำนวนเงิน", "Amount")}</span>
            </div>
            {lines.map((l) => (
              <div key={l.id} className="grid gap-x-2 gap-y-0.5 border-t border-border/50 px-4 py-2.5 first:border-0 sm:grid-cols-[1.6fr_1.6fr_1fr_1fr]">
                <span className="font-semibold">{l.item}{l.months ? L(` · ${l.months} เดือน`, ` · ${l.months} ${l.months === 1 ? "month" : "months"}`) : ""}</span>
                <span className="text-muted-foreground">{l.startDate ? `${fd(l.startDate)} – ${fd(l.expiryDate)}` : "-"}</span>
                <span className={`text-muted-foreground ${l.discount ? "" : "hidden sm:block"}`}><span className="sm:hidden">{L("ส่วนลด", "Discount")} </span>{off(l)}</span>
                <span className="font-semibold sm:text-right">{money(l.amount ?? 0)}</span>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap items-baseline justify-end gap-x-5 gap-y-1">
            <span className="text-sm text-muted-foreground">{L("รวม", "Subtotal")} {money(r.price)}{r.discount ? ` · ${L("ส่วนลด", "discount")} ${money(r.discount)}` : ""}</span>
            <span className={`text-2xl font-bold text-primary ${r.cancelled ? "line-through" : ""}`} data-testid="receipt-detail-total">{money(r.amount)} {L("บาท", "THB")}</span>
          </div>
          {r.remark && <p className="text-sm">{L("หมายเหตุ", "Remark")}: {r.remark}</p>}
        </Card>
        <Card className="gap-3 rounded-3xl p-5 text-sm">
          <div><p className="text-xs text-muted-foreground">{L("ชำระโดย", "Paid by")}</p><p className="font-semibold">{methodLabel(r.method, getLang())} · {fd(r.date)}</p></div>
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
