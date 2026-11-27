import type { ReactNode } from "react";
import { Check } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  packageName: string;
  pointsLabel?: string;
  pointsValue?: string;
  footer?: ReactNode;
};

/**
 * Purchase success card styled like a compact receipt:
 * cream header, seal check, red title and a soft grey details strip.
 */
export function PurchaseSuccessModal({
  open,
  onOpenChange,
  packageName,
  pointsLabel = "Get points",
  pointsValue = "x1",
  footer,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100%-2rem)] max-w-[320px] gap-0 overflow-hidden rounded-[28px] border-0 bg-card p-0 shadow-2xl">
        {/* Cream header */}
        <div className="relative bg-[#fbf4e4] px-6 pb-6 pt-7 text-center">
          <span className="mx-auto grid h-14 w-14 place-items-center rounded-full border-4 border-[#d8c9a3] bg-[#8a6d3b] text-white shadow-sm">
            <Check className="h-7 w-7" strokeWidth={3} />
          </span>
          <p className="mt-3 text-xs font-bold uppercase tracking-[0.2em] text-[#8a6d3b]">pay success!</p>
          <h2 className="mt-1 text-xl font-extrabold text-[#e23744]">{packageName}</h2>
        </div>

        {/* Details strip */}
        <div className="bg-[#f7f7f5] px-6 py-5 text-center">
          <p className="text-base font-extrabold text-primary">Congratulations!</p>
          <div className="mt-3 flex items-center justify-between rounded-xl bg-card px-4 py-3 text-left shadow-sm">
            <span className="text-sm font-semibold text-muted-foreground">{pointsLabel}</span>
            <span className="text-sm font-extrabold text-primary">{pointsValue}</span>
          </div>
        </div>

        {footer && <div className="grid grid-cols-2 gap-3 bg-card px-5 pb-5 pt-4">{footer}</div>}
      </DialogContent>
    </Dialog>
  );
}
