import { useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate, useLocation, useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { CalendarHeart, ChevronDown, Hourglass, Crown, FileUp, History, LogOut, Ellipsis, Music4, PanelLeftClose, PanelLeftOpen, PersonStanding, ReceiptText, Settings, Building2, ShieldCheck, Sparkles, UserCog, MessageCircle, IdCard } from "lucide-react";
import { api, clearMeCache, getMe } from "@/lib/api";
import { ROLE_LABEL } from "@/lib/auth-utils";
import { Avatar, EmptyState } from "@/components/yodo/ui";
import { useYodo, type MenuKey } from "@/lib/yodo-store";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { NotificationBell } from "@/components/yodo/NotificationBell";
import { LangToggle } from "@/components/yodo/LangToggle";
import { L } from "@/lib/i18n";
import { ReceiptHost } from "@/components/yodo/receipt";
import { CourseHosts } from "@/components/yodo/courses";
import { forgetSupportUnread, rememberPage, useSupportUnread } from "@/components/yodo/support";
import logoImg from "@/assets/yodo-logo.png";
import markImg from "@/assets/yodo-mark.png";

const NAV = [
  { to: "/", th: "ภาพรวม", en: "Dashboard", icon: Sparkles, key: "dashboard" },
  { to: "/students", th: "นักเรียน", en: "Students", icon: PersonStanding, key: "students" },
  { to: "/classes", th: "คลาส", en: "Classes", icon: Music4, key: "classes" },
  { to: "/courses", th: "วันหมดอายุ", en: "Expiry dates", icon: Hourglass, key: "courses" },
  { to: "/teachers", th: "ครู", en: "Teachers", icon: Crown, key: "teachers" },
  { to: "/calendar", th: "ปฏิทิน", en: "Calendar", icon: CalendarHeart, key: "calendar" },
  { to: "/receipts", th: "ใบเสร็จรับเงิน", en: "Receipts", icon: ReceiptText, key: "receipts" },
  // Everyone has it, last in the menu (owner 25/10/2026); the SuperAdmin's reads "Inbox" (`navLabel`).
  { to: "/support", th: "แชทกับผู้ดูแล", en: "Chat with support", icon: MessageCircle, key: "support" },
] as const satisfies readonly { to: string; th: string; en: string; key: MenuKey | "support"; icon: unknown }[];

// Moved from the side menu to the account menu, under "System" (owner 12/10/2026).
const ADMIN = [
  { to: "/users", th: "ผู้ใช้ระบบ", en: "Users", icon: UserCog, key: "users" },
  { to: "/permissions", th: "สิทธิ์", en: "Permissions", icon: ShieldCheck, key: "users" },
  { to: "/audit-log", th: "ประวัติการแก้ไข", en: "Audit Log", icon: History, key: "auditlog" },
] as const satisfies readonly { to: string; th: string; en: string; key: MenuKey; icon: unknown }[];

// Kept between redraws: a language switch redraws the page, and the account picture must not blink away (owner 25/10/2026).
let lastMe: Me | null = null;
function useMe() {
  const [me, setMe] = useState<Me | null>(lastMe);
  useEffect(() => {
    const load = async () => {
      try {
        const p = await getMe();
        // top right shows the nickname, else the first name (owner 13/10/2026); the open menu keeps the full name
        lastMe = { name: p.name, short: p.nickname.trim() || p.firstName.trim() || p.name, role: p.positionName || ROLE_LABEL[p.role] || p.role || "-", image: p.image };
        setMe(lastMe);
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
    clearMeCache();
    lastMe = null;
    forgetSupportUnread();
    await qc.cancelQueries();
    qc.clear();
    clear();
    navigate({ to: "/auth", replace: true });
  };
}

function Guarded({ children }: { children: ReactNode }) {
  const { can, loading, me } = useYodo();
  const path = useLocation({ select: (l) => l.pathname });
  const item = [...NAV, ...ADMIN].reverse().find((n) => (n.to === "/" ? path === "/" : path.startsWith(n.to)));
  if (loading || !me || !item || item.key === "support" || can(item.key)) return <>{children}</>;
  return <EmptyState title={L("ไม่มีสิทธิ์เข้าถึงหน้านี้", "You don't have access to this page")} text={L("ติดต่อผู้ดูแลระบบเพื่อขอสิทธิ์การใช้งานเมนูนี้", "Ask an administrator for access to this menu.")} />;
}

type Me = { name: string; short: string; role: string; image: string };

/** Account menu at the top right (owner 12/10/2026): profile settings, import, sign out, version. */
function AccountMenu({ me, compact }: { me: Me; compact?: boolean }) {
  const { me: who, can, data } = useYodo();
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
            <span className="max-w-40 truncate text-sm font-medium" data-testid="account-name">{me.short}</span>
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
        {can("company") && (
          <DropdownMenuItem asChild>
            <Link to="/company" className="flex cursor-pointer items-center gap-2">
              <Building2 className="h-4 w-4" /> {L("ตั้งค่าบริษัท", "Company settings")}
            </Link>
          </DropdownMenuItem>
        )}
        {(ADMIN.some((a) => can(a.key)) || data.owner) && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{L("จัดการระบบ", "System")}</DropdownMenuLabel>
            {/* Office staff and salary certificates: the Owner / SuperAdmin only (owner 27/10/2026) */}
            {data.owner && (
              <DropdownMenuItem asChild>
                <Link to="/employees" className="flex cursor-pointer items-center gap-2" data-testid="menu-employees">
                  <IdCard className="h-4 w-4" /> {L("พนักงาน", "Staff")}
                </Link>
              </DropdownMenuItem>
            )}
            {ADMIN.filter((a) => can(a.key)).map((a) => (
              <DropdownMenuItem key={a.to} asChild>
                <Link to={a.to} className="flex cursor-pointer items-center gap-2">
                  <a.icon className="h-4 w-4" /> {L(a.th, a.en)}
                </Link>
              </DropdownMenuItem>
            ))}
          </>
        )}
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

type NavItem = (typeof NAV)[number];

/** Phones: menu bar at the bottom like a phone app (owner 17/10/2026, mockup 2o1pdZZR6AXvK63C3a4rsf). Up to 5 pages show
 *  as they are; more than 5 = the first 4 + "More" (three dots), which opens the rest from the bottom. */
// Phone order (owner 25/10/2026): Calendar takes Classes' place in the bar, Classes moves into More. Computers keep NAV.
const PHONE_ORDER = ["/", "/students", "/calendar", "/courses", "/classes", "/teachers", "/receipts", "/support"];
/** The SuperAdmin answers the chats, so their menu item is the inbox. */
const navLabel = (n: NavItem, superadmin: boolean) => (n.to === "/support" && superadmin ? L("กล่องข้อความ", "Inbox") : L(n.th, n.en));
function Badge({ n, className }: { n: number; className?: string }) {
  if (!n) return null;
  return <span className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-bold text-primary-foreground ${className ?? ""}`} data-testid="support-badge">{n > 99 ? "99+" : n}</span>;
}
function BottomNav({ nav: all, superadmin, unread }: { nav: NavItem[]; superadmin: boolean; unread: number }) {
  const [open, setOpen] = useState(false);
  const path = useRouterState({ select: (st) => st.location.pathname });
  const nav = [...all].sort((a, b) => PHONE_ORDER.indexOf(a.to) - PHONE_ORDER.indexOf(b.to));
  const main = nav.length > 5 ? nav.slice(0, 4) : nav;
  const rest = nav.length > 5 ? nav.slice(4) : [];
  const on = (to: string) => (to === "/" ? path === "/" : path === to || path.startsWith(`${to}/`) || path.startsWith(`${to}_`));
  const moreOn = rest.some((n) => on(n.to));
  const tab = (active: boolean) => `flex min-w-0 flex-col items-center gap-1 rounded-2xl px-1 py-1.5 text-[11px] font-semibold transition-colors ${active ? "text-primary" : "text-muted-foreground"}`;
  const pill = (active: boolean) => `flex h-7 w-14 items-center justify-center rounded-full transition-colors ${active ? "bg-accent" : ""}`;
  return (
    <>
      <nav className="fixed inset-x-0 bottom-0 z-30 grid border-t border-border bg-background/95 px-2 pb-[calc(0.4rem+env(safe-area-inset-bottom))] pt-1.5 backdrop-blur md:hidden"
        style={{ gridTemplateColumns: `repeat(${main.length + (rest.length ? 1 : 0)}, minmax(0, 1fr))` }} aria-label={L("เมนูหลัก", "Main menu")} data-testid="bottom-nav">
        {main.map((n) => (
          <Link key={n.to} to={n.to} className={tab(on(n.to))} aria-current={on(n.to) ? "page" : undefined}>
            <span className={`relative ${pill(on(n.to))}`}><n.icon className="h-5 w-5" />{n.to === "/support" && <Badge n={unread} className="absolute -right-0.5 -top-1" />}</span>
            <span className="max-w-full truncate">{navLabel(n, superadmin)}</span>
          </Link>
        ))}
        {rest.length > 0 && (
          <button type="button" className={tab(moreOn)} onClick={() => setOpen(true)} data-testid="nav-more">
            <span className={`relative ${pill(moreOn)}`}><Ellipsis className="h-5 w-5" />{rest.some((n) => n.to === "/support") && <Badge n={unread} className="absolute -right-0.5 -top-1" />}</span>
            <span className="max-w-full truncate">{L("เพิ่มเติม", "More")}</span>
          </button>
        )}
      </nav>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="rounded-t-3xl px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-3 md:hidden">
          <div className="mx-auto mb-1 h-1 w-10 rounded-full bg-border" />
          <SheetHeader className="px-1 text-left"><SheetTitle className="text-base">{L("เมนูเพิ่มเติม", "More")}</SheetTitle></SheetHeader>
          <nav className="flex flex-col">
            {rest.map((n) => (
              <Link key={n.to} to={n.to} onClick={() => setOpen(false)} className={`flex items-center gap-3 border-t border-border/70 px-2 py-3.5 text-sm font-semibold ${on(n.to) ? "text-primary" : "text-foreground"}`}>
                <n.icon className="h-5 w-5 shrink-0" />{navLabel(n, superadmin)}{n.to === "/support" && <Badge n={unread} className="ml-auto" />}
              </Link>
            ))}
          </nav>
        </SheetContent>
      </Sheet>
    </>
  );
}

const NAV_KEY = "yodo-nav-collapsed";
function readCollapsed() {
  try { return localStorage.getItem(NAV_KEY) === "1"; } catch { return false; }
}

export function AppShell({ children }: { children: ReactNode }) {
  const me = useMe();
  const { can, me: who } = useYodo();
  const nav = NAV.filter((n) => n.key === "support" || can(n.key));
  const superadmin = !!who?.superadmin;
  const unread = useSupportUnread();
  const href = useRouterState({ select: (st) => st.location.href });
  useEffect(() => { rememberPage(href); }, [href]); // the chat sends the page the person came from; Close goes back there
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
          <Link to="/" className="flex min-w-0 flex-1 items-center justify-center px-1" title="YODO">
            {/* Full logo + motto when the menu is open, the Y dancer when folded (owner 12/10/2026). */}
            <img src={markImg} alt="YODO" className={`h-12 w-12 shrink-0 object-contain ${wide ? "lg:hidden" : ""}`} />
            {wide && <img src={logoImg} alt="YODO You Only Dance Once" className="hidden w-[170px] lg:block" />}
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
              <span className="relative"><n.icon className="h-4 w-4 shrink-0" />{n.to === "/support" && !wide && <Badge n={unread} className="absolute -right-3 -top-2.5" />}</span>
              <span className={wide ? "hidden lg:inline" : "hidden"}>{navLabel(n, superadmin)}</span>
              {n.to === "/support" && wide && <Badge n={unread} className="ml-auto hidden lg:inline-flex" />}
            </Link>
          ))}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex items-center justify-between border-b border-border bg-background/90 px-4 py-3 backdrop-blur md:hidden">
          <div className="flex items-center gap-1">
          <Link to="/" className="flex items-center gap-2">
            <img src={logoImg} alt="YODO You Only Dance Once" className="h-9 w-auto" />
          </Link>
          </div>
          <div className="flex items-center gap-1">
          <LangToggle />
          <NotificationBell />
          {me && <AccountMenu me={me} compact />}
          </div>
        </header>
        <div className="sticky top-0 z-20 hidden justify-end px-8 pt-4 md:flex"><div className="flex items-center gap-2"><LangToggle className="border border-border bg-background shadow-soft" /><NotificationBell className="border border-border bg-background shadow-soft" />{me && <AccountMenu me={me} />}</div></div>
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 pb-[calc(6rem+env(safe-area-inset-bottom))] pt-8 md:px-8 md:pb-8 md:pt-2"><Guarded>{children}</Guarded></main>
        <BottomNav nav={nav} superadmin={superadmin} unread={unread} />
        <CourseHosts />
        <ReceiptHost />
      </div>
    </div>
  );
}
