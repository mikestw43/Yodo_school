import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useRouter } from "@tanstack/react-router";
import { CheckCheck, ChevronRight, Monitor, Paperclip, SendHorizontal, Smartphone, X } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Avatar, EmptyState } from "@/components/yodo/ui";
import { api, errorText } from "@/lib/api";
import { L, fd } from "@/lib/i18n";
import { cn } from "@/lib/utils";

// "Chat with support" (owner 25/10/2026, mockup D1GCdHAfNmKbMkrNXQBjed): a user's own conversation, and the SuperAdmin's
// inbox + one conversation. Answers show as "ผู้ดูแล" / "Support". The page / device / version line is sent with every
// message and shown only to the SuperAdmin (owner: "เฉพาะผม").

export type ChatMsg = { id: string; fromAdmin: boolean; text: string; image: string; createdAt: string; read: boolean; page?: string; device?: string; version?: string };
export type Room = { userId: string; name: string; fullName: string; image: string; position: string; last: ChatMsg; unread: number };

const REFRESH = "yodo:support-refresh";
const refreshBadge = () => window.dispatchEvent(new Event(REFRESH));

/** Unread messages for the menu badge: answers for a user, new messages for the SuperAdmin. */
let lastUnread = 0; // kept between redraws (language switch)
export const forgetSupportUnread = () => { lastUnread = 0; };
export function useSupportUnread() {
  const [n, setN] = useState(lastUnread);
  useEffect(() => {
    let alive = true;
    const load = () => api<{ unread: number }>("/support/unread").then((r) => { lastUnread = r.unread; if (alive) setN(r.unread); }).catch(() => null);
    void load();
    const t = setInterval(load, 30_000);
    window.addEventListener(REFRESH, load);
    window.addEventListener("focus", load);
    return () => { alive = false; clearInterval(t); window.removeEventListener(REFRESH, load); window.removeEventListener("focus", load); };
  }, []);
  return n;
}

let versionCache = "";
async function appVersion() {
  if (versionCache) return versionCache;
  try { versionCache = (await (await fetch("/version.txt", { cache: "no-store" })).text()).split(" ")[0]?.trim() ?? ""; } catch { /* unknown */ }
  return versionCache;
}
const isPhone = () => window.matchMedia("(max-width: 767px)").matches;

/** "ปิด" / "Close" at the top left of the chat and the inbox (owner 25/10/2026): leaves the chat for the page the person was
 *  on before (the conversation stays as it is), else the dashboard. */
export function CloseChat() {
  const router = useRouter();
  return (
    <button type="button" onClick={() => router.history.push(lastPage() || "/")} data-testid="chat-close"
      className="mb-3 inline-flex h-9 items-center gap-1.5 rounded-full border border-border bg-background px-4 text-sm font-semibold hover:bg-muted">
      <X className="h-4 w-4" /> {L("ปิด", "Close")}
    </button>
  );
}

/** Where the person was before opening the chat (the page they want to talk about). */
function lastPage() {
  try { return sessionStorage.getItem("yodo-last-page") ?? ""; } catch { return ""; }
}
export function rememberPage(path: string) {
  if (path.startsWith("/support")) return;
  try { sessionStorage.setItem("yodo-last-page", path); } catch { /* not kept */ }
}

