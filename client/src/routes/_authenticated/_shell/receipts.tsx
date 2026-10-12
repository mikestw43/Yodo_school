import { useCallback, useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/yodo/ui";
import { openReceipt, RECEIPTS_CHANGED } from "@/components/yodo/receipt";
import { api, errorText } from "@/lib/api";
import { fd, fMonthYear, L, useLang } from "@/lib/i18n";
import { methodLabel, money } from "@/lib/receipt-print";
import { fullName, useYodo, type Receipt } from "@/lib/yodo-store";

export const Route = createFileRoute("/_authenticated/_shell/receipts")({
  component: ReceiptsPage,
});

type Summary = { total: number; count: number; cancelled: number; cash: number; transfer: number; card: number };
const thisMonth = () => new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 7);
const shift = (m: string, n: number) => { const [y, mo] = m.split("-").map(Number); const d = new Date(Date.UTC(y!, mo! - 1 + n, 1)); return d.toISOString().slice(0, 7); };

// Receipts by month with the month's money in (owner 12/10/2026, mockup board 5). Cancelled ones stay, struck through.
function ReceiptsPage() {
  const { data } = useYodo();
  const lang = useLang();
  const [month, setMonth] = useState(thisMonth());
  const [rows, setRows] = useState<Receipt[] | null>(null);
  const [sum, setSum] = useState<Summary | null>(null);
  const load = useCallback(() => {
    Promise.all([api<Receipt[]>(`/receipts?month=${month}`), api<Summary>(`/receipts/summary?month=${month}`)])
      .then(([r, s]) => { setRows(r); setSum(s); })
      .catch((e) => toast.error(errorText(e)));
  }, [month]);
  useEffect(() => { setRows(null); load(); }, [load]);
  useEffect(() => { window.addEventListener(RECEIPTS_CHANGED, load); return () => window.removeEventListener(RECEIPTS_CHANGED, load); }, [load]);
  const student = (id: string) => data.students.find((s) => s.id === id);

  return (
    <>
      <PageHeader title={L("ใบเสร็จรับเงิน", "Receipts")} subtitle={L("ใบเสร็จจากการซื้อคลาส", "Receipts from class purchases")}
        action={
          <div className="flex items-center gap-2">
            <button type="button" aria-label={L("เดือนก่อน", "Previous month")} onClick={() => setMonth(shift(month, -1))} className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-background hover:bg-muted"><ChevronLeft className="h-4 w-4" /></button>
            <span className="min-w-36 text-center font-semibold" data-testid="receipt-month">{fMonthYear(`${month}-01`)}</span>
            <button type="button" aria-label={L("เดือนถัดไป", "Next month")} onClick={() => setMonth(shift(month, 1))} className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-background hover:bg-muted"><ChevronRight className="h-4 w-4" /></button>
          </div>
        } />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card className="rounded-3xl border-0 bg-primary p-4 text-primary-foreground"><p className="text-xs opacity-85">{L("รับเงินเดือนนี้", "Money in this month")}</p><p className="font-display text-2xl font-bold" data-testid="receipt-total">{sum ? money(sum.total) : "-"}</p></Card>
        <Card className="rounded-3xl p-4"><p className="text-xs text-muted-foreground">{L("จำนวนใบเสร็จ", "Receipts")}</p><p className="font-display text-2xl font-bold">{sum?.count ?? "-"}</p></Card>
        <Card className="rounded-3xl p-4"><p className="text-xs text-muted-foreground">{L("เงินสด / โอน / บัตร", "Cash / transfer / card")}</p><p className="pt-1.5 text-sm font-bold">{sum ? `${money(sum.cash)} / ${money(sum.transfer)} / ${money(sum.card)}` : "-"}</p></Card>
        <Card className="rounded-3xl p-4"><p className="text-xs text-muted-foreground">{L("ยกเลิก", "Cancelled")}</p><p className="font-display text-2xl font-bold">{sum?.cancelled ?? "-"}</p></Card>
      </div>
      {rows && rows.length === 0 ? <EmptyState title={L("ยังไม่มีใบเสร็จในเดือนนี้", "No receipts this month")} text={L("ออกใบเสร็จได้ตอนเพิ่มนักเรียนเข้าคลาส", "Receipts are issued when a student is added to a class")} /> : (
        <Card className="overflow-hidden rounded-3xl p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm" data-testid="receipt-table">
              <thead><tr className="bg-muted/50 text-left text-muted-foreground">
                <th className="px-4 py-3 font-medium">{L("เลขที่", "No.")}</th><th className="px-4 py-3 font-medium">{L("วันที่", "Date")}</th>
                <th className="px-4 py-3 font-medium">{L("นักเรียน", "Student")}</th><th className="px-4 py-3 font-medium">{L("คอร์ส", "Course")}</th>
                <th className="px-4 py-3 font-medium">{L("รับทาง", "Paid by")}</th><th className="px-4 py-3 text-right font-medium">{L("ยอด", "Amount")}</th>
              </tr></thead>
              <tbody>
                {(rows ?? []).map((r) => {
                  const s = student(r.studentId);
                  return (
                    <tr key={r.id} onClick={() => openReceipt(r.id)} className={`cursor-pointer border-t border-border/60 hover:bg-muted/40 ${r.cancelled ? "text-muted-foreground line-through" : ""}`}>
                      <td className="px-4 py-3 font-mono">{r.no}</td><td className="px-4 py-3">{fd(r.date)}</td>
                      <td className="px-4 py-3">{s ? fullName(s) : "-"}</td><td className="px-4 py-3">{r.item}</td>
                      <td className="px-4 py-3">{methodLabel(r.method, lang)}</td><td className="px-4 py-3 text-right font-semibold">{money(r.amount)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </>
  );
}
