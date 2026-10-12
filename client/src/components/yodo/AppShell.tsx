import { useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate, useLocation } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { CalendarHeart, ChevronDown, Crown, FileUp, History, LogOut, Menu, Music4, PanelLeftClose, PanelLeftOpen, PersonStanding, Settings, ShieldCheck, Sparkles, UserCog } from "lucide-react";
import { api, getMe } from "@/lib/api";
import { ROLE_LABEL } from "@/lib/auth-utils";
import { Avatar, EmptyState } from "@/components/yodo/ui";
import { useYodo, type MenuKey } from "@/lib/yodo-store";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { NotificationBell } from "@/components/yodo/NotificationBell";
import { LangToggle } from "@/components/yodo/LangToggle";
import { L } from "@/lib/i18n";

const NAV = [
  { to: "/", th: "ภาพรวม", en: "Dashboard", icon: Sparkles, key: "dashboard" },
  { to: "/students", th: "นักเรียน", en: "Students", icon: PersonStanding, key: "students" },
  { to: "/classes", th: "คลาส", en: "Classes", icon: Music4, key: "classes" },
  { to: "/teachers", th: "ครู", en: "Teachers", icon: Crown, key: "teachers" },
  { to: "/calendar", th: "ปฏิทิน", en: "Calendar", icon: CalendarHeart, key: "calendar" },
  { to: "/users", th: "ผู้ใช้ระบบ", en: "Users", icon: UserCog, key: "users" },
  { to: "/permissions", th: "สิทธิ์", en: "Permissions", icon: ShieldCheck, key: "users" },
  { to: "/audit-log", th: "ประวัติการแก้ไข", en: "Audit Log", icon: History, key: "auditlog" },
] as const satisfies readonly { to: string; th: string; en: string; key: MenuKey; icon: unknown }[];

function useMe() {
  const [me, setMe] = useState<Me | null>(null);
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
  return <EmptyState title={L("ไม่มีสิทธิ์เข้าถึงหน้านี้", "You don't have access to this page")} text={L("ติดต่อผู้ดูแลระบบเพื่อขอสิทธิ์การใช้งานเมนูนี้", "Ask an administrator for access to this menu.")} />;
}

type Me = { name: string; role: string; image: string };

