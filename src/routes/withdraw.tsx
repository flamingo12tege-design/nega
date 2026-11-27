import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowRight, CheckCircle2, Clock3, Gift, LockKeyhole, ShieldCheck, ShoppingBag, Sparkles } from "lucide-react";
import { etb } from "@/lib/format";
import { rewardRules } from "@/lib/mock-data";
import { actions, useStore } from "@/lib/store";
import { PageHeader } from "@/components/cas/AppShell";
import { MoneyForm } from "@/components/cas/MoneyForm";
import { useSupabaseWallet } from "@/lib/use-supabase-wallet";
import { supabase } from "@/lib/supabase";
import { useProfile, useSessionUser } from "@/lib/queries";

export const Route = createFileRoute("/withdraw")({
  head: () => ({ meta: [{ title: "Withdraw — CAS" }, { name: "description", content: "Withdraw the income your CAS package earns." }, { property: "og:title", content: "Withdraw — CAS" }, { property: "og:description", content: "Withdraw the income your CAS package earns." }] }),
  component: Page,
});

type Eligibility = {
  has_package: boolean;
  earned: number;
  pending: number;
  available: number;
  min_amount: number;
};

function Page() {
  const { userId } = useSessionUser();
  const profileQuery = useProfile(userId);
  const wallet = useSupabaseWallet();
  const payoutAccount = useStore((s) => s.payoutAccount);
  const [eligibility, setEligibility] = useState<Eligibility | null>(null);

  useEffect(() => {
    const account = typeof profileQuery.data?.payout_account === "string" ? profileQuery.data.payout_account : "";
    if (account) actions.setPayoutAccount(account);
  }, [profileQuery.data?.payout_account]);

  // Load withdrawal eligibility.
  useEffect(() => {
    let active = true;
    const load = async () => {
      if (!userId) return;

      const [{ data: rpcData, error: rpcError }, { data: purchases }] = await Promise.all([
        supabase.rpc("withdraw_eligibility"),
        supabase.from("purchases").select("status").eq("user_id", userId),
      ]);

      if (!active) return;

      const row = Array.isArray(rpcData) ? rpcData[0] : rpcData;
      if (!rpcError && row) {
        setEligibility({
          has_package: row["has_package"] === true,
          earned: Number(row["earned"] ?? 0),
          pending: Number(row["pending"] ?? 0),
          available: Number(row["available"] ?? 0),
          min_amount: Number(row["min_amount"] ?? rewardRules.minimumWithdrawal),
        });
        return;
      }

      // Fallback for databases where the RPC has not been run yet.
      const earned = wallet.ledger
        .filter((r) => r.status === "completed" && r.amount > 0 && !["recharge", "deposit"].includes(r.type))
        .reduce((sum, r) => sum + Math.abs(r.amount), 0);
      const pending = wallet.ledger
        .filter((r) => r.type === "withdrawal" && r.status === "pending")
        .reduce((sum, r) => sum + Math.abs(r.amount), 0);
      const hasPackage = (purchases ?? []).some((p) => /approved|completed/i.test(String(p.status ?? "")));
      setEligibility({
        has_package: hasPackage,
        earned,
        pending,
        available: Math.max(0, earned - pending),
        min_amount: rewardRules.minimumWithdrawal,
      });
    };
    void load();
    return () => { active = false; };
  }, [userId, wallet.ledger]);

  const available = eligibility?.available ?? 0;
  const minAmount = eligibility?.min_amount ?? rewardRules.minimumWithdrawal;
  const remaining = Math.max(0, minAmount - available);
  const progress = Math.min(100, Math.round((available / minAmount) * 100));

  return (
    <div className="pb-6">
      <PageHeader title="Withdraw" subtitle="Payouts from earned income" back />

      <section className="relative -mt-4 mx-5 overflow-hidden rounded-3xl bg-primary p-5 text-primary-foreground shadow-lift">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.12]"
          style={{ backgroundImage: "radial-gradient(circle at 1px 1px, white 1px, transparent 0)", backgroundSize: "20px 20px" }}
        />
        <div className="pointer-events-none absolute -right-12 -top-16 h-44 w-44 rounded-full bg-accent/25 blur-3xl" />
        <div className="relative">
          <p className="flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-[0.18em] text-accent">
            <Sparkles className="h-3.5 w-3.5" />Withdrawable income
          </p>
          <p className="mt-2 text-3xl font-extrabold tracking-tight tabular-nums">{etb(available)}</p>
          <p className="mt-1 max-w-xs text-xs text-primary-foreground/70">Deposits are not withdrawable. Payouts come from the income your package earns.</p>

          <div className="mt-4 grid grid-cols-3 gap-2 border-t border-white/15 pt-4">
            <div><p className="text-[10px] uppercase tracking-wide text-primary-foreground/60">Earned</p><p className="text-sm font-bold tabular-nums">{etb(eligibility?.earned ?? 0)}</p></div>
            <div><p className="text-[10px] uppercase tracking-wide text-primary-foreground/60">Reserved</p><p className="text-sm font-bold tabular-nums">{etb(eligibility?.pending ?? 0)}</p></div>
            <div><p className="text-[10px] uppercase tracking-wide text-primary-foreground/60">Minimum</p><p className="text-sm font-bold tabular-nums">{etb(minAmount)}</p></div>
          </div>
        </div>
      </section>

      <div className="mx-5 mt-4">
        {!eligibility ? (
          <div className="rounded-3xl bg-card p-6 text-center shadow-card">
            <span className="mx-auto block h-5 w-5 animate-spin rounded-full border-2 border-primary/20 border-t-primary" />
            <p className="mt-3 text-sm text-muted-foreground">Checking your withdrawal eligibility…</p>
          </div>
        ) : !eligibility.has_package ? (
          <section className="rounded-3xl bg-card p-5 shadow-card">
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-tint-orange text-primary"><LockKeyhole className="h-5 w-5" /></span>
            <h2 className="mt-3 text-lg font-extrabold">Your first package unlocks withdrawals</h2>
            <p className="mt-1 text-sm text-muted-foreground">Buy a package, claim your daily income and reach {etb(minAmount)} to make your first withdrawal.</p>
            <ol className="mt-4 space-y-2">
              {[
                { icon: ShoppingBag, text: "Choose a package that fits you" },
                { icon: Gift, text: "Claim your daily income and task rewards" },
                { icon: ShieldCheck, text: `Reach ${etb(minAmount)} to withdraw` },
              ].map(({ icon: Icon, text }, i) => (
                <li key={text} className="flex items-center gap-3 rounded-2xl bg-surface p-3">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-primary text-accent"><Icon className="h-4 w-4" /></span>
                  <span className="text-sm font-semibold">{i + 1}. {text}</span>
                </li>
              ))}
            </ol>
            <Link to="/appliances" className="press mt-4 flex items-center justify-center gap-2 rounded-2xl bg-accent py-3.5 font-extrabold text-accent-foreground">
              Browse packages <ArrowRight className="h-4 w-4" />
            </Link>
          </section>
        ) : remaining > 0 ? (
          <section className="rounded-3xl bg-card p-5 shadow-card">
            <div className="flex items-start gap-3">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-tint-green text-success"><Clock3 className="h-5 w-5" /></span>
              <div className="min-w-0">
                <h2 className="text-lg font-extrabold">Almost there</h2>
                <p className="mt-1 text-sm text-muted-foreground">Earn <span className="font-bold text-primary">{etb(remaining)}</span> more to unlock withdrawals.</p>
              </div>
            </div>
            <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-secondary">
              <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${progress}%` }} />
            </div>
            <div className="mt-2 flex justify-between text-[11px] font-semibold text-muted-foreground">
              <span>{etb(available)} earned</span><span>{etb(minAmount)} goal</span>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <Link to="/tasks" className="press flex items-center justify-center gap-2 rounded-2xl bg-accent py-3 text-sm font-bold text-accent-foreground">Earn more</Link>
              <Link to="/wallet" className="press flex items-center justify-center gap-2 rounded-2xl bg-secondary py-3 text-sm font-bold text-primary">My wallet</Link>
            </div>
          </section>
        ) : (
          <>
            <div className="mb-3 flex items-center gap-2 rounded-2xl bg-success/10 px-4 py-3 text-sm font-bold text-success">
              <CheckCircle2 className="h-4 w-4 shrink-0" />You're eligible to withdraw
            </div>
            <MoneyForm kind="Withdraw" max={available} payoutAccount={payoutAccount} />
          </>
        )}
      </div>
    </div>
  );
}
