import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { FileUp, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/yodo/ui";
import { api, errorText } from "@/lib/api";
import { useYodo } from "@/lib/yodo-store";

export const Route = createFileRoute("/_authenticated/_shell/import")({
  component: ImportPage,
});

interface Result { total: number; added: number; skipped: { code: string; reason: string }[] }
const REASON: Record<string, string> = { exists: "มีอยู่แล้ว", missing: "ไม่มีรหัสหรือชื่อ" };

// One-off: brings the students over from the old Lovable app (its "students" table exported as CSV or JSON).
function ImportPage() {
  const { me, reload } = useYodo();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Result | null>(null);
  const [done, setDone] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);

  if (me && !me.superadmin) return <EmptyState title="ไม่มีสิทธิ์เข้าถึงหน้านี้" text="เฉพาะ SuperAdmin" />;

  const send = async (dry: boolean) => {
    if (!file) return;
    setBusy(true);
    try {
      const r = await api<Result>(`/import/students${dry ? "?dry=1" : ""}`, { raw: await file.text() });
      if (dry) setPreview(r);
      else { setDone(r); setPreview(null); await reload(); toast.success(`นำเข้านักเรียนแล้ว ${r.added} คน`); }
    } catch (e) { toast.error(errorText(e)); }
    setBusy(false);
  };

  return (
    <>
      <PageHeader title="นำเข้านักเรียน" subtitle="ย้ายข้อมูลนักเรียนจากแอปเดิม (Lovable)" />
      <Card className="flex max-w-2xl flex-col gap-5 rounded-3xl p-7">
        <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
          <li>ใน Lovable เปิด Cloud → Database → ตาราง <b>students</b> → Export (CSV)</li>
          <li>เลือกไฟล์ที่ได้ด้านล่าง แล้วกด "ตรวจไฟล์"</li>
          <li>ถ้าจำนวนถูกต้อง กด "นำเข้า" (นักเรียนที่มีรหัสอยู่แล้วจะถูกข้าม ทำซ้ำได้ไม่ซ้ำ)</li>
        </ol>
        <label className="flex cursor-pointer flex-col items-center gap-1 rounded-2xl border border-dashed border-border bg-muted/30 px-4 py-8 text-sm text-muted-foreground hover:bg-muted/60">
          <FileUp className="h-6 w-6 text-primary" />
          <span className="font-medium text-foreground">{file ? file.name : "เลือกไฟล์ CSV หรือ JSON"}</span>
          {file && <span className="text-xs">{(file.size / 1024 / 1024).toFixed(1)} MB</span>}
          <input type="file" accept=".csv,.json,text/csv,application/json" className="hidden" onChange={(e) => { setFile(e.target.files?.[0] ?? null); setPreview(null); setDone(null); e.target.value = ""; }} />
        </label>
        {preview && (
          <div className="rounded-2xl bg-accent/40 p-4 text-sm">
            <p>ในไฟล์มี <b>{preview.total}</b> แถว · จะนำเข้า <b>{preview.added}</b> คน · ข้าม <b>{preview.skipped.length}</b></p>
          </div>
        )}
        {done && (
          <div className="rounded-2xl bg-success/15 p-4 text-sm">
            <p>นำเข้าแล้ว <b>{done.added}</b> คน จาก {done.total} แถว</p>
            {done.skipped.length > 0 && (
              <p className="mt-1 text-muted-foreground">ข้าม: {done.skipped.slice(0, 30).map((s) => `${s.code || "-"} (${REASON[s.reason] ?? s.reason})`).join(", ")}{done.skipped.length > 30 ? " …" : ""}</p>
            )}
          </div>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="outline" className="rounded-full" disabled={!file || busy} onClick={() => send(true)}>ตรวจไฟล์</Button>
          <Button className="rounded-full px-8" disabled={!preview || preview.added === 0 || busy} onClick={() => send(false)}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} นำเข้า
          </Button>
        </div>
      </Card>
    </>
  );
}
