import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/cas/AppShell";

export const Route = createFileRoute("/reviews")({
  head: () => ({ meta: [{ title: "Customer Experiences — CAS" }, { name: "description", content: "What CAS customers say about us." }, { property: "og:title", content: "Customer Experiences — CAS" }, { property: "og:description", content: "What CAS customers say about us." }] }),
  component: Page,
});

function Page() {
  return (
    <div>
      <PageHeader title="Customer Experiences" back />
      <div className="-mt-4 grid gap-3 px-5 sm:grid-cols-3">
        {/* No testimonials to display */}
      </div>
    </div>
  );
}
