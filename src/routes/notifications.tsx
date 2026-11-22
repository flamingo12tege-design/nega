import { createFileRoute } from "@tanstack/react-router";
import { Bell } from "lucide-react";
import { notifications } from "@/lib/mock-data";
import { fmtDate } from "@/lib/format";
import { PageHeader } from "@/components/cas/AppShell";

export const Route = createFileRoute("/notifications")({
  head: () => ({ meta: [{ title: "Notifications — CAS" }, { name: "description", content: "Your latest CAS updates." }, { property: "og:title", content: "Notifications — CAS" }, { property: "og:description", content: "Your latest CAS updates." }] }),
  component: Page,
});

function Page() {
  return (
    <div>
      <PageHeader title="Notifications" back />
      <div className="-mt-4 mx-5 divide-y overflow-hidden rounded-2xl bg-card shadow-card">
        {notifications.map((n) => (
          <div key={n.id} className="flex gap-3 p-4">
            <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-full ${n.unread ? "bg-accent text-accent-foreground" : "bg-muted text-muted-foreground"}`}><Bell className="h-4 w-4" /></span>
            <div className="min-w-0"><p className="font-bold">{n.title}</p><p className="text-sm text-muted-foreground">{n.body}</p><p className="mt-1 text-xs text-muted-foreground">{fmtDate(n.date)}</p></div>
          </div>
        ))}
      </div>
    </div>
  );
}
