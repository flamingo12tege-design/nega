import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Sparkles, RotateCw, Info, Crown } from "lucide-react";
import luckyWheelIcon from "@/assets/lucky-wheel.webp";
import { PageHeader } from "@/components/cas/AppShell";
import { RedeemSuccessModal } from "@/components/cas/RedeemSuccessModal";
import {
  queryKeys,
  useLuckyWheelJackpot,
  useLuckyWheelSpins,
  useSessionUser,
} from "@/lib/queries";
import { supabase } from "@/lib/supabase";
import { etb, fmtDate } from "@/lib/format";

export const Route = createFileRoute("/lucky-wheel")({
  head: () => ({
    meta: [
      { title: "Lucky Wheel — CAS" },
      {
        name: "description",
        content:
          "Spin for ETB 10-50. VIP2+ get better odds; locked/VIP5+ can hit the rare ETB 2,000 jackpot.",
      },
      { property: "og:title", content: "Lucky Wheel — CAS" },
      {
        property: "og:description",
        content:
          "Spin for ETB 10-50. VIP2+ get better odds; locked/VIP5+ can hit the rare ETB 2,000 jackpot.",
      },
    ],
  }),
  component: Page,
});

type Winner = {
  id: string;
  member_id: string | null;
  prize: string;
  amount: number;
  created_at: string;
};

