import { useMemo, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Check, LockKeyhole } from "lucide-react";
import cbeLogo from "@/assets/cbe-logo.png";
import { etb, maskAccount } from "@/lib/format";
import { rewardRules } from "@/lib/mock-data";
import { actions, minimumRechargeAmount, useStore } from "@/lib/store";
import { supabase } from "@/lib/supabase";
import { saveWithdrawalReceipt } from "@/lib/withdrawal-receipt";
import { useWithdrawalSecurityStatus } from "@/lib/queries";

const methods = ["CBE"];

export function MoneyForm({
  kind,
  max,
  payoutAccount,
  minimumWithdrawal = rewardRules.minimumWithdrawal,
}: {
  kind: "Recharge" | "Withdraw";
  max?: number;
  payoutAccount?: string;
  minimumWithdrawal?: number;
}) {
  const navigate = useNavigate();
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("CBE");
  const [account, setAccount] = useState(payoutAccount ?? "");
  const [withdrawPassword, setWithdrawPassword] = useState("");
  const security = useWithdrawalSecurityStatus();
  const needsPassword =
    kind === "Withdraw" && security.data?.hasPassword === true;

  const saveAccount = async () => {
    if (!/^\d{13}$/.test(account)) {
      toast.error("Enter a valid 13-digit CBE account number");
      return;
    }
    // Persist to the profile so the account survives reloads and is available
    // when the admin processes the withdrawal.
    const { error } = await supabase.rpc("set_payout_account", {
      p_account: account,
    });
    if (error) {
      const detail = /could not find the function|does not exist/i.test(
        error.message,
      )
        ? "Run REQUEST_WITHDRAWAL.sql in Supabase to enable saved accounts."
        : error.message;
      toast.error("Could not save bank account", { description: detail });
      return;
    }
    actions.setPayoutAccount(account);
    toast.success("Bank account saved", {
      description: "Your CBE account details are attached.",
    });
  };
  const n = Number(amount);
  const minPackageAmount = useStore(minimumRechargeAmount);
  const packages = useStore((s) => s.packages);
  const packagePrices = useMemo(
    () =>
      Array.from(
        new Set(
          packages
            .map((p) => Number(p.price))
            .filter((v) => Number.isFinite(v) && v > 0),
        ),
      ).sort((a, b) => a - b),
    [packages],
  );
  const isWithdraw = kind === "Withdraw";
  const minimumAmount = isWithdraw ? minimumWithdrawal : minPackageAmount;
  const amountLabel = isWithdraw ? "withdrawal" : "recharge";
  // The RPC rounds the fee to whole birr; keep the UI identical.
  const fee = isWithdraw
    ? Math.round((n * rewardRules.withdrawalFeePercent) / 100)
    : 0;
  const quickAmounts =
    packagePrices.length > 0 ? packagePrices : [minPackageAmount];
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isWithdraw && !rewardRules.withdrawalAmounts.includes(n)) {
      toast.error("Choose one of the fixed withdrawal amounts");
      return;
    }
    if (!n || n < minimumAmount) {
      toast.error(`Minimum ${amountLabel} amount is ${etb(minimumAmount)}`);
      return;
    }
    if (max !== undefined && n > max) {
      toast.error("Amount exceeds your available balance");
      return;
    }

    if (isWithdraw) {
      if (!payoutAccount) {
        toast.error("Save your CBE account before withdrawing");
        return;
      }
      if (needsPassword && !withdrawPassword) {
        toast.error("Enter your withdrawal password");
        return;
      }

      const { data: requestId, error } = await supabase.rpc(
        "request_withdrawal",
        {
          p_amount: n,
          p_account: payoutAccount,
          p_method: method,
          p_password: needsPassword ? withdrawPassword : null,
        },
      );

      if (error) {
        const message = error.message;
        if (/enter your withdrawal password/i.test(message)) {
          toast.error("Enter your withdrawal password", {
            description:
              "It is required because you enabled it in Profile → Security Settings.",
          });
          return;
        }
        if (/incorrect withdrawal password/i.test(message)) {
          toast.error("Incorrect withdrawal password", {
            description: "Check it in Profile → Security Settings.",
          });
          return;
        }
        if (/buy a package/i.test(message)) {
          toast.error("Buy a package first", {
            description:
              "Withdrawals unlock from the income your package earns.",
          });
          return;
        }
        if (
          /could not find the function|does not exist|unexpected argument|unknown function/i.test(
            message,
          )
        ) {
          toast.error("Withdrawals need the latest update", {
            description: "Please run WITHDRAWAL_ELIGIBILITY.sql in Supabase.",
          });
          return;
        }
        toast.error("Withdrawal request failed", { description: message });
        return;
      }

      // Keep the bank number out of the URL, history and Referer header.
      saveWithdrawalReceipt({
        amount: n,
        account: payoutAccount,
        method,
        reference: String(
          requestId ?? `WD-${Date.now().toString(36).toUpperCase()}`,
        ),
      });
      navigate({ to: "/withdraw/success", replace: true });
      return;
    }

    navigate({ to: "/recharge/payment", search: { amount: n, method } });
  };
  return (
    <form
      onSubmit={submit}
      className="-mt-4 mx-5 space-y-4 rounded-3xl bg-card p-5 shadow-card"
    >
      {max !== undefined && kind === "Recharge" && (
        <p className="text-sm text-muted-foreground">
          Withdrawable income:{" "}
          <span className="font-bold text-primary">{etb(max)}</span>
        </p>
      )}
      {isWithdraw ? (
        <div>
          <span className="text-sm font-semibold">Amount (ETB)</span>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {rewardRules.withdrawalAmounts.map((v) => {
              const unavailable = max !== undefined && v > max;
              const selected = n === v;
              return (
                <button
                  type="button"
                  key={v}
                  disabled={unavailable}
                  aria-pressed={selected}
                  onClick={() => setAmount(String(v))}
                  className={`press rounded-xl border py-2.5 text-xs font-bold ${
                    selected
                      ? "border-accent bg-accent/15 text-primary"
                      : "bg-secondary"
                  } ${unavailable ? "cursor-not-allowed opacity-40" : ""}`}
                >
                  {v.toLocaleString()}
                </button>
              );
            })}
          </div>
          {amount && (
            <p className="mt-2 text-sm font-bold text-primary">
              Selected: {etb(n)}
            </p>
          )}
        </div>
      ) : (
        <label className="block">
          <span className="text-sm font-semibold">Amount (ETB)</span>
          <input
            inputMode="numeric"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/\D/g, ""))}
            placeholder="0"
            className="mt-1 w-full rounded-xl border bg-surface px-4 py-3 text-xl font-bold outline-none focus:border-accent"
          />
        </label>
      )}
      <div className="rounded-xl bg-muted p-3 text-xs text-muted-foreground">
        {isWithdraw ? (
          <>
            <p>
              Fixed amounts only · Fee: {rewardRules.withdrawalFeePercent}% ·
              whole ETB
            </p>
            <p className="mt-1">
              Allowed:{" "}
              {rewardRules.withdrawalAmounts.map((v) => etb(v)).join(" · ")}
            </p>
            {n > 0 && (
              <p className="mt-1 font-semibold text-foreground">
                Fee: {etb(fee)} · You receive: {etb(n - fee)}
              </p>
            )}
          </>
        ) : (
          <p>
            Minimum recharge: {etb(minimumAmount)} — the price of the cheapest
            available package.
          </p>
        )}
      </div>
      {!isWithdraw && (
        <div
          className="grid gap-2"
          style={{
            gridTemplateColumns: `repeat(${Math.max(1, Math.min(quickAmounts.length, 4))}, minmax(0, 1fr))`,
          }}
        >
          {quickAmounts.map((v) => (
            <button
              type="button"
              key={v}
              onClick={() => setAmount(String(v))}
              className="press rounded-xl bg-secondary py-2 text-xs font-bold"
            >
              {v.toLocaleString()}
            </button>
          ))}
        </div>
      )}
      <div className="flex flex-col gap-4">
        <div>
          <p className="text-sm font-semibold">Method</p>
          <div className="mt-1 flex gap-2">
            {methods.map((m) => (
              <button
                type="button"
                key={m}
                onClick={() => setMethod(m)}
                className={`press flex flex-1 items-center justify-center gap-1.5 rounded-xl border px-2 py-3 text-xs font-semibold ${method === m ? "border-accent bg-accent/10 text-primary" : ""}`}
              >
                {m === "CBE" && (
                  <img
                    src={cbeLogo}
                    alt=""
                    className="h-5 w-5 object-contain"
                  />
                )}
                {m}
              </button>
            ))}
          </div>
        </div>
        {isWithdraw && !payoutAccount && (
          <div className="space-y-2 rounded-xl border border-accent bg-accent/10 p-3">
            <p className="text-xs font-semibold text-foreground">
              Save a bank account to withdraw
            </p>
            <div className="flex gap-2">
              <input
                value={account}
                onChange={(e) =>
                  setAccount(e.target.value.replace(/\D/g, "").slice(0, 13))
                }
                placeholder="13-digit CBE account"
                inputMode="numeric"
                className="min-w-0 flex-1 rounded-xl border bg-surface px-3 py-2.5 text-sm font-bold outline-none focus:border-accent"
              />
              <button
                type="button"
                onClick={saveAccount}
                className="press rounded-xl bg-secondary px-4 py-2.5 text-sm font-bold text-primary"
              >
                Save
              </button>
            </div>
          </div>
        )}
        {isWithdraw && payoutAccount && (
          <div className="flex items-center gap-3 rounded-xl border border-accent bg-accent/10 p-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-accent text-accent-foreground">
              <Check className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-xs text-muted-foreground">
                Withdraw to · {method}
              </p>
              <p className="truncate text-sm font-bold">
                CBE {maskAccount(payoutAccount)}
              </p>
            </div>
            <Link
              to="/profile"
              className="shrink-0 text-xs font-bold text-accent"
            >
              Manage
            </Link>
          </div>
        )}
        {isWithdraw && needsPassword && (
          <label className="block">
            <span className="flex items-center gap-1.5 text-sm font-semibold">
              <LockKeyhole className="h-4 w-4 text-primary" />
              Withdrawal password
            </span>
            <input
              type="password"
              value={withdrawPassword}
              onChange={(e) => setWithdrawPassword(e.target.value)}
              autoComplete="off"
              placeholder="Your security password"
              className="mt-1 w-full rounded-xl border bg-surface px-4 py-3 text-sm outline-none focus:border-accent"
            />
            <span className="mt-1 block text-xs text-muted-foreground">
              Set in Profile → Security Settings. Forgot it? Reset there with
              your recovery keywords.
            </span>
          </label>
        )}
      </div>
      <button
        disabled={isWithdraw && !n}
        className="press w-full rounded-2xl bg-accent py-4 font-extrabold text-accent-foreground disabled:opacity-60"
      >
        {kind}
      </button>
      <p className="text-center text-xs text-muted-foreground">
        {isWithdraw
          ? "Only income your package earns can be withdrawn — deposits and promo credits stay in your wallet."
          : "Your balance updates after the payment is confirmed."}
      </p>
    </form>
  );
}
