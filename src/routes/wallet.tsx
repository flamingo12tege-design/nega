import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { useSupabaseWallet } from "@/lib/use-supabase-wallet";
import { etb, fmtDate } from "@/lib/format";
import { PageHeader, Section } from "@/components/cas/AppShell";
import { StatusPill } from "@/components/cas/StatusPill";
import { usePurchases, useSessionUser } from "@/lib/queries";

export const Route = createFileRoute("/wallet")({
  head: () => ({ meta: [{ title: "My Wallet — CAS" }, { name: "description", content: "Your CAS balances, bonuses, purchases and transactions." }, { property: "og:title", content: "My Wallet — CAS" }, { property: "og:description", content: "Your CAS balances, bonuses, purchases and transactions." }] }),
  component: Page,
});

function Page() {
  const { userId } = useSessionUser();
  const purchasesQuery = usePurchases(userId);
  const wallet = useSupabaseWallet();
  const balance = wallet.balance;
  const history = useMemo(() => wallet.ledger.map((row) => ({
    id: row.id,
    type: row.type === "daily_income" ? "Daily income" : row.type === "team_commission" ? "Team commission" : row.type === "referral_bonus" || row.type === "recruitment_bonus" ? "Referral bonus" : row.type === "withdrawal" ? "Withdrawal" : "Wallet transaction",
    amount: row.amount,
    date: row.created_at,
    status: row.status,
  })), [wallet.ledger]);
  const livePurchases = purchasesQuery.data ?? [];
  return (
    <div>
      <PageHeader title="My Wallet" back />
      <div className="-mt-4 mx-5 rounded-3xl bg-card p-5 shadow-card">
        <p className="text-xs text-muted-foreground">Wallet balance</p>
        <p className="text-3xl font-extrabold text-primary">{etb(Math.round(balance))}</p>
        <div className="mt-4 grid grid-cols-3 gap-3 border-t pt-4">
          <div><p className="text-xs text-muted-foreground">Balance</p><p className="font-bold">{etb(Math.round(wallet.balance))}</p></div>
          <div><p className="text-xs text-muted-foreground">Team bonus</p><p className="font-bold">{etb(Math.round(wallet.teamBonus))}</p></div>
          <div><p className="text-xs text-muted-foreground">Pay income</p><p className="font-bold">{etb(Math.round(wallet.payIncome))}</p></div>
        </div>
        <p className="mt-3 rounded-xl bg-muted p-3 text-xs text-muted-foreground">Only income earned after your first approved package is withdrawable. Deposits, gifts and welcome credits stay outside withdrawal eligibility.</p>
      </div>
      <Section title="My Purchases">
        <div className="divide-y overflow-hidden rounded-2xl bg-card shadow-card">
          {livePurchases.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">No packages purchased yet.</p>
          ) : livePurchases.map((purchase) => {
            return (
              <div key={purchase.id} className="flex items-center gap-3 p-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold">{purchase.package_id}</p>
                  <p className="text-xs text-muted-foreground">{etb(Math.round(purchase.amount))} · {purchase.payment_method}</p>
                </div>
                <StatusPill s={purchase.status === "approved" ? "Approved" : purchase.status === "rejected" ? "Rejected" : "Pending"} />
              </div>
            );
          })}
        </div>
      </Section>
      <Section title="Transaction History">
        <div className="divide-y overflow-hidden rounded-2xl bg-card shadow-card">
          {history.map((t) => {
            const status = t.status === "approved" ? "Approved" : t.status === "rejected" ? "Rejected" : t.status === "pending" ? "Pending" : t.status;
            const statusColor = t.status === "rejected" ? "text-destructive" : t.status === "approved" ? "text-success" : t.status === "pending" ? "text-warning" : "";
            const amountColor = t.status === "rejected" || t.amount < 0 ? "text-destructive" : "text-success";
            return (
              <div key={t.id} className="flex items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <p className="text-sm font-bold">{t.type}</p>
                  <p className="text-xs text-muted-foreground">{fmtDate(t.date)} · <span className={`font-bold ${statusColor}`}>{status}</span></p>
                </div>
                <p className={`shrink-0 font-extrabold ${amountColor}`}>{t.amount > 0 ? "+" : t.amount < 0 ? "-" : ""}{etb(Math.abs(Math.round(t.amount)))}</p>
              </div>
            );
          })}
        </div>
      </Section>
    </div>
  );
}
