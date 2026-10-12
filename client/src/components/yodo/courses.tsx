import { useEffect, useState } from "react";
import { Banknote, CalendarPlus, Pencil, Plus, RefreshCw, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DateField, Field, NativeSelect, ReceiptUpload } from "@/components/yodo/ui";
import { useNavigate } from "@tanstack/react-router";
import { L, fd, getLang } from "@/lib/i18n";
import { methodLabel, money } from "@/lib/receipt-print";
import { addPeriod, courseEnd, courseState, daysLeft, daysText, nextStart, todayIso, type PeriodUnit } from "@/lib/courses";
import { fullName, useYodo, type BuyLine, type Enrollment, type PaymentInput, type Student } from "@/lib/yodo-store";

// Buying courses, free extensions and a student's course history (owner 12/10/2026, mockup WTr5LoqwQAEnSrKDuzZiMi).
// Any page opens the windows with openBuy / openExtend; <CourseHosts/> in the shell shows them.

const BUY = "yodo:open-buy";
const EXTEND = "yodo:open-extend";
export const openBuy = (studentId: string, classId?: string) => window.dispatchEvent(new CustomEvent(BUY, { detail: { studentId, classId } }));
export const openExtend = (enrollmentId: string) => window.dispatchEvent(new CustomEvent(EXTEND, { detail: enrollmentId }));

const STATE_CLS = {
  ok: "bg-emerald-100 text-emerald-800",
  soon: "bg-orange-100 text-orange-800",
  ended: "bg-red-100 text-red-800",
  none: "bg-muted text-muted-foreground",
} as const;
/** "5 days left" in green / orange (ending soon) / red (ended). */
export function DaysBadge({ expiry }: { expiry: string }) {
  const { data } = useYodo();
  const st = courseState(expiry, data.expiryDays);
  return <span className={`inline-flex shrink-0 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATE_CLS[st]}`} data-state={st}>{daysText(daysLeft(expiry))}</span>;
}

export function CourseHosts() {
  return <><BuyHost /><ExtendHost /></>;
}

// ---------- buy ----------
type Line = { key: number; classId: string; startDate: string; expiryDate: string; auto: boolean; price: string; discountType: "baht" | "pct"; discountValue: string };
type Pay = { on: boolean; date: string; method: "cash" | "transfer" | "card"; slip: string; payer: string; remark: string };
let keySeq = 1;
const r2 = (n: number) => Math.round(n * 100) / 100;
const lineMoney = (l: Line) => {
  const price = Number(l.price) || 0, v = Number(l.discountValue) || 0;
  const discount = l.discountType === "pct" ? r2((price * v) / 100) : r2(v);
  return { price, discount, amount: r2(price - discount), bad: l.discountType === "pct" ? v > 100 : v > price };
};

