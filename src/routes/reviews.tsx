import { createFileRoute } from "@tanstack/react-router";
import { Quote } from "lucide-react";
import { testimonials } from "@/lib/mock-data";
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
        {testimonials.map((t) => (
          <figure key={t.name} className="rounded-2xl bg-card p-4 shadow-card">
            <Quote className="h-5 w-5 text-accent" />
            <blockquote className="mt-2 text-sm">{t.text}</blockquote>
            <figcaption className="mt-3 text-xs font-bold">{t.name} · <span className="font-normal text-muted-foreground">{t.city}</span></figcaption>
          </figure>
        ))}
      </div>
    </div>
  );
}
