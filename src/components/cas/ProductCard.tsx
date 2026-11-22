import { Link } from "@tanstack/react-router";
import { Lock } from "lucide-react";
import { type Appliance } from "@/lib/mock-data";
import { etb } from "@/lib/format";
import { useStore } from "@/lib/store";

export function ProductCard({ a }: { a: Appliance }) {
  const locked = useStore((s) => s.lockedIds.includes(a.id));
  return (
    <Link to="/appliances/$id" params={{ id: a.id }} className="press group flex flex-col overflow-hidden rounded-2xl bg-card shadow-card">
      <div className="relative aspect-square overflow-hidden bg-muted">
        <img src={a.image} alt={a.name} loading="lazy" width={816} height={816} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
        {locked && <div className="absolute inset-0 grid place-items-center bg-primary/55 backdrop-blur-[2px]"><span className="grid h-12 w-12 place-items-center rounded-full bg-background text-primary"><Lock className="h-5 w-5" /></span></div>}
        <span className="absolute left-2 top-2 rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold text-primary-foreground">Tier {a.tier}</span>
      </div>
      <div className="flex flex-1 flex-col p-3">
        <h3 className="line-clamp-1 text-sm font-bold">{a.name}</h3>
        <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{a.short}</p>
        <p className="mt-2 text-base font-extrabold text-primary">{etb(a.price)}</p>
        <p className="mt-1 text-[11px] font-semibold text-muted-foreground">{etb(a.dailyPayout)} daily payout</p>
        {locked
          ? <span className="mt-2 flex items-center justify-center gap-1 rounded-xl bg-muted py-2 text-xs font-bold text-muted-foreground"><Lock className="h-3 w-3" />Locked</span>
          : <span className="mt-2 rounded-xl bg-accent py-2 text-center text-xs font-bold text-accent-foreground">Buy Now</span>}
      </div>
    </Link>
  );
}
