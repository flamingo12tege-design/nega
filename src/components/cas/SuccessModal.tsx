import type { ReactNode } from "react";
import { CheckCircle2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

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
export function SuccessModal({
  open,
  onOpenChange,
  title,
  description,
  badge,
  rows,
  footer,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100%-2rem)] max-w-md overflow-hidden rounded-[28px] border-0 p-0 text-center shadow-2xl">
        <div className="bg-gradient-to-b from-success/15 via-card to-card px-6 pb-6 pt-7">
          <div className="relative mx-auto w-fit">
            <span className="grid h-20 w-20 place-items-center rounded-full border-8 border-white bg-success text-white shadow-lg">
              <CheckCircle2 className="h-10 w-10" />
            </span>
          </div>
          <DialogHeader className="mt-5">
            <DialogTitle className="text-center text-2xl font-extrabold">
              {title}
            </DialogTitle>
            {description && (
              <DialogDescription className="mx-auto max-w-xs text-center text-sm">
                {description}
              </DialogDescription>
            )}
          </DialogHeader>
          {badge && (
            <span className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-success px-3 py-1.5 text-xs font-extrabold text-white">
              <CheckCircle2 className="h-3.5 w-3.5" />
              {badge}
            </span>
          )}
        </div>
        <div className="px-5 pb-5">
          {rows && rows.length > 0 && (
            <div className="divide-y rounded-2xl border bg-surface px-4 text-left">
              {rows.map((row) => (
                <div
                  key={row.label}
                  className="flex items-center justify-between gap-3 py-3"
                >
                  <span className="text-xs text-muted-foreground">
                    {row.label}
                  </span>
                  <span className="text-right text-sm font-extrabold">
                    {row.value}
                  </span>
                </div>
              ))}
            </div>
          )}
          <div className="mt-4 grid grid-cols-2 gap-3">{footer}</div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
