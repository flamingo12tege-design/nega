import { createFileRoute, Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Sparkles, Clock3, PackageOpen, Users, type LucideIcon } from "lucide-react";
import { rewardRules } from "@/lib/mock-data";
import { claimStatus, claimedDays, todayKey, totalClaimed, type DailyClaim } from "@/lib/daily-income";
import { etb, fmtDate } from "@/lib/format";
import { actions, useReferral, useStore } from "@/lib/store";
import { supabase } from "@/lib/supabase";
import { PageHeader, Section } from "@/components/cas/AppShell";
import { IncomeSuccessModal } from "@/components/cas/IncomeSuccessModal";
import type { TaskStatus } from "@/lib/mock-data";
import { walletQueryKey } from "@/lib/use-supabase-wallet";
import { queryKeys, useDailyClaims, usePurchases, useSessionUser } from "@/lib/queries";

type SuccessCard = { title: string; amount: number; label: string; note?: string | undefined };

/** Small allow-list so we don't pull every lucide icon into the bundle. */
const taskIcons: Record<string, LucideIcon> = { Sparkles };

export const Route = createFileRoute("/tasks")({
  head: () => ({ meta: [{ title: "Tasks — CAS" }, { name: "description", content: "Claim daily income from your active packages and earn eligible rewards." }, { property: "og:title", content: "Tasks — CAS" }, { property: "og:description", content: "Claim daily income from your active packages and earn eligible rewards." }] }),
  component: Page,
});

const pill: Record<TaskStatus, string> = {
  Available: "bg-secondary text-primary",
  "In Progress": "bg-accent/15 text-primary",
  "Under Review": "bg-warning/20 text-primary",
  Completed: "bg-success/15 text-success",
};

