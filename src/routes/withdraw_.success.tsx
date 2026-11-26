import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Check, CheckCircle2, Clock3, Hash, Landmark, LockKeyhole, ShieldCheck, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { rewardRules } from "@/lib/mock-data";
import { etb, fmtDateTime, maskAccount } from "@/lib/format";
import { takeWithdrawalReceipt, type WithdrawalReceipt } from "@/lib/withdrawal-receipt";

export const Route = createFileRoute("/withdraw_/success")({
  head: () => ({ meta: [{ title: "Withdrawal submitted — CAS" }, { name: "description", content: "Your CAS withdrawal request has been submitted for review." }, { property: "og:title", content: "Withdrawal submitted — CAS" }, { property: "og:description", content: "Your CAS withdrawal request has been submitted for review." }] }),
  component: Page,
});

function Row({ icon: Icon, label, value, strong }: { icon: typeof Hash; label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 py-3">
      <span className="flex items-center gap-2 text-xs text-muted-foreground"><Icon className="h-3.5 w-3.5" />{label}</span>
      <span className={`truncate text-right text-sm ${strong ? "font-extrabold text-primary" : "font-semibold"}`}>{value}</span>
    </div>
  );
}

function Page() {
  const [receipt, setReceipt] = useState<WithdrawalReceipt | null>(null);
  const [submittedAt] = useState(() => new Date().toISOString());

  useEffect(() => {
    // Old links with sensitive query params are stripped and never displayed.
    const params = new URLSearchParams(window.location.search);
    if (["amount", "account", "method"].some((key) => params.has(key))) {
      window.history.replaceState(window.history.state, "", window.location.pathname);
    }
    setReceipt(takeWithdrawalReceipt());
  }, []);

  const amount = receipt?.amount ?? 0;
  const fee = (amount * rewardRules.withdrawalFeePercent) / 100;
  const receive = amount - fee;
  const reference = receipt?.reference || "Pending";

  const steps = [
    { icon: CheckCircle2, title: "Request submitted", text: "Saved to your wallet history", done: true },
    { icon: Clock3, title: "Admin review", text: "Bank details are verified", done: false, active: true },
    { icon: Landmark, title: "Payout", text: "Sent to your CBE account", done: false },
  ];

  return (
    <div className="min-h-dvh bg-surface pb-10">
      <section className="relative overflow-hidden bg-primary px-5 pb-16 pt-10 text-center text-primary-foreground">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.12]"
          style={{ backgroundImage: "radial-gradient(circle at 1px 1px, white 1px, transparent 0)", backgroundSize: "20px 20px" }}
        />
        <div className="pointer-events-none absolute -left-16 -top-20 h-48 w-48 rounded-full bg-accent/25 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-20 -right-10 h-48 w-48 rounded-full bg-white/10 blur-3xl" />

        <div className="relative mx-auto max-w-md">
          <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-accent text-accent-foreground shadow-lift">
            <Check className="h-8 w-8" strokeWidth={3} />
          </span>
          <p className="mt-4 flex items-center justify-center gap-1.5 text-[11px] font-extrabold uppercase tracking-[0.2em] text-accent">
            <Sparkles className="h-3.5 w-3.5" />Request received
          </p>
          <h1 className="mt-2 text-2xl font-extrabold tracking-tight">Your withdrawal is on its way</h1>
          <p className="mx-auto mt-2 max-w-sm text-sm text-primary-foreground/75">
            We've recorded your request. An admin will review it and send the payout to your CBE account.
          </p>
        </div>
      </section>

      <div className="mx-auto -mt-10 w-full max-w-md space-y-3 px-5">
        <section className="rounded-3xl bg-card p-5 shadow-lift">
          <div className="flex items-center justify-between gap-3 border-b pb-3">
            <span className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-muted-foreground"><Hash className="h-3.5 w-3.5" />Reference</span>
            <span className="max-w-[60%] truncate text-xs font-extrabold text-primary">{reference}</span>
          </div>

          <div className="py-4 text-center">
            <p className="text-xs text-muted-foreground">Withdrawal amount</p>
            <p className="mt-1 text-3xl font-extrabold tracking-tight text-primary tabular-nums">{etb(amount || 0)}</p>
            <p className="mt-1 text-xs text-muted-foreground">Submitted {fmtDateTime(submittedAt)}</p>
          </div>

          <div className="divide-y rounded-2xl bg-surface px-4">
            <Row icon={ShieldCheck} label={`Fee (${rewardRules.withdrawalFeePercent}%)`} value={amount ? `− ${etb(fee)}` : "—"} />
            <Row icon={CheckCircle2} label="You receive" value={amount ? etb(receive) : "—"} strong />
            <Row icon={Landmark} label="To account" value={receipt ? `CBE ${maskAccount(receipt.account)}` : "—"} />
            <Row icon={Sparkles} label="Method" value={receipt?.method ?? "CBE"} />
          </div>
        </section>

        <section className="rounded-3xl bg-card p-5 shadow-card">
          <p className="font-bold">What happens next</p>
          <div className="mt-4 space-y-0">
            {steps.map(({ icon: Icon, title, text, done, active }, i) => (
              <div key={title} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${done ? "bg-success/15 text-success" : active ? "bg-accent text-accent-foreground" : "bg-secondary text-muted-foreground"}`}>
                    <Icon className="h-4 w-4" />
                  </span>
                  {i < steps.length - 1 && <span className={`h-8 w-px ${done ? "bg-success/40" : "bg-border"}`} />}
                </div>
                <div className="pb-3 pt-1">
                  <p className="text-sm font-bold">{title}</p>
                  <p className="text-xs text-muted-foreground">{text}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <div className="flex items-start gap-2 rounded-2xl bg-primary/5 p-4 text-xs text-muted-foreground">
          <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          Your bank number is hidden here for security. Only CAS admin can see the full account to process the payout.
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Link to="/wallet" className="press flex items-center justify-center gap-2 rounded-2xl bg-accent py-3.5 text-sm font-extrabold text-accent-foreground">
            Back to wallet
          </Link>
          <Link to="/" className="press flex items-center justify-center gap-2 rounded-2xl bg-secondary py-3.5 text-sm font-bold text-primary">
            Go home <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </div>
  );
}
