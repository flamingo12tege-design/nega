import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Check } from "lucide-react";
import cbeLogo from "@/assets/cbe-logo.svg";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { StatusPill } from "@/components/cas/StatusPill";
import { SuccessModal } from "@/components/cas/SuccessModal";
import { Lock } from "lucide-react";
import { etb } from "@/lib/format";
import { actions, getPackage, useStore } from "@/lib/store";

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
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [successOpen, setSuccessOpen] = useState(false);
  const allPurchases = useStore((s) => s.purchases);
  const locked = useStore((s) => s.lockedIds.includes(a.id));
  const purchases = allPurchases.filter((p) => p.applianceId === a.id);
  const purchaseLimitReached = purchases.length >= 2;

  const submit = () => {
    if (!actions.addPurchase(a.id, paymentMethod)) {
      toast.error("You can only request this package twice.");
      return;
    }
    setConfirmOpen(false);
    setSuccessOpen(true);
  };

  return (
    <div className="lg:grid lg:grid-cols-2 lg:gap-8 lg:p-8">
      <div className="relative bg-muted lg:overflow-hidden lg:rounded-3xl">
        <img src={a.image} alt={a.name} width={816} height={816} className="aspect-square w-full object-cover" />
        <Link to="/appliances" className="absolute left-4 top-4 rounded-full bg-background/90 px-3 py-1.5 text-sm font-semibold shadow-card">← Back</Link>
      </div>
      <div className="-mt-6 rounded-t-3xl bg-background p-5 lg:mt-0 lg:rounded-3xl lg:shadow-card">
        <span className="rounded-full bg-secondary px-2.5 py-1 text-xs font-bold text-primary">Tier {a.tier}</span>
        <h1 className="mt-3 text-2xl font-extrabold">{a.name}</h1>
        <p className="mt-1 text-muted-foreground">{a.short}</p>
        <p className="mt-4 text-3xl font-extrabold text-primary">{etb(a.price)}</p>
        <div className="mt-4 grid grid-cols-3 gap-2 rounded-2xl bg-secondary p-3">
          <div><p className="text-xs text-muted-foreground">Daily payout</p><p className="mt-1 text-sm font-bold">{etb(a.dailyPayout)}</p></div>
          <div><p className="text-xs text-muted-foreground">Monthly</p><p className="mt-1 text-sm font-bold">{etb(a.dailyPayout * 30)}</p></div>
          <div><p className="text-xs text-muted-foreground">90-day total</p><p className="mt-1 text-sm font-bold">{etb(a.dailyPayout * 90)}</p></div>
        </div>
        <ul className="mt-4 space-y-2">
          {a.details.map((d) => <li key={d} className="flex items-center gap-2 text-sm"><Check className="h-4 w-4 text-success" />{d}</li>)}
        </ul>

        {locked ? (
          <div className="mt-6 flex items-center gap-3 rounded-2xl bg-muted p-4"><Lock className="h-5 w-5 shrink-0 text-primary" /><div><p className="font-bold">This package is locked</p><p className="text-sm text-muted-foreground">It will open soon. Stay tuned for updates.</p></div></div>
        ) : (
          <>
            <button disabled={purchaseLimitReached} onClick={() => setConfirmOpen(true)} className={`press mt-6 w-full rounded-2xl py-4 font-extrabold ${purchaseLimitReached ? "cursor-not-allowed bg-muted text-muted-foreground" : "bg-accent text-accent-foreground"}`}>{purchaseLimitReached ? "Purchase limit reached" : "Buy Now"}</button>
            {purchaseLimitReached && <p className="mt-2 text-center text-xs text-muted-foreground">This package has reached its limit of 2 requests.</p>}
          </>
        )}

        <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <DialogContent className="w-[calc(100%-2rem)] max-w-md rounded-3xl p-5">
            <DialogHeader>
              <DialogTitle>Confirm purchase</DialogTitle>
              <DialogDescription>Review your package and payment method.</DialogDescription>
            </DialogHeader>
            <div className="rounded-xl border border-accent bg-accent/10 px-3 py-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-primary">
                <img src={cbeLogo} alt="" className="h-6 w-6 object-contain" />
                {paymentMethod}
                <Check className="ml-auto h-4 w-4" />
              </div>
            </div>
            <div className="flex justify-between text-sm">
              <span>Total</span>
              <span className="font-extrabold">{etb(a.price)}</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => setConfirmOpen(false)} className="press rounded-xl bg-secondary py-3 font-bold">Cancel</button>
              <button onClick={submit} className="press rounded-xl bg-primary py-3 font-bold text-primary-foreground">Submit request</button>
            </div>
          </DialogContent>
        </Dialog>

        <SuccessModal
          open={successOpen}
          onOpenChange={setSuccessOpen}
          title="Purchase request submitted"
          description="We'll notify you once it's processed."
          badge="Pending review"
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

        {purchases.length > 0 && (
          <div className="mt-6">
            <p className="text-sm font-bold">Your requests</p>
            {purchases.map((p) => (
              <div key={p.id} className="mt-2 flex items-center justify-between rounded-xl bg-muted px-3 py-2 text-sm">
                <span>{p.method}</span><StatusPill s={p.status} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

