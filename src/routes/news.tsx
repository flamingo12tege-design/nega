import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { fmtDate } from "@/lib/format";
import { useStore } from "@/lib/store";
import { PageHeader } from "@/components/cas/AppShell";

export const Route = createFileRoute("/news")({
  head: () => ({ meta: [{ title: "News — CAS" }, { name: "description", content: "CAS announcements, product updates and promotions." }, { property: "og:title", content: "News — CAS" }, { property: "og:description", content: "CAS announcements, product updates and promotions." }] }),
  component: Page,
});

function Page() {
  const news = useStore((s) => s.news);
  const [open, setOpen] = useState<string | null>(news[0]?.id ?? null);
  return (
    <div>
      <PageHeader title="News" subtitle="Announcements & updates" back />
      <div className="-mt-4 grid gap-4 px-5 sm:grid-cols-2">
        {news.map((n) => (
          <article key={n.id} className="overflow-hidden rounded-2xl bg-card shadow-card">
            <img src={n.image} alt="" loading="lazy" className="aspect-video w-full object-cover" />
            <div className="p-4">
              <p className="text-xs font-semibold text-accent">{n.tag} · {fmtDate(n.date)}</p>
              <h2 className="mt-1 font-extrabold">{n.title}</h2>
              {open === n.id ? <p className="rise mt-2 text-sm text-muted-foreground">{n.body}</p> : null}
              <button onClick={() => setOpen(open === n.id ? null : n.id)} className="mt-3 text-sm font-bold text-primary">{open === n.id ? "Show less" : "Read more"}</button>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