function shrink(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("read"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("image"));
      img.onload = () => {
        const scale = Math.min(1, 1600 / Math.max(img.width, img.height));
        const c = document.createElement("canvas");
        c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
        c.getContext("2d")?.drawImage(img, 0, 0, c.width, c.height);
        resolve(c.toDataURL("image/jpeg", 0.85));
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

const hm = (iso: string) => { const d = new Date(iso); return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };
const dayOf = (iso: string) => { const d = new Date(iso); const t = new Date(); return d.toDateString() === t.toDateString() ? L("วันนี้", "Today") : fd(d); };

function Messages({ list, admin, other }: { list: ChatMsg[]; admin: boolean; other?: string }) {
  const end = useRef<HTMLDivElement>(null);
  const [big, setBig] = useState("");
  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [list.length]);
  const lastMine = [...list].reverse().find((m) => m.fromAdmin === admin);
  return (
    <div className="flex flex-col gap-2 py-3" data-testid="chat-messages">
      {list.map((m, i) => {
        const mine = m.fromAdmin === admin;
        const day = dayOf(m.createdAt);
        const showDay = i === 0 || dayOf(list[i - 1]!.createdAt) !== day;
        const showWho = !mine && (i === 0 || list[i - 1]!.fromAdmin !== m.fromAdmin);
        return (
          <div key={m.id} className="flex flex-col">
            {showDay && <span className="mx-auto my-1 rounded-full bg-muted px-3 py-0.5 text-[11px] text-muted-foreground">{day}</span>}
            {showWho && <span className="mb-0.5 ml-1 text-[11px] text-muted-foreground">{m.fromAdmin ? L("ผู้ดูแล", "Support") : other}</span>}
            <div data-testid="chat-msg" data-mine={mine ? "1" : "0"} className={cn("max-w-[80%] whitespace-pre-wrap break-words rounded-2xl px-3 py-2 text-sm",
              mine ? "self-end rounded-br-md bg-primary text-primary-foreground" : "self-start rounded-bl-md border border-border bg-card")}>
              {m.image && <button type="button" onClick={() => setBig(m.image)} className="mb-1 block"><img src={m.image} alt="" className="max-h-48 rounded-xl object-cover" /></button>}
              {m.text}
              <span className="mt-0.5 block text-right text-[10px] opacity-75">{hm(m.createdAt)}</span>
            </div>
            {/* page · phone/computer · version: only the SuperAdmin sees it */}
            {admin && !m.fromAdmin && (m.page || m.device || m.version) && (
              <span className="ml-1 mt-0.5 flex items-center gap-1 text-[10.5px] text-muted-foreground" data-testid="chat-context">
                {m.device === "phone" ? <Smartphone className="h-3 w-3" /> : <Monitor className="h-3 w-3" />}
                {[m.page, m.device === "phone" ? L("มือถือ", "Phone") : m.device ? L("คอมพิวเตอร์", "Computer") : "", m.version].filter(Boolean).join(" · ")}
              </span>
            )}
            {m === lastMine && m.read && <span className="mr-1 mt-0.5 flex items-center gap-1 self-end text-[10.5px] text-muted-foreground" data-testid="chat-read"><CheckCheck className="h-3 w-3" />{L("อ่านแล้ว", "Read")}</span>}
          </div>
        );
      })}
      <div ref={end} />
      <Dialog open={!!big} onOpenChange={(o) => !o && setBig("")}>
        <DialogContent className="max-w-3xl p-2"><DialogTitle className="sr-only">{L("รูปภาพ", "Picture")}</DialogTitle><img src={big} alt="" className="max-h-[80vh] w-full rounded-xl object-contain" /></DialogContent>
      </Dialog>
    </div>
  );
}

function Composer({ onSend }: { onSend: (text: string, image: string) => Promise<void> }) {
  const [text, setText] = useState("");
  const [image, setImage] = useState("");
  const [busy, setBusy] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const send = async () => {
    if (busy || (!text.trim() && !image)) return;
    setBusy(true);
    try { await onSend(text.trim(), image); setText(""); setImage(""); }
    catch (e) { toast.error(errorText(e)); }
    finally { setBusy(false); }
  };
  return (
    <div className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-10 -mx-1 rounded-3xl border border-border bg-card p-2 shadow-soft md:bottom-4">
      {image && (
        <div className="relative mb-2 inline-block">
          <img src={image} alt="" className="h-20 rounded-xl object-cover" />
          <button type="button" onClick={() => setImage("")} className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-foreground text-background" aria-label={L("เอารูปออก", "Remove picture")}><X className="h-3.5 w-3.5" /></button>
        </div>
      )}
      <div className="flex items-end gap-2">
        <button type="button" onClick={() => file.current?.click()} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted" aria-label={L("แนบรูป", "Attach a picture")} data-testid="chat-attach"><Paperclip className="h-5 w-5" /></button>
        <input ref={file} type="file" accept="image/*" className="hidden" data-testid="chat-file"
          onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) try { setImage(await shrink(f)); } catch { toast.error(L("อ่านรูปไม่ได้", "Could not read the picture")); } }} />
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={1} placeholder={L("พิมพ์ข้อความ", "Type a message")} data-testid="chat-input"
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !isPhone()) { e.preventDefault(); void send(); } }}
          className="max-h-32 min-h-10 flex-1 resize-none rounded-2xl border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:border-primary" />
        <button type="button" onClick={() => void send()} disabled={busy || (!text.trim() && !image)} data-testid="chat-send"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground disabled:opacity-40" aria-label={L("ส่ง", "Send")}><SendHorizontal className="h-5 w-5" /></button>
      </div>
    </div>
  );
}

