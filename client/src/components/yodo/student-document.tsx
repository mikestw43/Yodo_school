import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import type { Student } from "@/lib/yodo-store";
import { appliedOn, formSections, signerLabel, terms } from "@/lib/student-print";
import { L, fd } from "@/lib/i18n";
import { RotateCcw } from "lucide-react";
import logoUrlRaw from "@/assets/yodo-logo.png";
const logo = { url: logoUrlRaw };

export type SignCanvasHandle = { clear: () => void; isDirty: () => boolean; toDataURL: () => string };

/** Inline signature canvas drawn directly on the document's signature line. */
export const SignCanvas = forwardRef<SignCanvasHandle, { onDirty: () => void }>(function SignCanvas({ onDirty }, ref) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const dirty = useRef(false);
  const setup = (c: HTMLCanvasElement) => {
    const dpr = window.devicePixelRatio || 1;
    c.width = c.offsetWidth * dpr; c.height = c.offsetHeight * dpr;
    const ctx = c.getContext("2d")!; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.lineWidth = 2.2; ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.strokeStyle = "#111";
  };
  useImperativeHandle(ref, () => ({
    clear: () => { const c = canvasRef.current; if (!c) return; const ctx = c.getContext("2d")!; ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, c.width, c.height); ctx.restore(); ctx.beginPath(); dirty.current = false; drawing.current = false; },
    isDirty: () => dirty.current,
    toDataURL: () => canvasRef.current!.toDataURL("image/png"),
  }));
  const pos = (e: React.PointerEvent<HTMLCanvasElement>) => { const r = e.currentTarget.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top] as const; };
  return (
    <canvas ref={canvasRef} className="absolute inset-0 h-full w-full touch-none cursor-crosshair"
      onPointerDown={(e) => { if (!dirty.current) setup(e.currentTarget); e.currentTarget.setPointerCapture(e.pointerId); drawing.current = true; const ctx = e.currentTarget.getContext("2d")!; const [x, y] = pos(e); ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 0.1, y + 0.1); ctx.stroke(); dirty.current = true; onDirty(); }}
      onPointerMove={(e) => { if (!drawing.current) return; const ctx = e.currentTarget.getContext("2d")!; const [x, y] = pos(e); ctx.lineTo(x, y); ctx.stroke(); }}
      onPointerUp={() => { drawing.current = false; }} onPointerLeave={() => { drawing.current = false; }} />
  );
});

/** The one signature: drawn once (on page 2) and shown on both pages (owner 12/10/2026). */
function SignatureBlock({ student, signMode, canvasRef, onDirty, showOld = false, mirror = false }: {
  student: Student; showOld?: boolean; signMode: boolean; mirror?: boolean; canvasRef?: React.Ref<SignCanvasHandle> | undefined; onDirty?: (() => void) | undefined;
}) {
  const date = student.signedAt ? fd(student.signedAt) : fd(new Date());
  const old = student.signature ? <img className="ydoc-sign-img" src={student.signature} alt={L("ลายเซ็น", "Signature")} /> : null;
  return (
    <div className="ydoc-signature">
      <span className="ydoc-line">
        {signMode && !mirror ? (
          <>
            {showOld && old ? old : <span className="ydoc-sign-hint">{L("เซ็นที่นี่", "Sign here")}</span>}
            <SignCanvas ref={canvasRef} onDirty={onDirty ?? (() => {})} />
          </>
        ) : signMode ? (
          <span className="ydoc-sign-hint">{L("ใช้ลายเซ็นเดียวกับหน้า 2", "Uses the signature from page 2")}</span>
        ) : old}
      </span>
      <div className="ydoc-sign-who">{signerLabel()}</div>
      <div className="ydoc-sign-date"><span>{L("วันที่", "Date")}</span><span>{date}</span></div>
    </div>
  );
}

