import { createFileRoute } from "@tanstack/react-router";
import { transactions, user } from "@/lib/mock-data";
import { totalClaimed } from "@/lib/daily-income";
import { etb, fmtDate } from "@/lib/format";
import { useStore } from "@/lib/store";
import { PageHeader, Section } from "@/components/cas/AppShell";
import { StatusPill } from "@/components/cas/StatusPill";

export const Route = createFileRoute("/wallet")({
  head: () => ({ meta: [{ title: "My Wallet — CAS" }, { name: "description", content: "Your CAS balances, bonuses, purchases and transactions." }, { property: "og:title", content: "My Wallet — CAS" }, { property: "og:description", content: "Your CAS balances, bonuses, purchases and transactions." }] }),
  component: Page,
});

function Page() {
  const purchases = useStore((s) => s.purchases);
  const balance = useStore((s) => s.walletBalance);
  const claims = useStore((s) => s.claims);
  const commissionClaims = useStore((s) => s.commissionClaims);
  const recruitmentCredits = useStore((s) => s.recruitmentCredits);
  const packages = useStore((s) => s.packages);
  const w = user.wallet;
  const history = [
    ...claims.map((c) => ({ id: c.id, type: "Daily income" as const, amount: c.amount, date: c.date, status: "Completed" as const })),
    ...commissionClaims.map((c) => ({ id: c.id, type: "Team commission" as const, amount: c.amount, date: c.date, status: "Completed" as const })),
    ...recruitmentCredits.map((c) => ({ id: c.id, type: "Recruitment bonus" as const, amount: c.amount, date: c.date, status: "Completed" as const })),
    ...transactions,
  ].sort((a, b) => b.date.localeCompare(a.date));
  return (
    <div>
      <PageHeader title="My Wallet" back />
      <div className="-mt-4 mx-5 rounded-3xl bg-card p-5 shadow-card">
        <p className="text-xs text-muted-foreground">Available balance · withdrawable</p>
        <p className="text-3xl font-extrabold text-primary">{etb(balance)}</p>
        <div className="mt-4 grid grid-cols-3 gap-3 border-t pt-4">
          <div><p className="text-xs text-muted-foreground">Registration bonus</p><p className="font-bold">{etb(w.registrationBonus)}</p></div>
          <div><p className="text-xs text-muted-foreground">Referral bonus</p><p className="font-bold">{etb(w.referralBonus)}</p></div>
          <div><p className="text-xs text-muted-foreground">Daily income claimed</p><p className="font-bold">{etb(totalClaimed(claims))}</p></div>
        </div>
        <p className="mt-3 rounded-xl bg-muted p-3 text-xs text-muted-foreground">Bonuses are promotional credits and are kept separate from your withdrawable balance. Eligibility rules apply to each bonus type.</p>
      </div>
      <Section title="My Purchases">
        <div className="divide-y overflow-hidden rounded-2xl bg-card shadow-card">
          {purchases.flatMap((p) => {
            const a = packages.find((x) => x.id === p.applianceId);
            return a ? [{ purchase: p, appliance: a }] : [];
          }).map(({ purchase, appliance }) => (
            <div key={purchase.id} className="flex items-center gap-3 p-3">
              <img src={appliance.image} alt="" className="h-12 w-12 shrink-0 rounded-xl object-cover" />
              <div className="min-w-0 flex-1"><p className="truncate text-sm font-bold">{appliance.name}</p><p className="text-xs text-muted-foreground">{etb(appliance.price)} · {purchase.method}</p></div>
              <StatusPill s={purchase.status} />
            </div>
          ))}
        </div>
      </Section>
      <Section title="Transaction History">
        <div className="divide-y overflow-hidden rounded-2xl bg-card shadow-card">
          {history.map((t) => (
            <div key={t.id} className="flex items-center justify-between gap-3 p-4">
              <div className="min-w-0"><p className="text-sm font-bold">{t.type}</p><p className="text-xs text-muted-foreground">{fmtDate(t.date)} · {t.status}</p></div>
              <p className={`shrink-0 font-extrabold ${t.amount < 0 ? "text-destructive" : "text-success"}`}>{t.amount > 0 ? "+" : ""}{etb(t.amount)}</p>
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}