function Page() {
  const queryClient = useQueryClient();
  const [success, setSuccess] = useState<SuccessCard | null>(null);
  const { userId } = useSessionUser();
  const storedPurchases = useStore((s) => s.purchases);
  const purchasesQuery = usePurchases(userId);
  const claimsQuery = useDailyClaims(userId);
  const storedClaims = useStore((s) => s.claims);
  const liveClaims = useMemo<DailyClaim[] | null>(() => {
    if (!purchasesQuery.data && !claimsQuery.data) return null;
    return (claimsQuery.data ?? []).map((row) => ({
      id: row.id,
      purchaseId: String(row.reference_id ?? ""),
      date: todayKey(new Date(row.created_at ?? Date.now())),
      amount: Number(row.amount) || 0,
    }));
  }, [claimsQuery.data, purchasesQuery.data]);
  const claims = liveClaims ?? storedClaims;
  const [claiming, setClaiming] = useState<string | null>(null);
  const tasks = useStore((s) => s.tasks);
  const allPackages = useStore((s) => s.packages);
  const { dailyCommission, commissionClaimedToday, settings, vip } = useReferral();
  const claimedToday = claims.filter((c) => c.date === todayKey()).length;

  const purchases = (purchasesQuery.data && purchasesQuery.data.length > 0)
    ? purchasesQuery.data.map((p) => ({
        id: p.id,
        applianceId: p.package_id,
        method: "Wallet balance",
        status: p.status === "approved" ? "Approved" : "Pending",
        date: p.created_at,
      }))
    : storedPurchases;

  const packages = purchases.flatMap((purchase) => {
    const appliance = allPackages.find((a) => a.id === purchase.applianceId);
    return appliance ? [{ purchase, appliance }] : [];
  });
  const active = packages.filter(({ purchase }) => purchase.status === "Approved");
  const pending = packages.filter(({ purchase }) => purchase.status === "Pending");
  const claimable = active.reduce(
    (sum, { purchase, appliance }) =>
      claimStatus(claims, purchase.id, rewardRules.packageDurationDays) === "claimable"
        ? sum + Math.round(appliance.dailyPayout)
        : sum,
    commissionClaimedToday ? 0 : Math.round(dailyCommission),
  );
  const claimed = totalClaimed(claims);

  const claim = async (id: string, applianceId?: string) => {
    if (claiming) return;
    setClaiming(id);

    // Persist the claim first so it shows in wallet history and profile totals.
    const { data, error } = await supabase.rpc("claim_daily_income", { p_purchase_id: id });
    setClaiming(null);

    if (error) {
      const message = error.message ?? "";
      if (/already claimed/i.test(message)) {
        toast("Already claimed today", { description: "Your next daily income unlocks tomorrow." });
        if (userId) void queryClient.invalidateQueries({ queryKey: queryKeys.dailyClaims(userId) });
      } else if (/package completed/i.test(message)) {
        toast("Package completed", { description: "This package has reached its daily income limit." });
      } else if (/not active/i.test(message)) {
        toast.error("This package is not active yet");
      } else if (/not found/i.test(message)) {
        toast.error("Purchase not found", { description: "Refresh the page and try again." });
      } else {
        toast.error("Could not claim daily income", { description: message || "Please try again." });
      }
      return;
    }

    const amount = Number(data) || 0;
    const appliance = allPackages.find((a) => a.id === applianceId);
    if (userId) void queryClient.invalidateQueries({ queryKey: queryKeys.dailyClaims(userId) });
    setSuccess({
      title: "Income!",
      amount: Math.round(amount),
      label: appliance?.name ?? "Daily income",
    });
    void queryClient.invalidateQueries({ queryKey: walletQueryKey });
  };

  const claimTeam = () => {
    const result = actions.claimTeamCommission();
    if (result.ok) {
      setSuccess({
        title: "Income!",
        amount: Math.round(result.amount),
        label: "Team commission",
      });
    } else if (result.reason === "already-claimed") {
      toast("Already claimed today", { description: "Your next team commission unlocks tomorrow." });
    } else {
      toast("No team commission due", { description: "Eligible active members are needed to earn." });
    }
  };

  const act = (id: string, status: TaskStatus, reward?: number, taskTitle?: string) => {
    if (status === "Available") { actions.setTask(id, "In Progress"); toast("Task started"); }
    else if (status === "In Progress") {
      actions.setTask(id, "Under Review");
      setSuccess({
        title: "Income!",
        amount: Math.round(reward ?? 0),
        label: taskTitle ?? "Bonus task",
        note: "Reward is credited after verification.",
      });
    }
  };

  return (
    <div>
      <PageHeader title="Task Center" subtitle="Claim daily income from your active packages" />

      <div className="-mt-4 px-5">
        <div className="rounded-3xl bg-card p-5 shadow-card">
          <p className="text-xs text-muted-foreground">Ready to claim today</p>
          <p className="mt-1 text-3xl font-extrabold text-primary">{etb(claimable)}</p>
          <div className="mt-4 grid grid-cols-3 gap-3 border-t pt-4">
            <div><p className="text-xs text-muted-foreground">Active packages</p><p className="font-bold">{active.length}</p></div>
            <div><p className="text-xs text-muted-foreground">Total claimed</p><p className="font-bold">{etb(Math.round(claimed))}</p></div>
            <div><p className="text-xs text-muted-foreground">Claimed today</p><p className="font-bold">{claimedToday} {claimedToday === 1 ? "package" : "packages"}</p></div>
          </div>
        </div>
      </div>

      <Section title="Daily Income" action={<Link to="/wallet" className="text-sm font-bold text-accent">Wallet</Link>}>
        {active.length === 0 ? (
          <div className="rounded-2xl bg-card p-6 text-center shadow-card">
            <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-secondary text-primary"><PackageOpen className="h-6 w-6" /></span>
            <p className="mt-3 font-bold">No active packages yet</p>
            <p className="mt-1 text-sm text-muted-foreground">Daily income unlocks as soon as your package purchase is approved.</p>
            <Link to="/appliances" className="press mt-4 inline-block rounded-xl bg-accent px-5 py-2.5 text-sm font-bold text-accent-foreground">Browse packages</Link>
          </div>
        ) : (
          <div className="space-y-3">
            {active.map(({ purchase, appliance }) => {
              const status = claimStatus(claims, purchase.id, rewardRules.packageDurationDays);
              const days = claimedDays(claims, purchase.id);
              const earned = days * Math.round(appliance.dailyPayout);
              const pct = Math.min(100, (days / rewardRules.packageDurationDays) * 100);
              return (
                <div key={purchase.id} className="rounded-2xl bg-card p-4 shadow-card">
                  <div className="flex items-center gap-3">
                    <img src={appliance.image} alt="" className="h-14 w-14 shrink-0 rounded-xl object-cover" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-bold">{appliance.name}</p>
                      <p className="text-xs text-muted-foreground">VIP {appliance.tier} · activated {fmtDate(purchase.date)}</p>
                    </div>
                    <span className="shrink-0 rounded-full bg-secondary px-2 py-0.5 text-[11px] font-bold text-primary">Active</span>
                  </div>

                  <div className="mt-4 flex items-end justify-between gap-3">
                    <div>
                      <p className="text-xs text-muted-foreground">Daily income</p>
                      <p className="text-lg font-extrabold text-primary">+{etb(Math.round(appliance.dailyPayout))}</p>
                    </div>
                    <button
                      disabled={status !== "claimable" || claiming !== null}
                      onClick={() => void claim(purchase.id, purchase.applianceId)}
                      className="press rounded-xl bg-accent px-4 py-2.5 text-sm font-bold text-accent-foreground disabled:bg-muted disabled:text-muted-foreground"
                    >
                      {claiming === purchase.id ? "Claiming..." : status === "claimable" ? "Claim today" : status === "claimed" ? "Claimed today" : "Completed"}
                    </button>
                  </div>

                  <div className="mt-4">
                    <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                      <span>Day {Math.min(days + (status === "claimable" ? 1 : 0), rewardRules.packageDurationDays)} of {rewardRules.packageDurationDays}</span>
                      <span>{days} {days === 1 ? "claim" : "claims"} · {etb(earned)} earned</span>
                    </div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${pct}%` }} />
                    </div>
                  </div>

                  {status === "claimed" && (
                    <p className="mt-3 flex items-center gap-1.5 rounded-xl bg-muted px-3 py-2 text-xs text-muted-foreground"><Clock3 className="h-3.5 w-3.5" />Next claim unlocks tomorrow.</p>
                  )}
                </div>
              );
            })}
          </div>
        )}
        {pending.length > 0 && (
          <p className="mt-3 rounded-xl bg-muted px-3 py-2 text-xs text-muted-foreground">
            {pending.length} package request{pending.length === 1 ? "" : "s"} awaiting approval. Daily income starts after approval.
          </p>
        )}
      </Section>

      <Section title="Daily Team Commission">
        <div className="rounded-2xl bg-card p-4 shadow-card">
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary text-accent"><Users className="h-5 w-5" /></span>
            <div className="min-w-0 flex-1">
              <p className="font-bold">Team commission</p>
              <p className="text-xs text-muted-foreground">
                {settings.dailyCommissionPercentByLevel.map((p) => `${p}%`).join(" · ")} from A / B / C levels · VIP {vip}
              </p>
            </div>
            <button
              disabled={commissionClaimedToday || dailyCommission <= 0}
              onClick={claimTeam}
              className="press shrink-0 rounded-xl bg-accent px-4 py-2.5 text-sm font-bold text-accent-foreground disabled:bg-muted disabled:text-muted-foreground"
            >
              {commissionClaimedToday ? "Claimed today" : dailyCommission <= 0 ? "Nothing due" : "Claim today"}
            </button>
          </div>
          <p className="mt-3 flex items-center gap-1.5 rounded-xl bg-muted px-3 py-2 text-xs text-muted-foreground">
            <Clock3 className="h-3.5 w-3.5" />Earned from your team's daily income for up to {rewardRules.packageDurationDays} days. VIP 1+ members only earn from invites at your VIP level or below.
          </p>
        </div>
      </Section>

      {tasks.length > 0 && (
        <Section title="Bonus Tasks">
          <div className="grid gap-3 sm:grid-cols-2">
            {tasks.map((t) => {
              const Icon = taskIcons[t.icon] ?? Sparkles;
              const btn = t.status === "Available" ? "Start Task" : t.status === "In Progress" ? "Complete Task" : t.status;
              const disabled = t.status === "Under Review" || t.status === "Completed";
              return (
                <div key={t.id} className="rounded-2xl bg-card p-4 shadow-card">
                  <div className="flex items-start gap-3">
                    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary text-accent"><Icon className="h-5 w-5" /></span>
                    <div className="min-w-0 flex-1">
                      <p className="font-bold">{t.title}</p>
                      <p className="text-sm text-muted-foreground">{t.desc}</p>
                    </div>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${pill[t.status]}`}>{t.status}</span>
                  </div>
                  <div className="mt-4 flex items-center justify-between">
                    <span className="text-sm font-extrabold text-primary">+{etb(t.reward)}</span>
                    <button disabled={disabled} onClick={() => act(t.id, t.status, t.reward, t.title)} className="press rounded-xl bg-accent px-4 py-2 text-sm font-bold text-accent-foreground disabled:bg-muted disabled:text-muted-foreground">{btn}</button>
                  </div>
                </div>
              );
            })}
          </div>
        </Section>
      )}

      <IncomeSuccessModal
        open={success !== null}
        onOpenChange={(open) => { if (!open) setSuccess(null); }}
        title={success?.title ?? "Income!"}
        amount={success?.amount ?? 0}
        label={success?.label}
        note={success?.note}
      />
    </div>
  );
}