function Page() {
  const discRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  const { userId } = useSessionUser();
  const { data: spinStatus, isLoading: spinsLoading } =
    useLuckyWheelSpins(userId);
  const { data: jackpotUnlocked = false } = useLuckyWheelJackpot(userId);
  const [spinning, setSpinning] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [result, setResult] = useState<string | null>(null);
  const [spinError, setSpinError] = useState<string | null>(null);
  const [winners, setWinners] = useState<Winner[]>([]);

  const spinsAvailable = spinStatus?.available ?? 0;
  const spinsRuleUnavailable = spinStatus?.unavailable ?? false;
  const spinsError = spinStatus?.error ?? null;

  // ETB 2,000 is a rare members-only slice; the server controls the odds.
  const segments = [
    { label: "ETB 10", color: "#0e7a4a" },
    { label: "Try again", color: "#7c3aed" },
    { label: "ETB 20", color: "#f59e0b" },
    { label: "ETB 30", color: "#2563eb" },
    { label: "ETB 40", color: "#db2777" },
    { label: "ETB 50", color: "#b45309" },
    ...(jackpotUnlocked ? [{ label: "ETB 2,000", color: "#eab308" }] : []),
  ];
  const slice = 360 / segments.length;

  const loadWinners = async () => {
    const { data, error } = await supabase.rpc("get_lucky_wheel_winners");
    if (error || !Array.isArray(data)) return;
    setWinners(
      data
        .filter((row) => Number(row["amount"]) > 0)
        .map((row) => ({
          id: String(row["id"] ?? ""),
          member_id: row["member_id"] ? String(row["member_id"]) : null,
          prize: String(row["prize"] ?? ""),
          amount: Number(row["amount"]) || 0,
          created_at: String(row["created_at"] ?? ""),
        })),
    );
  };

  useEffect(() => {
    void loadWinners();
  }, []);

  const spin = async () => {
    if (spinning || spinsLoading || spinsAvailable <= 0 || !discRef.current)
      return;
    const disc = discRef.current;

    setResult(null);
    setSpinError(null);
    setSpinning(true);

    // The server owns the weighted draw and spends the earned spin, so the
    // client cannot force ETB 50 or the jackpot.
    const { data, error } = await supabase.rpc("spin_lucky_wheel");
    await queryClient.invalidateQueries({
      queryKey: queryKeys.luckyWheelSpins(userId ?? "anon"),
    });

    if (error) {
      setSpinning(false);
      setSpinError(
        /could not find the function|does not exist|unexpected argument|unknown function/i.test(
          error.message,
        )
          ? "Lucky wheel needs the latest update. Run LUCKY_WHEEL.sql in Supabase."
          : error.message || "Your spin could not be saved. Please try again.",
      );
      return;
    }

    const prize = String(
      (data as { prize_label?: string } | null)?.prize_label ?? "Try again",
    );
    const index = Math.max(
      0,
      segments.findIndex((s) => s.label === prize),
    );

    // Each slice is centred on its angle, so rotating by -index * slice puts
    // it under the pointer. Add full turns + the shortest forward delta so
    // the wheel always spins forward and never reverses.
    const currentMod = ((rotation % 360) + 360) % 360;
    const desiredMod = (((360 - index * slice) % 360) + 360) % 360;
    let delta = desiredMod - currentMod;
    if (delta < 0) delta += 360;
    const target = rotation + 360 * 6 + delta;

    // Physical-style spin: fast start, long deceleration, then a small
    // overshoot/bounce as the winning slice settles under the pointer.
    const animation = disc.animate(
      [
        {
          transform: `rotate(${rotation}deg)`,
          offset: 0,
          easing: "cubic-bezier(0.12, 0.7, 0.12, 1)",
        },
        {
          transform: `rotate(${target - 34}deg)`,
          offset: 0.8,
          easing: "ease-in-out",
        },
        {
          transform: `rotate(${target + 8}deg)`,
          offset: 0.9,
          easing: "ease-in-out",
        },
        {
          transform: `rotate(${target - 2}deg)`,
          offset: 0.96,
          easing: "ease-out",
        },
        { transform: `rotate(${target}deg)`, offset: 1 },
      ],
      { duration: 4600, fill: "forwards" },
    );

    animation.onfinish = () => {
      setRotation(target);
      animation.cancel();
      setSpinning(false);
      setResult(segments[index]?.label ?? prize);
      void loadWinners();
    };
  };

  const gradient = segments
    .map((s, i) => `${s.color} ${i * slice}deg ${(i + 1) * slice}deg`)
    .join(", ");

  return (
    <div>
      <PageHeader
        title="Lucky Wheel"
        subtitle="Spin for a surprise reward"
        back
      />

      <div className="-mt-4 space-y-4 px-5">
        <section className="relative overflow-hidden rounded-3xl bg-primary p-6 text-center text-primary-foreground shadow-card">
          <div className="pointer-events-none absolute -left-10 -top-10 h-36 w-36 rounded-full bg-accent/20 blur-3xl" />
          <span className="relative mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-accent/15 p-1.5">
            <img
              src={luckyWheelIcon}
              alt=""
              className="h-full w-full object-contain"
            />
          </span>
          <h2 className="relative mt-3 text-xl font-extrabold">
            Try your luck
          </h2>
          <p className="relative mt-1 text-sm text-primary-foreground/75">
            Spin for {etb(10)} to {etb(50)}. Most spins land on {etb(10)} or Try
            again. Rewards are credited after verification.
          </p>
        </section>

        {/* How spins are earned */}
        <section className="flex items-start gap-3 rounded-2xl bg-card p-4 shadow-card">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-secondary text-primary">
            <Info className="h-4 w-4" />
          </span>
          <p className="text-sm leading-6 text-muted-foreground">
            Spins are earned, never given for free: one for your first approved
            package, plus one for each invited friend who activates a package.
            VIP2+ members get better odds at {etb(20)}-{etb(50)}. The rare{" "}
            {etb(2000)} prize stays reserved for locked-package and VIP5+
            members.
          </p>
        </section>

        <section className="flex flex-col items-center rounded-3xl bg-card px-5 pb-7 pt-8 shadow-card">
          {/* Wheel assembly */}
          <div className="relative h-[300px] w-[300px] max-w-full select-none">
            {/* Outer metallic rim */}
            <div className="absolute inset-0 rounded-full border-[10px] border-[#e2b33a] bg-gradient-to-br from-[#fff0b8] via-[#d9a326] to-[#8a6410] shadow-[0_14px_30px_rgba(0,0,0,0.35),inset_0_2px_4px_rgba(255,255,255,0.7)]">
              {/* Rim bolts */}
              {Array.from({ length: 16 }).map((_, i) => (
                <span
                  key={i}
                  className="bolt-glow absolute left-1/2 top-1/2 h-2.5 w-2.5 rounded-full bg-gradient-to-b from-[#fffbe8] to-[#c99a1c]"
                  style={{
                    transform: `translate(-50%, -50%) rotate(${i * 22.5}deg) translateY(-140px)`,
                    animationDuration: spinning ? "0.3s" : "1.4s",
                  }}
                />
              ))}

              {/* Pointer */}
              <div className="absolute left-1/2 top-[-14px] z-20 -translate-x-1/2 drop-shadow-[0_3px_4px_rgba(0,0,0,0.45)]">
                <div className="h-0 w-0 border-x-[13px] border-t-[26px] border-x-transparent border-t-[#dc2626]" />
              </div>

              {/* Rotating disc */}
              <div
                ref={discRef}
                className="absolute inset-[11px] rounded-full shadow-[inset_0_0_20px_rgba(0,0,0,0.35)]"
                style={{
                  background: `conic-gradient(from ${-slice / 2}deg, ${gradient})`,
                  transform: `rotate(${rotation}deg)`,
                }}
              >
                {/* Segment dividers */}
                <div
                  className="absolute inset-0 rounded-full"
                  style={{
                    background: `repeating-conic-gradient(from ${-slice / 2}deg, rgba(255,255,255,0.85) 0deg 1.5deg, transparent 1.5deg ${slice}deg)`,
                  }}
                />

                {/* Labels */}
                {segments.map((s, i) => {
                  const angle = i * slice;
                  return (
                    <span
                      key={`${s.label}-${i}`}
                      className={`absolute left-1/2 top-1/2 whitespace-nowrap font-extrabold tracking-tight text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)] ${
                        s.label.length > 7 ? "text-[10px]" : "text-[12px]"
                      }`}
                      style={{
                        transform: `translate(-50%, -50%) rotate(${angle}deg) translateY(-105px) rotate(${-angle}deg)`,
                      }}
                    >
                      {s.label}
                    </span>
                  );
                })}
              </div>

              {/* Center hub */}
              <div className="absolute left-1/2 top-1/2 z-10 grid h-[86px] w-[86px] -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-[6px] border-[#f5d477] bg-gradient-to-b from-[#0e7a4a] to-[#075c36] shadow-[0_6px_14px_rgba(0,0,0,0.45),inset_0_2px_4px_rgba(255,255,255,0.25)]">
                <RotateCw className="h-7 w-7 text-white" />
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={spin}
            disabled={spinning || spinsLoading || spinsAvailable <= 0}
            className="press mt-6 flex items-center gap-2 rounded-full bg-gradient-to-b from-[#0e7a4a] to-[#075c36] px-9 py-3.5 font-bold text-white shadow-[0_6px_16px_rgba(14,122,74,0.35)] disabled:opacity-60"
          >
            {spinning ? (
              <Sparkles className="h-4 w-4 animate-spin" />
            ) : (
              <RotateCw className="h-4 w-4" />
            )}
            {spinning
              ? "Spinning..."
              : spinsLoading
                ? "Checking spins..."
                : spinsAvailable > 0
                  ? "Spin the wheel"
                  : "No spin available"}
          </button>

          <div className="mt-4 flex w-full max-w-sm flex-col items-center gap-2">
            <span
              className={`rounded-full px-4 py-1.5 text-xs font-bold ${
                spinsAvailable > 0
                  ? "bg-success/15 text-success"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {spinsLoading
                ? "Checking spins..."
                : spinsRuleUnavailable
                  ? "Spin rules unavailable"
                  : `${spinsAvailable} spin${spinsAvailable === 1 ? "" : "s"} available`}
            </span>

            {jackpotUnlocked && (
              <span className="rounded-full bg-warning/20 px-4 py-1.5 text-xs font-bold text-primary">
                {etb(2000)} jackpot unlocked
              </span>
            )}

            {!spinsLoading && spinsAvailable === 0 && (
              <p className="max-w-xs text-center text-xs leading-5 text-muted-foreground">
                {!userId
                  ? "Sign in to check your earned spins."
                  : spinsRuleUnavailable
                    ? "Ask an administrator to run the latest LUCKY_WHEEL.sql so spins can be checked."
                    : spinsError
                      ? spinsError
                      : "No free spins. Activate your first package, or invite a friend who activates theirs, to earn one."}
              </p>
            )}

            {spinError && (
              <p className="max-w-xs text-center text-xs font-semibold text-red-600">
                {spinError}
              </p>
            )}
          </div>
        </section>

        {/* Recent winners */}
        <section className="rounded-3xl bg-card p-5 shadow-card">
          <div className="flex items-center gap-2">
            <Crown className="h-4 w-4 text-accent" />
            <h2 className="font-extrabold">Recent winners</h2>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Latest real wins from the CAS community.
          </p>

          {winners.length === 0 ? (
            <p className="py-5 text-center text-sm text-muted-foreground">
              No winners yet. Be the first to spin!
            </p>
          ) : (
            <div className="mt-3 divide-y">
              {winners.map((winner) => (
                <div
                  key={winner.id}
                  className="flex items-center justify-between gap-3 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold">
                      {winner.member_id ?? "CAS member"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {fmtDate(winner.created_at)}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-extrabold text-success">
                      +{etb(winner.amount)}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {winner.prize}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <RedeemSuccessModal
        open={result !== null}
        onOpenChange={(open) => {
          if (!open) setResult(null);
        }}
        amount={
          result && result.startsWith("ETB")
            ? Number(result.replace(/\D/g, ""))
            : 0
        }
        title={
          result && result.startsWith("ETB") ? "Congratulations" : "Try again"
        }
        amountLabel={
          result && result.startsWith("ETB")
            ? undefined
            : "Better luck next time"
        }
      />
    </div>
  );
}
