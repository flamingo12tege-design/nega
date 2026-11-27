import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Sparkles, RotateCw, Info, Crown } from "lucide-react";
import luckyWheelIcon from "@/assets/lucky-wheel.webp";
import { PageHeader } from "@/components/cas/AppShell";
import { RedeemSuccessModal } from "@/components/cas/RedeemSuccessModal";
import { supabase } from "@/lib/supabase";
import { etb, fmtDate } from "@/lib/format";

export const Route = createFileRoute("/lucky-wheel")({
  head: () => ({
    meta: [
      { title: "Lucky Wheel — CAS" },
      { name: "description", content: "Spin the CAS lucky wheel for a surprise reward." },
      { property: "og:title", content: "Lucky Wheel — CAS" },
      { property: "og:description", content: "Spin the CAS lucky wheel for a surprise reward." },
    ],
  }),
  component: Page,
});

const segments = [
  { label: "ETB 50", color: "#f59e0b" },
  { label: "ETB 100", color: "#0e7a4a" },
  { label: "ETB 200", color: "#2563eb" },
  { label: "ETB 500", color: "#dc2626" },
  { label: "Try again", color: "#7c3aed" },
  { label: "ETB 80", color: "#0891b2" },
  { label: "ETB 150", color: "#db2777" },
  { label: "ETB 300", color: "#65a30d" },
];

const SLICE = 360 / segments.length;

type Winner = {
  id: string;
  member_id: string | null;
  prize: string;
  amount: number;
  created_at: string;
};

