import { createFileRoute, Link } from "@tanstack/react-router";
import { CheckCircle2 } from "lucide-react";
import { rewardRules } from "@/lib/mock-data";
import { etb } from "@/lib/format";

export const Route = createFileRoute("/withdraw_/success")({
  validateSearch: (search: Record<string, unknown>) => ({
    amount: Number(search["amount"]) || 0,
    account: String(search["account"] ?? ""),
    method: String(search["method"] ?? "CBE"),
  }),
  head: () => ({ meta: [{ title: "Withdraw request submitted — CAS" }, { name: "description", content: "Your CAS withdrawal request has been submitted for review." }, { property: "og:title", content: "Withdraw request submitted — CAS" }, { property: "og:description", content: "Your CAS withdrawal request has been submitted for review." }] }),
  component: Page,
});

function Row({ l, v, strong }: { l: string; v: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 py-3">
      <span className="text-xs text-muted-foreground">{l}</span>
      <span className={strong ? "text-sm font-extrabold text-primary" : "text-sm font-semibold"}>{v}</span>
    </div>
  );
}

function Page() {
  const { amount, account, method } = Route.useSearch();
  const fee = (amount * rewardRules.withdrawalFeePercent) / 100;
  const receive = amount - fee;
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-5 py-8">
      <div className="w-full rounded-3xl bg-card p-6 text-center shadow-card">
        <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-success/15 text-success"><CheckCircle2 className="h-9 w-9" /></span>
        <h1 className="mt-4 text-xl font-extrabold">Withdraw request submitted</h1>
        {amount > 0 ? (
          <p className="mt-1 text-sm text-muted-foreground">
            {etb(amount)} to CBE {account} via {method} — {etb(fee)} fee; you receive {etb(receive)}.
          </p>
        ) : (
          <p className="mt-1 text-sm text-muted-foreground">Your withdrawal request is pending review.</p>
        )}
        <span className="mt-3 inline-block rounded-full bg-warning/20 px-3 py-1 text-xs font-bold text-primary">Pending review</span>

        {amount > 0 && (
          <div className="mt-5 divide-y rounded-2xl bg-surface px-4 text-left">
            <Row l="Amount" v={etb(amount)} />
            <Row l={`Fee (${rewardRules.withdrawalFeePercent}%)`} v={`− ${etb(fee)}`} />
            <Row l="You receive" v={etb(receive)} strong />
            <Row l="To" v={`CBE ${account}`} />
            <Row l="Method" v={method} />
          </div>
        )}

        <Link to="/wallet" className="press mt-5 block w-full rounded-2xl bg-accent py-3.5 font-extrabold text-accent-foreground">Back to Wallet</Link>
        <Link to="/" className="press mt-2 block w-full rounded-2xl bg-secondary py-3 font-bold">Back to Home</Link>
        <p className="mt-4 text-xs text-muted-foreground">Your balance is updated after the request is reviewed.</p>
      </div>
    </div>
  );
}
