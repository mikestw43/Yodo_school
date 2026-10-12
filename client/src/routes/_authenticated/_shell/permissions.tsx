import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { CalendarHeart, Crown, Music4, PersonStanding, Sparkles, UserCog , History } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { EmptyState, Field, NativeSelect, PageHeader } from "@/components/yodo/ui";
import { emptyPerms, MENU_KEYS, useYodo, type MenuKey, type PermAction, type PositionPerms } from "@/lib/yodo-store";

export const Route = createFileRoute("/_authenticated/_shell/permissions")({
  head: () => ({
    meta: [
      { title: "YODO" },
      { name: "description", content: "กำหนดสิทธิ์การใช้งานแต่ละเมนูตามตำแหน่งของทีมงาน YODO" },
      { property: "og:title", content: "YODO" },
      { property: "og:description", content: "กำหนดสิทธิ์การใช้งานแต่ละเมนูตามตำแหน่งของทีมงาน YODO" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PermissionsPage,
});

const MENU_LABEL: Record<MenuKey, string> = { dashboard: "Dashboard", students: "Students", classes: "Classes", teachers: "Teachers", calendar: "Calendar", users: "Users", auditlog: "Audit Log" };
const ACTIONS: { key: PermAction; label: string }[] = [
  { key: "view", label: "ดู" }, { key: "add", label: "เพิ่ม" }, { key: "edit", label: "แก้ไข" }, { key: "delete", label: "ลบ" },
];
const ACTION_HINT: Record<PermAction, string> = {
  view: "เห็นข้อมูลในหน้านี้", add: "เพิ่มรายการใหม่ได้", edit: "แก้ไขข้อมูลเดิมได้", delete: "ลบรายการได้",
};
const MENU_ICON: Record<MenuKey, typeof Sparkles> = { dashboard: Sparkles, students: PersonStanding, classes: Music4, teachers: Crown, calendar: CalendarHeart, users: UserCog, auditlog: History };

function PermissionsPage() {
  const { data, setPositionPermissions, can } = useYodo();
  const [positionId, setPositionId] = useState(data.positions[0]?.id ?? "");
  const validId = data.positions.some((p) => p.id === positionId) ? positionId : (data.positions[0]?.id ?? "");
  const saved = (validId && data.permissions[validId]) || emptyPerms();
  const locked = data.positions.find((p) => p.id === validId)?.isSystem === true || !can("users", "edit");
  const [draft, setDraft] = useState<PositionPerms>(saved);
  useEffect(() => { setDraft({ ...emptyPerms(), ...((validId && data.permissions[validId]) || {}) }); }, [validId, data.permissions]);

  const toggle = (m: MenuKey, action: PermAction, on: boolean) => setDraft((d) => {
    const cur = { ...d[m], [action]: on };
    if (action === "view" && !on) { cur.add = false; cur.edit = false; cur.delete = false; }
    if (action !== "view" && on) cur.view = true;
    return { ...d, [m]: cur };
  });
  const toggleRow = (m: MenuKey, on: boolean) => setDraft((d) => ({ ...d, [m]: { view: on, add: on, edit: on, delete: on } }));

  if (data.positions.length === 0) {
    return (
      <>
        <PageHeader title="Permissions" subtitle="สิทธิ์การใช้งานตามตำแหน่ง" />
        <EmptyState title="ยังไม่มีตำแหน่ง" text="เพิ่มตำแหน่งในหน้า Users ก่อนเพื่อกำหนดสิทธิ์" />
      </>
    );
  }
  return (
    <>
      <PageHeader title="Permissions" subtitle="สิทธิ์การใช้งานตามตำแหน่ง" />
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <Field label="เลือกตำแหน่ง" className="w-64">
          <NativeSelect value={validId} onValueChange={setPositionId}>
            {data.positions.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </NativeSelect>
        </Field>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {MENU_KEYS.map((m) => {
          const row = draft[m];
          const allOn = ACTIONS.every((a) => row[a.key]);
          const Icon = MENU_ICON[m];
          return (
            <Card key={m} className="flex flex-col rounded-3xl p-6">
              <div className="mb-2 flex items-center justify-between gap-3 border-b border-border pb-4">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"><Icon className="h-5 w-5" /></span>
                  <h3 className="truncate font-display text-lg font-semibold">สิทธิ์ {MENU_LABEL[m]}</h3>
                </div>
                <label className="flex shrink-0 cursor-pointer items-center gap-2 text-sm">
                  <Checkbox checked={allOn} disabled={locked} onCheckedChange={(v) => toggleRow(m, v === true)} aria-label={`ทั้งหมด ${MENU_LABEL[m]}`} /> ทั้งหมด
                </label>
              </div>
              <ul className="flex-1 divide-y divide-border/60">
                {ACTIONS.map((a) => (
                  <li key={a.key} className="flex items-center justify-between gap-4 py-3">
                    <div className="min-w-0">
                      <p className="font-medium">{a.label}</p>
                      <p className="text-xs text-muted-foreground">{ACTION_HINT[a.key]}</p>
                    </div>
                    <Checkbox checked={row[a.key]} disabled={locked} onCheckedChange={(v) => toggle(m, a.key, v === true)} aria-label={`${a.label} ${MENU_LABEL[m]}`} />
                  </li>
                ))}
              </ul>
            </Card>
          );
        })}
      </div>
      {locked ? (
        <p className="mt-4 text-right text-sm text-muted-foreground">{can("users", "edit") ? "ตำแหน่งระบบนี้มีสิทธิ์เต็มทุกเมนู และแก้ไขไม่ได้" : "คุณดูสิทธิ์ได้อย่างเดียว ไม่มีสิทธิ์แก้ไข"}</p>
      ) : (
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setDraft({ ...emptyPerms(), ...saved })}>ยกเลิกการแก้ไข</Button>
          <Button className="rounded-full" onClick={() => { setPositionPermissions(validId, draft); toast.success("บันทึกสิทธิ์แล้ว"); }}>บันทึก</Button>
        </div>
      )}
    </>
  );
}
