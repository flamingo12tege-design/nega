import { Gift, Sparkles, Send, ArrowUpRight, X } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { etb } from "@/lib/format";
import { rewardRules } from "@/lib/mock-data";

const TELEGRAM_CHANNEL = "https://t.me/CAS_Official_Channel03";

/**
 * Centered popup shown on the homepage after a new member registers.
 * Focused on the welcome bonus and the official Telegram channel.
 * Only appears when the path is "/" and a welcome is queued.
 * Does NOT appear during navigation away and back - only on fresh home load
 * with a queued welcome message.
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" aria-hidden="true" />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="welcome-title"
        className="relative rounded-3xl bg-card shadow-lift transform transition-shadow duration-300 hover:shadow-lg max-w-sm w-full"
      >
        {/* Hero */ }
        <div className="relative overflow-hidden bg-primary px-6 pb-14 pt-7 text-center text-primary-foreground">
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.14]"
            style={{ backgroundImage: "radial-gradient(circle at 1px 1px, white 1px, transparent 0)", backgroundSize: "20px 20px" }}
          />
          <div className="pointer-events-none absolute -left-10 -top-12 h-40 w-40 rounded-full bg-accent/25 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-16 -right-10 h-40 w-40 rounded-full bg-white/10 blur-3xl" />

          <button
            type="button"
            onClick={onContinue}
            aria-label="Close"
            className="press absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-full bg-white/10 text-primary-foreground"
          >
            <X className="h-4 w-4" />
          </button>

          <span className="relative mx-auto grid h-16 w-16 place-items-center rounded-full bg-accent text-accent-foreground shadow-lift">
            <Gift className="h-7 w-7" />
          </span>
          <p className="relative mt-4 flex items-center justify-center gap-1.5 text-[11px] font-extrabold uppercase tracking-[0.2em] text-accent">
            <Sparkles className="h-3.5 w-3.5" />Welcome to CAS
          </p>
          <h2 id="welcome-title" className="relative mt-1 text-2xl font-extrabold tracking-tight">
            {memberId ? `Welcome, ${memberId}!` : "Welcome to CAS!"}
          </h2>
          <p className="relative mx-auto mt-1 max-w-xs text-sm text-primary-foreground/75">
            Your account is ready — and your welcome gift is waiting below.
          </p>
        </div>

        <div className="space-y-4 px-5 pb-5">
          {/* Bonus card */ }
          <div className="-mt-9 rounded-2xl border border-accent bg-accent/10 p-5 text-center shadow-card">
            <p className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-primary/70">Your welcome bonus</p>
            <p className="mt-1 text-4xl font-extrabold tracking-tight text-primary tabular-nums">{etb(bonus)}</p>
            <p className="mt-3 inline-flex items-center gap-2 rounded-full bg-success/15 px-3 py-1 text-[11px] font-bold text-success">
              <span className="h-1.5 w-1.5 rounded-full bg-success" />
              {credited ? "Added to your CAS wallet" : "Will be added to your CAS wallet"}
            </p>
          </div>

          {/* Telegram channel */ }
          <div className="overflow-hidden rounded-2xl border bg-surface">
            <div className="flex items-center gap-3 border-b px-4 py-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#229ED9] text-white">
                <Send className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-extrabold">Join our official channel</p>
                <p className="truncate text-xs text-muted-foreground">@CAS_Official_Channel03</p>
              </div>
            </div>
            <p className="px-4 py-3 text-xs leading-5 text-muted-foreground">
              Get announcements, new package updates and reward news straight from CAS.
            </p>
          </div>

          {/* Primary CTA */ }
          <a
            href={TELEGRAM_CHANNEL}
            target="_blank"
            rel="noopener noreferrer"
            onClick={onContinue}
            className="press flex w-full items-center justify-center gap-2 rounded-2xl bg-accent py-4 font-extrabold text-accent-foreground"
          >
            <Send className="h-4 w-4" />{continueLabel}<ArrowUpRight className="h-4 w-4" />
          </a>

          <button type="button" onClick={onContinue} className="w-full text-center text-xs font-semibold text-muted-foreground">
            I'll join later
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}