import { createFileRoute, Link } from "@tanstack/react-router";
import { Gift, Users, Sparkles, Tag } from "lucide-react";
import { transactions } from "@/lib/mock-data";
import { etb, fmtDate } from "@/lib/format";
import { PageHeader, Section } from "@/components/cas/AppShell";

export const Route = createFileRoute("/gifts")({
  head: () => ({ meta: [{ title: "Gifts & Rewards — CAS" }, { name: "description", content: "Your CAS registration gifts, referral rewards and special offers." }, { property: "og:title", content: "Gifts & Rewards — CAS" }, { property: "og:description", content: "Your CAS registration gifts, referral rewards and special offers." }] }),
  component: Page,
});

function Page() {
  const rewards = transactions.filter((t) => t.amount > 0 && t.type !== "Deposit");
  const cards = [
    { i: Gift, t: "Registration gift", d: "Credited when you joined CAS.", to: "/wallet" as const },
    { i: Users, t: "Referral rewards", d: "Earn when invited friends join.", to: "/team" as const },
    { i: Sparkles, t: "Promotional gifts", d: "Seasonal CAS campaigns.", to: "/news" as const },
    { i: Tag, t: "Special offers", d: "Limited-time package deals.", to: "/appliances" as const },
  ];
  return (
    <div>
      <PageHeader title="Gifts & Rewards" back />
      <div className="-mt-4 grid grid-cols-2 gap-3 px-5 lg:grid-cols-4">
        {cards.map(({ i: Icon, t, d, to }) => (
          <Link key={t} to={to} className="press rounded-2xl bg-card p-4 shadow-card"><Icon className="h-6 w-6 text-accent" /><p className="mt-2 text-sm font-bold">{t}</p><p className="text-xs text-muted-foreground">{d}</p></Link>
        ))}
      </div>
      <Section title="Reward History">
        <div className="divide-y overflow-hidden rounded-2xl bg-card shadow-card">
          {rewards.map((t) => (
            <div key={t.id} className="flex justify-between gap-3 p-4">
              <div><p className="text-sm font-bold">{t.type}</p><p className="text-xs text-muted-foreground">{fmtDate(t.date)} · {t.status}</p></div>
              <p className="font-extrabold text-success">+{etb(t.amount)}</p>
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}
