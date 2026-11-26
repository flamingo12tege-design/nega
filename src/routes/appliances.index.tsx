import { createFileRoute } from "@tanstack/react-router";
import { useStore } from "@/lib/store";
import { PageHeader } from "@/components/cas/AppShell";
import { ProductCard } from "@/components/cas/ProductCard";

export const Route = createFileRoute("/appliances/")({
  head: () => ({ meta: [{ title: "Appliances — CAS" }, { name: "description", content: "Browse eight CAS appliance packages from ETB 1,300 to ETB 300,000." }, { property: "og:title", content: "Appliances — CAS" }, { property: "og:description", content: "Browse eight CAS appliance packages from ETB 1,300 to ETB 300,000." }] }),
  component: Page,
});

function Page() {
  const packages = useStore((s) => s.packages);
  return (
    <div>
      <PageHeader title="Appliances" subtitle="Packages for every home" />
      <div className="-mt-4 grid grid-cols-2 gap-3 px-5 sm:grid-cols-3 lg:grid-cols-4">
        {packages.map((a) => <ProductCard key={a.id} a={a} />)}
      </div>
      <p className="mt-6 px-5 text-center text-xs text-muted-foreground">Package contents are confirmed by CAS before each purchase is approved.</p>
    </div>
  );
}
