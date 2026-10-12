import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { ApiError, getMe } from "@/lib/api";

export const Route = createFileRoute("/_authenticated")({
  beforeLoad: async () => {
    try {
      return { user: await getMe() };
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) throw redirect({ to: "/auth" });
      throw e;
    }
  },
  component: () => <Outlet />,
});
