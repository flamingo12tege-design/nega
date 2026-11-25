import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Check } from "lucide-react";
import cbeLogo from "@/assets/cbe-logo.png";
import { etb } from "@/lib/format";
import { rewardRules } from "@/lib/mock-data";
import { actions, minimumRechargeAmount, useStore } from "@/lib/store";
import { supabase } from "@/lib/supabase";

const methods = ["CBE"];

export function MoneyForm({ kind, max, payoutAccount }: { kind: "Recharge" | "Withdraw"; max?: number; payoutAccount?: string }) {
  const navigate = useNavigate();
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("CBE");
  const [account, setAccount] = useState(payoutAccount ?? "");
  const saveAccount = async () => {
    if (!/^\d{13}$/.test(account)) { toast.error("Enter a valid 13-digit CBE account number"); return; }
    // Persist to the profile so the account survives reloads and is available
    // when the admin processes the withdrawal.
    const { error } = await supabase.rpc("set_payout_account", { p_account: account });
    if (error && !/could not find the function|does not exist/i.test(error.message)) {
      toast.error("Could not save bank account", { description: error.message });
      return;
    }
    actions.setPayoutAccount(account);
    toast.success("Bank account saved", { description: "Your CBE account details are attached." });
  };
  const n = Number(amount);
  const minPackageAmount = useStore(minimumRechargeAmount);
  const minimumAmount = kind === "Withdraw" ? rewardRules.minimumWithdrawal : minPackageAmount;
  const amountLabel = kind === "Withdraw" ? "withdrawal" : "recharge";
  const fee = kind === "Withdraw" ? (n * rewardRules.withdrawalFeePercent) / 100 : 0;
  const quickAmounts = kind === "Withdraw"
    ? [300, 500, 1000, 5000]
    : Array.from(new Set([minPackageAmount, 500, 1000, 2000, 3000, 5000, 10000].filter((v) => v >= minPackageAmount))).sort((a, b) => a - b);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!n || n < minimumAmount) { toast.error(`Minimum ${amountLabel} amount is ${etb(minimumAmount)}`); return; }
    if (max !== undefined && n > max) { toast.error("Amount exceeds your available balance"); return; }

    if (kind === "Withdraw") {
      if (!payoutAccount) { toast.error("Save your CBE account before withdrawing"); return; }

      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData.session?.user.id;
      if (!userId) { toast.error("Please log in first"); return; }

      const { error } = await supabase.rpc("request_withdrawal", {
        p_amount: n,
        p_account: payoutAccount,
        p_method: method,
      });

      if (error) {
        // Fallback for databases where REQUEST_WITHDRAWAL.sql has not been run yet.
        if (!/could not find the function|does not exist/i.test(error.message)) {
          toast.error("Withdrawal request failed", { description: error.message });
          return;
        }
        const { error: insertError } = await supabase.from("wallet_ledger").insert({
          user_id: userId,
          amount: -n,
          type: "withdrawal",
          status: "pending",
          description: `CBE withdrawal to ${payoutAccount}`,
        });
        if (insertError) { toast.error("Withdrawal request failed", { description: insertError.message }); return; }
      }
      navigate({ to: "/withdraw/success", search: { amount: n, account: payoutAccount, method } });
      return;
    }

    navigate({ to: "/recharge/payment", search: { amount: n, method } });
  };
  return (
    <form onSubmit={submit} className="-mt-4 mx-5 space-y-4 rounded-3xl bg-card p-5 shadow-card">
      {max !== undefined && <p className="text-sm text-muted-foreground">Withdrawable balance: <span className="font-bold text-primary">{etb(max)}</span></p>}
      <label className="block"><span className="text-sm font-semibold">Amount (ETB)</span>
        <input inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, ""))} placeholder="0" className="mt-1 w-full rounded-xl border bg-surface px-4 py-3 text-xl font-bold outline-none focus:border-accent" />
      </label>
      <div className="rounded-xl bg-muted p-3 text-xs text-muted-foreground">
        {kind === "Withdraw" ? (
          <>
            <p>Minimum withdrawal: {etb(rewardRules.minimumWithdrawal)} · Fee: {rewardRules.withdrawalFeePercent}%</p>
            {n > 0 && <p className="mt-1 font-semibold text-foreground">Fee: {etb(fee)} · You receive: {etb(n - fee)}</p>}
          </>
        ) : (
          <p>Minimum recharge: {etb(minimumAmount)} — the price of the cheapest available package.</p>
        )}
      </div>
      <div className="grid grid-cols-4 gap-2">
        {quickAmounts.map((v) => <button type="button" key={v} onClick={() => setAmount(String(v))} className="press rounded-xl bg-secondary py-2 text-xs font-bold">{v.toLocaleString()}</button>)}
      </div>
      <div className="flex flex-col gap-4">
        <div>
          <p className="text-sm font-semibold">Method</p>
          <div className="mt-1 flex gap-2">
            {methods.map((m) => <button type="button" key={m} onClick={() => setMethod(m)} className={`press flex flex-1 items-center justify-center gap-1.5 rounded-xl border px-2 py-3 text-xs font-semibold ${method === m ? "border-accent bg-accent/10 text-primary" : ""}`}>{m === "CBE" && <img src={cbeLogo} alt="" className="h-5 w-5 object-contain" />}{m}</button>)}
          </div>
        </div>
        {kind === "Withdraw" && !payoutAccount && (
          <div className="space-y-2 rounded-xl border border-accent bg-accent/10 p-3">
            <p className="text-xs font-semibold text-foreground">Save a bank account to withdraw</p>
            <div className="flex gap-2">
              <input
                value={account}
                onChange={(e) => setAccount(e.target.value.replace(/\D/g, "").slice(0, 13))}
                placeholder="13-digit CBE account"
                inputMode="numeric"
                className="min-w-0 flex-1 rounded-xl border bg-surface px-3 py-2.5 text-sm font-bold outline-none focus:border-accent"
              />
              <button type="button" onClick={saveAccount} className="press rounded-xl bg-secondary px-4 py-2.5 text-sm font-bold text-primary">Save</button>
            </div>
          </div>
        )}
        {kind === "Withdraw" && payoutAccount && (
          <div className="flex items-center gap-3 rounded-xl border border-accent bg-accent/10 p-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-accent text-accent-foreground"><Check className="h-4 w-4" /></span>
            <div className="min-w-0 flex-1">
              <p className="text-xs text-muted-foreground">Withdraw to · {method}</p>
              <p className="truncate text-sm font-bold">CBE {payoutAccount}</p>
            </div>
            <Link to="/profile" className="shrink-0 text-xs font-bold text-accent">Manage</Link>
          </div>
        )}
      </div>
      <button className="press w-full rounded-2xl bg-accent py-4 font-extrabold text-accent-foreground">{kind}</button>
      <p className="text-center text-xs text-muted-foreground">{kind === "Withdraw" ? "Deposits and earned income are both withdrawable — no package purchase is required." : "Your balance updates after the payment is confirmed."}</p>
    </form>
  );
}
