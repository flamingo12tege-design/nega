import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/cas/AppShell";
import { MoneyForm } from "@/components/cas/MoneyForm";

export const Route = createFileRoute("/recharge")({
  head: () => ({ meta: [{ title: "Recharge — CAS" }, { name: "description", content: "Add funds to your CAS wallet." }, { property: "og:title", content: "Recharge — CAS" }, { property: "og:description", content: "Add funds to your CAS wallet." }] }),
  component: Page,
});

const steps = [
  "Enter an amount and tap Recharge.",
  "Send it to the CBE account shown on the next screen.",
  "Submit a screenshot or the SMS transaction number.",
  "Your wallet is credited after the payment is verified.",
];

function Page() {
  return (
    <div>
      <PageHeader title="Recharge" subtitle="Add funds to your wallet" back />
      <MoneyForm kind="Recharge" />
      <section className="mx-5 mt-5 rounded-2xl bg-card p-4 shadow-card">
        <p className="font-bold">How recharge works</p>
        <ol className="mt-3 space-y-2.5">
          {steps.map((step, i) => (
            <li key={step} className="flex items-start gap-3 text-sm text-muted-foreground">
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-secondary text-xs font-bold text-primary">{i + 1}</span>
              <span className="pt-0.5">{step}</span>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