/** On-screen mirror of the printable A4 document (terms page + registration form page). */
export function StudentDocument({ student, signMode = false, canvasRef, onDirty, resetKey = 0, showOld = false }: {
  student: Student;
  showOld?: boolean;
  resetKey?: number;
  signMode?: boolean;
  canvasRef?: React.Ref<SignCanvasHandle> | undefined;
  onDirty?: (() => void) | undefined;
}) {
  const photo = student.image && (/^data:image\//i.test(student.image) || /^https?:\/\//i.test(student.image) || student.image.startsWith("/api/files/"));
  return (
    <div className="ydoc-root">
      <style>{`
        .ydoc-root { color: #171717; font-family: Tahoma, Arial, sans-serif; }
        .ydoc-sheet { width: 210mm; max-width: 100%; min-height: 297mm; padding: 12mm 14mm 11mm; margin: 0 auto 8mm; background: #fff; box-shadow: 0 2px 15px rgba(0,0,0,.18); display: flex; flex-direction: column; overflow: hidden; }
        .ydoc-logo { width: 66mm; height: 34mm; object-fit: contain; display: block; margin: 0 auto; }
        .ydoc-terms { margin-top: 8mm; font-size: 10.2pt; line-height: 1.55; }
        .ydoc-terms-title { margin: 0 0 5mm; font-size: 10.6pt; }
        .ydoc-terms ol { margin: 0; padding-left: 10mm; }
        .ydoc-terms li { padding-left: 3mm; margin-bottom: 3.1mm; }
        .ydoc-signature { width: 72mm; margin: auto 0 0 auto; font-size: 10pt; padding-top: 8mm; text-align: center; }
        .ydoc-line { display: block; height: 16mm; border-bottom: 1px solid #111; position: relative; }
        .ydoc-sign-img { position: absolute; left: 50%; bottom: 1mm; transform: translateX(-50%); max-height: 15mm; max-width: 100%; object-fit: contain; }
        .ydoc-sign-hint { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; color: #b3b3b3; font-size: 9pt; pointer-events: none; }
        .ydoc-sign-who { padding-top: 1.5mm; }
        .ydoc-sign-date { display: flex; justify-content: center; gap: 2mm; color: #5f4b52; padding-top: 0.5mm; }
        .ydoc-p2 { padding: 12mm 15mm 11mm; gap: 5mm; font-family: 'Noto Sans Thai', Tahoma, sans-serif; color: #2b2024; }
        .ydoc-head { display: flex; align-items: flex-start; gap: 6mm; }
        .ydoc-head-text { flex: 1; display: flex; flex-direction: column; gap: 2.5mm; min-width: 0; }
        .ydoc-p2 .ydoc-logo { width: 50mm; height: 26mm; object-position: left center; margin: 0; }
        .ydoc-title { margin: 0; font-family: 'Noto Serif Thai', serif; font-size: 22pt; font-weight: 700; color: #8e2d4c; line-height: 1.1; }
        .ydoc-meta { display: flex; flex-wrap: wrap; gap: 1mm 5mm; font-size: 9.5pt; color: #6b5a60; }
        .ydoc-meta b { color: #2b2024; font-weight: 600; }
        .ydoc-photo { display: block; width: 35mm; height: 45mm; object-fit: cover; border-radius: 2.5mm; border: 1px solid #ead7dd; flex-shrink: 0; }
        .ydoc-photo-empty { width: 35mm; height: 45mm; border-radius: 2.5mm; border: 1px dashed #ead7dd; flex-shrink: 0; }
        .ydoc-sec { display: flex; flex-direction: column; gap: 2mm; }
        .ydoc-sec-title { display: flex; align-items: center; gap: 2.5mm; font-size: 10pt; font-weight: 600; color: #8e2d4c; white-space: nowrap; }
        .ydoc-sec-title i { flex: 1; height: 1px; background: #e6c9d2; }
        .ydoc-grid { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); column-gap: 4.5mm; row-gap: 2.6mm; }
        .ydoc-lbl { font-size: 8.3pt; color: #7a666c; }
        .ydoc-val { font-size: 10.5pt; min-height: 6mm; padding-bottom: 0.8mm; border-bottom: 1px dotted #b9a2a9; word-break: break-word; }
      `}</style>
      <section className="ydoc-sheet">
        <img className="ydoc-logo" src={logo.url} alt="YODO You Only Dance Once" />
        <div className="ydoc-terms">
          <p className="ydoc-terms-title">{L("ข้อตกลงและเงื่อนไขของโรงเรียน", "School terms and conditions")}</p>
          <ol>{terms().map((term, i) => <li key={i}>{term}</li>)}</ol>
        </div>
        <SignatureBlock key={resetKey} student={student} signMode={signMode} mirror />
      </section>
      <section className="ydoc-sheet ydoc-p2">
        <div className="ydoc-head">
          <div className="ydoc-head-text">
            <img className="ydoc-logo" src={logo.url} alt="YODO You Only Dance Once" />
            <h1 className="ydoc-title">{L("ใบสมัครเรียน", "Application form")}</h1>
            <div className="ydoc-meta">
              <span>{L("รหัสนักเรียน", "Student ID")} <b>{student.code}</b></span>
              <span>{L("วันที่สมัคร", "Applied on")} <b>{appliedOn(student)}</b></span>
            </div>
          </div>
          {photo
            ? <img className="ydoc-photo" src={student.image!} alt={L("รูปนักเรียน", "Student photo")} />
            : <div className="ydoc-photo-empty" />}
        </div>
        {formSections(student).map((sec) => (
          <div key={sec.title} className="ydoc-sec">
            <div className="ydoc-sec-title"><span>{sec.title}</span><i /></div>
            <div className="ydoc-grid">
              {sec.fields.map((x) => (
                <div key={x.label} style={{ gridColumn: `span ${x.span}` }}>
                  <div className="ydoc-lbl">{x.label}</div>
                  <div className="ydoc-val">{x.value}</div>
                </div>
              ))}
            </div>
          </div>
        ))}
        <SignatureBlock key={resetKey} showOld={showOld} student={student} signMode={signMode} canvasRef={canvasRef} onDirty={onDirty} />
      </section>
    </div>
  );
}

/** One signature canvas for the sign dialog and the student form. */
export function useSignCanvas() {
  const ref = useRef<SignCanvasHandle>(null);
  const [drawn, setDrawn] = useState(false);
  const [resetKey, setResetKey] = useState(0);
  const [cleared, setCleared] = useState(false);
  const clear = () => { ref.current?.clear(); setDrawn(false); setCleared(true); setResetKey((k) => k + 1); };
  const markDrawn = () => { setCleared(true); setDrawn(true); };
  /** Back to "nothing drawn yet, show the saved signature" (a form opening again). */
  const reset = () => { setDrawn(false); setCleared(false); setResetKey((k) => k + 1); };
  const exportSignature = (): string | null => (ref.current?.isDirty() ? ref.current.toDataURL() : null);
  return { ref, clear, reset, exportSignature, markDrawn, hasSignature: drawn, resetKey, showOld: !cleared };
}

/** Sign box (owner 12/10/2026): the terms to read, two ticks (terms accepted, details correct), then the one signature.
 *  Used at the end of the student form and in the "sign again" window. */
export function SignBox({ sig, current }: { sig: ReturnType<typeof useSignCanvas>; current?: string | undefined }) {
  const [agree, setAgree] = useState(false);
  const [correct, setCorrect] = useState(false);
  const ready = agree && correct;
  return (
    <div className="space-y-3">
      <p className="text-sm font-semibold">{L("ข้อตกลงและเงื่อนไขของโรงเรียน", "School terms and conditions")}</p>
      <ol className="max-h-44 list-decimal space-y-1.5 overflow-y-auto rounded-2xl border border-border bg-muted/40 py-3 pl-8 pr-4 text-xs leading-relaxed text-foreground/80" data-testid="sign-terms">
        {terms().map((t, i) => <li key={i}>{t}</li>)}
      </ol>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 accent-primary" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
        {L("อ่านและยอมรับข้อตกลงและเงื่อนไขแล้ว", "I have read and accept the terms and conditions")}
      </label>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 accent-primary" checked={correct} onChange={(e) => setCorrect(e.target.checked)} />
        {L("ข้อมูลที่ให้ไว้ถูกต้องตามความเป็นจริง", "The details given are true and correct")}
      </label>
      <div className="flex items-center justify-between gap-2 pt-1">
        <p className="text-sm font-semibold">{L("ลายเซ็นผู้สมัคร / ผู้ปกครอง", "Applicant / Parent signature")}</p>
        <button type="button" onClick={sig.clear} disabled={!ready} className="inline-flex h-8 items-center gap-1.5 rounded-full border border-border bg-background px-3 text-xs disabled:opacity-40">
          <RotateCcw className="h-3.5 w-3.5" /> {L("เซ็นใหม่", "Sign again")}
        </button>
      </div>
      <div key={sig.resetKey} className={`relative h-36 rounded-2xl border-[1.5px] border-dashed bg-background ${ready ? "border-primary/40" : "border-border opacity-60"}`} data-testid="form-sign">
        {sig.showOld && current
          ? <img src={current} alt={L("ลายเซ็น", "Signature")} className="pointer-events-none absolute inset-0 m-auto max-h-28 max-w-[80%] object-contain" />
          : !sig.hasSignature && <span className="pointer-events-none absolute inset-0 flex items-center justify-center px-4 text-center text-sm text-muted-foreground">{ready ? L("เซ็นที่นี่", "Sign here") : L("ติ๊กทั้ง 2 ช่องด้านบนก่อนเซ็น", "Tick both boxes above before signing")}</span>}
        {ready && <SignCanvas ref={sig.ref} onDirty={sig.markDrawn} />}
      </div>
      <p className="text-xs text-muted-foreground">{L("เซ็นครั้งเดียว ใช้ทั้งหน้า 1 และหน้า 2 ของใบสมัคร", "Sign once; it is used on both pages of the application")}</p>
    </div>
  );
}
