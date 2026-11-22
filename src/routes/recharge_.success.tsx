import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { CheckCircle2 } from "lucide-react";
import { etb } from "@/lib/format";
import { useEffect, useState } from "react";

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
  const navigate = useNavigate();
  const { amount, method, proof, txn } = Route.useSearch();
  const [seconds, setSeconds] = useState(5);
  const proofLabel = [proof ? "Screenshot" : "", txn ? `Txn ${txn}` : ""].filter(Boolean).join(" · ");

  useEffect(() => {
    const timer = window.setInterval(() => {
      setSeconds((value) => {
        if (value <= 1) {
          window.clearInterval(timer);
          void navigate({ to: "/" });
          return 0;
        }
        return value - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [navigate]);

  return (
    <div className="fixed inset-0 z-[100] grid min-h-dvh place-items-center overflow-hidden bg-surface px-5 py-8">
      <div className="pointer-events-none absolute -left-28 -top-24 h-80 w-80 rounded-full bg-success/15 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-28 -right-20 h-80 w-80 rounded-full bg-primary/10 blur-3xl" />
      <div className="rise relative w-full max-w-md overflow-hidden rounded-[28px] border border-white/70 bg-card text-center shadow-lift">
        <div className="bg-gradient-to-b from-success/15 to-card px-6 pb-5 pt-7">
          <div className="relative mx-auto w-fit">
            <span className="grid h-20 w-20 place-items-center rounded-full border-8 border-white bg-success text-white shadow-lg">
              <CheckCircle2 className="h-10 w-10" />
            </span>
            <span className="absolute -right-2 -top-2 grid h-7 w-7 place-items-center rounded-full bg-accent text-[11px] font-extrabold text-accent-foreground">{seconds}</span>
          </div>
          <h1 className="mt-5 text-2xl font-extrabold tracking-tight text-primary">Recharge submitted</h1>
          <p className="mx-auto mt-2 max-w-xs text-sm leading-6 text-muted-foreground">
            Your payment proof is under review. Your wallet balance will update after verification.
          </p>
          <span className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-warning/20 px-3 py-1.5 text-xs font-extrabold text-primary">
            Pending review
          </span>
        </div>

        {amount > 0 && (
          <div className="px-5 pb-5">
            <div className="divide-y rounded-2xl border bg-surface px-4 text-left">
              <Row l="Amount" v={etb(amount)} />
              <Row l="Method" v={method} />
              <Row l="Proof" v={proofLabel || "Submitted"} />
              <Row l="Status" v="Pending review" />
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <Link to="/wallet" className="press rounded-xl bg-secondary py-3 text-sm font-bold text-primary">My Wallet</Link>
              <Link to="/" className="press rounded-xl bg-accent py-3 text-sm font-bold text-accent-foreground">Back Home</Link>
            </div>
            <p className="mt-4 text-xs text-muted-foreground">Returning home in {seconds} second{seconds === 1 ? "" : "s"}...</p>
          </div>
        )}
      </div>
    </div>
  );
}
