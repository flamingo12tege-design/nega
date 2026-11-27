import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Sparkles, Trophy, RotateCw } from "lucide-react";
import { PageHeader } from "@/components/cas/AppShell";

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

function Page() {
  const [spinning, setSpinning] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [result, setResult] = useState<string | null>(null);

  const spin = () => {
    if (spinning) return;
    const index = Math.floor(Math.random() * segments.length);
    const target = 360 * 6 - index * SLICE - SLICE / 2;
    setResult(null);
    setSpinning(true);
    setRotation(target);
    window.setTimeout(() => {
      setSpinning(false);
      setResult(segments[index]?.label ?? "Try again");
    }, 4200);
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
          <span className="relative mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-accent/15 text-accent">
            <Trophy className="h-6 w-6" />
          </span>
          <h2 className="relative mt-3 text-xl font-extrabold">Try your luck</h2>
          <p className="relative mt-1 text-sm text-primary-foreground/75">One spin per day. Rewards are credited after verification.</p>
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
                  className="absolute left-1/2 top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-gradient-to-b from-[#fff6cf] to-[#8a6410] shadow-[0_1px_2px_rgba(0,0,0,0.5)]"
                  style={{ transform: `translate(-50%, -50%) rotate(${i * 22.5}deg) translateY(-140px)` }}
                />
              ))}

              {/* Pointer */}
              <div className="absolute left-1/2 top-[-14px] z-20 -translate-x-1/2 drop-shadow-[0_3px_4px_rgba(0,0,0,0.45)]">
                <div className="h-0 w-0 border-x-[13px] border-t-[26px] border-x-transparent border-t-[#dc2626]" />
              </div>

              {/* Rotating disc */}
              <div
                className="absolute inset-[11px] rounded-full shadow-[inset_0_0_20px_rgba(0,0,0,0.35)] transition-transform ease-out"
                style={{
                  background: `conic-gradient(from ${-SLICE / 2}deg, ${gradient})`,
                  transform: `rotate(${rotation}deg)`,
                  transitionDuration: spinning ? "4200ms" : "0ms",
                  transitionTimingFunction: "cubic-bezier(0.12, 0.72, 0.08, 1)",
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

          {result && (
            <div className="rise mt-6 w-full rounded-2xl bg-success/10 p-4 text-center">
              <p className="text-xs font-semibold text-muted-foreground">The wheel stopped at</p>
              <p className="mt-1 text-2xl font-extrabold text-success">{result}</p>
              {result !== "Try again" && <p className="mt-1 text-xs text-muted-foreground">Credited after verification.</p>}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
