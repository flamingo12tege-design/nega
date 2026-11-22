import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { SearchX, House, LayoutGrid } from "lucide-react";

import appCss from "../styles.css?url";
import { AppShell } from "@/components/cas/AppShell";
import { Toaster } from "@/components/ui/sonner";

function NotFoundComponent() {
  return (
    <div className="fixed inset-0 z-[100] grid min-h-dvh place-items-center overflow-hidden bg-surface px-5">
      <div className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full bg-accent/15 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-28 -right-20 h-80 w-80 rounded-full bg-primary/10 blur-3xl" />
      <div className="rise relative w-full max-w-md text-center">
        <div className="relative mx-auto w-fit">
          <span className="absolute -left-8 top-8 h-3 w-3 rounded-full bg-accent" />
          <span className="absolute -right-7 bottom-8 h-2 w-2 rounded-full bg-primary" />
          <span className="grid h-24 w-24 place-items-center rounded-[28px] border border-white/70 bg-card text-primary shadow-lift">
            <SearchX className="h-11 w-11" strokeWidth={1.8} />
          </span>
        </div>
        <p className="mt-5 text-sm font-extrabold uppercase tracking-[0.35em] text-accent">Error 404</p>
        <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-primary">This page wandered off</h1>
        <p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-muted-foreground">
          The link may be outdated, or the page may have moved. Let’s get you back to something useful.
        </p>
        <div className="mt-7 grid grid-cols-2 gap-3">
          <Link
            to="/"
            className="press flex items-center justify-center gap-2 rounded-2xl bg-primary py-3.5 text-sm font-bold text-primary-foreground shadow-card"
          >
            <House className="h-4 w-4 text-accent" /> Go home
          </Link>
          <Link
            to="/appliances"
            className="press flex items-center justify-center gap-2 rounded-2xl border border-border bg-card py-3.5 text-sm font-bold text-primary shadow-card"
          >
            <LayoutGrid className="h-4 w-4" /> Appliances
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
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    // Replace these placeholders with the app's name and description when first building the app.
    // Each content route, / included, must still set its own head(). Never add og:image or
    // twitter:image here: every page without its own would inherit the root's preview image.
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { name: "theme-color", content: "#092653" },
      { title: "CAS — Home Appliances" },
      { name: "description", content: "CAS: quality home appliances, rewards and referrals." },
      { property: "og:title", content: "CAS — Home Appliances" },
      { property: "og:description", content: "CAS: quality home appliances, rewards and referrals." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "icon", href: "/favicon.png", type: "image/png" },
      { rel: "manifest", href: "/manifest.webmanifest" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    }
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
      <AppShell>
        <Outlet />
      </AppShell>
      <Toaster position="top-center" />
    </QueryClientProvider>
  );
}
