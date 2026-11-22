import { createFileRoute, Link } from "@tanstack/react-router";
import { PageHeader } from "@/components/cas/AppShell";

export const Route = createFileRoute("/offers")({
  head: () => ({ meta: [{ title: "Special Offers — CAS" }, { name: "description", content: "Current CAS special offers and promotions." }, { property: "og:title", content: "Special Offers — CAS" }, { property: "og:description", content: "Current CAS special offers and promotions." }] }),
  component: Page,
});

function Page() {
  return (
    <div>
      <PageHeader title="Special Offers" back />
      <div className="-mt-4 space-y-3 px-5">
        <div className="flex items-center justify-between gap-4 rounded-3xl bg-primary p-5 text-primary-foreground shadow-card">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-wider text-accent">Limited time</p>
            <p className="mt-1 text-lg font-extrabold">Invite 3 friends this month</p>
            <p className="text-sm opacity-75">Earn extra referral rewards on approval.</p>
          </div>
          <Link to="/team" className="press shrink-0 rounded-full bg-accent px-4 py-2 text-sm font-bold text-accent-foreground">Invite</Link>
        </div>
      </div>
    </div>
  );
}
