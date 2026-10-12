import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { format } from "date-fns";
import type { Student } from "@/lib/yodo-store";
import { ageDetail, displayDate, terms } from "@/lib/student-print";
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

function SignatureBlock({ student, signMode, canvasRef, onDirty, showOld = false }: {
  student: Student; showOld?: boolean; signMode: boolean; canvasRef?: React.Ref<SignCanvasHandle> | undefined; onDirty?: (() => void) | undefined;
}) {
  const date = student.signedAt ? student.signedAt.split("-").reverse().join("/") : format(new Date(), "dd/MM/yyyy");
  return (
    <div className="ydoc-signature">
      <div className="ydoc-sign-line">
        <span>ลายเซ็นต์</span>
        <span className="ydoc-line">
          {signMode ? (
            <>
              {showOld && student.signature
                ? <img className="ydoc-sign-img" src={student.signature} alt="ลายเซ็นเดิม" />
                : <span className="ydoc-sign-hint">เซ็นที่นี่</span>}
              <SignCanvas ref={canvasRef} onDirty={onDirty ?? (() => {})} />
            </>
          ) : student.signature ? (
            <img className="ydoc-sign-img" src={student.signature} alt="ลายเซ็น" />
          ) : null}
        </span>
      </div>
      <div className="ydoc-sign-date"><span>วันที่</span><span>{date}</span></div>
    </div>
  );
}

/** On-screen mirror of the printable A4 document (terms page + registration form page). */
export function StudentDocument({ student, signMode = false, canvasRefs, onDirty, resetKey = 0, showOld = false }: {
  student: Student;
  showOld?: boolean;
  resetKey?: number;
  signMode?: boolean;
  canvasRefs?: [React.Ref<SignCanvasHandle>, React.Ref<SignCanvasHandle>] | undefined;
  onDirty?: ((index: number) => void) | undefined;
}) {
  const nationality = student.nationality === "Other" ? student.nationalityOther : student.nationality;
  const photo = student.image && (/^data:image\//i.test(student.image) || /^https?:\/\//i.test(student.image));
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
        .ydoc-signature { width: 78mm; margin: auto 0 0 auto; font-size: 10pt; padding-top: 8mm; }
        .ydoc-sign-line, .ydoc-sign-date { display: flex; align-items: flex-end; gap: 2mm; }
        .ydoc-line { flex: 1; height: 16mm; border-bottom: 1px solid #111; position: relative; }
        .ydoc-sign-img { position: absolute; left: 50%; bottom: 0; transform: translateX(-50%); max-height: 16mm; max-width: 100%; object-fit: contain; }
        .ydoc-sign-hint { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; color: #b3b3b3; font-size: 9pt; pointer-events: none; }
        .ydoc-sign-date { justify-content: center; gap: 3mm; padding: 1mm 0 0; }
        .ydoc-photo { display: block; width: 43mm; height: 39mm; object-fit: cover; margin: 7mm auto 8mm; }
        .ydoc-photo-empty { width: 43mm; height: 39mm; margin: 7mm auto 8mm; }
        .ydoc-table { border-collapse: collapse; width: 100%; table-layout: fixed; font-size: 9pt; line-height: 1.4; }
        .ydoc-table th, .ydoc-table td { border: 1px solid #171717; padding: 1.8mm 1.4mm; text-align: left; vertical-align: middle; font-weight: 400; word-break: break-word; }
      `}</style>
      <section className="ydoc-sheet">
        <img className="ydoc-logo" src={logo.url} alt="YODO You Only Dance Once" />
        <div className="ydoc-terms">
          <p className="ydoc-terms-title">ข้อตกลงและเงื่อนไขของโรงเรียน</p>
          <ol>{terms.map((term, i) => <li key={i}>{term}</li>)}</ol>
        </div>
        <SignatureBlock key={resetKey} showOld={showOld} student={student} signMode={signMode} canvasRef={canvasRefs?.[0]} onDirty={() => onDirty?.(0)} />
      </section>
      <section className="ydoc-sheet">
        <img className="ydoc-logo" src={logo.url} alt="YODO You Only Dance Once" />
        {photo
          ? <img className="ydoc-photo" src={student.image!} alt="รูปนักเรียน" />
          : <div className="ydoc-photo-empty" />}
        <table className="ydoc-table"><tbody>
          <tr><th>ชื่อ</th><td>{student.prefix} {student.firstName}</td><th>นามสกุล</th><td>{student.lastName}</td><th>ชื่อเล่น</th><td>{student.nickname}</td></tr>
          <tr><th>วันเกิด</th><td>{displayDate(student.dob)}</td><th>อายุ</th><td colSpan={3}>{ageDetail(student.dob)}</td></tr>
          <tr><th>เชื้อชาติ</th><td></td><th>สัญชาติ</th><td>{nationality}</td><th>ศาสนา</th><td>{student.religion}</td></tr>
          <tr><th>ที่อยู่</th><td colSpan={5}>{student.address}</td></tr>
          <tr><th>เบอร์โทร</th><td>{student.phone}</td><th>E-mail</th><td>{student.email}</td><th>Line ID</th><td>{student.lineId}</td></tr>
          <tr><th>ผู้ติดต่อฉุกเฉิน</th><td colSpan={2}>{student.emergencyName}</td><th>เบอร์โทร</th><td colSpan={2}>{student.emergencyPhone}</td></tr>
          <tr><th>มีความสัมพันธ์เป็น</th><td colSpan={5}>{student.relationship}</td></tr>
          <tr><th>คลาสเต้นที่สนใจ</th><td colSpan={5}>{student.interested.join(", ")}</td></tr>
          <tr><th>เคยเรียนเต้นมาก่อนหรือไม่</th><td colSpan={2}>{student.hasExperience ? "เคย" : "ไม่เคย"}</td><th>หากเคย โปรดระบุ</th><td colSpan={2}>{student.hasExperience ? student.experienceDetail : ""}</td></tr>
          <tr><th>รู้จัก Y.O.D.O. จากช่องทางไหน</th><td colSpan={2}>{student.source}</td><th>อื่นๆ โปรดระบุ</th><td colSpan={2}>{student.source === "Other" ? student.sourceOther : ""}</td></tr>
        </tbody></table>
        <SignatureBlock key={resetKey} showOld={showOld} student={student} signMode={signMode} canvasRef={canvasRefs?.[1]} onDirty={() => onDirty?.(1)} />
      </section>
    </div>
  );
}

/** Dialog: read the document and sign directly on each page's signature line. */
export function useSignCanvases() {
  const refs = [useRef<SignCanvasHandle>(null), useRef<SignCanvasHandle>(null)] as const;
  const [active, setActive] = useState<number>(-1);
  const [resetKey, setResetKey] = useState(0);
  const [cleared, setCleared] = useState(false);
  const clear = () => { refs.forEach((r) => r.current?.clear()); setActive(-1); setCleared(true); setResetKey((k) => k + 1); };
  const markActive = (i: number) => { setCleared(true); setActive(i); };
  const exportSignature = (): string | null => {
    const pick = active >= 0 && refs[active]?.current?.isDirty() ? refs[active] : refs.find((r) => r.current?.isDirty());
    return pick?.current?.toDataURL() ?? null;
  };
  return { refs, clear, exportSignature, markActive, hasSignature: active >= 0, resetKey, showOld: !cleared };
}
