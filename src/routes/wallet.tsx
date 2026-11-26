import { createFileRoute } from "@tanstack/react-router";
import { useSupabaseWallet } from "@/lib/use-supabase-wallet";
import { etb, fmtDate } from "@/lib/format";
import { useStore } from "@/lib/store";
import { PageHeader, Section } from "@/components/cas/AppShell";
import { StatusPill } from "@/components/cas/StatusPill";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export const Route = createFileRoute("/wallet")({
  head: () => ({ meta: [{ title: "My Wallet — CAS" }, { name: "description", content: "Your CAS balances, bonuses, purchases and transactions." }, { property: "og:title", content: "My Wallet — CAS" }, { property: "og:description", content: "Your CAS balances, bonuses, purchases and transactions." }] }),
  component: Page,
});

function Page() {
  const wallet = useSupabaseWallet();
  const balance = wallet.balance;
  const history = wallet.ledger.map((row) => ({
    id: row.id,
    type: row.type === "daily_income" ? "Daily income" : row.type === "team_commission" ? "Team commission" : row.type === "referral_bonus" || row.type === "recruitment_bonus" ? "Referral bonus" : row.type === "withdrawal" ? "Withdrawal" : "Wallet transaction",
    amount: row.amount,
    date: row.created_at,
    status: row.status,
  }));
  const [livePurchases, setLivePurchases] = useState<Array<{ id: string; package_id: string; amount: number; payment_method: string; status: string; created_at: string }>>([]);

  useEffect(() => {
    const loadPurchases = async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData.session?.user.id;
      if (!userId) return;
      const { data } = await supabase
        .from("purchases")
        .select("id,package_id,amount,payment_method,status,created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });
      setLivePurchases((data ?? []).map((row) => ({ ...row, amount: Number(row.amount) })));
    };
    void loadPurchases();
  }, []);
  return (
    <div>
      <PageHeader title="My Wallet" back />
      <div className="-mt-4 mx-5 rounded-3xl bg-card p-5 shadow-card">
        <p className="text-xs text-muted-foreground">Available balance · withdrawable</p>
        <p className="text-3xl font-extrabold text-primary">{etb(balance)}</p>
        <div className="mt-4 grid grid-cols-3 gap-3 border-t pt-4">
          <div><p className="text-xs text-muted-foreground">Available</p><p className="font-bold">{etb(wallet.balance)}</p></div>
          <div><p className="text-xs text-muted-foreground">Team bonus</p><p className="font-bold">{etb(wallet.teamBonus)}</p></div>
          <div><p className="text-xs text-muted-foreground">Pay income</p><p className="font-bold">{etb(wallet.payIncome)}</p></div>
        </div>
        <p className="mt-3 rounded-xl bg-muted p-3 text-xs text-muted-foreground">Bonuses are promotional credits and are kept separate from your withdrawable balance. Eligibility rules apply to each bonus type.</p>
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
                  <p className="text-xs text-muted-foreground">{etb(purchase.amount)} · {purchase.payment_method}</p>
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
                <p className={`shrink-0 font-extrabold ${amountColor}`}>{t.amount > 0 ? "+" : ""}{etb(t.amount)}</p>
              </div>
            );
          })}
        </div>
      </Section>
    </div>
  );
}
