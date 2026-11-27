import { Dialog, DialogContent } from "@/components/ui/dialog";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  amount: number;
  message?: string | undefined;
  title?: string | undefined;
  amountLabel?: string | undefined;
};

/** Compact confirmation card for gift codes and lucky wheel rewards. */
export function RedeemSuccessModal({
  open,
  onOpenChange,
  amount,
  message,
  title = "Congratulations",
  amountLabel: customAmountLabel,
}: Props) {
  const amountLabel = customAmountLabel ?? (amount > 0
    ? `ETB ${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : "Gift applied");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100%-2rem)] max-w-[320px] gap-0 overflow-hidden rounded-3xl border-0 bg-card p-0 shadow-2xl">
        <div className="px-6 pb-7 pt-9 text-center">
          <h2 className="text-xl font-extrabold text-foreground">{title}</h2>
          <p className="mt-4 text-2xl font-extrabold text-[#e23744]">{amountLabel}</p>
          {message && <p className="mt-2 text-sm text-muted-foreground">{message}</p>}
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="press mt-7 w-full rounded-full bg-[#0e7a4a] py-3.5 text-base font-bold text-white transition hover:bg-[#0b683e]"
          >
            Okay
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
