import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Lock, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/yodo/ui";
import { emptyPerms, useYodo, type MenuKey, type PermAction, type PermissionMap, type Position } from "@/lib/yodo-store";
import { L } from "@/lib/i18n";
import { PositionDialog } from "./users";

export const Route = createFileRoute("/_authenticated/_shell/permissions")({
  head: () => ({
    meta: [
      { title: "YODO" },
      { name: "description", content: L("กำหนดสิทธิ์การใช้งานแต่ละเมนูตาม Role ของทีมงาน YODO", "Set what each YODO role can use in every menu") },
      { property: "og:title", content: "YODO" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PermissionsPage,
});

type Chip = { menu: MenuKey; action: PermAction; label: string };
const VAED = (menu: MenuKey): Chip[] => [
  { menu, action: "view", label: L("ดู", "View") }, { menu, action: "add", label: L("เพิ่ม", "Add") },
  { menu, action: "edit", label: L("แก้ไข", "Edit") }, { menu, action: "delete", label: L("ลบ", "Delete") },
];
// One row per menu, each with the switches that mean something there (owner 12/10/2026, mockup board 1).
const ROWS = (): { label: string; isNew?: boolean; chips: Chip[] }[] => [
  { label: L("ภาพรวม", "Dashboard"), chips: [{ menu: "dashboard", action: "view", label: L("ดู", "View") }, { menu: "money", action: "view", label: L("ดูยอดเงิน", "See money") }] },
  { label: L("นักเรียน", "Students"), chips: VAED("students") },
  { label: L("คลาส", "Classes"), chips: VAED("classes") },
  { label: L("ครู", "Teachers"), chips: VAED("teachers") },
  { label: L("ปฏิทิน", "Calendar"), chips: VAED("calendar") },
  { label: L("ใบเสร็จรับเงิน", "Receipts"), isNew: true, chips: [{ menu: "receipts", action: "view", label: L("ดู", "View") }, { menu: "receipts", action: "add", label: L("ออกใบเสร็จ", "Issue") }, { menu: "receipts", action: "delete", label: L("ยกเลิกใบเสร็จ", "Cancel") }] },
  { label: L("ตั้งค่าบริษัท", "Company settings"), isNew: true, chips: [{ menu: "company", action: "view", label: L("ดู", "View") }, { menu: "company", action: "edit", label: L("แก้ไข", "Edit") }] },
  { label: L("ผู้ใช้ระบบ", "Users"), chips: VAED("users") },
  { label: L("ประวัติการแก้ไข", "Audit log"), chips: [{ menu: "auditlog", action: "view", label: L("ดู", "View") }] },
];

const roleOrder = (p: Position) => ({ superadmin: 0, owner: 1, partner: 2, admin: 3 } as Record<string, number>)[p.kind ?? ""] ?? 4;

function PermissionsPage() {
  const { data, setPositionPermissions } = useYodo();
  const owner = data.owner === true;
  const rows = ROWS();
  const roles = useMemo(() => [...data.positions].sort((a, b) => roleOrder(a) - roleOrder(b)), [data.positions]);
  const [draft, setDraft] = useState<PermissionMap>(data.permissions);
  const [addOpen, setAddOpen] = useState(false);
  useEffect(() => { setDraft(data.permissions); }, [data.permissions]);
  const dirty = roles.filter((r) => !r.isSystem && JSON.stringify(draft[r.id]) !== JSON.stringify(data.permissions[r.id]));

  const toggle = (rid: string, c: Chip) => setDraft((d) => {
    const perms = { ...emptyPerms(), ...(d[rid] ?? {}) };
    const cur = { ...perms[c.menu] };
    const on = !cur[c.action];
    cur[c.action] = on;
    if (c.action === "view" && !on) { cur.add = false; cur.edit = false; cur.delete = false; }
    if (c.action !== "view" && on) cur.view = true;
    return { ...d, [rid]: { ...perms, [c.menu]: cur } };
  });
  const save = () => {
    for (const r of dirty) setPositionPermissions(r.id, { ...emptyPerms(), ...draft[r.id] });
    toast.success(L("บันทึกสิทธิ์แล้ว", "Access saved"));
  };

  if (roles.length === 0) {
    return (
      <>
        <PageHeader back title={L("สิทธิ์การใช้งาน", "Permissions")} subtitle={L("สิทธิ์การใช้งานตาม Role", "Access by role")} />
        <EmptyState title={L("ยังไม่มี Role", "No roles yet")} />
      </>
    );
  }
  return (
    <>
      <PageHeader
        back
        title={L("สิทธิ์การใช้งาน", "Permissions")}
        subtitle={owner ? L("แต่ละคนมี 1 Role · กดที่ช่องเพื่อเปิด/ปิด", "Each person has one role · tap a switch to turn it on or off") : L("เฉพาะ Owner แก้สิทธิ์ได้ คุณดูได้อย่างเดียว", "Only the Owner changes access; you can only look")}
        action={owner ? <Button className="rounded-full" onClick={() => setAddOpen(true)}><Plus className="h-4 w-4" /> {L("เพิ่ม Role", "Add role")}</Button> : undefined}
      />
      <Card className="overflow-hidden rounded-3xl p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm" data-testid="perm-table">
            <thead>
              <tr className="bg-muted/50 text-left">
                <th className="sticky left-0 z-10 bg-muted px-4 py-3 font-semibold">{L("เมนู", "Menu")}</th>
                {roles.map((r) => <th key={r.id} className="px-4 py-3 font-semibold">{r.name}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.label} className="border-t border-border/60 align-top">
                  <td className="sticky left-0 z-10 bg-card px-4 py-3 font-medium">
                    {row.label}
                    {row.isNew && <span className="ml-1.5 rounded-lg bg-primary px-1.5 py-0.5 text-[10px] text-primary-foreground">{L("ใหม่", "New")}</span>}
                  </td>
                  {roles.map((r) => (
                    <td key={r.id} className="px-4 py-3">
                      {r.isSystem ? (
                        <span className="inline-flex items-center gap-1.5 text-muted-foreground"><Lock className="h-3.5 w-3.5" /> {L("ทำได้ทุกอย่าง", "Everything")}</span>
                      ) : (
                        <div className="flex flex-wrap gap-1.5">
                          {row.chips.map((c) => {
                            const on = !!draft[r.id]?.[c.menu]?.[c.action];
                            return (
                              <button key={c.menu + c.action} type="button" disabled={!owner} aria-pressed={on} onClick={() => toggle(r.id, c)}
                                aria-label={`${r.name} · ${row.label} · ${c.label}`}
                                className={`rounded-lg px-2.5 py-1 text-xs transition-colors disabled:cursor-default ${on ? "bg-primary text-primary-foreground" : "border border-dashed border-border text-muted-foreground"} ${owner ? "hover:opacity-80" : ""}`}>
                                {c.label}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      {owner && (
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" disabled={dirty.length === 0} onClick={() => setDraft(data.permissions)}>{L("ยกเลิกการแก้ไข", "Discard changes")}</Button>
          <Button className="rounded-full" disabled={dirty.length === 0} onClick={save}>{L("บันทึก", "Save")}</Button>
        </div>
      )}
      <PositionDialog open={addOpen} onOpenChange={setAddOpen} position={null} />
    </>
  );
}
