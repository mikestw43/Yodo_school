import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import { getRouter } from "./router";
import "./styles.css";

const router = getRouter();

// A file dropped outside a drop area must not make the browser leave the app to open it (real drop areas have data-drop).
for (const ev of ["dragover", "drop"] as const) {
  window.addEventListener(ev, (e) => { if (!(e.target as HTMLElement | null)?.closest?.("[data-drop]")) e.preventDefault(); });
}

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
