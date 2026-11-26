import { Gift, Sparkles, CalendarCheck, UserPlus, ArrowUpFromLine, X } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { etb } from "@/lib/format";
import { rewardRules } from "@/lib/mock-data";

/**
 * Announcement shown right after a member creates their account.
 * `credited` is true when the welcome bonus was actually added to the wallet.
 */
export function WelcomeModal({
  credited,
  memberId,
  onContinue,
  continueLabel = "Continue",
}: {
  credited: boolean;
  memberId?: string | undefined;
  onContinue: () => void;
  continueLabel?: string;
}) {
  const bonus = rewardRules.registrationBonus;
  // Portals only exist in the browser, so wait until after hydration.
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const highlights = [
    { icon: CalendarCheck, title: "Claim daily income", text: "Collect your package payout every day." },
    { icon: UserPlus, title: "Invite and earn", text: "Get bonuses and commissions from your team." },
    { icon: ArrowUpFromLine, title: "Withdraw anytime", text: "Your deposits and earnings are withdrawable." },
  ];

  if (!mounted) return null;

  // Rendered through a portal so the animated page layout cannot offset it.
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-5">
      <div className="absolute inset-0 bg-black/55 backdrop-blur-sm" aria-hidden="true" />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="welcome-title"
        className="rise relative max-h-[92dvh] w-full max-w-sm overflow-y-auto rounded-t-3xl bg-card shadow-lift sm:rounded-3xl"
      >
        <div className="relative overflow-hidden bg-primary px-6 pb-8 pt-7 text-center text-primary-foreground">
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.14]"
            style={{ backgroundImage: "radial-gradient(circle at 1px 1px, white 1px, transparent 0)", backgroundSize: "20px 20px" }}
          />
          <div className="pointer-events-none absolute -right-10 -top-12 h-40 w-40 rounded-full bg-accent/25 blur-3xl" />

          <button
            type="button"
            onClick={onContinue}
            aria-label="Close"
            className="press absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-full bg-white/10 text-primary-foreground"
          >
            <X className="h-4 w-4" />
          </button>

          <span className="relative mx-auto grid h-16 w-16 place-items-center rounded-full bg-accent text-accent-foreground shadow-card">
            <Gift className="h-7 w-7" />
          </span>
          <p className="relative mt-4 flex items-center justify-center gap-1.5 text-[11px] font-extrabold uppercase tracking-[0.2em] text-accent">
            <Sparkles className="h-3.5 w-3.5" />Welcome to CAS
          </p>
          <h2 id="welcome-title" className="relative mt-1 text-2xl font-extrabold tracking-tight">
            {memberId ? `Welcome, ${memberId}!` : "Welcome to CAS!"}
          </h2>
          <p className="relative mt-1 text-sm text-primary-foreground/75">
            Your account is ready. Here is your welcome bonus.
          </p>
        </div>

        <div className="space-y-4 px-5 pb-5">
          <div className="-mt-6 rounded-2xl border border-accent bg-accent/10 p-4 text-center shadow-card">
            <p className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-primary/70">Welcome bonus</p>
            <p className="mt-1 text-3xl font-extrabold tracking-tight text-primary tabular-nums">{etb(bonus)}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {credited ? "Added to your CAS wallet." : "Ready to be added to your CAS wallet."}
            </p>
          </div>

          <ul className="space-y-2">
            {highlights.map(({ icon: Icon, title, text }) => (
              <li key={title} className="flex items-start gap-3 rounded-2xl bg-surface p-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary text-accent"><Icon className="h-4 w-4" /></span>
                <span className="min-w-0">
                  <span className="block text-sm font-bold">{title}</span>
                  <span className="block text-xs text-muted-foreground">{text}</span>
                </span>
              </li>
            ))}
          </ul>

          <button type="button" onClick={onContinue} className="press w-full rounded-2xl bg-accent py-4 font-extrabold text-accent-foreground">
            {continueLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
