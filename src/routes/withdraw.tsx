import { createFileRoute } from "@tanstack/react-router";
import { useStore } from "@/lib/store";
import { PageHeader } from "@/components/cas/AppShell";
import { MoneyForm } from "@/components/cas/MoneyForm";

export const Route = createFileRoute("/withdraw")({
  head: () => ({ meta: [{ title: "Withdraw — CAS" }, { name: "description", content: "Withdraw funds from your CAS wallet." }, { property: "og:title", content: "Withdraw — CAS" }, { property: "og:description", content: "Withdraw funds from your CAS wallet." }] }),
  component: Page,
});

function Page() {
  const balance = useStore((s) => s.walletBalance);
  const payoutAccount = useStore((s) => s.payoutAccount);
  return (
    <div>
      <PageHeader title="Withdraw" subtitle="Transfer your available balance" back />
      <MoneyForm kind="Withdraw" max={balance} payoutAccount={payoutAccount} />
    </div>
  );
}
