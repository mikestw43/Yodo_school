import { useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate, useLocation } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { CalendarHeart, ChevronUp, Crown, FileUp, History, LogOut, Menu, Music4, PersonStanding, Settings, ShieldCheck, Sparkles, UserCog } from "lucide-react";
import { api, getMe } from "@/lib/api";
import { ROLE_LABEL } from "@/lib/auth-utils";
import { Avatar, EmptyState } from "@/components/yodo/ui";
import { useYodo, type MenuKey } from "@/lib/yodo-store";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { NotificationBell } from "@/components/yodo/NotificationBell";

const NAV = [
  { to: "/", label: "Dashboard", icon: Sparkles, key: "dashboard" },
  { to: "/students", label: "Students", icon: PersonStanding, key: "students" },
  { to: "/classes", label: "Classes", icon: Music4, key: "classes" },
  { to: "/teachers", label: "Teachers", icon: Crown, key: "teachers" },
  { to: "/calendar", label: "Calendar", icon: CalendarHeart, key: "calendar" },
  { to: "/users", label: "Users", icon: UserCog, key: "users" },
  { to: "/permissions", label: "Permissions", icon: ShieldCheck, key: "users" },
  { to: "/audit-log", label: "Audit Log", icon: History, key: "auditlog" },
] as const satisfies readonly { to: string; label: string; key: MenuKey; icon: unknown }[];

function useMe() {
  const [me, setMe] = useState<{ name: string; role: string; image: string } | null>(null);
  useEffect(() => {
    const load = async () => {
      try {
        const p = await getMe();
        setMe({ name: p.name, role: p.positionName || ROLE_LABEL[p.role] || p.role || "-", image: p.image });
      } catch { /* signed out */ }
    };
    void load();
    window.addEventListener("yodo:me-updated", load);
    return () => window.removeEventListener("yodo:me-updated", load);
  }, []);
  return me;
}

// The running version (short commit hash written at deploy), so the owner can check what the NAS runs.
function useVersion() {
  const [v, setV] = useState("");
  useEffect(() => {
    fetch("/version.txt", { cache: "no-store" }).then((r) => (r.ok ? r.text() : "")).then((t) => setV(t.split(" ")[0]?.trim() ?? "")).catch(() => null);
  }, []);
  return v;
}

export function useSignOut() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { clear } = useYodo();
  return async () => {
    try { await api("/auth/logout", { body: {} }); } catch { /* signed out anyway */ }
    await qc.cancelQueries();
    qc.clear();
    clear();
    navigate({ to: "/auth", replace: true });
  };
}

function Guarded({ children }: { children: ReactNode }) {
  const { can, loading, me } = useYodo();
  const path = useLocation({ select: (l) => l.pathname });
  const item = [...NAV].reverse().find((n) => (n.to === "/" ? path === "/" : path.startsWith(n.to)));
  if (loading || !me || !item || can(item.key)) return <>{children}</>;
  return <EmptyState title="ไม่มีสิทธิ์เข้าถึงหน้านี้" text="ติดต่อผู้ดูแลระบบเพื่อขอสิทธิ์การใช้งานเมนูนี้" />;
}

