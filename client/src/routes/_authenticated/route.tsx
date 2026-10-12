import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { ApiError, getMe } from "@/lib/api";
import { AutoLock } from "@/components/yodo/Pin";
import { useSignOut } from "@/components/yodo/AppShell";

export const Route = createFileRoute("/_authenticated")({
  beforeLoad: async () => {
    try {
      return { user: await getMe() };
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) throw redirect({ to: "/auth" });
      throw e;
    }
  },
  component: Signed,
});

// Every signed-in page (the settings page too) can lock itself when the person set auto-lock.
function Signed() {
  const { user } = Route.useRouteContext();
  const signOut = useSignOut();
  return (
    <>
      <Outlet />
      <AutoLock name={user.nickname || user.firstName || user.username} onLogout={() => void signOut()} />
    </>
  );
}
