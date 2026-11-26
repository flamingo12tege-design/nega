import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, CalendarDays, Sparkles, TrendingUp } from "lucide-react";
import { etb } from "@/lib/format";
import { rewardRules } from "@/lib/mock-data";
import { useStore } from "@/lib/store";
import { PageHeader } from "@/components/cas/AppShell";
import { ProductCard } from "@/components/cas/ProductCard";

export const Route = createFileRoute("/appliances/")({
  head: () => ({ meta: [{ title: "Appliances — CAS" }, { name: "description", content: "Browse eight CAS appliance packages from ETB 1,300 to ETB 300,000." }, { property: "og:title", content: "Appliances — CAS" }, { property: "og:description", content: "Browse eight CAS appliance packages from ETB 1,300 to ETB 300,000." }] }),
  component: Page,
});

function Page() {
  const packages = useStore((s) => s.packages);
  const vipPlans = packages
    .filter((a) => a.tier <= 2)
    .sort((a, b) => a.tier - b.tier)
    .map((a) => ({
      level: `VIP${a.tier}`,
      investment: a.price,
      dailyReturn: Math.round(a.dailyPayout),
      duration: `${rewardRules.packageDurationDays} Days`,
      totalReturn: Math.round(a.dailyPayout * rewardRules.packageDurationDays),
    }));

  return (
    <div>
      <PageHeader title="Appliances" subtitle="Packages for every home" />

      <section className="relative -mt-4 mx-5 overflow-hidden rounded-3xl bg-primary shadow-lift">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.12]"
          style={{ backgroundImage: "radial-gradient(circle at 1px 1px, white 1px, transparent 0)", backgroundSize: "20px 20px" }}
        />
        <div className="pointer-events-none absolute -right-12 -top-16 h-44 w-44 rounded-full bg-accent/25 blur-3xl" />

        <div className="relative px-4 pb-4 pt-5 text-primary-foreground sm:px-5">
          <p className="flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-[0.18em] text-accent">
            <Sparkles className="h-3.5 w-3.5" />VIP investment plans
          </p>
          <h2 className="mt-2 text-xl font-extrabold tracking-tight">See what your package earns</h2>
          <p className="mt-1 text-xs text-primary-foreground/70">Invest once, earn daily for 45 days.</p>
        </div>

        <div className="relative overflow-x-auto">
          <table className="w-full border-collapse text-left text-[11px] sm:text-xs">
            <thead className="bg-white/10 text-primary-foreground">
              <tr>
                <th className="px-3 py-2.5 font-bold leading-tight sm:px-4">VIP<br /><span className="font-medium text-primary-foreground/70">Level</span></th>
                <th className="px-2 py-2.5 text-right font-bold leading-tight sm:px-3">Investment<br /><span className="font-medium text-primary-foreground/70">(ETB)</span></th>
                <th className="px-2 py-2.5 text-right font-bold leading-tight sm:px-3">Daily<br /><span className="font-medium text-primary-foreground/70">Return (ETB)</span></th>
                <th className="px-2 py-2.5 text-center font-bold leading-tight sm:px-3">Duration</th>
                <th className="px-3 py-2.5 text-right font-bold leading-tight sm:px-4">Total<br /><span className="font-medium text-primary-foreground/70">Return (ETB)</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {vipPlans.map((plan) => (
                <tr key={plan.level} className="tabular-nums">
                  <td className="px-3 py-3 font-extrabold text-accent sm:px-4">{plan.level}</td>
                  <td className="px-2 py-3 text-right font-semibold sm:px-3">{etb(plan.investment)}</td>
                  <td className="px-2 py-3 text-right font-semibold sm:px-3">{etb(plan.dailyReturn)}</td>
                  <td className="px-2 py-3 text-center text-primary-foreground/80 sm:px-3">{plan.duration}</td>
                  <td className="px-3 py-3 text-right font-extrabold text-accent sm:px-4">{etb(plan.totalReturn)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="relative flex flex-wrap items-center justify-between gap-2 border-t border-white/10 bg-white/5 px-4 py-3 text-[11px] text-primary-foreground/70 sm:px-5">
          <span className="flex items-center gap-1.5"><TrendingUp className="h-3.5 w-3.5 text-accent" />Returns are calculated from the exact daily payout.</span>
          <Link to="/withdraw" className="flex items-center gap-1 font-bold text-accent">Withdraw rules <ArrowRight className="h-3.5 w-3.5" /></Link>
        </div>
      </section>

      <div className="mt-4 flex items-center gap-2 px-5 text-xs text-muted-foreground">
        <CalendarDays className="h-3.5 w-3.5" />
        <span>{rewardRules.packageDurationDays}-day earning window · daily claims required</span>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 px-5 sm:grid-cols-3 lg:grid-cols-4">
        {packages.map((a) => <ProductCard key={a.id} a={a} />)}
      </div>
      <p className="mt-6 px-5 text-center text-xs text-muted-foreground">Package contents are confirmed by CAS before each purchase is approved.</p>
    </div>
  );
}
