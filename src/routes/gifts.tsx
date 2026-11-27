import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Gift, TicketPercent, Sparkles } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { etb } from "@/lib/format";
import { PageHeader } from "@/components/cas/AppShell";

export const Route = createFileRoute("/gifts")({
  head: () => ({
    meta: [
      { title: "Redeem Gift Code — CAS" },
      { name: "description", content: "Redeem your CAS gift code and receive your reward." },
      { property: "og:title", content: "Redeem Gift Code — CAS" },
      { property: "og:description", content: "Redeem your CAS gift code and receive your reward." },
    ],
  }),
  component: Page,
});

type RedeemResult = {
  amount?: number;
  message?: string;
};

function Page() {
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const normalized = code.trim().toUpperCase();
    if (!normalized) {
      toast.error("Enter a gift code");
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.rpc("redeem_gift_code", { p_code: normalized });

      if (error) {
        const message = error.message ?? "Could not redeem this gift code.";
        if (/could not find the function|does not exist|unknown function/i.test(message)) {
          toast.error("Gift code redemption is not available yet", {
            description: "Please run the gift code SQL setup in Supabase.",
          });
          return;
        }
        if (/already redeemed|already used/i.test(message)) {
          toast.error("Gift code already used", { description: "This code has already been redeemed." });
          return;
        }
        if (/invalid|not found|expired/i.test(message)) {
          toast.error("Invalid gift code", { description: "Check the code and try again." });
          return;
        }
        toast.error("Could not redeem gift code", { description: message });
        return;
      }

      const result = (data && typeof data === "object" ? data : {}) as RedeemResult;
      const amount = Number(result.amount);
      const hasAmount = Number.isFinite(amount) && amount > 0;

      toast.success("Gift code redeemed", {
        description: hasAmount
          ? `${etb(amount)} has been added to your account.`
          : result.message || "Your gift has been applied successfully.",
      });
      setCode("");
    } catch {
      toast.error("Could not redeem gift code", { description: "Please try again." });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <PageHeader title="Gifts" subtitle="Redeem your gift code" back />

      <div className="-mt-4 space-y-4 px-5">
        <section className="relative overflow-hidden rounded-3xl bg-primary p-6 text-primary-foreground shadow-card">
          <div className="pointer-events-none absolute -right-10 -top-10 h-36 w-36 rounded-full bg-accent/20 blur-3xl" />
          <span className="relative grid h-14 w-14 place-items-center rounded-2xl bg-accent/15 text-accent">
            <Gift className="h-7 w-7" />
          </span>
          <p className="relative mt-4 text-[11px] font-extrabold uppercase tracking-[0.2em] text-accent">Gift code</p>
          <h2 className="relative mt-1 text-2xl font-extrabold tracking-tight">Redeem your reward</h2>
          <p className="relative mt-2 max-w-sm text-sm text-primary-foreground/75">
            Enter your gift code below to claim your CAS reward.
          </p>
        </section>

        <section className="rounded-3xl bg-card p-5 shadow-card">
          <form onSubmit={submit} className="space-y-4">
            <label className="block">
              <span className="text-sm font-semibold">Gift code</span>
              <div className="mt-2 flex items-center gap-3 rounded-2xl border bg-surface px-4 py-3 focus-within:border-accent">
                <TicketPercent className="h-5 w-5 shrink-0 text-muted-foreground" />
                <input
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  placeholder="Enter gift code"
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  className="w-full bg-transparent text-sm font-semibold outline-none placeholder:font-normal placeholder:text-muted-foreground"
                />
              </div>
            </label>

            <button
              type="submit"
              disabled={loading || !code.trim()}
              className="press w-full rounded-2xl bg-accent py-4 font-extrabold text-accent-foreground disabled:opacity-60"
            >
              {loading ? "Redeeming..." : "Redeem code"}
            </button>
          </form>
        </section>

        <section className="rounded-2xl bg-card p-4 shadow-card">
          <div className="flex items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-secondary text-primary">
              <Sparkles className="h-5 w-5" />
            </span>
            <div>
              <p className="font-bold">How it works</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Gift codes can be redeemed once. After a successful redemption, your reward is added to your account.
              </p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
