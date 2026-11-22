import { createFileRoute, Link } from "@tanstack/react-router";
import { CheckCircle2 } from "lucide-react";
import { etb } from "@/lib/format";

export const Route = createFileRoute("/recharge_/success")({
  validateSearch: (search: Record<string, unknown>) => ({
    amount: Number(search["amount"]) || 0,
    method: String(search["method"] ?? "CBE Birr"),
    proof: search["proof"] === true || search["proof"] === "1" || search["proof"] === "true",
    txn: String(search["txn"] ?? ""),
  }),
  head: () => ({ meta: [{ title: "Recharge request submitted — CAS" }, { name: "description", content: "Your CAS recharge request has been submitted for review." }, { property: "og:title", content: "Recharge request submitted — CAS" }, { property: "og:description", content: "Your CAS recharge request has been submitted for review." }] }),
  component: Page,
});

function Row({ l, v }: { l: string; v: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-3">
      <span className="text-xs text-muted-foreground">{l}</span>
      <span className="text-sm font-semibold">{v}</span>
    </div>
  );
}

function Page() {
  const { amount, method, proof, txn } = Route.useSearch();
  const proofLabel = [proof ? "Screenshot" : "", txn ? `Txn ${txn}` : ""].filter(Boolean).join(" · ");
  return (
    <div className="px-5 py-8 lg:py-12">
      <div className="mx-auto w-full max-w-md rounded-3xl bg-card p-6 text-center shadow-card">
        <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-success/15 text-success"><CheckCircle2 className="h-9 w-9" /></span>
        <h1 className="mt-4 text-xl font-extrabold">Recharge request submitted</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {amount > 0
            ? `${etb(amount)} via ${method}. We'll credit your wallet once your payment is verified.`
            : "We'll credit your wallet once your payment is verified."}
        </p>
        <span className="mt-3 inline-block rounded-full bg-warning/20 px-3 py-1 text-xs font-bold text-primary">Pending review</span>

        {amount > 0 && (
          <div className="mt-5 divide-y rounded-2xl bg-surface px-4 text-left">
            <Row l="Amount" v={etb(amount)} />
            <Row l="Method" v={method} />
            <Row l="Proof" v={proofLabel || "Submitted"} />
            <Row l="Status" v="Pending review" />
          </div>
        )}

        <Link to="/wallet" className="press mt-5 block w-full rounded-2xl bg-accent py-3.5 font-extrabold text-accent-foreground">Back to Wallet</Link>
        <Link to="/" className="press mt-2 block w-full rounded-2xl bg-secondary py-3 font-bold">Back to Home</Link>
        <p className="mt-4 text-xs text-muted-foreground">Proof received. Verification usually completes within 24 hours.</p>
      </div>
    </div>
  );
}