function usePoll<T>(path: string, ms: number) {
  const [data, setData] = useState<T | null>(null);
  const load = useCallback(async () => {
    try { setData(await api<T>(path)); refreshBadge(); } catch { /* keep what we have */ }
  }, [path]);
  useEffect(() => {
    void load();
    const t = setInterval(load, ms);
    return () => clearInterval(t);
  }, [load, ms]);
  return [data, load] as const;
}

/** A person's own conversation with support. */
export function MyChat() {
  const [d, reload] = usePoll<{ messages: ChatMsg[] }>("/support/me", 5000);
  const send = async (text: string, image: string) => {
    await api("/support/me", { body: { text, image, page: lastPage(), device: isPhone() ? "phone" : "computer", version: await appVersion() } });
    await reload();
  };
  return (
    <div className="mx-auto flex max-w-2xl flex-col" data-testid="my-chat">
      {d && d.messages.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">{L("พิมพ์บอกปัญหา หรือสิ่งที่อยากให้แก้ได้เลย ผู้ดูแลจะตอบกลับในนี้", "Tell us about a problem or what you would like changed; support will answer here")}</p>}
      {d && <Messages list={d.messages} admin={false} />}
      <Composer onSend={send} />
    </div>
  );
}

/** The SuperAdmin's list of conversations, newest first. */
export function Inbox() {
  const [d] = usePoll<{ rooms: Room[] }>("/support/rooms", 10_000);
  if (!d) return null;
  if (!d.rooms.length) return <EmptyState title={L("ยังไม่มีข้อความ", "No messages yet")} text={L("เมื่อมีคนแชทเข้ามา จะแสดงที่นี่และเด้งเตือนในมือถือ", "When someone writes, it shows here and on your phone")} />;
  return (
    <Card className="mx-auto max-w-2xl gap-0 overflow-hidden rounded-3xl p-0" data-testid="inbox">
      {d.rooms.map((r) => (
        <Link key={r.userId} to="/support/$userId" params={{ userId: r.userId }} data-testid="inbox-room"
          className="flex items-center gap-3 border-b border-border/60 px-4 py-3 last:border-0 hover:bg-muted/40">
          <Avatar src={r.image} name={r.name} className="h-10 w-10 shrink-0" />
          <span className="min-w-0 flex-1">
            <span className={cn("block truncate text-sm", r.unread ? "font-bold" : "font-semibold")}>{r.name}{r.position ? <span className="font-normal text-muted-foreground"> ({r.position})</span> : null}</span>
            <span className={cn("block truncate text-xs", r.unread ? "font-semibold text-foreground" : "text-muted-foreground")}>
              {r.last.fromAdmin ? L("คุณ: ", "You: ") : ""}{r.last.text || L("ส่งรูปภาพ", "Sent a picture")}
            </span>
          </span>
          <span className="flex shrink-0 flex-col items-end gap-1 text-[11px] text-muted-foreground">
            {dayOf(r.last.createdAt) === L("วันนี้", "Today") ? hm(r.last.createdAt) : fd(r.last.createdAt)}
            {r.unread > 0 ? <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-bold text-primary-foreground">{r.unread}</span> : <ChevronRight className="h-4 w-4" />}
          </span>
        </Link>
      ))}
    </Card>
  );
}

/** One conversation, seen by the SuperAdmin. */
export function AdminRoom({ userId }: { userId: string }) {
  const [d, reload] = usePoll<{ user: { name: string; fullName: string; image: string; position: string }; messages: ChatMsg[] }>(`/support/rooms/${userId}`, 5000);
  const send = async (text: string, image: string) => {
    await api(`/support/rooms/${userId}`, { body: { text, image } });
    await reload();
  };
  if (!d) return null;
  return (
    <div className="mx-auto flex max-w-2xl flex-col" data-testid="admin-room">
      <div className="flex items-center gap-3 rounded-3xl border border-border bg-card px-4 py-3">
        <Avatar src={d.user.image} name={d.user.name} className="h-10 w-10" />
        <span className="min-w-0"><span className="block truncate font-semibold">{d.user.fullName}</span><span className="block text-xs text-muted-foreground">{d.user.position}</span></span>
      </div>
      <Messages list={d.messages} admin other={d.user.name} />
      <Composer onSend={send} />
    </div>
  );
}
