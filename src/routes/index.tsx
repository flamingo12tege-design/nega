import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { UserRound, Bell, Newspaper, Gift, Info, UserPlus, ArrowDownToLine, ArrowUpFromLine, Download } from "lucide-react";
import { heroSlides } from "@/lib/mock-data";
import { supabase } from "@/lib/supabase";
import { useStore } from "@/lib/store";
import { Logo } from "@/components/cas/Logo";
import { Section } from "@/components/cas/AppShell";
import { ProductCard } from "@/components/cas/ProductCard";
import { toast } from "sonner";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "CAS — Make Your Home Better" },
      { name: "description", content: "Explore quality home appliances, earn rewards and invite friends with CAS." },
      { property: "og:title", content: "CAS — Make Your Home Better" },
      { property: "og:description", content: "Explore quality home appliances, earn rewards and invite friends with CAS." },
    ],
  }),
  component: Home,
});

function Hero() {
  const [i, setI] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const t = setInterval(() => setI((v) => (v + 1) % heroSlides.length), 5000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTo({ left: el.clientWidth * i, behavior: "smooth" });
  }, [i]);
  return (
    <div className="relative px-5">
      <div ref={ref} onScroll={(e) => { const el = e.currentTarget; const n = Math.round(el.scrollLeft / el.clientWidth); if (n !== i) setI(n); }}
        className="no-scrollbar flex snap-x snap-mandatory overflow-x-auto rounded-3xl shadow-lift">
        {heroSlides.map((s, idx) => (
          <div key={s.title} className="relative aspect-[2/1] w-full shrink-0 snap-center sm:aspect-[3/1]">
            <img src={s.image} alt="" width={1280} height={720} loading={idx === 0 ? "eager" : "lazy"} className="absolute inset-0 h-full w-full object-cover" />
            <div className="hero-scrim absolute inset-0" />
            <div className="absolute inset-x-0 bottom-0 p-4 text-primary-foreground sm:p-6">
              <h2 className="text-base font-extrabold leading-tight sm:text-3xl">{s.title}</h2>
              <p className="mt-1 hidden max-w-md text-sm opacity-90 sm:block">{s.subtitle}</p>
              <Link to={s.to} className="press mt-2 inline-block rounded-full bg-accent px-4 py-1.5 text-xs font-bold text-accent-foreground">{s.cta}</Link>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-3 flex justify-center gap-1.5">
        {heroSlides.map((_, idx) => (
          <button key={idx} aria-label={`Slide ${idx + 1}`} onClick={() => setI(idx)} className={`h-1.5 rounded-full transition-all ${i === idx ? "w-6 bg-accent" : "w-1.5 bg-border"}`} />
        ))}
      </div>
    </div>
  );
}

type InstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

function Home() {
  const packages = useStore((s) => s.packages);
  const [memberId, setMemberId] = useState("CAS Member");
  const [unread, setUnread] = useState(0);
  const quick = [
    { to: "/news", label: "News", icon: Newspaper },
    { to: "/gifts", label: "Gifts", icon: Gift },
    { to: "/about", label: "About", icon: Info },
    { to: "/team", label: "Invite", icon: UserPlus },
  ] as const;

  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);

  useEffect(() => {
    const handleInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handleInstallPrompt);
    return () => window.removeEventListener("beforeinstallprompt", handleInstallPrompt);
  }, []);

  useEffect(() => {
    const loadProfile = async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData.session?.user.id;
      if (!userId) return;
      const [{ data: profile }, { count }] = await Promise.all([
        supabase.from("profiles").select("member_id").eq("id", userId).maybeSingle(),
        supabase.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("unread", true),
      ]);
      if (profile?.member_id) setMemberId(profile.member_id);
      setUnread(count ?? 0);
    };
    void loadProfile();
  }, []);

  const installApp = async () => {
    if (!installPrompt) {
      const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
      toast(isIOS ? "Add CAS to your Home Screen" : "Install CAS", {
        description: isIOS ? "Tap Share, then choose Add to Home Screen." : "Use your browser menu and choose Install App or Add to Home Screen.",
      });
      return;
    }
    await installPrompt.prompt();
    await installPrompt.userChoice;
    setInstallPrompt(null);
  };

  return (
    <div>
      <header className="flex items-center justify-between gap-3 px-5 pb-4 pt-5">
        <div className="flex min-w-0 items-center gap-3">
          <Logo className="h-10 lg:hidden" />
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">Welcome back</p>
            <p className="truncate font-extrabold">Hello, {memberId}!</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Link to="/notifications" aria-label="Notifications" className="press relative grid h-10 w-10 place-items-center rounded-full bg-card shadow-card">
            <Bell className="h-5 w-5" />
            {unread > 0 && <span className="absolute right-2 top-2 h-2.5 w-2.5 rounded-full bg-accent ring-2 ring-card" />}
          </Link>
          <Link to="/profile" className="grid h-10 w-10 place-items-center rounded-full bg-primary text-sm font-bold text-primary-foreground"><UserRound className="h-5 w-5" /></Link>
        </div>
      </header>

      <Hero />

      <div className="mt-5 grid grid-cols-2 gap-3 px-5">
        <Link to="/recharge" className="press flex items-center justify-center gap-2 rounded-2xl bg-primary py-3.5 font-extrabold text-primary-foreground shadow-card"><ArrowDownToLine className="h-5 w-5 text-accent" />Recharge</Link>
        <Link to="/withdraw" className="press flex items-center justify-center gap-2 rounded-2xl bg-accent py-3.5 font-extrabold text-accent-foreground shadow-card"><ArrowUpFromLine className="h-5 w-5" />Withdraw</Link>
      </div>

      <div className="mt-6 grid grid-cols-4 gap-x-3 gap-y-4 px-5">
        {quick.map(({ to, label, icon: Icon }) => (
          <Link key={label} to={to} className="press flex flex-col items-center gap-2">
            <span className="grid h-14 w-14 place-items-center rounded-2xl bg-card text-primary shadow-card"><Icon className="h-6 w-6" /></span>
            <span className="text-center text-xs font-semibold leading-tight">{label}</span>
          </Link>
        ))}
        <button type="button" onClick={installApp} className="press flex flex-col items-center gap-2">
          <span className="grid h-14 w-14 place-items-center rounded-2xl bg-primary text-accent shadow-card"><Download className="h-6 w-6" /></span>
          <span className="text-center text-xs font-semibold leading-tight">App</span>
        </button>
      </div>

      <Section title="Featured Appliances" action={<Link to="/appliances" className="text-sm font-bold text-accent">See all</Link>}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {packages.slice(0, 4).map((a) => <ProductCard key={a.id} a={a} />)}
        </div>
      </Section>
    </div>
  );
}
