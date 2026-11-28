import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { CheckCircle2, Clock3, Home, Wallet } from "lucide-react";
import { etb } from "@/lib/format";
import { useEffect, useState } from "react";

export const Route = createFileRoute("/recharge_/success")({
  validateSearch: (search: Record<string, unknown>) => ({
    amount: Number(search["amount"]) || 0,
    method: String(search["method"] ?? "CBE"),
    proof:
      search["proof"] === true ||
      search["proof"] === "1" ||
      search["proof"] === "true",
    txn: String(search["txn"] ?? ""),
    approved:
      search["approved"] === true ||
      search["approved"] === "1" ||
      search["approved"] === "true",
  }),
  head: () => ({
    meta: [
      { title: "Recharge request submitted — CAS" },
      {
        name: "description",
        content: "Your CAS recharge request has been submitted for review.",
      },
      { property: "og:title", content: "Recharge request submitted — CAS" },
      {
        property: "og:description",
        content: "Your CAS recharge request has been submitted for review.",
      },
    ],
  }),
  component: Page,
});

const REDIRECT_SECONDS = 6;

function Row({ l, v }: { l: string; v: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-3">
      <span className="text-xs text-muted-foreground">{l}</span>
      <span className="min-w-0 truncate text-right text-sm font-semibold">
        {v}
      </span>
    </div>
  );
}

function Page() {
  const navigate = useNavigate();
  const { amount, method, proof, txn, approved } = Route.useSearch();
  const [seconds, setSeconds] = useState(REDIRECT_SECONDS);
  const proofLabel = [proof ? "Screenshot" : "", txn ? `Txn ${txn}` : ""]
    .filter(Boolean)
    .join(" · ");
  const progress = ((REDIRECT_SECONDS - seconds) / REDIRECT_SECONDS) * 100;

  useEffect(() => {
    if (seconds > 0) return;
    void navigate({ to: "/" });
  }, [navigate, seconds]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setSeconds((value) => Math.max(0, value - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className="relative min-h-dvh bg-surface">
      <div className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full bg-success/15 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 -right-24 h-72 w-72 rounded-full bg-accent/15 blur-3xl" />

      <div className="relative mx-auto flex min-h-dvh w-full max-w-md flex-col px-5 py-6">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-extrabold uppercase tracking-[0.2em] text-muted-foreground">
            Recharge
          </span>
          <Link
            to="/"
            className="press rounded-full bg-card px-3.5 py-1.5 text-xs font-bold text-primary shadow-card"
          >
            Close
          </Link>
        </div>

        <div className="rise mt-8 flex flex-col items-center text-center">
          <div className="relative">
            <span className="absolute inset-0 -z-10 scale-150 rounded-full bg-success/10 blur-2xl" />
            <span className="grid h-24 w-24 place-items-center rounded-full bg-success text-white shadow-lift ring-8 ring-success/10">
              <CheckCircle2 className="h-12 w-12" strokeWidth={2.2} />
            </span>
          </div>
          <h1 className="mt-5 text-[26px] font-extrabold leading-tight tracking-tight text-primary">
            Recharge submitted
          </h1>
          <p className="mt-2 max-w-xs text-sm leading-6 text-muted-foreground">
            {approved
              ? "Your payment was verified and your wallet has already been credited."
              : "We received your payment proof. Your wallet balance updates after our team verifies it."}
          </p>
          <span
            className={`mt-4 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-extrabold ${approved ? "bg-success/15 text-success" : "bg-warning/20 text-primary"}`}
          >
            {approved ? (
              <CheckCircle2 className="h-3.5 w-3.5" />
            ) : (
              <Clock3 className="h-3.5 w-3.5" />
            )}
            {approved ? "Approved" : "Pending review"}
          </span>
        </div>

        {amount > 0 && (
          <div className="rise mt-7 rounded-3xl bg-card p-5 shadow-card">
            <p className="text-center text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Amount sent
            </p>
            <p className="mt-1 text-center text-4xl font-extrabold tracking-tight text-primary tabular-nums">
              {etb(amount)}
            </p>
            <p className="mt-1 text-center text-xs text-muted-foreground">
              via {method}
            </p>

            <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-accent transition-[width] duration-1000 ease-linear"
                style={{ width: `${progress}%` }}
              />
            </div>

            <div className="mt-5 divide-y rounded-2xl bg-surface px-4 text-left">
              <Row l="Method" v={method} />
              <Row l="Payment proof" v={proofLabel || "Submitted"} />
              <Row l="Status" v={approved ? "Approved" : "Pending review"} />
              {txn && <Row l="Reference" v={txn} />}
            </div>
          </div>
        )}

        <div className="mt-auto pt-6">
          <div className="grid grid-cols-2 gap-3">
            <Link
              to="/wallet"
              className="press flex items-center justify-center gap-2 rounded-2xl bg-secondary py-3.5 text-sm font-bold text-primary"
            >
              <Wallet className="h-4 w-4" />
              My Wallet
            </Link>
            <Link
              to="/"
              className="press flex items-center justify-center gap-2 rounded-2xl bg-accent py-3.5 text-sm font-extrabold text-accent-foreground"
            >
              <Home className="h-4 w-4" />
              Back Home
            </Link>
          </div>
          <p className="mt-4 text-center text-xs text-muted-foreground">
            Returning home in {seconds} second{seconds === 1 ? "" : "s"}…
          </p>
        </div>
      </div>
    </div>
  );
}
