import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { actions, useStore } from "@/lib/store";
import { PageHeader } from "@/components/cas/AppShell";
import { MoneyForm } from "@/components/cas/MoneyForm";
import { useSupabaseWallet } from "@/lib/use-supabase-wallet";
import { supabase } from "@/lib/supabase";

export const Route = createFileRoute("/withdraw")({
  head: () => ({ meta: [{ title: "Withdraw — CAS" }, { name: "description", content: "Withdraw funds from your CAS wallet." }, { property: "og:title", content: "Withdraw — CAS" }, { property: "og:description", content: "Withdraw funds from your CAS wallet." }] }),
  component: Page,
});

function Page() {
  const wallet = useSupabaseWallet();
  const payoutAccount = useStore((s) => s.payoutAccount);

  // Restore the saved bank account from the profile so it survives a reload.
  useEffect(() => {
    let active = true;
    const load = async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData.session?.user.id;
      if (!userId) return;
      const { data } = await supabase.from("profiles").select("payout_account").eq("id", userId).maybeSingle();
      const saved = typeof data?.payout_account === "string" ? data.payout_account : "";
      if (active && saved) actions.setPayoutAccount(saved);
    };
    void load();
    return () => { active = false; };
  }, []);

  // Deposits are withdrawable too; only funds already requested cannot be reused.
  const pending = wallet.ledger
    .filter((row) => row.type === "withdrawal" && row.status === "pending")
    .reduce((sum, row) => sum + Math.abs(row.amount), 0);
  const available = Math.max(0, wallet.balance - pending);

  return (
    <div>
      <PageHeader title="Withdraw" subtitle="Transfer your available balance" back />
      <MoneyForm kind="Withdraw" max={available} payoutAccount={payoutAccount} />
    </div>
  );
}
