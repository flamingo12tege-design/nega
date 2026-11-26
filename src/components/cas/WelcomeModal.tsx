import { Gift, Sparkles, Send, ArrowUpRight, X } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { etb } from "@/lib/format";
import { rewardRules } from "@/lib/mock-data";

const TELEGRAM_CHANNEL = "https://t.me/CAS_Official_Channel03";

/**
 * Full-screen announcement shown to a newly registered member after they
 * land on the homepage. Focused on the welcome bonus and official channel.
 */
export function WelcomeModal({
  credited,
  memberId,
  onContinue,
  continueLabel = "Join the channel",
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

  if (!mounted) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="welcome-title"
      className="fixed inset-0 z-50 overflow-y-auto bg-primary text-primary-foreground"
    >
      <div className="relative min-h-dvh">
        {/* Background texture */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.13]"
          style={{ backgroundImage: "radial-gradient(circle at 1px 1px, white 1px, transparent 0)", backgroundSize: "22px 22px" }}
        />
        <div className="pointer-events-none absolute -left-20 -top-24 h-72 w-72 rounded-full bg-accent/25 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 -right-20 h-80 w-80 rounded-full bg-white/10 blur-3xl" />

        <button
          type="button"
          onClick={onContinue}
          aria-label="Close"
          className="press absolute right-4 top-4 z-10 grid h-9 w-9 place-items-center rounded-full bg-white/10 text-primary-foreground"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="relative mx-auto flex min-h-dvh w-full max-w-md flex-col px-6 pb-44 pt-14 sm:pt-20">
          <div className="text-center">
            <span className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-accent text-accent-foreground shadow-lift">
              <Gift className="h-9 w-9" />
            </span>
            <p className="mt-5 flex items-center justify-center gap-1.5 text-[11px] font-extrabold uppercase tracking-[0.22em] text-accent">
              <Sparkles className="h-3.5 w-3.5" />Welcome to CAS
            </p>
            <h1 className="mt-2 text-3xl font-extrabold tracking-tight">
              {memberId ? `Welcome, ${memberId}!` : "Welcome to CAS!"}
            </h1>
            <p className="mx-auto mt-2 max-w-sm text-sm text-primary-foreground/75">
              Your account is ready — and your welcome gift is waiting below.
            </p>
          </div>

          {/* Bonus card */}
          <div className="mt-8 rounded-3xl border border-accent bg-accent/10 p-6 text-center shadow-lift">
            <p className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-accent">Your welcome bonus</p>
            <p className="mt-2 text-5xl font-extrabold tracking-tight tabular-nums">{etb(bonus)}</p>
            <p className="mt-3 inline-flex items-center gap-2 rounded-full bg-success/20 px-4 py-1.5 text-xs font-bold text-success">
              <span className="h-2 w-2 rounded-full bg-success" />
              {credited ? "Added to your CAS wallet" : "Will be added to your CAS wallet"}
            </p>
          </div>

          {/* Telegram channel */}
          <div className="mt-5 overflow-hidden rounded-3xl bg-card text-card-foreground shadow-card">
            <div className="flex items-center gap-3 border-b px-4 py-4">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[#229ED9] text-white">
                <Send className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-extrabold">Join our official channel</p>
                <p className="truncate text-xs text-muted-foreground">@CAS_Official_Channel03</p>
              </div>
            </div>
            <p className="px-4 py-4 text-sm leading-6 text-muted-foreground">
              Get announcements, new package updates and reward news straight from CAS.
            </p>
          </div>
        </div>

        {/* Sticky bottom actions */}
        <div className="fixed inset-x-0 bottom-0 border-t border-white/10 bg-primary/95 px-6 pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-4 backdrop-blur">
          <div className="mx-auto max-w-md space-y-2">
            <a
              href={TELEGRAM_CHANNEL}
              target="_blank"
              rel="noopener noreferrer"
              onClick={onContinue}
              className="press flex w-full items-center justify-center gap-2 rounded-2xl bg-accent py-4 font-extrabold text-accent-foreground"
            >
              <Send className="h-4 w-4" />{continueLabel}<ArrowUpRight className="h-4 w-4" />
            </a>
            <button type="button" onClick={onContinue} className="w-full py-1 text-center text-xs font-semibold text-primary-foreground/70">
              I'll join later
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
