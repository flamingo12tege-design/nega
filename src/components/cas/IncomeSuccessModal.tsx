import { Check } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string | undefined;
  amount: number;
  label?: string | undefined;
  note?: string | undefined;
};

/** Compact green confirmation card for claimed income / task rewards. */
export function IncomeSuccessModal({
  open,
  onOpenChange,
  title = "Income!",
  amount,
  label,
  note,
}: Props) {
  const amountLabel = `ETB ${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100%-2rem)] max-w-[320px] gap-0 overflow-hidden rounded-3xl border-0 bg-card p-0 shadow-2xl">
        <div className="px-6 pb-7 pt-8 text-center">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-full border-4 border-[#a9d8bf] bg-[#0e7a4a] text-white shadow-sm">
            <Check className="h-6 w-6" strokeWidth={3} />
          </span>
          <h2 className="mt-4 text-lg font-extrabold text-foreground">{title}</h2>
          <p className="mt-3 text-2xl font-extrabold text-primary">{amountLabel}</p>
          {label && <p className="mt-1 text-xs font-semibold text-muted-foreground">{label}</p>}
          {note && <p className="mt-2 text-xs text-muted-foreground">{note}</p>}
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="press mt-7 w-full rounded-full bg-[#0e7a4a] py-3.5 text-base font-bold text-white transition hover:bg-[#0b683e]"
          >
            Ok
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
