import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/yodo/ui";
import { CloseChat, Inbox, MyChat } from "@/components/yodo/support";
import { useYodo } from "@/lib/yodo-store";
import { L } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/_shell/support")({
  head: () => ({ meta: [{ title: "YODO" }] }),
  component: SupportPage,
});

// Everyone: their own chat with support. The SuperAdmin (who answers, owner 25/10/2026): the inbox.
function SupportPage() {
  const { me } = useYodo();
  if (!me) return null;
  return me.superadmin ? (
    <>
      <CloseChat />
      <PageHeader title={L("กล่องข้อความ", "Inbox")} subtitle={L("ทุกคนที่แชทเข้ามา ล่าสุดอยู่บน", "Everyone who wrote, newest first")} />
      <Inbox />
    </>
  ) : (
    <>
      <CloseChat />
      <PageHeader title={L("แชทกับผู้ดูแล", "Chat with support")} subtitle={L("แจ้งปัญหา หรือขอให้แก้อะไรก็ได้", "Report a problem or ask for a change")} />
      <MyChat />
    </>
  );
}
