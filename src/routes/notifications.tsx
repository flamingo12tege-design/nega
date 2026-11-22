import { createFileRoute } from "@tanstack/react-router";
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
        <div className="p-4 text-center text-muted-foreground">
          No notifications yet.
        </div>
      </div>
    </div>
  );
}
