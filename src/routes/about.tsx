import { createFileRoute } from "@tanstack/react-router";
import { ShieldCheck, HeartHandshake, Home } from "lucide-react";
import heroKitchen from "@/assets/hero_family_kitchen.webp";
import { Logo } from "@/components/cas/Logo";
import { PageHeader } from "@/components/cas/AppShell";

export const Route = createFileRoute("/about")({
  head: () => ({ meta: [{ title: "About CAS — CAS" }, { name: "description", content: "Learn about CAS, our mission and how we serve Ethiopian homes." }, { property: "og:title", content: "About CAS — CAS" }, { property: "og:description", content: "Learn about CAS, our mission and how we serve Ethiopian homes." }] }),
  component: Page,
});

function Page() {
  return (
    <div>
      <PageHeader title="About CAS" back />
      <div className="-mt-4 px-5">
        <img src={heroKitchen} alt="Family in a CAS kitchen" className="aspect-video w-full rounded-3xl object-cover shadow-card" />
        <div className="mt-5 rounded-2xl bg-card p-5 shadow-card">
          <Logo className="h-10" />
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">CAS is a home appliance platform helping families access quality household appliances, with a transparent rewards and referral program built on trust.</p>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {[{ i: Home, t: "Better homes", d: "Appliances that make everyday life easier." }, { i: ShieldCheck, t: "Transparent", d: "Clear purchase, reward and withdrawal conditions." }, { i: HeartHandshake, t: "Community", d: "Grow together with friends and family." }].map(({ i: Icon, t, d }) => (
            <div key={t} className="rounded-2xl bg-card p-4 shadow-card"><Icon className="h-5 w-5 text-accent" /><p className="mt-2 font-bold">{t}</p><p className="text-sm text-muted-foreground">{d}</p></div>
          ))}
        </div>
        <div className="mt-4 rounded-2xl bg-card p-5 text-sm text-muted-foreground shadow-card">
          <p className="font-bold text-foreground">Terms & Privacy</p>
          <p className="mt-1">Purchases are processed only after confirmation. Bonuses are promotional credits subject to eligibility rules. Your personal data is used only to operate your CAS account.</p>
        </div>
      </div>
    </div>
  );
}
