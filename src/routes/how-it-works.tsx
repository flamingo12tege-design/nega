import { createFileRoute } from "@tanstack/react-router";
import { ShoppingBag, CheckCircle2, Share2 } from "lucide-react";
import { PageHeader } from "@/components/cas/AppShell";

export const Route = createFileRoute("/how-it-works")({
  head: () => ({ meta: [{ title: "How CAS Works — CAS" }, { name: "description", content: "Choose a package, confirm your request, invite friends and earn." }, { property: "og:title", content: "How CAS Works — CAS" }, { property: "og:description", content: "Choose a package, confirm your request, invite friends and earn." }] }),
  component: Page,
});

const steps = [
  { icon: ShoppingBag, t: "Choose a package", d: "Pick from eight VIP levels." },
  { icon: CheckCircle2, t: "Confirm your request", d: "We review and process each purchase." },
  { icon: Share2, t: "Invite & earn", d: "Share your link and earn eligible rewards." },
];

function Page() {
  return (
    <div>
      <PageHeader title="How CAS Works" back />
      <div className="-mt-4 grid gap-3 px-5 sm:grid-cols-3">
        {steps.map(({ icon: Icon, t, d }, k) => (
          <div key={t} className="flex gap-3 rounded-2xl bg-card p-4 shadow-card">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-secondary font-extrabold text-primary">{k + 1}</span>
            <div><p className="flex items-center gap-1.5 font-bold"><Icon className="h-4 w-4 text-accent" />{t}</p><p className="text-sm text-muted-foreground">{d}</p></div>
          </div>
        ))}
      </div>
    </div>
  );
}
