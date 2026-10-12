import { createFileRoute, Outlet } from "@tanstack/react-router";
import { AppShell } from "@/components/yodo/AppShell";

export const Route = createFileRoute("/_authenticated/_shell")({
  component: () => (
    <AppShell>
      <Outlet />
    </AppShell>
  ),
});
