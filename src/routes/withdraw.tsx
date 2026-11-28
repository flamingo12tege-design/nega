import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  Check,
  CheckCircle2,
  Clock3,
  RefreshCw,
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
      {
        name: "description",
        content: "Withdraw the income your CAS package earns.",
      },
      { property: "og:title", content: "Withdraw — CAS" },
      {
        property: "og:description",
        content: "Withdraw the income your CAS package earns.",
      },
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

type EatClock = { day: number; hour: number; minute: number };

/** Wall-clock parts in East Africa Time (UTC+3), the CAS operating timezone. */
function eatNow(): EatClock {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Africa/Addis_Ababa",
    weekday: "short",
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  }).formatToParts(new Date());
  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );
  const weekdays: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  return {
    day: weekdays[values["weekday"] ?? ""] ?? 0,
    hour: Number(values["hour"]) % 24,
    minute: Number(values["minute"]) || 0,
  };
}

function nextOpenText(now: EatClock) {
  const hour = now.hour + now.minute / 60;
  if (now.day === 0) return "Opens Monday at 3:00 AM";
  if (now.day === 6)
    return hour < OPEN_FROM
      ? "Opens today at 3:00 AM"
      : "Opens Monday at 3:00 AM";
  if (hour < OPEN_FROM) return "Opens today at 3:00 AM";
  if (hour >= OPEN_TO)
    return now.day === 5
      ? "Opens Monday at 3:00 AM"
      : "Opens tomorrow at 3:00 AM";
  return "";
}

