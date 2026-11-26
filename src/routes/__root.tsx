import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useNavigate,
  useRouter,
  useRouterState,
  HeadContent,
  Scripts,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { SearchX, House, LayoutGrid } from "lucide-react";

import appCss from "../styles.css?url";
import { AppShell } from "@/components/cas/AppShell";
import { Logo } from "@/components/cas/Logo";
import { WelcomeModal } from "@/components/cas/WelcomeModal";
import { Toaster } from "@/components/ui/sonner";
import { supabase } from "@/lib/supabase";
import { actions } from "@/lib/store";
import { appliances as seedAppliances, defaultPackageImage } from "@/lib/mock-data";
import { clearQueuedWelcome, getQueuedWelcome, type QueuedWelcome } from "@/lib/welcome";

function NotFoundComponent() {
  return (
    <div className="grid min-h-dvh place-items-center overflow-hidden bg-surface px-5">
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
      // Sensitive pages must never leak their full URL through the Referer header.
      { name: "referrer", content: "no-referrer" },
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

/** Pages that do not require a signed-in member. */
const isPublicPath = (path: string) =>
  path === "/login" ||
  path === "/register" ||
  path.startsWith("/casadmin");

function AuthSplash() {
  return (
    <div className="grid min-h-dvh place-items-center bg-surface px-5">
      <div className="flex flex-col items-center gap-3 text-center">
        <Logo className="h-10" />
        <span className="h-5 w-5 animate-spin rounded-full border-2 border-primary/20 border-t-primary" aria-hidden="true" />
        <p className="text-xs font-semibold text-muted-foreground">Checking your session…</p>
      </div>
    </div>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const [sessionReady, setSessionReady] = useState(false);
  const [hasSession, setHasSession] = useState(false);
  const [welcome, setWelcome] = useState<QueuedWelcome | null>(null);
  const publicPath = isPublicPath(path);

  // Strip credentials and bank details that may have been placed in a URL by
  // an old link, a copied screenshot URL or a malicious third party.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sensitive = ["account", "account_number", "bank_account", "password", "pw", "token", "secret", "email", "phone"];
    let changed = false;
    for (const key of sensitive) {
      if (params.has(key)) {
        params.delete(key);
        changed = true;
      }
    }
    if (changed) {
      const query = params.toString();
      window.history.replaceState(
        window.history.state,
        "",
        `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`,
      );
    }
  }, [path]);

  // Show the new-member announcement as a popup on the homepage only, after
  // navigation has settled. Re-check on navigation because the flag is queued
  // after registration, while the root is already mounted.
  useEffect(() => {
    if (path !== "/") {
      setWelcome(null);
      return;
    }
    const queued = getQueuedWelcome();
    if (!queued) {
      setWelcome(null);
      return;
    }
    const timer = window.setTimeout(() => setWelcome(queued), 700);
    return () => window.clearTimeout(timer);
  }, [path]);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" }).catch(() => undefined);
    }

    const loadSupabase = async () => {
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const signedIn = Boolean(sessionData.session);
        actions.setLoggedIn(signedIn);
        setHasSession(signedIn);
      } catch {
        actions.setLoggedIn(false);
        setHasSession(false);
      } finally {
        setSessionReady(true);
      }

      const { data, error } = await supabase
        .from("packages")
        .select("id,tier,name,price,daily_payout,image_url,short_description,details,locked")
        .order("tier", { ascending: true });

      if (!error && data) {
        actions.setPackages(data.map((row) => {
          const seed = seedAppliances.find((item) => item.id === row.id);
          return {
            id: row.id,
            tier: row.tier,
            name: row.name,
            price: Number(row.price),
            dailyPayout: Number(row.daily_payout),
            image: seed?.image ?? row.image_url ?? defaultPackageImage,
            short: row.short_description || seed?.short || "CAS appliance package.",
            details: Array.isArray(row.details) ? row.details : seed?.details ?? ["CAS appliance package"],
          };
        }));
      }
    };

    void loadSupabase();

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      const signedIn = Boolean(session);
      actions.setLoggedIn(signedIn);
      setHasSession(signedIn);
      setSessionReady(true);
    });

    return () => authListener.subscription.unsubscribe();
  }, []);

  // URL guards: signed-out visitors are sent to the auth page, signed-in members skip it.
  useEffect(() => {
    if (!sessionReady) return;
    if (!hasSession && !publicPath) {
      void navigate({ to: "/login", replace: true });
    } else if (hasSession && (path === "/login" || path === "/register")) {
      void navigate({ to: "/", replace: true });
    }
  }, [sessionReady, hasSession, publicPath, path, navigate]);

  // Never render protected page content before the session is known (or while redirecting).
  const showSplash = !sessionReady ? !publicPath : !hasSession && !publicPath;

  return (
    <QueryClientProvider client={queryClient}>
      {showSplash ? (
        <AuthSplash />
      ) : (
        /* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */
        <AppShell>
          <Outlet />
        </AppShell>
      )}
      <Toaster position="top-center" />
      {welcome && (
        <WelcomeModal
          credited={welcome.credited}
          memberId={welcome.memberId}
          continueLabel="Join the channel"
          onContinue={() => {
            clearQueuedWelcome();
            setWelcome(null);
          }}
        />
      )}
    </QueryClientProvider>
  );
}