function BuyHost() {
  const navigate = useNavigate();
  const { data, can, buyCourses } = useYodo();
  const canPay = can("receipts", "add");
  const [studentId, setStudentId] = useState<string | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [pay, setPay] = useState<Pay>({ on: false, date: "", method: "transfer", slip: "", payer: "", remark: "" });
  const [busy, setBusy] = useState(false);
  const student = data.students.find((s) => s.id === studentId) ?? null;
  const enrollmentOf = (classId: string) => data.enrollments.find((e) => e.studentId === studentId && e.classId === classId);
  const blank = (classId = ""): Line => {
    const c = data.classes.find((x) => x.id === classId);
    const start = nextStart(enrollmentOf(classId));
    return { key: keySeq++, classId, startDate: start, expiryDate: c ? courseEnd(start, c.months) : "", auto: true, price: c?.price != null ? String(c.price) : "", discountType: "baht", discountValue: "" };
  };
  useEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent<{ studentId: string; classId?: string }>).detail;
      setStudentId(d.studentId);
      setPay({ on: canPay, date: todayIso(), method: "transfer", slip: "", payer: "", remark: "" }); // payer starts empty (owner 12/10/2026)
      setLines([]);
      setPendingClass(d.classId ?? "");
    };
    window.addEventListener(BUY, on);
    return () => window.removeEventListener(BUY, on);
  }, [canPay]);
  // The first line is made once the student is known (its start date depends on the student's current course).
  const [pendingClass, setPendingClass] = useState<string | null>(null);
  if (studentId && pendingClass !== null && lines.length === 0) { setLines([blank(pendingClass)]); setPendingClass(null); }

  const usable = (l: Line) => data.classes.filter((c) => c.id === l.classId || (!lines.some((x) => x.classId === c.id) && ((c.status === "Active" && !c.disabled) || !!enrollmentOf(c.id))));
  const setLine = (key: number, patch: Partial<Line>) => setLines((ls) => ls.map((l) => {
    if (l.key !== key) return l;
    const n = { ...l, ...patch };
    const c = data.classes.find((x) => x.id === n.classId);
    if (patch.classId !== undefined) {
      n.startDate = nextStart(enrollmentOf(n.classId));
      n.price = c?.price != null ? String(c.price) : n.price;
      n.auto = true;
    }
    if (n.auto && c && n.startDate && (patch.classId !== undefined || patch.startDate !== undefined)) n.expiryDate = courseEnd(n.startDate, c.months);
    return n;
  }));
  const sums = lines.reduce((t, l) => { const m = lineMoney(l); return { price: t.price + m.price, discount: t.discount + m.discount, amount: t.amount + m.amount }; }, { price: 0, discount: 0, amount: 0 });
  const close = () => { if (!busy) setStudentId(null); };

  const submit = async () => {
    if (!student) return;
    if (!lines.length) return void toast.error(L("กรุณาเพิ่มคลาส", "Please add a class"));
    for (const l of lines) {
      if (!l.classId) return void toast.error(L("กรุณาเลือกคลาสให้ครบ", "Please choose a class on every line"));
      if (!l.startDate || !l.expiryDate) return void toast.error(L("กรุณาใส่วันเริ่มและวันหมดอายุ", "Please fill in the start and expiry dates"));
      if (l.expiryDate < l.startDate) return void toast.error(L("วันหมดอายุต้องไม่ก่อนวันเริ่ม", "The expiry date cannot be before the start"));
      if (lineMoney(l).bad) return void toast.error(L("ส่วนลดมากกว่าราคา", "The discount is more than the price"));
    }
    if (pay.on && !pay.date) return void toast.error(L("กรุณาเลือกวันที่รับเงิน", "Please choose the payment date"));
    const body: BuyLine[] = lines.map((l) => ({ classId: l.classId, startDate: l.startDate, expiryDate: l.expiryDate, price: Number(l.price) || 0, discountType: l.discountType, discountValue: Number(l.discountValue) || 0 }));
    const p: PaymentInput | undefined = pay.on ? { date: pay.date, method: pay.method, slip: pay.method === "transfer" ? pay.slip : "", payer: pay.payer.trim(), remark: pay.remark.trim() } : undefined;
    setBusy(true);
    try {
      const r = await buyCourses(student.id, body, p);
      setStudentId(null);
      if (r) { toast.success(L(`ออกใบเสร็จ ${r.no} แล้ว`, `Receipt ${r.no} issued`)); void navigate({ to: "/receipts/$id", params: { id: r.id } }); }
      else toast.success(L("บันทึกคลาสแล้ว", "Classes saved"));
    } catch { /* shown by the store */ }
    setBusy(false);
  };
  const setP = <K extends keyof Pay>(k: K, v: Pay[K]) => setPay((x) => ({ ...x, [k]: v }));

  return (
    <Dialog open={!!student} onOpenChange={(o) => { if (!o) close(); }}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl" data-testid="buy-dialog">
        <DialogHeader>
          <DialogTitle>{L("ซื้อคลาส", "Buy classes")}{student ? ` · ${fullName(student)}` : ""}</DialogTitle>
          <DialogDescription>{L("เลือกได้หลายคลาส ออกใบเสร็จใบเดียว", "Several classes, one receipt")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {lines.map((l, i) => {
            const m = lineMoney(l);
            const c = data.classes.find((x) => x.id === l.classId);
            const en = enrollmentOf(l.classId);
            return (
              <div key={l.key} className="grid gap-3 rounded-2xl border border-border/70 bg-background p-3 sm:grid-cols-2" data-testid="buy-line">
                <div>
                  <Field label={L(`คลาสที่ ${i + 1}`, `Class ${i + 1}`)}>
                    <NativeSelect value={l.classId} onValueChange={(v) => setLine(l.key, { classId: v })}>
                      <option value="">{L("เลือกคลาส", "Choose a class")}</option>
                      {usable(l).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                    </NativeSelect>
                  </Field>
                  {c && <p className="mt-1 text-xs text-muted-foreground">{L(`${c.months} เดือน`, `${c.months} ${c.months === 1 ? "month" : "months"}`)}{en?.expiryDate ? ` · ${L("ตอนนี้หมดอายุ", "now ends")} ${fd(en.expiryDate)}` : ""}</p>}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Field label={L("เริ่ม", "Start")}><DateField value={l.startDate} onChange={(v) => setLine(l.key, { startDate: v })} /></Field>
                  <Field label={L("หมดอายุ", "Expiry")}><DateField value={l.expiryDate} min={l.startDate || undefined} onChange={(v) => setLine(l.key, { expiryDate: v, auto: false })} /></Field>
                </div>
                <div className="flex flex-wrap items-end gap-2 sm:col-span-2">
                  <Field label={L("ราคา", "Price")} className="w-32"><Input type="number" min={0} inputMode="decimal" value={l.price} onChange={(e) => setLine(l.key, { price: e.target.value })} data-testid="line-price" /></Field>
                  <Field label={L("ส่วนลด", "Discount")} error={m.bad ? L("เกินราคา", "Too much") : undefined} className="w-44">
                    <div className="flex gap-1">
                      <Input type="number" min={0} inputMode="decimal" placeholder="0" value={l.discountValue} onChange={(e) => setLine(l.key, { discountValue: e.target.value })} className="min-w-0" data-testid="line-discount" />
                      <div className="flex shrink-0 overflow-hidden rounded-lg border border-border text-xs font-bold" role="group" aria-label={L("ส่วนลดเป็น", "Discount in")}>
                        {(["pct", "baht"] as const).map((t) => (
                          <button key={t} type="button" aria-pressed={l.discountType === t} onClick={() => setLine(l.key, { discountType: t })}
                            className={`px-2.5 ${l.discountType === t ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted"}`}>{t === "pct" ? "%" : L("บาท", "THB")}</button>
                        ))}
                      </div>
                    </div>
                  </Field>
                  <p className="ml-auto pb-2 text-sm">{L("สุทธิ", "Net")} <span className="font-semibold" data-testid="line-amount">{money(m.amount)}</span></p>
                  {lines.length > 1 && <Button type="button" size="icon" variant="ghost" className="mb-0.5 h-9 w-9 rounded-full text-destructive" aria-label={L("เอาคลาสนี้ออก", "Remove this class")} onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}><X className="h-4 w-4" /></Button>}
                </div>
              </div>
            );
          })}
          <Button type="button" variant="outline" className="rounded-full border-dashed text-primary" onClick={() => setLines((ls) => [...ls, blank()])}><Plus className="h-4 w-4" /> {L("เพิ่มคลาส", "Add a class")}</Button>
          <div className="flex flex-wrap items-baseline justify-end gap-x-6 gap-y-1 border-t border-border pt-3 text-sm">
            <span className="text-muted-foreground">{L("รวม", "Subtotal")} {money(sums.price)}{sums.discount ? ` · ${L("ส่วนลด", "discount")} ${money(sums.discount)}` : ""}</span>
            <span className="text-lg font-bold text-primary">{L("ยอดชำระ", "Total")} <span data-testid="buy-total">{money(sums.amount)}</span> {L("บาท", "THB")}</span>
          </div>
          {canPay && (
            <div className="space-y-3 rounded-2xl border border-border/60 p-4" data-testid="payment-box">
              <label className="flex items-center gap-2 text-sm font-semibold">
                <input type="checkbox" className="h-4 w-4 accent-primary" checked={pay.on} onChange={(e) => setP("on", e.target.checked)} />
                <Banknote className="h-4 w-4 text-primary" /> {L("รับเงินและออกใบเสร็จ", "Take payment and issue a receipt")}
              </label>
              {pay.on && (
                <>
                  <div className="flex flex-wrap gap-2">
                    {(["cash", "transfer", "card"] as const).map((x) => (
                      <button key={x} type="button" onClick={() => setP("method", x)} aria-pressed={pay.method === x}
                        className={`h-9 rounded-full px-4 text-sm transition-colors ${pay.method === x ? "bg-primary text-primary-foreground" : "border border-border bg-background hover:bg-muted"}`}>{methodLabel(x, getLang())}</button>
                    ))}
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label={L("วันที่รับเงิน", "Payment date")}><DateField value={pay.date} onChange={(v) => setP("date", v)} /></Field>
                    <Field label={L("ชื่อผู้จ่าย (ในใบเสร็จ)", "Payer (on the receipt)")}><Input data-testid="pay-payer" value={pay.payer} placeholder={L("ไม่ใส่ = ชื่อนักเรียน", "Empty = the student's name")} onChange={(e) => setP("payer", e.target.value)} /></Field>
                  </div>
                  <Field label={L("หมายเหตุ (พิมพ์ในใบเสร็จ)", "Remark (printed on the receipt)")}><Textarea rows={2} maxLength={500} value={pay.remark} onChange={(e) => setP("remark", e.target.value)} data-testid="pay-remark" /></Field>
                  {pay.method === "transfer" && <Field label={L("สลิปโอน", "Transfer slip")}><ReceiptUpload value={pay.slip} onChange={(v) => setP("slip", v)} /></Field>}
                </>
              )}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={close}>{L("ยกเลิก", "Cancel")}</Button>
          <Button disabled={busy} onClick={submit}>{pay.on && canPay ? L("บันทึกและออกใบเสร็จ", "Save and issue receipt") : L("บันทึก", "Save")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------- extend ----------
function ExtendHost() {
  const { data, extendCourse } = useYodo();
  const [eid, setEid] = useState<string | null>(null);
  const [n, setN] = useState("7");
  const [unit, setUnit] = useState<PeriodUnit>("day");
  const [own, setOwn] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const on = (e: Event) => { setEid((e as CustomEvent<string>).detail); setN("7"); setUnit("day"); setOwn(""); setReason(""); };
    window.addEventListener(EXTEND, on);
    return () => window.removeEventListener(EXTEND, on);
  }, []);
  const en = data.enrollments.find((e) => e.id === eid);
  const s = en ? data.students.find((x) => x.id === en.studentId) : undefined;
  const c = en ? data.classes.find((x) => x.id === en.classId) : undefined;
  const base = en?.expiryDate || todayIso();
  const auto = addPeriod(base, Number(n) || 0, unit);
  const to = own || auto;
  const ok = !!en && to > (en.expiryDate || "");
  const save = async () => {
    if (!en || !ok) return void toast.error(L("วันหมดอายุใหม่ต้องหลังวันเดิม", "The new expiry date must be after the current one"));
    setBusy(true);
    try { await extendCourse(en.id, to, reason.trim()); toast.success(L("ขยายเวลาแล้ว", "Class extended")); setEid(null); } catch { /* shown by the store */ }
    setBusy(false);
  };
  return (
    <Dialog open={!!en} onOpenChange={(o) => { if (!o && !busy) setEid(null); }}>
      <DialogContent className="sm:max-w-md" data-testid="extend-dialog">
        <DialogHeader>
          <DialogTitle>{L(`ขยายเวลาคลาส ${c?.name ?? ""}`, `Extend ${c?.name ?? ""}`)}</DialogTitle>
          <DialogDescription>{s ? fullName(s) : ""} · {L("หมดอายุตอนนี้", "Now ends")} {fd(en?.expiryDate)}</DialogDescription>
        </DialogHeader>
        <Field label={L("ขยายเพิ่ม", "Extend by")}>
          <div className="flex flex-wrap items-center gap-2">
            <Input type="number" min={1} inputMode="numeric" className="w-20" value={n} onChange={(e) => { setN(e.target.value); setOwn(""); }} data-testid="extend-n" />
            <div className="flex overflow-hidden rounded-full border border-border text-sm font-semibold" role="group" aria-label={L("หน่วย", "Unit")}>
              {(["day", "week", "month"] as const).map((u) => (
                <button key={u} type="button" aria-pressed={unit === u} onClick={() => { setUnit(u); setOwn(""); }}
                  className={`h-9 px-3 ${unit === u ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted"}`}>{u === "day" ? L("วัน", "days") : u === "week" ? L("สัปดาห์", "weeks") : L("เดือน", "months")}</button>
              ))}
            </div>
          </div>
        </Field>
        <Field label={L("หมดอายุใหม่ (แก้วันที่เองได้)", "New expiry date (you can change it)")}><DateField value={to} min={base} onChange={setOwn} /></Field>
        <Field label={L("เหตุผล", "Reason")}><Input value={reason} maxLength={300} placeholder={L("เช่น ครูป่วย 1 สัปดาห์", "e.g. teacher ill for a week")} onChange={(e) => setReason(e.target.value)} data-testid="extend-reason" /></Field>
        <p className="text-xs text-muted-foreground">{L("ไม่เก็บเงิน ไม่ออกใบเสร็จ · บันทึกไว้ในประวัติของนักเรียนและประวัติการแก้ไข", "No money, no receipt · kept in the student's history and the audit log")}</p>
        <DialogFooter>
          <Button variant="outline" onClick={() => setEid(null)}>{L("ยกเลิก", "Cancel")}</Button>
          <Button disabled={busy || !ok} onClick={save}>{L("ขยายเวลา", "Extend")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------- a student's courses (details window, "Courses" tab) ----------
export function StudentCourses({ student, onEdit }: { student: Student; onEdit: (e: Enrollment) => void }) {
  const navigate = useNavigate();
  const { data, can } = useYodo();
  const mine = data.enrollments.filter((e) => e.studentId === student.id)
    .map((e) => ({ e, c: data.classes.find((x) => x.id === e.classId) }))
    .sort((a, b) => (a.e.expiryDate || "9999").localeCompare(b.e.expiryDate || "9999"));
  const history = data.purchases.filter((p) => p.studentId === student.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const seeMoney = history.some((p) => p.amount !== undefined);
  const paid = history.filter((p) => p.kind === "buy" && !p.cancelled).reduce((t, p) => t + (p.amount ?? 0), 0);
  const canBuy = can("students", "edit") && student.status === "Active";
  const canExtend = can("courses", "edit");
  const extDays = (e: Enrollment) => history.filter((p) => p.enrollmentId === e.id && p.kind === "extend" && p.fromExpiry && p.expiryDate <= e.expiryDate)
    .reduce((t, p) => t + Math.max(0, Math.round((Date.parse(p.expiryDate) - Date.parse(p.fromExpiry)) / 864e5)), 0);
  return (
    <div className="space-y-4" data-testid="student-courses">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold">{L(`คลาสที่มีตอนนี้ (${mine.length})`, `Current classes (${mine.length})`)}</p>
        {canBuy && <Button size="sm" className="rounded-full" onClick={() => openBuy(student.id)}><Plus className="h-4 w-4" /> {L("ซื้อคลาส", "Buy classes")}</Button>}
      </div>
      {mine.length === 0 ? <p className="text-sm text-muted-foreground">{L("ยังไม่มีคลาส", "No classes yet")}</p> : (
        <div className="grid gap-3 sm:grid-cols-2">
          {mine.map(({ e, c }) => {
            const ext = extDays(e);
            return (
              <div key={e.id} className="space-y-2 rounded-2xl border border-border/70 bg-background p-3.5" data-testid="course-card">
                <div className="flex items-center justify-between gap-2"><span className="font-semibold">{c?.name ?? "-"}</span><DaysBadge expiry={e.expiryDate} /></div>
                <p className="text-xs text-muted-foreground">{fd(e.startDate)} – {fd(e.expiryDate)}{ext ? L(` · ขยายแล้ว ${ext} วัน`, ` · extended ${ext} days`) : ""}</p>
                <div className="flex flex-wrap gap-1.5">
                  {canBuy && <Button size="sm" variant="outline" className="h-8 rounded-full" onClick={() => openBuy(student.id, e.classId)}><RefreshCw className="h-3.5 w-3.5" /> {L("ต่ออายุ", "Renew")}</Button>}
                  {canExtend && <Button size="sm" variant="outline" className="h-8 rounded-full" onClick={() => openExtend(e.id)}><CalendarPlus className="h-3.5 w-3.5" /> {L("ขยายเวลา", "Extend")}</Button>}
                  {can("students", "edit") && <Button size="icon" variant="ghost" className="h-8 w-8 rounded-full text-muted-foreground" title={L("แก้ไขวันที่ / นำออกจากคลาส", "Fix dates / remove from class")} aria-label={L(`แก้ไข ${c?.name ?? ""}`, `Edit ${c?.name ?? ""}`)} onClick={() => onEdit(e)}><Pencil className="h-3.5 w-3.5" /></Button>}
                </div>
              </div>
            );
          })}
        </div>
      )}
      <p className="pt-1 text-sm font-semibold">{L("ประวัติการซื้อ", "Purchase history")}</p>
      {history.length === 0 ? <p className="text-sm text-muted-foreground">{L("ยังไม่มีประวัติ", "No history yet")}</p> : (
        <div className="overflow-hidden rounded-2xl border border-border/70" data-testid="course-history">
          {history.map((p) => {
            const label = p.kind === "extend"
              ? L(`ขยายเวลา ${p.item}`, `Extended ${p.item}`)
              : L(`ซื้อ ${p.item}${p.months ? ` ${p.months} เดือน` : ""}`, `Bought ${p.item}${p.months ? ` ${p.months} ${p.months === 1 ? "month" : "months"}` : ""}`);
            const period = p.kind === "extend" ? `${L("หมดอายุ", "Expiry")} ${fd(p.fromExpiry)} → ${fd(p.expiryDate)}` : `${fd(p.startDate)} – ${fd(p.expiryDate)}`;
            return (
              <div key={p.id} className={`grid gap-x-3 gap-y-0.5 border-b border-border/50 px-3 py-2.5 text-sm last:border-0 sm:grid-cols-[90px_1.3fr_1.6fr_90px_120px] ${p.kind === "extend" ? "bg-amber-50/60" : ""} ${p.cancelled ? "text-muted-foreground line-through" : ""}`} data-testid="history-row">
                <span className="text-muted-foreground">{fd(p.date)}</span>
                <span className="font-medium">{label}</span>
                <span className="text-muted-foreground">{period}</span>
                <span className="sm:text-right">{p.kind === "extend" ? L("ฟรี", "Free") : seeMoney && p.amount !== undefined ? money(p.amount) : ""}</span>
                <span className="truncate">{p.kind === "extend"
                  ? <span className="text-muted-foreground no-underline">{p.reason}</span>
                  : p.receiptNo && can("receipts") ? <button type="button" className="font-mono text-primary hover:underline" onClick={() => navigate({ to: "/receipts/$id", params: { id: p.receiptId } })}>{p.receiptNo}</button>
                  : <span className="font-mono text-muted-foreground">{p.receiptNo}</span>}{p.cancelled ? ` ${L("(ยกเลิก)", "(cancelled)")}` : ""}</span>
              </div>
            );
          })}
        </div>
      )}
      {seeMoney && paid > 0 && <p className="text-right text-sm text-muted-foreground">{L("จ่ายรวมทั้งหมด", "Paid in total")} <span className="font-semibold text-foreground">{money(paid)} {L("บาท", "THB")}</span></p>}
    </div>
  );
}
