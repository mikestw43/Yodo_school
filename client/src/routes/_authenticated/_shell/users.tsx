import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Ban, Pencil, Plus, RotateCcw, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Avatar, ConfirmDialog, EmptyState, Field, ImageUpload, NativeSelect, PageHeader, Pagination, StatusBadge, onlyDigits10, usePagination } from "@/components/yodo/ui";
import { useYodo, type Position, type SystemUser, type SystemUserInput } from "@/lib/yodo-store";

export const Route = createFileRoute("/_authenticated/_shell/users")({
  head: () => ({
    meta: [
      { title: "YODO" },
      { name: "description", content: "จัดการผู้ใช้ระบบและตำแหน่งของทีมงาน YODO" },
      { property: "og:title", content: "YODO" },
      { property: "og:description", content: "จัดการผู้ใช้ระบบและตำแหน่งของทีมงาน YODO" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: UsersPage,
});

function UsersPage() {
  return (
    <>
      <PageHeader title="Users" subtitle="ผู้ใช้ระบบและตำแหน่ง" />
      <Tabs defaultValue="users">
        <TabsList className="mb-6 rounded-full">
          <TabsTrigger value="users" className="rounded-full px-5">ผู้ใช้ระบบ</TabsTrigger>
          <TabsTrigger value="positions" className="rounded-full px-5">ตำแหน่ง</TabsTrigger>
        </TabsList>
        <TabsContent value="users"><UsersTab /></TabsContent>
        <TabsContent value="positions"><PositionsTab /></TabsContent>
      </Tabs>
    </>
  );
}

function UsersTab() {
  const { data, setSystemUserStatus, deleteSystemUser, can } = useYodo();
  const [deleting, setDeleting] = useState<SystemUser | null>(null);
  const [q, setQ] = useState("");
  const [pos, setPos] = useState("all");
  const [status, setStatus] = useState("all");
  const [edit, setEdit] = useState<SystemUser | null>(null);
  const [open, setOpen] = useState(false);
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return data.systemUsers.filter((u) =>
      (pos === "all" || u.positionId === pos) && (status === "all" || u.status === status) &&
      (!s || `${u.firstName} ${u.lastName} ${u.nickname} ${u.email} ${u.phone}`.toLowerCase().includes(s)));
  }, [data.systemUsers, q, pos, status]);
  const pg = usePagination(list, 10, `${q}|${pos}|${status}`);
  const canManage = can("users", "edit") || can("users", "delete");

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative min-w-60 flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหาชื่อ อีเมล เบอร์โทร" className="rounded-full pl-9" />
        </div>
        <NativeSelect value={pos} onValueChange={setPos} className="w-44">
          <option value="all">ทุกตำแหน่ง</option>
          {data.positions.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </NativeSelect>
        <NativeSelect value={status} onValueChange={setStatus} className="w-36">
          <option value="all">ทุกสถานะ</option>
          <option value="Active">Active</option>
          <option value="Disabled">Disabled</option>
        </NativeSelect>
        {can("users", "add") && <Button className="rounded-full" onClick={() => { setEdit(null); setOpen(true); }}><Plus className="h-4 w-4" /> เพิ่มผู้ใช้</Button>}
      </div>
      {list.length === 0 ? <EmptyState title="ไม่พบผู้ใช้" /> : (
        <>
        <div className="space-y-3 md:hidden">
          {pg.pageItems.map((u) => (
            <Card key={u.id} className="rounded-3xl p-4">
              <div className="flex items-center gap-3">
                <Avatar src={u.image} name={u.firstName} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{[u.firstName, u.lastName].filter(Boolean).join(" ") || u.username || "-"}</p>
                  <p className="text-xs text-muted-foreground">{u.nickname}</p>
                </div>
                <StatusBadge status={u.status} />
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                <div className="min-w-0"><p className="text-xs text-muted-foreground">อีเมล</p><p className="truncate">{u.email || "-"}</p></div>
                <div><p className="text-xs text-muted-foreground">เบอร์โทร</p><p>{u.phone || "-"}</p></div>
                <div><p className="text-xs text-muted-foreground">ตำแหน่ง</p><p>{data.positions.find((p) => p.id === u.positionId)?.name ?? "-"}</p></div>
              </div>
              {canManage && <div className="mt-3 flex justify-center gap-1.5 border-t border-border/60 pt-3">
                {can("users", "edit") && <Button size="icon" variant="ghost" className="h-8 w-8 rounded-full" aria-label="แก้ไข" title="แก้ไข" onClick={() => { setEdit(u); setOpen(true); }}><Pencil className="h-4 w-4" /></Button>}
                {can("users", "edit") && <Button size="icon" variant="ghost" className="h-8 w-8 rounded-full" aria-label={u.status === "Active" ? "ปิดใช้งาน" : "เปิดใช้งาน"} title={u.status === "Active" ? "ปิดใช้งาน" : "เปิดใช้งาน"}
                  onClick={() => { setSystemUserStatus(u.id, u.status === "Active" ? "Disabled" : "Active"); toast.success("อัปเดตสถานะแล้ว"); }}>
                  {u.status === "Active" ? <Ban className="h-4 w-4" /> : <RotateCcw className="h-4 w-4" />}
                </Button>}
                {can("users", "delete") && <Button size="icon" variant="ghost" className="h-8 w-8 rounded-full hover:text-destructive" aria-label="ลบ" title="ลบ" onClick={() => setDeleting(u)}><Trash2 className="h-4 w-4" /></Button>}
              </div>}
            </Card>
          ))}
        </div>
        <Card className="hidden overflow-x-auto rounded-3xl p-0 md:block">
          <table className="w-full text-center text-sm">
            <thead className="text-center text-xs uppercase tracking-wider text-muted-foreground">
              <tr className="border-b border-border">
                <th className="px-5 py-3 text-left">ชื่อ</th><th className="px-3 py-3">อีเมล</th><th className="px-3 py-3">เบอร์โทร</th>
                <th className="px-3 py-3">ตำแหน่ง</th><th className="px-3 py-3">สถานะ</th>{canManage && <th className="px-5 py-3">จัดการ</th>}
              </tr>
            </thead>
            <tbody>
              {pg.pageItems.map((u) => (
                <tr key={u.id} className="border-b border-border/60 last:border-0">
                  <td className="px-5 py-3 text-left">
                    <div className="flex items-center gap-3">
                      <Avatar src={u.image} name={u.firstName} />
                      <div><p className="font-medium">{[u.firstName, u.lastName].filter(Boolean).join(" ") || u.username || "-"}</p><p className="text-xs text-muted-foreground">{u.nickname}</p></div>
                    </div>
                  </td>
                  <td className="px-3 py-3">{u.email}</td>
                  <td className="px-3 py-3">{u.phone}</td>
                  <td className="px-3 py-3">{data.positions.find((p) => p.id === u.positionId)?.name ?? "-"}</td>
                  <td className="px-3 py-3"><StatusBadge status={u.status} /></td>
                  {canManage && <td className="px-5 py-3">
                    {can("users", "edit") && <Button size="icon" variant="ghost" className="h-8 w-8 rounded-full" aria-label="แก้ไข" title="แก้ไข" onClick={() => { setEdit(u); setOpen(true); }}><Pencil className="h-4 w-4" /></Button>}
                    {can("users", "edit") && <Button size="icon" variant="ghost" className="h-8 w-8 rounded-full" aria-label={u.status === "Active" ? "ปิดใช้งาน" : "เปิดใช้งาน"} title={u.status === "Active" ? "ปิดใช้งาน" : "เปิดใช้งาน"}
                      onClick={() => { setSystemUserStatus(u.id, u.status === "Active" ? "Disabled" : "Active"); toast.success("อัปเดตสถานะแล้ว"); }}>
                      {u.status === "Active" ? <Ban className="h-4 w-4" /> : <RotateCcw className="h-4 w-4" />}
                    </Button>}
                    {can("users", "delete") && <Button size="icon" variant="ghost" className="h-8 w-8 rounded-full hover:text-destructive" aria-label="ลบ" title="ลบ" onClick={() => setDeleting(u)}><Trash2 className="h-4 w-4" /></Button>}
                  </td>}
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        </>
      )}
      <div className="mt-4"><Pagination page={pg.page} totalPages={pg.totalPages} onChange={pg.setPage} from={pg.from} to={pg.to} total={pg.total} unit="คน" /></div>
      <UserDialog open={open} onOpenChange={setOpen} user={edit} />
      <ConfirmDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)} title="ลบผู้ใช้ระบบ?" text={deleting ? `ต้องการลบ ${deleting.username} ใช่หรือไม่ (จะเข้าสู่ระบบไม่ได้อีก)` : ""} confirmLabel="ลบ" destructive onConfirm={() => { if (deleting) { deleteSystemUser(deleting.id); toast.success("ลบผู้ใช้แล้ว"); } }} />
    </>
  );
}

const emptyUser: SystemUserInput = { firstName: "", lastName: "", nickname: "", username: "", password: "", email: "", phone: "", positionId: "", image: "" };

function UserDialog({ open, onOpenChange, user }: { open: boolean; onOpenChange: (o: boolean) => void; user: SystemUser | null }) {
  const { data, addSystemUser, updateSystemUser } = useYodo();
  const [f, setF] = useState<SystemUserInput>(emptyUser);
  const [errors, setErrors] = useState<Partial<Record<keyof SystemUserInput, string>>>({});
  useEffect(() => {
    if (!open) return;
    setErrors({});
    setF(user ? { firstName: user.firstName, lastName: user.lastName, nickname: user.nickname, username: user.username ?? "", password: "", email: user.email, phone: user.phone, positionId: user.positionId, image: user.image } : emptyUser);
  }, [open, user]);
  const set = <K extends keyof SystemUserInput>(k: K, v: SystemUserInput[K]) => setF((p) => ({ ...p, [k]: v }));
  const save = () => {
    const e: Partial<Record<keyof SystemUserInput, string>> = {};
    const un = f.username.trim().toLowerCase();
    if (!/^[a-z0-9._-]{3,30}$/.test(un)) e.username = "3–30 ตัว ใช้ a-z 0-9 . _ - เท่านั้น";
    else if (data.systemUsers.some((u) => u.id !== user?.id && (u.username ?? "").toLowerCase() === un)) e.username = "Username นี้ถูกใช้แล้ว";
    if (!user && !f.password) e.password = "กรุณากรอกรหัสผ่าน";
    else if (f.password && f.password.length < 6) e.password = "รหัสผ่านอย่างน้อย 6 ตัว (ใส่อะไรก็ได้)";
    if (f.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email)) e.email = "อีเมลไม่ถูกต้อง";
    if (f.phone && !/^\d{10}$/.test(f.phone)) e.phone = "เบอร์โทรต้องมี 10 หลัก";
    setErrors(e);
    if (Object.keys(e).length) return;
    const payload = { ...f, username: un, password: user && !f.password ? user.password : f.password };
    if (user) updateSystemUser(user.id, payload); else addSystemUser(payload);
    toast.success(user ? "บันทึกแล้ว" : "เพิ่มผู้ใช้แล้ว");
    onOpenChange(false);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto rounded-3xl">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">{user ? "แก้ไขผู้ใช้" : "เพิ่มผู้ใช้ระบบ"}</DialogTitle>
          <DialogDescription>ข้อมูลผู้ใช้และตำแหน่ง</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Profile Image" className="sm:col-span-2"><ImageUpload value={f.image} onChange={(v) => set("image", v)} /></Field>
          <Field label="ชื่อ" error={errors.firstName}><Input value={f.firstName} onChange={(e) => set("firstName", e.target.value)} /></Field>
          <Field label="นามสกุล" error={errors.lastName}><Input value={f.lastName} onChange={(e) => set("lastName", e.target.value)} /></Field>
          <Field label="ชื่อเล่น"><Input value={f.nickname} onChange={(e) => set("nickname", e.target.value)} /></Field>
          <Field label="ตำแหน่ง" error={errors.positionId}>
            <NativeSelect value={f.positionId} onValueChange={(v) => set("positionId", v)}>
              <option value="">ไม่ระบุตำแหน่ง</option>
              {data.positions.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </NativeSelect>
          </Field>
          <Field label="Username" required error={errors.username}><Input autoComplete="off" value={f.username} onChange={(e) => set("username", e.target.value)} /></Field>
          <Field label="Password" required={!user} error={errors.password}><Input type="password" autoComplete="new-password" placeholder={user ? "เว้นว่างถ้าไม่เปลี่ยน" : ""} value={f.password} onChange={(e) => set("password", e.target.value)} /></Field>
          <Field label="อีเมล" error={errors.email}><Input type="email" value={f.email} onChange={(e) => set("email", e.target.value)} /></Field>
          <Field label="เบอร์โทร" error={errors.phone}><Input inputMode="numeric" value={f.phone} onChange={(e) => set("phone", onlyDigits10(e.target.value))} /></Field>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>ยกเลิก</Button>
          <Button className="rounded-full" onClick={save}>บันทึก</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PositionsTab() {
  const { data, deletePosition, can } = useYodo();
  const [edit, setEdit] = useState<Position | null>(null);
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className="mb-4 flex justify-end">
        {can("users", "add") && <Button className="rounded-full" onClick={() => { setEdit(null); setOpen(true); }}><Plus className="h-4 w-4" /> เพิ่มตำแหน่ง</Button>}
      </div>
      {data.positions.length === 0 ? <EmptyState title="ยังไม่มีตำแหน่ง" /> : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data.positions.map((p) => {
            const n = data.systemUsers.filter((u) => u.positionId === p.id).length;
            return (
              <Card key={p.id} className="gap-2 rounded-3xl p-6">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="font-display text-xl font-semibold">{p.name}</h3>
                    {p.isSystem && <span className="mt-1 inline-block rounded-full bg-primary/10 px-3 py-0.5 text-xs text-primary">ตำแหน่งระบบ · แก้ไขไม่ได้</span>}
                  </div>
                  {!p.isSystem && (
                    <div className="flex">
                      {can("users", "edit") && <Button size="icon" variant="ghost" className="h-8 w-8 rounded-full" aria-label="แก้ไขตำแหน่ง" title="แก้ไข" onClick={() => { setEdit(p); setOpen(true); }}><Pencil className="h-4 w-4" /></Button>}
                      {can("users", "delete") && <Button size="icon" variant="ghost" className="h-8 w-8 rounded-full text-destructive hover:text-destructive" aria-label="ลบตำแหน่ง" title="ลบ"
                        onClick={() => { if (n > 0) { toast.error("ลบไม่ได้ ยังมีผู้ใช้ในตำแหน่งนี้"); return; } deletePosition(p.id); toast.success("ลบตำแหน่งแล้ว"); }}>
                        <Trash2 className="h-4 w-4" />
                      </Button>}
                    </div>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">{p.description || "-"}</p>
                <p className="text-xs text-muted-foreground">ผู้ใช้ {n} คน</p>
              </Card>
            );
          })}
        </div>
      )}
      <PositionDialog open={open} onOpenChange={setOpen} position={edit} />
    </>
  );
}

function PositionDialog({ open, onOpenChange, position }: { open: boolean; onOpenChange: (o: boolean) => void; position: Position | null }) {
  const { data, addPosition, updatePosition } = useYodo();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    if (open) { setName(position?.name ?? ""); setDescription(position?.description ?? ""); setError(""); }
  }, [open, position]);
  const save = () => {
    const n = name.trim();
    if (!n) return setError("กรุณากรอกชื่อตำแหน่ง");
    if (data.positions.some((p) => p.id !== position?.id && p.name.toLowerCase() === n.toLowerCase())) return setError("มีตำแหน่งนี้แล้ว");
    if (position) updatePosition(position.id, { name: n, description }); else addPosition({ name: n, description });
    toast.success(position ? "บันทึกแล้ว" : "เพิ่มตำแหน่งแล้ว");
    onOpenChange(false);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md rounded-3xl">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">{position ? "แก้ไขตำแหน่ง" : "เพิ่มตำแหน่ง"}</DialogTitle>
          <DialogDescription>ตำแหน่งจะใช้เลือกในฟอร์มผู้ใช้ระบบ</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <Field label="ชื่อตำแหน่ง" required error={error}><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
          <Field label="คำอธิบาย"><Textarea value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>ยกเลิก</Button>
          <Button className="rounded-full" onClick={save}>บันทึก</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