export function AppShell({ children }: { children: ReactNode }) {
  const me = useMe();
  const { can, me: who } = useYodo();
  const nav = NAV.filter((n) => can(n.key));
  const version = useVersion();
  const signOut = useSignOut();
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <div className="flex min-h-screen bg-background">
      <aside className="sticky top-0 hidden h-screen w-20 shrink-0 flex-col border-r border-sidebar-border bg-sidebar px-3 py-6 md:flex lg:w-64 lg:px-5">
        <Link to="/" className="mb-10 flex items-center gap-3 px-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary font-display text-xl font-bold text-primary-foreground">Y</div>
          <div className="hidden lg:block">
            <p className="font-display text-2xl font-bold leading-none tracking-wide">YODO</p>
            <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Dance Academy</p>
          </div>
        </Link>
        <nav className="flex flex-1 flex-col gap-1">
          {nav.map((n) => (
            <Link
              key={n.to}
              to={n.to}
              activeOptions={{ exact: n.to === "/" }}
              className="flex items-center justify-center gap-3 rounded-full px-3 py-2.5 text-sm font-medium text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground lg:justify-start"
              activeProps={{ className: "!bg-primary !text-primary-foreground shadow-soft" }}
              title={n.label}
            >
              <n.icon className="h-4 w-4 shrink-0" />
              <span className="hidden lg:inline">{n.label}</span>
            </Link>
          ))}
        </nav>
        <div className="mt-4 border-t border-sidebar-border pt-4">
          {me && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex w-full items-center justify-center gap-3 rounded-2xl px-2 py-2 text-left transition-colors hover:bg-sidebar-accent lg:justify-start" title="เมนูโปรไฟล์">
                  <Avatar src={me.image} name={me.name} className="h-9 w-9" />
                  <div className="hidden min-w-0 flex-1 lg:block">
                    <p className="truncate text-sm font-medium">{me.name}</p>
                    <p className="text-xs text-muted-foreground">{me.role}</p>
                  </div>
                  <ChevronUp className="hidden h-4 w-4 shrink-0 text-muted-foreground lg:block" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="top" align="center" className="w-56 rounded-2xl">
                <DropdownMenuLabel className="lg:hidden">
                  <p className="truncate text-sm font-medium">{me.name}</p>
                  <p className="text-xs font-normal text-muted-foreground">{me.role}</p>
                </DropdownMenuLabel>
                <DropdownMenuSeparator className="lg:hidden" />
                <DropdownMenuItem asChild>
                  <Link to="/settings" className="flex cursor-pointer items-center gap-2">
                    <Settings className="h-4 w-4" /> ตั้งค่าโปรไฟล์
                  </Link>
                </DropdownMenuItem>
                {who?.superadmin && (
                  <DropdownMenuItem asChild>
                    <Link to="/import" className="flex cursor-pointer items-center gap-2">
                      <FileUp className="h-4 w-4" /> นำเข้านักเรียน
                    </Link>
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={signOut} className="cursor-pointer gap-2 text-destructive focus:text-destructive">
                  <LogOut className="h-4 w-4" /> ออกจากระบบ
                </DropdownMenuItem>
                {version && <p className="px-2 pb-1 pt-2 text-[11px] text-muted-foreground">เวอร์ชัน {version}</p>}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex items-center justify-between border-b border-border bg-background/90 px-4 py-3 backdrop-blur md:hidden">
          <Link to="/" className="flex items-center gap-2" onClick={() => setMenuOpen(false)}>
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary font-display text-base font-bold text-primary-foreground">Y</div>
            <span className="font-display text-xl font-bold">YODO</span>
          </Link>
          <div className="flex items-center gap-1">
          <NotificationBell />
          <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
            <SheetTrigger asChild>
              <button aria-label="เปิดเมนู" className="rounded-full p-2 text-foreground"><Menu className="h-5 w-5" /></button>
            </SheetTrigger>
            <SheetContent side="right" className="flex w-72 flex-col p-0">
              <SheetHeader className="border-b border-border px-5 py-4 text-left">
                <SheetTitle className="font-display text-xl font-bold">YODO</SheetTitle>
              </SheetHeader>
              <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-3 py-4">
                {nav.map((n) => (
                  <Link
                    key={n.to}
                    to={n.to}
                    activeOptions={{ exact: n.to === "/" }}
                    onClick={() => setMenuOpen(false)}
                    className="flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium text-foreground/70 transition-colors hover:bg-muted hover:text-foreground"
                    activeProps={{ className: "!bg-primary !text-primary-foreground shadow-soft" }}
                  >
                    <n.icon className="h-4 w-4 shrink-0" />
                    {n.label}
                  </Link>
                ))}
              </nav>
              {me && (
                <div className="border-t border-border px-3 py-4">
                  <div className="flex items-center gap-3 px-2 pb-3">
                    <Avatar src={me.image} name={me.name} className="h-10 w-10" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{me.name}</p>
                      <p className="text-xs text-muted-foreground">{me.role}</p>
                    </div>
                  </div>
                  <Link to="/settings" onClick={() => setMenuOpen(false)} className="flex items-center gap-3 rounded-2xl px-4 py-2.5 text-sm font-medium text-foreground/70 transition-colors hover:bg-muted hover:text-foreground">
                    <Settings className="h-4 w-4" /> ตั้งค่าโปรไฟล์
                  </Link>
                  {who?.superadmin && (
                    <Link to="/import" onClick={() => setMenuOpen(false)} className="flex items-center gap-3 rounded-2xl px-4 py-2.5 text-sm font-medium text-foreground/70 transition-colors hover:bg-muted hover:text-foreground">
                      <FileUp className="h-4 w-4" /> นำเข้านักเรียน
                    </Link>
                  )}
                  <button onClick={() => { setMenuOpen(false); void signOut(); }} className="flex w-full items-center gap-3 rounded-2xl px-4 py-2.5 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10">
                    <LogOut className="h-4 w-4" /> ออกจากระบบ
                  </button>
                  {version && <p className="px-4 pt-2 text-[11px] text-muted-foreground">เวอร์ชัน {version}</p>}
                </div>
              )}
            </SheetContent>
          </Sheet>
          </div>
        </header>
        <div className="sticky top-0 z-20 hidden justify-end px-8 pt-4 md:flex"><NotificationBell className="border border-border bg-background shadow-soft" /></div>
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 md:px-8 md:pt-2"><Guarded>{children}</Guarded></main>
      </div>
    </div>
  );
}