function Page() {
  const discRef = useRef<HTMLDivElement>(null);
  const [spinning, setSpinning] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [result, setResult] = useState<string | null>(null);
  const [winners, setWinners] = useState<Winner[]>([]);

  const loadWinners = async () => {
    const { data, error } = await supabase.rpc("get_lucky_wheel_winners");
    if (error || !Array.isArray(data)) return;
    setWinners(data.map((row) => ({
      id: String(row["id"] ?? ""),
      member_id: row["member_id"] ? String(row["member_id"]) : null,
      prize: String(row["prize"] ?? ""),
      amount: Number(row["amount"]) || 0,
      created_at: String(row["created_at"] ?? ""),
    })));
  };

  useEffect(() => { void loadWinners(); }, []);

  const spin = () => {
    if (spinning || !discRef.current) return;
    const index = Math.floor(Math.random() * segments.length);

    // Each slice is centred on its angle, so rotating by -index * SLICE puts
    // it under the pointer. Add full turns + the shortest forward delta so
    // the wheel always spins forward and never reverses.
    const currentMod = ((rotation % 360) + 360) % 360;
    const desiredMod = (((360 - index * SLICE) % 360) + 360) % 360;
    let delta = desiredMod - currentMod;
    if (delta < 0) delta += 360;
    const target = rotation + 360 * 6 + delta;

    setResult(null);
    setSpinning(true);

    // Physical-style spin: fast start, long deceleration, then a small
    // overshoot/bounce as the winning slice settles under the pointer.
    const animation = discRef.current.animate(
      [
        { transform: `rotate(${rotation}deg)`, offset: 0, easing: "cubic-bezier(0.12, 0.7, 0.12, 1)" },
        { transform: `rotate(${target - 34}deg)`, offset: 0.8, easing: "ease-in-out" },
        { transform: `rotate(${target + 8}deg)`, offset: 0.9, easing: "ease-in-out" },
        { transform: `rotate(${target - 2}deg)`, offset: 0.96, easing: "ease-out" },
        { transform: `rotate(${target}deg)`, offset: 1 },
      ],
      { duration: 4600, fill: "forwards" },
    );

    animation.onfinish = () => {
      setRotation(target);
      animation.cancel();
      setSpinning(false);
      const prize = segments[index]?.label ?? "Try again";
      setResult(prize);

      // Record the win so it appears in the public winners list.
      const amount = prize.startsWith("ETB") ? Number(prize.replace(/\D/g, "")) : 0;
      void supabase
        .rpc("record_lucky_wheel_win", { p_prize_label: prize, p_amount: amount })
        .then(() => loadWinners());
    };
  };

  const gradient = segments
    .map((s, i) => `${s.color} ${i * SLICE}deg ${(i + 1) * SLICE}deg`)
    .join(", ");

  return (
    <div>
      <PageHeader title="Lucky Wheel" subtitle="Spin for a surprise reward" back />

      <div className="-mt-4 space-y-4 px-5">
        <section className="relative overflow-hidden rounded-3xl bg-primary p-6 text-center text-primary-foreground shadow-card">
          <div className="pointer-events-none absolute -left-10 -top-10 h-36 w-36 rounded-full bg-accent/20 blur-3xl" />
          <span className="relative mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-accent/15 p-1.5">
            <img src={luckyWheelIcon} alt="" className="h-full w-full object-contain" />
          </span>
          <h2 className="relative mt-3 text-xl font-extrabold">Try your luck</h2>
          <p className="relative mt-1 text-sm text-primary-foreground/75">Rewards are credited after verification.</p>
        </section>

        {/* How spins are earned */}
        <section className="flex items-start gap-3 rounded-2xl bg-card p-4 shadow-card">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-secondary text-primary">
            <Info className="h-4 w-4" />
          </span>
          <p className="text-sm leading-6 text-muted-foreground">
            Earn a spin with your first subscription, or when a friend you invite makes theirs.
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
                  background: `conic-gradient(from ${-SLICE / 2}deg, ${gradient})`,
                  transform: `rotate(${rotation}deg)`,
                }}
              >
                {/* Segment dividers */}
                <div
                  className="absolute inset-0 rounded-full"
                  style={{
                    background: `repeating-conic-gradient(from ${-SLICE / 2}deg, rgba(255,255,255,0.85) 0deg 1.5deg, transparent 1.5deg ${SLICE}deg)`,
                  }}
                />

                {/* Labels */}
                {segments.map((s, i) => {
                  const angle = i * SLICE;
                  return (
                    <span
                      key={`${s.label}-${i}`}
                      className="absolute left-1/2 top-1/2 whitespace-nowrap text-[12px] font-extrabold tracking-tight text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]"
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
            disabled={spinning}
            className="press mt-6 flex items-center gap-2 rounded-full bg-gradient-to-b from-[#0e7a4a] to-[#075c36] px-9 py-3.5 font-bold text-white shadow-[0_6px_16px_rgba(14,122,74,0.35)] disabled:opacity-60"
          >
            {spinning ? <Sparkles className="h-4 w-4 animate-spin" /> : <RotateCw className="h-4 w-4" />}
            {spinning ? "Spinning..." : "Spin the wheel"}
          </button>
        </section>

        {/* Recent winners */}
        <section className="rounded-3xl bg-card p-5 shadow-card">
          <div className="flex items-center gap-2">
            <Crown className="h-4 w-4 text-accent" />
            <h2 className="font-extrabold">Recent winners</h2>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">Latest real wins from the CAS community.</p>

          {winners.length === 0 ? (
            <p className="py-5 text-center text-sm text-muted-foreground">No winners yet. Be the first to spin!</p>
          ) : (
            <div className="mt-3 divide-y">
              {winners.map((winner) => (
                <div key={winner.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold">{winner.member_id ?? "CAS member"}</p>
                    <p className="text-xs text-muted-foreground">{fmtDate(winner.created_at)}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-extrabold text-success">+{etb(winner.amount)}</p>
                    <p className="text-[11px] text-muted-foreground">{winner.prize}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <RedeemSuccessModal
        open={result !== null}
        onOpenChange={(open) => { if (!open) setResult(null); }}
        amount={result && result.startsWith("ETB") ? Number(result.replace(/\D/g, "")) : 0}
        title={result && result.startsWith("ETB") ? "Congratulations" : "Try again"}
        amountLabel={result && result.startsWith("ETB") ? undefined : "Better luck next time"}
      />
    </div>
  );
}
