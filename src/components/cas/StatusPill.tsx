import { Check, Clock, XCircle } from "lucide-react";

export function StatusPill({ s }: { s: "Pending" | "Approved" | "Rejected" }) {
  const map = { Pending: ["bg-warning/20 text-primary", Clock], Approved: ["bg-success/15 text-success", Check], Rejected: ["bg-destructive/10 text-destructive", XCircle] } as const;
  const [cls, Icon] = map[s];
  return <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold ${cls}`}><Icon className="h-3 w-3" />{s}</span>;
}
