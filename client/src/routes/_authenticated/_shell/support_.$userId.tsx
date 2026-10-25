import { createFileRoute } from "@tanstack/react-router";
import { EmptyState, PageHeader } from "@/components/yodo/ui";
import { AdminRoom } from "@/components/yodo/support";
import { useYodo } from "@/lib/yodo-store";
import { L } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/_shell/support_/$userId")({
  head: () => ({ meta: [{ title: "YODO" }] }),
  component: SupportRoomPage,
});

// One conversation in the SuperAdmin's inbox (bell notices of a new message open it).
function SupportRoomPage() {
  const { userId } = Route.useParams();
  const { me } = useYodo();
  if (!me) return null;
  if (!me.superadmin) return <EmptyState title={L("ไม่มีสิทธิ์เข้าถึงหน้านี้", "You don't have access to this page")} />;
  return (
    <>
      <PageHeader back title={L("แชท", "Chat")} />
      <AdminRoom userId={userId} />
    </>
  );
}
