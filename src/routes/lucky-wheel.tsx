import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Sparkles, Trophy } from "lucide-react";
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

function Page() {
  const [spinning, setSpinning] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [result, setResult] = useState<string | null>(null);

  const spin = () => {
    if (spinning) return;
    const index = Math.floor(Math.random() * segments.length);
    const slice = 360 / segments.length;
    // Land the chosen slice under the top pointer.
    const target = 360 * 6 - index * slice - slice / 2;
    setResult(null);
    setSpinning(true);
    setRotation((prev) => prev - (prev % 360) + target);
    window.setTimeout(() => {
      setSpinning(false);
      setResult(segments[index]?.label ?? "Try again");
    }, 3200);
  };

  const gradient = segments
    .map((s, i) => `${s.color} ${i * (360 / segments.length)}deg ${(i + 1) * (360 / segments.length)}deg`)
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

        <section className="rounded-3xl bg-card p-6 text-center shadow-card">
          <div className="relative mx-auto h-64 w-64 max-w-full">
            <div
              className="h-full w-full rounded-full border-[6px] border-card shadow-lift transition-transform duration-[3000ms] ease-out"
              style={{ background: `conic-gradient(${gradient})`, transform: `rotate(${rotation}deg)` }}
            >
              <span className="absolute left-1/2 top-0 h-4 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-foreground" />
              {segments.map((s, i) => {
                const angle = i * (360 / segments.length) + 360 / segments.length / 2;
                return (
                  <span
                    key={s.label + i}
                    className="absolute left-1/2 top-1/2 text-[10px] font-extrabold text-white drop-shadow"
                    style={{ transform: `rotate(${angle}deg) translateY(-78px) rotate(${-angle}deg) translateY(-50%)` }}
                  >
                    {s.label}
                  </span>
                );
              })}
            </div>
          </div>

          <button
            type="button"
            onClick={spin}
            disabled={spinning}
            className="press mx-auto mt-6 flex items-center gap-2 rounded-full bg-[#0e7a4a] px-8 py-3.5 font-bold text-white disabled:opacity-60"
          >
            <Sparkles className="h-4 w-4" />
            {spinning ? "Spinning..." : "Spin now"}
          </button>

          {result && (
            <div className="rise mt-5 rounded-2xl bg-success/10 p-4">
              <p className="text-xs font-semibold text-muted-foreground">You got</p>
              <p className="mt-1 text-2xl font-extrabold text-success">{result}</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