function OperatingWindow() {
  const [now, setNow] = useState(eatNow);
  useEffect(() => {
    const id = setInterval(() => setNow(eatNow()), 60_000);
    return () => clearInterval(id);
  }, []);

  const today = DAY_ORDER[(now.day + 6) % 7];
  const hour = now.hour + now.minute / 60;
  const closedDay = today === "Sun";
  const closedHours = hour < OPEN_FROM || hour >= OPEN_TO;
  const isOpen = !closedDay && !closedHours;
  const marker = Math.min(
    100,
    Math.max(0, ((hour - OPEN_FROM) / (OPEN_TO - OPEN_FROM)) * 100),
  );

  return (
    <section className="relative overflow-hidden rounded-[28px] bg-card p-5 shadow-card">
      <div className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-tint-orange/70 blur-3xl" />

      <div className="relative flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-muted-foreground">
            Operating window
          </p>
          <h2 className="mt-1 text-lg font-extrabold tracking-tight">
            When payouts run
          </h2>
        </div>
        <span
          className={`flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-extrabold ${
            isOpen
              ? "bg-success/12 text-success"
              : "bg-tint-rose text-destructive"
          }`}
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${isOpen ? "animate-pulse bg-success" : "bg-destructive"}`}
          />
          {isOpen ? "Open now" : "Closed"}
        </span>
      </div>

      <div className="relative mt-5 grid grid-cols-7 gap-1.5">
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

      <div className="relative mt-5 rounded-2xl bg-surface p-4">
        <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
          <span>3:00 AM</span>
          <span>11:00 PM</span>
        </div>
        <div
          className={`relative mt-3 h-2.5 overflow-hidden rounded-full ${isOpen ? "bg-success/20" : "bg-tint-rose"}`}
        >
          <div
            className={`absolute inset-y-0 left-0 rounded-full ${isOpen ? "bg-success/75" : "bg-destructive/40"}`}
            style={{ width: `${marker}%` }}
          />
          <div
            className="absolute -top-1 h-4.5 w-1.5 -translate-x-1/2 rounded-full bg-accent shadow-card"
            style={{ left: `${marker}%` }}
          />
        </div>
        <div className="mt-2 flex items-center justify-between gap-2 text-[11px] font-bold text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <CalendarDays className="h-3.5 w-3.5" /> Mon – Sat
          </span>
          <span className={isOpen ? "text-success" : "text-destructive"}>
            {isOpen ? "Payouts processing" : nextOpenText(now)}
          </span>
          <span className="flex items-center gap-1.5">
            <Clock3 className="h-3.5 w-3.5" /> 1–48h
          </span>
        </div>
      </div>

      <div className="relative mt-4 grid grid-cols-2 gap-3">
        {[
          { icon: RefreshCw, label: "Frequency", value: "Once per day" },
          { icon: Timer, label: "Processing", value: "1–48 hours" },
        ].map(({ icon: Icon, label, value }) => (
          <div
            key={label}
            className="flex items-center gap-2.5 rounded-2xl bg-surface p-3"
          >
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-card text-primary shadow-card">
              <Icon className="h-4 w-4" />
            </span>
            <span className="min-w-0">
              <span className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                {label}
              </span>
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
  const ledgerRef = useRef(wallet.ledger);

  useEffect(() => {
    ledgerRef.current = wallet.ledger;
  }, [wallet.ledger]);

  useEffect(() => {
    const account =
      typeof profileQuery.data?.payout_account === "string"
        ? profileQuery.data.payout_account
        : "";
    actions.setPayoutAccount(account);
  }, [profileQuery.data?.payout_account]);

  // Load withdrawal eligibility. Wallet totals change often; use scalar keys
  // so a ledger refetch does not re-run this RPC on every render.
  useEffect(() => {
    let active = true;
    const load = async () => {
      if (!userId) return;

      const [{ data: rpcData, error: rpcError }, { data: purchases }] =
        await Promise.all([
          supabase.rpc("withdraw_eligibility"),
          supabase
            .from("purchases")
            .select("status,created_at")
            .eq("user_id", userId),
        ]);

      if (!active) return;

      const row = Array.isArray(rpcData) ? rpcData[0] : rpcData;
      if (!rpcError && row) {
        setEligibility({
          has_package: row["has_package"] === true,
          earned: Number(row["earned"] ?? 0),
          pending: Number(row["pending"] ?? 0),
          available: Number(row["available"] ?? 0),
          min_amount: Number(
            row["min_amount"] ?? rewardRules.minimumWithdrawal,
          ),
        });
        return;
      }

      // Fallback only for databases where the RPC has not been run yet.
      const approved = (purchases ?? []).filter((p) =>
        /approved|completed/i.test(String(p.status ?? "")),
      );
      const investedAt =
        approved.length > 0
          ? Math.min(...approved.map((p) => new Date(p.created_at).getTime()))
          : null;
      const earnedTypes = new Set([
        "daily_income",
        "team_commission",
        "recruitment_bonus",
        "referral_bonus",
        "task_reward",
        "commission",
        "pay_income",
      ]);
      const earned =
        investedAt === null
          ? 0
          : ledgerRef.current
              .filter(
                (r) =>
                  r.status === "completed" &&
                  r.amount > 0 &&
                  earnedTypes.has(r.type) &&
                  new Date(r.created_at).getTime() >= investedAt,
              )
              .reduce((sum, r) => sum + r.amount, 0);
      const reserved = ledgerRef.current
        .filter(
          (r) => r.type === "withdrawal" && /pending|completed/i.test(r.status),
        )
        .reduce((sum, r) => sum + Math.abs(r.amount), 0);
      setEligibility({
        has_package: investedAt !== null,
        earned,
        pending: reserved,
        available: Math.max(0, earned - reserved),
        min_amount: rewardRules.minimumWithdrawal,
      });
    };
    void load();
    return () => {
      active = false;
    };
  }, [userId, wallet.ledger.length, wallet.balance]);

  const available = eligibility?.available ?? 0;
  const minAmount = eligibility?.min_amount ?? rewardRules.minimumWithdrawal;
  const remaining = Math.max(0, minAmount - available);
  const progress = Math.min(100, Math.round((available / minAmount) * 100));
  const reserved = eligibility?.pending ?? 0;
  const earned = eligibility?.earned ?? 0;
  const barTotal = Math.max(earned, available + reserved, 1);

  return (
    <div className="min-h-dvh bg-surface pb-8">
      <PageHeader title="Withdraw" subtitle="Payouts from earned income" back />

      <div className="mx-5 -mt-4 space-y-5">
        <section className="relative overflow-hidden rounded-[28px] bg-primary p-6 text-primary-foreground shadow-lift">
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.12]"
            style={{
              backgroundImage:
                "radial-gradient(circle at 1px 1px, white 1px, transparent 0)",
              backgroundSize: "18px 18px",
            }}
          />
          <div className="pointer-events-none absolute -right-20 -top-24 h-56 w-56 rounded-full bg-accent/25 blur-3xl" />

          <div className="relative flex items-start justify-between gap-3">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-[11px] font-extrabold uppercase tracking-[0.14em] text-accent">
                Payout counter
              </span>
              <p className="mt-5 text-[11px] font-bold uppercase tracking-[0.18em] text-primary-foreground/55">
                Available to withdraw
              </p>
              <p className="mt-1.5 flex items-baseline gap-2">
                <span className="text-lg font-extrabold text-accent">ETB</span>
                <span className="text-[44px] font-extrabold leading-none tracking-tight tabular-nums">
                  {Math.round(available).toLocaleString("en-US")}
                </span>
              </p>
            </div>
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-white/10 p-1.5 ring-1 ring-white/15">
              <WithdrawIcon className="h-full w-full" />
            </span>
          </div>

          <div className="relative mt-5 grid grid-cols-3 gap-2 rounded-2xl bg-white/10 p-3">
            {[
              { dot: "bg-accent", label: "Withdrawable", value: available },
              { dot: "bg-white/45", label: "In review", value: reserved },
              { dot: "bg-white/15", label: "Lifetime earned", value: earned },
            ].map(({ dot, label, value }) => (
              <div key={label} className="min-w-0 rounded-xl bg-black/10 p-2.5">
                <span className={`mb-1.5 block h-2 w-2 rounded-full ${dot}`} />
                <span className="block truncate text-[10px] font-bold uppercase tracking-wide text-primary-foreground/55">
                  {label}
                </span>
                <span className="mt-0.5 block truncate text-sm font-extrabold tabular-nums">
                  {birr(value)}
                </span>
              </div>
            ))}
          </div>

          <div className="relative mt-4 flex h-2.5 overflow-hidden rounded-full bg-white/15">
            <div
              className="rounded-full bg-accent"
              style={{ width: `${(available / barTotal) * 100}%` }}
            />
            <div
              className="rounded-full bg-white/45"
              style={{ width: `${(reserved / barTotal) * 100}%` }}
            />
          </div>
          <p className="relative mt-3 text-center text-[11px] font-bold uppercase tracking-[0.14em] text-primary-foreground/55">
            Minimum payout{" "}
            <span className="text-accent">{birr(minAmount)}</span>
          </p>
        </section>

        {eligibility?.has_package !== false && (
          <section className="rounded-[28px] bg-card p-5 shadow-card">
            {!eligibility ? (
              <div>
                <div className="flex items-center gap-3">
                  <div className="h-11 w-11 animate-pulse rounded-2xl bg-secondary" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3.5 w-40 animate-pulse rounded-full bg-secondary" />
                    <div className="h-3 w-24 animate-pulse rounded-full bg-secondary" />
                  </div>
                </div>
                <div className="mt-5 h-2.5 w-full animate-pulse rounded-full bg-secondary" />
                <p className="mt-4 text-sm text-muted-foreground">
                  Checking your withdrawal eligibility…
                </p>
              </div>
            ) : remaining > 0 ? (
              <div>
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
                      Progress to payout
                    </p>
                    <h2 className="mt-1.5 text-xl font-extrabold tracking-tight">
                      Almost there
                    </h2>
                  </div>
                  <span className="shrink-0 rounded-2xl bg-tint-green px-3 py-2 text-2xl font-extrabold tabular-nums text-success">
                    {progress}%
                  </span>
                </div>

                <p className="mt-3 text-sm leading-6 text-muted-foreground">
                  Earn{" "}
                  <span className="font-extrabold text-primary tabular-nums">
                    {birr(remaining)}
                  </span>{" "}
                  more to unlock the withdrawal counter.
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
              </div>
            ) : (
              <div className="flex items-center gap-3 rounded-2xl border border-success/35 bg-success/10 px-4 py-3.5">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-success text-success-foreground">
                  <Check className="h-4.5 w-4.5" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-extrabold text-success">
                    You're eligible to withdraw
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Up to {birr(available)} · paid to your CBE account within
                    1–48 hours.
                  </p>
                </div>
                <CheckCircle2 className="ml-auto h-5 w-5 shrink-0 text-success/60" />
              </div>
            )}
          </section>
        )}

        <OperatingWindow />

        {eligibility?.has_package && remaining <= 0 && (
          <section className="rounded-[28px] border border-accent/35 bg-card p-5 shadow-card">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-accent">
                  Request payout
                </p>
                <h2 className="mt-1 text-lg font-extrabold tracking-tight">
                  Send to your CBE account
                </h2>
              </div>
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-secondary text-primary">
                <ArrowUpRight className="h-5 w-5" />
              </span>
            </div>
            <MoneyForm
              kind="Withdraw"
              max={available}
              minimumWithdrawal={minAmount}
              payoutAccount={payoutAccount}
            />
          </section>
        )}
      </div>
    </div>
  );
}
