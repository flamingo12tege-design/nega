import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  Check,
  CheckCircle2,
  Clock3,
  LockKeyhole,
  RefreshCw,
  ShoppingBag,
  Sparkles,
  Timer,
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

const OPEN_FROM = 3; // 3:00 AM
const OPEN_TO = 23; // 11:00 PM
const DAY_ORDER = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

/** Daily returns are shown as whole birr everywhere else in CAS — do the same here. */
const birr = (n: number) => etb(Math.round(Number(n) || 0));

/** Wall-clock time in East Africa Time (UTC+3), the CAS operating timezone. */
function eatNow() {
  return new Date(new Date().toLocaleString("en-US", { timeZone: "Africa/Addis_Ababa" }));
}

function nextOpenText(now: Date) {
  const day = now.getDay();
  const hour = now.getHours() + now.getMinutes() / 60;
  if (day === 0 || day === 6) return "Opens Monday at 3:00 AM";
  if (hour < OPEN_FROM) return "Opens today at 3:00 AM";
  if (hour >= OPEN_TO) return day === 5 ? "Opens Monday at 3:00 AM" : "Opens tomorrow at 3:00 AM";
  return "";
}

function OperatingWindow() {
  const [now, setNow] = useState(eatNow);
  useEffect(() => {
    const id = setInterval(() => setNow(eatNow()), 60_000);
    return () => clearInterval(id);
  }, []);

  const today = DAY_ORDER[(now.getDay() + 6) % 7];
  const hour = now.getHours() + now.getMinutes() / 60;
  const closedDay = today === "Sun";
  const closedHours = hour < OPEN_FROM || hour >= OPEN_TO;
  const isOpen = !closedDay && !closedHours;
  const marker = Math.min(100, Math.max(0, ((hour - OPEN_FROM) / (OPEN_TO - OPEN_FROM)) * 100));

  return (
    <section className="overflow-hidden rounded-3xl bg-card shadow-card">
      <div className="flex items-start justify-between gap-3 p-5 pb-4">
        <div>
          <h2 className="text-base font-extrabold">Operating window</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">Times shown in East Africa Time (UTC+3)</p>
        </div>
        <span
          className={`flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-extrabold ${
            isOpen ? "bg-success/12 text-success" : "bg-tint-rose text-destructive"
          }`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${isOpen ? "animate-pulse bg-success" : "bg-destructive"}`} />
          {isOpen ? "Open now" : "Closed"}
        </span>
      </div>

      {/* Day strip */}
      <div className="grid grid-cols-7 gap-1.5 px-5">
        {DAY_ORDER.map((day) => {
          const isToday = day === today;
          const isSunday = day === "Sun";
          return (
            <div
              key={day}
              className={`rounded-xl py-2 text-center text-[11px] font-bold ${
                isSunday
                  ? "bg-tint-rose text-destructive/70 line-through"
                  : isToday
                    ? "bg-primary text-primary-foreground"
                    : "bg-surface text-muted-foreground"
              }`}
            >
              {day}
            </div>
          );
        })}
      </div>

      {/* Hours timeline */}
      <div className="px-5 pt-5">
        <div className={`relative h-2.5 overflow-hidden rounded-full ${isOpen ? "bg-success/20" : "bg-tint-rose"}`}>
          <div
            className={`absolute inset-y-0 left-0 rounded-full ${isOpen ? "bg-success/75" : "bg-destructive/40"}`}
            style={{ width: `${marker}%` }}
          />
          <div
            className="absolute -top-1 h-4.5 w-1.5 -translate-x-1/2 rounded-full bg-accent shadow-card"
            style={{ left: `${marker}%` }}
          />
        </div>
        <div className="mt-2 flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          <span>3:00 AM</span>
          <span className={isOpen ? "text-success" : "text-destructive"}>
            {isOpen ? "Payouts processing" : nextOpenText(now)}
          </span>
          <span>11:00 PM</span>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 divide-x border-t border-dashed border-border">
        {[
          { icon: RefreshCw, label: "Frequency", value: "Once per day" },
          { icon: Timer, label: "Processing", value: "1–48 hours" },
        ].map(({ icon: Icon, label, value }) => (
          <div key={label} className="flex items-center gap-2.5 px-5 py-3.5">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-surface text-primary">
              <Icon className="h-4 w-4" />
            </span>
            <span className="min-w-0">
              <span className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</span>
              <span className="block text-sm font-extrabold">{value}</span>
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

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
  const reserved = eligibility?.pending ?? 0;
  const earned = eligibility?.earned ?? 0;
  const barTotal = Math.max(earned, available + reserved, 1);

  return (
    <div className="pb-8">
      <PageHeader title="Withdraw" subtitle="Payouts from earned income" back />

      {/* Voucher hero */}
      <section className="relative -mt-4 mx-5 overflow-hidden rounded-[28px] bg-primary text-primary-foreground shadow-lift">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.12]"
          style={{ backgroundImage: "radial-gradient(circle at 1px 1px, white 1px, transparent 0)", backgroundSize: "18px 18px" }}
        />
        <div className="pointer-events-none absolute -right-20 -top-24 h-56 w-56 rounded-full bg-accent/25 blur-3xl" />

        <div className="relative p-6 pb-5">
          <div className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-[11px] font-extrabold uppercase tracking-[0.14em] text-accent">
              <Sparkles className="h-3.5 w-3.5" />Payout counter
            </span>
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-white/10 p-1.5 ring-1 ring-white/15">
              <WithdrawIcon className="h-full w-full" />
            </span>
          </div>

          <p className="mt-5 text-[11px] font-bold uppercase tracking-[0.18em] text-primary-foreground/55">
            Available to withdraw
          </p>
          <p className="mt-1.5 flex items-baseline gap-2">
            <span className="text-lg font-extrabold text-accent">ETB</span>
            <span className="text-[44px] font-extrabold leading-none tracking-tight tabular-nums">
              {Math.round(available).toLocaleString("en-US")}
            </span>
          </p>

          {/* Breakdown bar */}
          <div className="mt-5 flex h-2.5 overflow-hidden rounded-full bg-white/15">
            <div className="rounded-full bg-accent" style={{ width: `${(available / barTotal) * 100}%` }} />
            <div className="rounded-full bg-white/45" style={{ width: `${(reserved / barTotal) * 100}%` }} />
          </div>
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs">
            {[
              { dot: "bg-accent", label: "Withdrawable", value: available },
              { dot: "bg-white/45", label: "In review", value: reserved },
              { dot: "bg-white/15", label: "Lifetime earned", value: earned },
            ].map(({ dot, label, value }) => (
              <span key={label} className="flex items-center gap-1.5">
                <span className={`h-2 w-2 rounded-full ${dot}`} />
                <span className="text-primary-foreground/60">{label}</span>
                <span className="font-bold tabular-nums">{birr(value)}</span>
              </span>
            ))}
          </div>
        </div>

        {/* Perforated edge */}
        <div className="relative border-t border-dashed border-white/25">
          <div className="flex items-center justify-between gap-3 px-6 py-3.5 text-xs">
            <span className="text-primary-foreground/60">
              Minimum payout <span className="font-extrabold text-accent">{birr(minAmount)}</span>
            </span>
            <span className="flex items-center gap-1.5 text-primary-foreground/60">
              <CalendarDays className="h-3.5 w-3.5" /> Mon – Sat
            </span>
            <span className="flex items-center gap-1.5 text-primary-foreground/60">
              <Clock3 className="h-3.5 w-3.5" /> 1–48h
            </span>
          </div>
        </div>
      </section>

      <div className="mx-5 mt-5 space-y-5">
        {!eligibility ? (
          <section className="rounded-3xl bg-card p-6 shadow-card">
            <div className="flex items-center gap-3">
              <div className="h-11 w-11 animate-pulse rounded-2xl bg-secondary" />
              <div className="flex-1 space-y-2">
                <div className="h-3.5 w-40 animate-pulse rounded-full bg-secondary" />
                <div className="h-3 w-24 animate-pulse rounded-full bg-secondary" />
              </div>
            </div>
            <div className="mt-5 h-2.5 w-full animate-pulse rounded-full bg-secondary" />
            <p className="mt-4 text-sm text-muted-foreground">Checking your withdrawal eligibility…</p>
          </section>
        ) : !eligibility.has_package ? (
          <section className="relative overflow-hidden rounded-3xl border border-dashed border-accent/60 bg-card p-6 shadow-card">
            <div className="pointer-events-none absolute -right-14 -top-14 h-44 w-44 rounded-full bg-tint-orange/70 blur-2xl" />
            <span className="relative grid h-12 w-12 place-items-center rounded-2xl bg-primary text-accent">
              <LockKeyhole className="h-5 w-5" />
            </span>
            <h2 className="relative mt-4 text-xl font-extrabold tracking-tight">Payouts locked</h2>
            <p className="relative mt-1.5 max-w-sm text-sm leading-6 text-muted-foreground">
              Your first package unlocks the counter. Earn from it, then cash out from {birr(minAmount)}.
            </p>

            <ol className="relative mt-5 space-y-0">
              {[
                { icon: ShoppingBag, text: "Choose a package that fits you", hint: "Takes a minute" },
                { icon: Sparkles, text: "Claim daily income & task rewards", hint: "Every day" },
                { icon: ArrowUpRight, text: `Withdraw from ${birr(minAmount)}`, hint: "Mon – Sat" },
              ].map(({ icon: Icon, text, hint }, i, list) => (
                <li key={text} className="relative flex gap-3 pb-4 last:pb-0">
                  {i < list.length - 1 && <span className="absolute left-[15px] top-8 h-[calc(100%-2rem)] w-px bg-border" />}
                  <span className="relative z-10 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-secondary text-primary ring-4 ring-card">
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 pt-1">
                    <span className="block text-sm font-bold">{text}</span>
                    <span className="block text-xs text-muted-foreground">{hint}</span>
                  </span>
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
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">Progress to payout</p>
                <h2 className="mt-1.5 text-xl font-extrabold tracking-tight">Almost there</h2>
              </div>
              <span className="shrink-0 rounded-2xl bg-tint-green px-3 py-2 text-2xl font-extrabold tabular-nums text-success">
                {progress}%
              </span>
            </div>

            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              Earn <span className="font-extrabold text-primary tabular-nums">{birr(remaining)}</span> more to unlock the
              withdrawal counter.
            </p>

            <div className="mt-5 h-3 overflow-hidden rounded-full bg-secondary">
              <div
                className="h-full rounded-full bg-gradient-to-r from-accent to-warning transition-all duration-700"
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="mt-2 flex justify-between text-[11px] font-bold tabular-nums text-muted-foreground">
              <span>{birr(available)} earned</span>
              <span>{birr(minAmount)} goal</span>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3">
              <Link
                to="/tasks"
                className="press flex items-center justify-center gap-2 rounded-2xl bg-accent py-3.5 text-sm font-extrabold text-accent-foreground"
              >
                Earn more <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                to="/wallet"
                className="press flex items-center justify-center rounded-2xl bg-secondary py-3.5 text-sm font-extrabold text-primary"
              >
                My wallet
              </Link>
            </div>
          </section>
        ) : (
          <section className="flex items-center gap-3 rounded-3xl border border-success/35 bg-success/10 px-5 py-4">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-success text-success-foreground">
              <Check className="h-4.5 w-4.5" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-extrabold text-success">You're eligible to withdraw</p>
              <p className="text-xs text-muted-foreground">
                Up to {birr(available)} · paid to your CBE account within 1–48 hours.
              </p>
            </div>
            <CheckCircle2 className="ml-auto h-5 w-5 shrink-0 text-success/60" />
          </section>
        )}
      </div>

      <div className="mx-5 mt-5">
        <OperatingWindow />
      </div>

      {eligibility?.has_package && remaining <= 0 && (
        <div className="mt-10">
          <MoneyForm kind="Withdraw" max={available} payoutAccount={payoutAccount} />
        </div>
      )}

      {/* How a payout works */}
      <section className="mx-5 mt-5 rounded-3xl bg-card p-5 shadow-card">
        <h2 className="text-base font-extrabold">How a payout works</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {[
            { n: "01", title: "Request", body: "Enter an amount and confirm your 13-digit CBE account." },
            { n: "02", title: "Review", body: "Our team verifies the request within 1–48 hours." },
            { n: "03", title: "Paid", body: "Funds land in your CBE account — once per day." },
          ].map((step) => (
            <div key={step.n} className="rounded-2xl bg-surface p-4">
              <span className="text-xs font-extrabold text-accent tabular-nums">{step.n}</span>
              <p className="mt-1 text-sm font-extrabold">{step.title}</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">{step.body}</p>
            </div>
          ))}
        </div>
        <p className="mt-4 flex items-start gap-1.5 text-xs leading-5 text-muted-foreground">
          <ShieldNote />
          Deposits and promo credits stay outside withdrawals. Only income your package earns can be paid out.
        </p>
      </section>
    </div>
  );
}

function ShieldNote() {
  return (
    <svg viewBox="0 0 24 24" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3l7 3v5c0 4.5-3 8.2-7 10-4-1.8-7-5.5-7-10V6l7-3z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  );
}
