import { createFileRoute, Link, notFound, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Check, Lock, WalletCards, X } from "lucide-react";
import { etb } from "@/lib/format";
import { rewardRules } from "@/lib/mock-data";
import { actions, getPackage, useStore, MAX_PURCHASES_PER_PACKAGE } from "@/lib/store";
import { SuccessModal } from "@/components/cas/SuccessModal";
import { supabase } from "@/lib/supabase";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export const Route = createFileRoute("/appliances/$id")({
  loader: ({ params }) => {
    const a = getPackage(params.id);
    if (!a) throw notFound();
    return a;
  },
  head: ({ loaderData }) => ({
    meta: [
      { title: `${loaderData?.name ?? "Appliance"} — CAS` },
      { name: "description", content: loaderData?.short ?? "CAS appliance package" },
      { property: "og:title", content: `${loaderData?.name ?? "Appliance"} — CAS` },
      { property: "og:description", content: loaderData?.short ?? "CAS appliance package" },
    ],
  }),
  component: Page,
});

const paymentMethod = "CBE Birr";

function Page() {
  const a = Route.useLoaderData();
  const [successOpen, setSuccessOpen] = useState(false);
  const [purchasing, setPurchasing] = useState(false);
  const [insufficientOpen, setInsufficientOpen] = useState(false);
  const locked = useStore((s) => s.lockedIds.includes(a.id));
  const navigate = useNavigate();

  const purchase = async () => {
    if (purchasing) return;
    setPurchasing(true);

    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session) {
      toast.error("Please log in first");
      setPurchasing(false);
      return;
    }

    const { data: ownedData } = await supabase
      .from("purchases")
      .select("id,package_id,status")
      .eq("user_id", sessionData.session.user.id)
      .eq("package_id", a.id);
    const approvedCount = (ownedData ?? []).filter((p) => p.status === "approved").length;
    if (approvedCount >= MAX_PURCHASES_PER_PACKAGE) {
      setPurchasing(false);
      toast.error(`You can only buy this package ${MAX_PURCHASES_PER_PACKAGE} times.`);
      return;
    }

    const { error } = await supabase.rpc("purchase_package", { p_package_id: a.id });
    setPurchasing(false);

    if (error) {
      if (error.message.includes("Insufficient balance") || error.message.includes("insufficient balance")) {
        setInsufficientOpen(true);
        return;
      }
      toast.error("Purchase failed", { description: error.message });
      return;
    }

    setSuccessOpen(true);
  };

  return (
    <div className="lg:grid lg:grid-cols-2 lg:gap-8 lg:p-8">
      <div className="relative bg-muted lg:overflow-hidden lg:rounded-3xl">
        <img src={a.image} alt={a.name} width={816} height={816} className="aspect-square w-full object-cover" />
        <Link to="/appliances" className="absolute left-4 top-4 rounded-full bg-background/90 px-3 py-1.5 text-sm font-semibold shadow-card">← Back</Link>
      </div>
      <div className="-mt-6 rounded-t-3xl bg-background p-5 lg:mt-0 lg:rounded-3xl lg:shadow-card">
        <span className="rounded-full bg-secondary px-2.5 py-1 text-xs font-bold text-primary">VIP {a.tier}</span>
        <h1 className="mt-3 text-2xl font-extrabold">{a.name}</h1>
        <p className="mt-1 text-muted-foreground">{a.short}</p>
        <p className="mt-4 text-3xl font-extrabold text-primary">{etb(a.price)}</p>
        <div className="mt-4 grid grid-cols-3 gap-2 rounded-2xl bg-secondary p-3">
          <div><p className="text-xs text-muted-foreground">Daily payout</p><p className="mt-1 text-sm font-bold">{etb(a.dailyPayout)}</p></div>
          <div><p className="text-xs text-muted-foreground">Monthly</p><p className="mt-1 text-sm font-bold">{etb(a.dailyPayout * 30)}</p></div>
          <div><p className="text-xs text-muted-foreground">{rewardRules.packageDurationDays}-day total</p><p className="mt-1 text-sm font-bold">{etb(a.dailyPayout * rewardRules.packageDurationDays)}</p></div>
        </div>
        <ul className="mt-4 space-y-2">
          {a.details.map((d) => <li key={d} className="flex items-center gap-2 text-sm"><Check className="h-4 w-4 text-success" />{d}</li>)}
        </ul>

        {locked ? (
          <div className="mt-6 flex items-center gap-3 rounded-2xl bg-muted p-4"><Lock className="h-5 w-5 shrink-0 text-primary" /><div><p className="font-bold">This package is locked</p><p className="text-sm text-muted-foreground">It will open soon. Stay tuned for updates.</p></div></div>
        ) : (
          <button disabled={purchasing} onClick={purchase} className={`press mt-6 w-full rounded-2xl py-4 font-extrabold ${purchasing ? "cursor-not-allowed bg-muted text-muted-foreground" : "bg-accent text-accent-foreground"}`}>{purchasing ? "Processing..." : "Buy Now"}</button>
        )}
      </div>
      <SuccessModal
        open={successOpen}
        onOpenChange={setSuccessOpen}
        title="Purchase successful"
        description="The package was paid for with your wallet balance."
        badge="Completed"
        rows={[
          { label: "Package", value: a.name },
          { label: "Amount", value: etb(a.price) },
          { label: "Payment method", value: paymentMethod },
        ]}
        footer={
          <>
            <button onClick={() => setSuccessOpen(false)} className="press rounded-xl bg-secondary py-3 font-bold">Done</button>
            <Link to="/wallet" onClick={() => setSuccessOpen(false)} className="press rounded-xl bg-accent py-3 text-center font-bold text-accent-foreground">My purchases</Link>
          </>
        }
      />

      <Dialog open={insufficientOpen} onOpenChange={setInsufficientOpen}>
        <DialogContent className="w-[calc(100vw-2rem)] max-w-[425px] gap-4 border bg-background p-6 shadow-lg">
          <DialogHeader>
            <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-warning/20 text-primary"><WalletCards className="h-8 w-8" /></span>
            <DialogTitle className="mt-4 text-center text-2xl font-extrabold text-primary">Insufficient balance</DialogTitle>
            <DialogDescription className="mt-2 text-center text-sm leading-6 text-muted-foreground">
              Recharge at least{" "}
              <span className="font-extrabold text-foreground">{etb(a.price)}</span> to buy this package.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-6 grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setInsufficientOpen(false)}
              className="press rounded-xl bg-secondary py-3.5 text-sm font-bold text-primary"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => navigate({ to: "/recharge" })}
              className="press rounded-xl bg-accent py-3.5 text-sm font-bold text-accent-foreground"
            >
              Recharge
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

