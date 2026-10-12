import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { FileUp, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/yodo/ui";
import { api, errorText } from "@/lib/api";
import { useYodo } from "@/lib/yodo-store";
import { L } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/_shell/import")({
  component: ImportPage,
});

interface Result { total: number; added: number; skipped: { code: string; reason: string }[] }
const REASON = (): Record<string, string> => ({ exists: L("มีอยู่แล้ว", "already there"), missing: L("ไม่มีรหัสหรือชื่อ", "no code or name") });

// One-off: brings the students over from the old Lovable app (its "students" table exported as CSV or JSON).
function ImportPage() {
  const { me, reload } = useYodo();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Result | null>(null);
  const [done, setDone] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);

  if (me && !me.superadmin) return <EmptyState title={L("ไม่มีสิทธิ์เข้าถึงหน้านี้", "You cannot open this page")} text={L("เฉพาะผู้ดูแลสูงสุด (SuperAdmin)", "SuperAdmin only")} />;

  const send = async (dry: boolean) => {
    if (!file) return;
    setBusy(true);
    try {
      const r = await api<Result>(`/import/students${dry ? "?dry=1" : ""}`, { raw: await file.text() });
      if (dry) setPreview(r);
      else { setDone(r); setPreview(null); await reload(); toast.success(L(`นำเข้านักเรียนแล้ว ${r.added} คน`, `Imported ${r.added} students`)); }
    } catch (e) { toast.error(errorText(e)); }
    setBusy(false);
  };

  return (
    <>
      <PageHeader title={L("นำเข้านักเรียน", "Import students")} subtitle={L("ย้ายข้อมูลนักเรียนจากแอปเดิม (Lovable)", "Move student data from the old app (Lovable)")} />
      <Card className="flex max-w-2xl flex-col gap-5 rounded-3xl p-7">
        <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
          <li>{L("ใน Lovable เปิด Cloud → Database → ตาราง ", "In Lovable open Cloud → Database → table ")}<b>students</b>{" → Export (CSV)"}</li>
          <li>{L('เลือกไฟล์ที่ได้ด้านล่าง แล้วกด "ตรวจไฟล์"', 'Pick that file below, then press "Check file"')}</li>
          <li>{L('ถ้าจำนวนถูกต้อง กด "นำเข้า" (นักเรียนที่มีรหัสอยู่แล้วจะถูกข้าม ทำซ้ำได้ไม่ซ้ำ)', 'If the numbers look right, press "Import" (students whose code already exists are skipped, so running it twice adds nothing twice)')}</li>
        </ol>
        <label className="flex cursor-pointer flex-col items-center gap-1 rounded-2xl border border-dashed border-border bg-muted/30 px-4 py-8 text-sm text-muted-foreground hover:bg-muted/60">
          <FileUp className="h-6 w-6 text-primary" />
          <span className="font-medium text-foreground">{file ? file.name : L("เลือกไฟล์ CSV หรือ JSON", "Choose a CSV or JSON file")}</span>
          {file && <span className="text-xs">{(file.size / 1024 / 1024).toFixed(1)} MB</span>}
          <input type="file" accept=".csv,.json,text/csv,application/json" className="hidden" onChange={(e) => { setFile(e.target.files?.[0] ?? null); setPreview(null); setDone(null); e.target.value = ""; }} />
        </label>
        {preview && (
          <div className="rounded-2xl bg-accent/40 p-4 text-sm">
            <p>{L("ในไฟล์มี ", "The file has ")}<b>{preview.total}</b>{L(" แถว · จะนำเข้า ", " rows · will import ")}<b>{preview.added}</b>{L(" คน · ข้าม ", " students · skip ")}<b>{preview.skipped.length}</b></p>
          </div>
        )}
        {done && (
          <div className="rounded-2xl bg-success/15 p-4 text-sm">
            <p>{L("นำเข้าแล้ว ", "Imported ")}<b>{done.added}</b>{L(` คน จาก ${done.total} แถว`, ` students from ${done.total} rows`)}</p>
            {done.skipped.length > 0 && (
              <p className="mt-1 text-muted-foreground">{L("ข้าม: ", "Skipped: ")}{done.skipped.slice(0, 30).map((s) => `${s.code || "-"} (${REASON()[s.reason] ?? s.reason})`).join(", ")}{done.skipped.length > 30 ? " …" : ""}</p>
            )}
          </div>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="outline" className="rounded-full" disabled={!file || busy} onClick={() => send(true)}>{L("ตรวจไฟล์", "Check file")}</Button>
          <Button className="rounded-full px-8" disabled={!preview || preview.added === 0 || busy} onClick={() => send(false)}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} {L("นำเข้า", "Import")}
          </Button>
        </div>
      </Card>
    </>
  );
}