/** Account menu at the top right (owner 12/10/2026): profile settings, import, sign out, version. */
function AccountMenu({ me, compact }: { me: Me; compact?: boolean }) {
  const { me: who } = useYodo();
  const version = useVersion();
  const signOut = useSignOut();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {compact ? (
          <button className="rounded-full p-1.5" title={L("เมนูบัญชี", "Account menu")} aria-label={L("เมนูบัญชี", "Account menu")}>
            <Avatar src={me.image} name={me.name} className="h-8 w-8" />
          </button>
        ) : (
          <button className="flex h-10 items-center gap-2 rounded-full border border-border bg-background py-1 pl-1 pr-3 shadow-soft transition-colors hover:bg-muted" title={L("เมนูบัญชี", "Account menu")} aria-label={L("เมนูบัญชี", "Account menu")}>
            <Avatar src={me.image} name={me.name} className="h-8 w-8" />
            <span className="max-w-40 truncate text-sm font-medium">{me.name}</span>
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          </button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60 rounded-2xl">
        <DropdownMenuLabel className="flex items-center gap-3">
          <Avatar src={me.image} name={me.name} className="h-10 w-10" />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{me.name}</p>
            <p className="text-xs font-normal text-muted-foreground">{me.role}</p>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/settings" className="flex cursor-pointer items-center gap-2">
            <Settings className="h-4 w-4" /> {L("ตั้งค่าโปรไฟล์", "Profile settings")}
          </Link>
        </DropdownMenuItem>
        {who?.superadmin && (
          <DropdownMenuItem asChild>
            <Link to="/import" className="flex cursor-pointer items-center gap-2">
              <FileUp className="h-4 w-4" /> {L("นำเข้านักเรียน", "Import students")}
            </Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={signOut} className="cursor-pointer gap-2 text-destructive focus:text-destructive">
          <LogOut className="h-4 w-4" /> {L("ออกจากระบบ", "Sign out")}
        </DropdownMenuItem>
        {version && <p className="px-2 pb-1 pt-2 text-[11px] text-muted-foreground">{L("เวอร์ชัน", "Version")} {version}</p>}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const NAV_KEY = "yodo-nav-collapsed";
function readCollapsed() {
  try { return localStorage.getItem(NAV_KEY) === "1"; } catch { return false; }
}

export function AppShell({ children }: { children: ReactNode }) {
  const me = useMe();
  const { can } = useYodo();
  const nav = NAV.filter((n) => can(n.key));
  const [menuOpen, setMenuOpen] = useState(false);
  // Folded side menu (icons only), remembered on this device (owner 12/10/2026).
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const toggle = () => setCollapsed((c) => {
    try { localStorage.setItem(NAV_KEY, c ? "0" : "1"); } catch { /* not kept */ }
    return !c;
  });
  const wide = !collapsed;
  return (
    <div className="flex min-h-screen bg-background">
      <aside className={`sticky top-0 hidden h-screen w-20 shrink-0 flex-col border-r border-sidebar-border bg-sidebar px-3 py-6 md:flex ${wide ? "lg:w-64 lg:px-5" : ""}`}>
        <div className={`mb-10 flex flex-col items-center gap-4 ${wide ? "lg:flex-row lg:gap-3" : ""}`}>
          <Link to="/" className="flex min-w-0 flex-1 items-center gap-3 px-2">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary font-display text-xl font-bold text-primary-foreground">Y</div>
            <div className={wide ? "hidden lg:block" : "hidden"}>
              <p className="font-display text-2xl font-bold leading-none tracking-wide">YODO</p>
              <p className="whitespace-nowrap text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Dance Academy</p>
            </div>
          </Link>
          <button onClick={toggle} className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border bg-background text-primary transition-colors hover:bg-muted lg:flex" title={collapsed ? L("ขยายเมนู", "Expand menu") : L("ย่อเมนู", "Collapse menu")} aria-label={collapsed ? L("ขยายเมนู", "Expand menu") : L("ย่อเมนู", "Collapse menu")}>
            {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          </button>
        </div>
        <nav className="flex flex-1 flex-col gap-1">
          {nav.map((n) => (
            <Link
              key={n.to}
              to={n.to}
              activeOptions={{ exact: n.to === "/" }}
              className={`flex items-center justify-center gap-3 rounded-full px-3 py-2.5 text-sm font-medium text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground ${wide ? "lg:justify-start" : ""}`}
              activeProps={{ className: "!bg-primary !text-primary-foreground shadow-soft" }}
              title={L(n.th, n.en)}
            >
              <n.icon className="h-4 w-4 shrink-0" />
              <span className={wide ? "hidden lg:inline" : "hidden"}>{L(n.th, n.en)}</span>
            </Link>
          ))}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex items-center justify-between border-b border-border bg-background/90 px-4 py-3 backdrop-blur md:hidden">
          <Link to="/" className="flex items-center gap-2" onClick={() => setMenuOpen(false)}>
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary font-display text-base font-bold text-primary-foreground">Y</div>
            <span className="font-display text-xl font-bold">YODO</span>
          </Link>
          <div className="flex items-center gap-1">
          <LangToggle />
          <NotificationBell />
          {me && <AccountMenu me={me} compact />}
          <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
            <SheetTrigger asChild>
              <button aria-label={L("เปิดเมนู", "Open menu")} className="rounded-full p-2 text-foreground"><Menu className="h-5 w-5" /></button>
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
                    {L(n.th, n.en)}
                  </Link>
                ))}
              </nav>
            </SheetContent>
          </Sheet>
          </div>
        </header>
        <div className="sticky top-0 z-20 hidden justify-end px-8 pt-4 md:flex"><div className="flex items-center gap-2"><LangToggle className="border border-border bg-background shadow-soft" /><NotificationBell className="border border-border bg-background shadow-soft" />{me && <AccountMenu me={me} />}</div></div>
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 md:px-8 md:pt-2"><Guarded>{children}</Guarded></main>
      </div>
    </div>
  );
}
