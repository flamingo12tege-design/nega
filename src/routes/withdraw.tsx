import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  Ban,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Gift,
  LockKeyhole,
  RefreshCw,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Zap,
} from "lucide-react";
import { etb } from "@/lib/format";
import { rewardRules } from "@/lib/mock-data";
import { actions, useStore } from "@/lib/store";
import { PageHeader } from "@/components/cas/AppShell";
import { MoneyForm } from "@/components/cas/MoneyForm";
import { WithdrawIcon } from "@/components/cas/MoneyIcons";
import { useSupabaseWallet } from "@/lib/use-supabase-wallet";
import { supabase } from "@/lib/supabase";
import { useProfile, useSessionUser } from "@/lib/queries";

export const Route = createFileRoute("/withdraw")({
  head: () => ({
    meta: [
      { title: "Withdraw — CAS" },
      { name: "description", content: "Withdraw the income your CAS package earns." },
      { property: "og:title", content: "Withdraw — CAS" },
      { property: "og:description", content: "Withdraw the income your CAS package earns." },
    ],
  }),
  component: Page,
});

type Eligibility = {
  has_package: boolean;
  earned: number;
  pending: number;
  available: number;
  min_amount: number;
};

const schedule = [
  { icon: RefreshCw, label: "Frequency", value: "Once per day" },
  { icon: CalendarDays, label: "Withdrawal days", value: "Monday – Saturday" },
  { icon: Clock3, label: "Operating hours", value: "3:00 AM – 11:00 PM" },
  { icon: Zap, label: "Processing time", value: "1–48 hours" },
  { icon: Ban, label: "Sunday", value: "No withdrawal operations" },
];

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
    <div className="pb-8">
      <PageHeader title="Withdraw" subtitle="Payouts from earned income" back />

      {/* Balance hero */}
      <section className="relative -mt-4 mx-5 overflow-hidden rounded-[28px] bg-primary p-6 text-primary-foreground shadow-lift">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.1]"
          style={{ backgroundImage: "radial-gradient(circle at 1px 1px, white 1px, transparent 0)", backgroundSize: "18px 18px" }}
        />
        <div className="pointer-events-none absolute -right-16 -top-20 h-52 w-52 rounded-full bg-accent/20 blur-3xl" />

        <div className="relative flex items-start gap-4">
          <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-white/10 p-1.5 ring-1 ring-white/15">
            <WithdrawIcon className="h-full w-full" />
          </span>
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-[0.16em] text-accent">
              <Sparkles className="h-3.5 w-3.5" />Withdrawable income
            </p>
            <p className="mt-2 text-[34px] font-extrabold leading-none tracking-tight tabular-nums">{etb(available)}</p>
          </div>
        </div>

        <p className="relative mt-4 max-w-sm text-xs leading-5 text-primary-foreground/70">
          Deposits stay outside withdrawals. Only income your package earns can be paid out.
        </p>

        <div className="relative mt-5 grid grid-cols-3 border-t border-white/15 pt-4">
          {[
            { label: "Earned", value: etb(eligibility?.earned ?? 0) },
            { label: "Reserved", value: etb(eligibility?.pending ?? 0) },
            { label: "Minimum", value: etb(minAmount) },
          ].map((stat, i) => (
            <div key={stat.label} className={i > 0 ? "border-l border-white/15 pl-3" : ""}>
              <p className="text-[10px] uppercase tracking-wider text-primary-foreground/55">{stat.label}</p>
              <p className="mt-1 text-sm font-bold tabular-nums">{stat.value}</p>
            </div>
          ))}
        </div>
      </section>

      <div className="mx-5 mt-5 space-y-5">
        {/* Schedule */}
        <section className="rounded-3xl bg-card p-5 shadow-card">
          <h2 className="text-base font-extrabold">Withdrawal schedule</h2>
          <p className="mt-1 text-xs text-muted-foreground">Requests are processed within the CAS operating window.</p>

          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {schedule.map(({ icon: Icon, label, value }) => (
              <div key={label} className="flex items-center gap-3 rounded-2xl bg-surface px-3 py-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-secondary text-primary">
                  <Icon className="h-4 w-4" />
                </span>
                <span className="min-w-0">
                  <span className="block text-[11px] font-semibold text-muted-foreground">{label}</span>
                  <span className="block text-sm font-bold">{value}</span>
                </span>
              </div>
            ))}
          </div>
        </section>

        {!eligibility ? (
          <div className="rounded-3xl bg-card p-6 shadow-card">
            <div className="h-4 w-32 animate-pulse rounded-full bg-secondary" />
            <div className="mt-4 h-10 w-48 animate-pulse rounded-xl bg-secondary" />
            <div className="mt-6 h-2.5 w-full animate-pulse rounded-full bg-secondary" />
            <p className="mt-3 text-sm text-muted-foreground">Checking your withdrawal eligibility…</p>
          </div>
        ) : !eligibility.has_package ? (
          <section className="relative overflow-hidden rounded-3xl bg-card p-6 shadow-card">
            <div className="pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full bg-tint-orange/60 blur-2xl" />
            <span className="relative grid h-12 w-12 place-items-center rounded-2xl bg-tint-orange text-primary">
              <LockKeyhole className="h-5 w-5" />
            </span>
            <h2 className="relative mt-4 text-xl font-extrabold tracking-tight">Your first package unlocks withdrawals</h2>
            <p className="relative mt-2 max-w-sm text-sm leading-6 text-muted-foreground">
              Buy a package, earn income from it, then withdraw once you reach {etb(minAmount)}.
            </p>

            <ol className="relative mt-5 space-y-3">
              {[
                { icon: ShoppingBag, text: "Choose a package that fits you" },
                { icon: Gift, text: "Claim daily income and task rewards" },
                { icon: ShieldCheck, text: `Reach ${etb(minAmount)} to withdraw` },
              ].map(({ icon: Icon, text }, i) => (
                <li key={text} className="flex items-center gap-3 rounded-2xl bg-surface p-3">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-primary text-accent">
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="text-sm font-semibold">{i + 1}. {text}</span>
                </li>
              ))}
            </ol>

            <Link
              to="/appliances"
              className="press mt-5 flex items-center justify-center gap-2 rounded-2xl bg-accent py-3.5 font-extrabold text-accent-foreground"
            >
              Browse packages <ArrowRight className="h-4 w-4" />
            </Link>
          </section>
        ) : remaining > 0 ? (
          <section className="rounded-3xl bg-card p-6 shadow-card">
            <div className="flex items-start gap-3">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-tint-green text-success">
                <Clock3 className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <h2 className="text-lg font-extrabold">Almost there</h2>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  Earn <span className="font-bold text-primary tabular-nums">{etb(remaining)}</span> more to unlock withdrawals.
                </p>
              </div>
            </div>

            <div className="mt-5 h-2.5 overflow-hidden rounded-full bg-secondary">
              <div className="h-full rounded-full bg-accent transition-all duration-500" style={{ width: `${progress}%` }} />
            </div>
            <div className="mt-2 flex justify-between text-[11px] font-semibold text-muted-foreground tabular-nums">
              <span>{etb(available)} earned</span>
              <span>{etb(minAmount)} goal</span>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3">
              <Link
                to="/tasks"
                className="press flex items-center justify-center gap-2 rounded-2xl bg-accent py-3.5 text-sm font-bold text-accent-foreground"
              >
                Earn more <ArrowRight className="h-4 w-4" />
              </Link>
              <Link to="/wallet" className="press flex items-center justify-center rounded-2xl bg-secondary py-3.5 text-sm font-bold text-primary">
                My wallet
              </Link>
            </div>
          </section>
        ) : (
          <>
            <div className="flex items-center gap-2 rounded-2xl bg-success/10 px-4 py-3 text-sm font-bold text-success">
              <CheckCircle2 className="h-4 w-4 shrink-0" />You're eligible to withdraw
            </div>
            <MoneyForm kind="Withdraw" max={available} payoutAccount={payoutAccount} />
          </>
        )}
      </div>
    </div>
  );
}
