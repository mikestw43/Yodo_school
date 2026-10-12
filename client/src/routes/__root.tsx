import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  type ErrorComponentProps,
} from "@tanstack/react-router";

import { Fragment } from "react";
import { YodoProvider } from "@/lib/yodo-store";
import { L, useLang } from "@/lib/i18n";
import { Toaster } from "@/components/ui/sonner";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="font-display text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">{L("ไม่พบหน้านี้", "Page not found")}</h2>
        <div className="mt-6">
          <Link to="/" className="inline-flex items-center justify-center rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
            {L("กลับหน้าแรก", "Back to home")}
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: ErrorComponentProps) {
  console.error(error);
  const router = useRouter();
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold text-foreground">{L("เกิดข้อผิดพลาด", "Something went wrong")}</h1>
        <button
          onClick={() => {
            router.invalidate();
            reset();
          }}
          className="mt-6 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          {L("ลองใหม่", "Try again")}
        </button>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  // A language change redraws every page, so texts written as L("ไทย", "English") follow at once.
  const lang = useLang();
  return (
    <QueryClientProvider client={queryClient}>
      <YodoProvider>
        <Fragment key={lang}><Outlet /></Fragment>
        <Toaster position="top-right" richColors />
      </YodoProvider>
    </QueryClientProvider>
  );
}
