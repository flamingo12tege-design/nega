import type { ReactNode } from "react";
import { CheckCircle2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export type SuccessRow = { label: string; value: string };

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: ReactNode | undefined;
  badge?: string | undefined;
  rows?: SuccessRow[] | undefined;
  footer?: ReactNode | undefined;
};

/** Shared success card for claims and purchase requests. Errors keep using toasts. */
export function SuccessModal({ open, onOpenChange, title, description, badge, rows, footer }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100%-2rem)] max-w-md rounded-3xl p-6 text-center">
        <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-success/15 text-success">
          <CheckCircle2 className="h-9 w-9" />
        </span>
        <DialogHeader>
          <DialogTitle className="text-center text-xl">{title}</DialogTitle>
          {description && <DialogDescription className="text-center">{description}</DialogDescription>}
        </DialogHeader>
        {badge && <span className="mx-auto inline-block rounded-full bg-warning/20 px-3 py-1 text-xs font-bold text-primary">{badge}</span>}
        {rows && rows.length > 0 && (
          <div className="divide-y rounded-2xl bg-surface px-4 text-left">
            {rows.map((row) => (
              <div key={row.label} className="flex items-center justify-between gap-3 py-2.5">
                <span className="text-xs text-muted-foreground">{row.label}</span>
                <span className="text-sm font-bold">{row.value}</span>
              </div>
            ))}
          </div>
        )}
        <div className="mt-2 grid grid-cols-2 gap-2">{footer}</div>
      </DialogContent>
    </Dialog>
  );
}
