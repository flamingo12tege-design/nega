import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { UserRound, Copy, Send, MessageCircle, Users } from "lucide-react";
import heroFriends from "@/assets/hero_friends.webp";
import { rewardRules, type TeamMember } from "@/lib/mock-data";
import {
  dailyCommission,
  isVipEligible,
  recruitmentBonusTotal,
  teamCommissionTotal,
  type ReferralLevel,
} from "@/lib/referral";
import { etb, fmtDate } from "@/lib/format";
import { useReferral } from "@/lib/store";
import { supabase } from "@/lib/supabase";
import { PageHeader, Section } from "@/components/cas/AppShell";

export const Route = createFileRoute("/team")({
  head: () => ({ meta: [{ title: "My Team — CAS" }, { name: "description", content: "Invite friends to CAS and track your recruitment and team rewards." }, { property: "og:title", content: "My Team — CAS" }, { property: "og:description", content: "Invite friends to CAS and track your recruitment and team rewards." }] }),
  component: Page,
});

const levelName: Record<TeamMember["level"], string> = { 1: "A-Level · direct", 2: "B-Level", 3: "C-Level" };
const shortLevel: Record<TeamMember["level"], string> = { 1: "A-Level", 2: "B-Level", 3: "C-Level" };

type RawTreeMember = {
  id: string;
  member_id: string | null;
  level: number;
  vip: number | null;
  package_price: number | null;
  daily_income: number | null;
  days_active: number | null;
  status: string | null;
  joined: string | null;
};
type ReferralTree = { inviter_vip: number | null; members: RawTreeMember[] | null };

function Page() {
  const [origin, setOrigin] = useState("");
  const [levelTab, setLevelTab] = useState<1 | 2 | 3>(1);
  const [myCode, setMyCode] = useState("");
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [vip, setVip] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  useEffect(() => setOrigin(window.location.origin), []);
  // Load the caller's own shareable code plus their real A / B / C downline.
  useEffect(() => {
    const load = async () => {
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const authUser = sessionData.session?.user;
        if (!authUser) return;

        const { data: profile } = await supabase
          .from("profiles")
          .select("member_id")
          .eq("id", authUser.id)
          .maybeSingle();
        const memberId = profile?.member_id as string | undefined;
        if (memberId) setMyCode(memberId.replace(/[^a-zA-Z0-9]/g, "").toUpperCase());

        const { data, error } = await supabase.rpc("get_referral_tree");
        if (error) {
          setLoadError(true);
          return;
        }
        const payload = data as ReferralTree | null;
        setVip(Number(payload?.inviter_vip ?? 0));
        setTeam(
          (payload?.members ?? []).map((m) => ({
            name: m.member_id ?? "CAS member",
            joined: m.joined ?? new Date().toISOString(),
            status: m.status === "Active" ? "Active" : "Pending",
            level: (m.level === 2 ? 2 : m.level === 3 ? 3 : 1) as ReferralLevel,
            vip: Number(m.vip ?? 0),
            applianceId: "",
            packagePrice: Number(m.package_price ?? 0),
            dailyIncome: Number(m.daily_income ?? 0),
            daysActive: Number(m.days_active ?? 0),
          })),
        );
      } catch {
        setLoadError(true);
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, []);
  const link = `${origin}/register?ref=${myCode}`;
  const msg = encodeURIComponent(`Join me on CAS — quality home appliances and rewards: ${link}`);
  const { settings } = useReferral();
  const teamCommission = teamCommissionTotal(team, settings.dailyCommissionPercentByLevel, vip, rewardRules.packageDurationDays);
  const recruitmentBonus = recruitmentBonusTotal(team, settings.recruitmentBonusPercent, vip);

  const memberCommission = (m: TeamMember) => {
    if (m.status !== "Active" || m.daysActive >= rewardRules.packageDurationDays || !isVipEligible(vip, m.vip)) return 0;
    return dailyCommission(m.dailyIncome, settings.dailyCommissionPercentByLevel[m.level - 1] ?? 0);
  };
  const memberNote = (m: TeamMember) => {
    if (m.status !== "Active") return "Not earning yet";
    if (m.daysActive >= rewardRules.packageDurationDays) return "Payout window ended";
    if (!isVipEligible(vip, m.vip)) return `VIP ${m.vip} > your VIP ${vip}`;
    return `${etb(memberCommission(m))}/day`;
  };

  const exampleRows = ([["A-Level", 20], ["B-Level", 40], ["C-Level", 90]] as const).map(([label, count], i) => ({
    label: `${count} × ${etb(3000)} × ${settings.dailyCommissionPercentByLevel[i]}%`,
    amount: dailyCommission(3000 * count, settings.dailyCommissionPercentByLevel[i] ?? 0),
  }));
  const exampleTotal = exampleRows.reduce((sum, row) => sum + row.amount, 0);

  const groups = ([1, 2, 3] as const).map((level) => ({
    level,
    label: levelName[level],
    short: shortLevel[level],
    percent: settings.dailyCommissionPercentByLevel[level - 1] ?? 0,
    members: team.filter((m) => m.level === level),
  }));
  const activeGroup = groups.find((g) => g.level === levelTab) ?? groups[0]!;
  const activeSubtotal = activeGroup.members.reduce((sum, m) => sum + memberCommission(m), 0);

  const stats = [
    { l: "Invited", v: team.length },
    { l: "Active", v: team.filter((t) => t.status === "Active").length },
    { l: "Pending", v: team.filter((t) => t.status === "Pending").length },
    { l: "Your VIP", v: vip },
  ];
  const copy = async () => { await navigator.clipboard.writeText(link); toast.success("Referral link copied"); };
  const share = async () => { if (navigator.share) await navigator.share({ title: "CAS", url: link }).catch(() => {}); else copy(); };

  return (
    <div>
      <PageHeader title="My Team" subtitle="Invite friends. Build your chain." />

      <section className="-mt-4 mx-5 min-w-0 overflow-hidden rounded-3xl bg-primary text-primary-foreground shadow-card">
        <div className="relative">
          <img src={heroFriends} alt="" aria-hidden="true" className="absolute inset-0 h-full w-full object-cover opacity-20" />
          <div className="absolute inset-0 bg-gradient-to-br from-primary via-primary/95 to-primary/70" />
          <div className="relative grid min-w-0 grid-cols-[minmax(0,1fr)] gap-5 p-5 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start lg:p-6">
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-primary-foreground/70">Referral team</p>
              <h2 className="mt-2 max-w-md text-3xl font-extrabold leading-[1.05] tracking-tight text-balance sm:text-4xl">Invite friends.<br className="hidden sm:block" /> Earn every day.</h2>
              <p className="mt-3 max-w-sm text-sm leading-relaxed text-primary-foreground/80">A one-time bonus on every direct invite, plus daily commission from your A / B / C chain.</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <span className="rounded-full bg-background/15 px-3 py-1 text-xs font-bold">VIP {vip}</span>
                <span className="rounded-full bg-background/15 px-3 py-1 text-xs font-bold">{team.length} invites</span>
                <span className="rounded-full bg-background/15 px-3 py-1 text-xs font-bold tabular-nums">{etb(teamCommission)}/day</span>
              </div>
            </div>

            <div className="w-full min-w-0 self-start rounded-2xl bg-background p-3 text-primary shadow-xl shadow-primary-foreground/10 sm:p-4">
              <p className="text-xs text-muted-foreground">Your invite code</p>
              <p className="text-lg font-extrabold tracking-tight">{myCode || "—"}</p>
              <div className="mt-2 flex min-w-0 items-center gap-2 overflow-hidden rounded-xl bg-muted p-2">
                <span className="min-w-0 flex-1 truncate text-xs">{link}</span>
                <button onClick={copy} aria-label="Copy referral link" className="press flex shrink-0 items-center gap-1 rounded-lg bg-primary px-2.5 py-1.5 text-xs font-bold text-primary-foreground transition hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"><Copy className="h-3.5 w-3.5" />Copy</button>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <a href={`https://t.me/share/url?url=${encodeURIComponent(link)}&text=${msg}`} target="_blank" rel="noreferrer" className="press flex items-center justify-center gap-1.5 rounded-xl bg-secondary py-2.5 text-xs font-bold transition hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"><Send className="h-3.5 w-3.5" />Telegram</a>
                <a href={`https://wa.me/?text=${msg}`} target="_blank" rel="noreferrer" className="press flex items-center justify-center gap-1.5 rounded-xl bg-secondary py-2.5 text-xs font-bold transition hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"><MessageCircle className="h-3.5 w-3.5" />WhatsApp</a>
              </div>
              <button onClick={share} className="press mt-2 w-full rounded-xl bg-accent py-3 text-sm font-extrabold text-accent-foreground transition hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">Invite Friends</button>
            </div>
          </div>

          <div className="relative grid grid-cols-4 border-t border-primary-foreground/15 bg-primary-foreground/5">
            {stats.map(({ l, v }) => (
              <div key={l} className="min-w-0 px-2 py-3 text-center sm:px-4">
                <p className="truncate text-[10px] font-semibold uppercase tracking-wider text-primary-foreground/60">{l}</p>
                <p className="mt-0.5 text-base font-extrabold tabular-nums sm:text-xl">{v}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <Section title="How the chain pays">
        <div className="overflow-hidden rounded-2xl bg-card shadow-card">
          <div className="grid sm:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
            <div className="border-b p-4 sm:border-b-0 sm:border-r sm:border-muted">
              <p className="text-xs font-semibold text-muted-foreground">Daily rates</p>
              <div className="mt-3 space-y-3">
                {groups.map((g) => (
                  <div key={g.level} className="flex items-center gap-3">
                    <span className="w-16 shrink-0 text-xs font-bold">{g.short}</span>
                    <div className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${g.percent * 10}%` }} />
                    </div>
                    <span className="w-10 shrink-0 text-right text-sm font-extrabold tabular-nums text-primary">{g.percent}%</span>
                  </div>
                ))}
              </div>
              <div className="mt-4 flex items-center justify-between gap-2 rounded-xl bg-muted p-3">
                <div>
                  <p className="text-xs text-muted-foreground">Recruitment earned</p>
                  <p className="text-lg font-extrabold tabular-nums text-primary">{etb(recruitmentBonus)}</p>
                </div>
                <span className="shrink-0 rounded-lg bg-background px-2 py-1 text-[11px] font-bold">{settings.recruitmentBonusPercent}% once</span>
              </div>
            </div>

            <div className="bg-muted/30 p-4">
              <p className="text-xs font-semibold text-muted-foreground">Example · {etb(3000)} earned per person daily</p>
              <div className="mt-3 space-y-1.5">
                {exampleRows.map((row) => (
                  <div key={row.label} className="flex items-center justify-between gap-2 text-xs">
                    <span className="min-w-0 truncate text-muted-foreground">{row.label}</span>
                    <span className="shrink-0 font-bold tabular-nums text-primary">+{etb(row.amount)}</span>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex items-center justify-between gap-2 border-t border-muted pt-3">
                <span className="text-sm font-bold">Total per day</span>
                <span className="text-xl font-extrabold tabular-nums text-primary">{etb(exampleTotal)}</span>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 border-t border-muted bg-muted/30 px-4 py-3 text-[11px] text-muted-foreground">
            <span className="rounded-full bg-card px-2 py-1">{rewardRules.packageDurationDays}-day cap per member</span>
            <span className="rounded-full bg-card px-2 py-1">VIP 1+ must match or exceed invitee VIP</span>
            <span className="rounded-full bg-card px-2 py-1">Direct invites paid once</span>
          </div>
        </div>
      </Section>

      <Section title="Your team tree" action={<span className="text-xs font-semibold text-muted-foreground">{team.length} members</span>}>
        <div className="overflow-hidden rounded-2xl bg-card shadow-card">
          <div className="no-scrollbar flex gap-2 overflow-x-auto border-b border-muted p-3">
            {groups.map((g) => (
              <button
                key={g.level}
                onClick={() => setLevelTab(g.level)}
                aria-pressed={levelTab === g.level}
                className={`press flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${levelTab === g.level ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:bg-muted"}`}
              >
                {g.short} <span className={`tabular-nums ${levelTab === g.level ? "opacity-75" : "opacity-60"}`}>{g.members.length}</span>
              </button>
            ))}
          </div>

          <div className="grid lg:grid-cols-[200px_minmax(0,1fr)]">
            <div className="border-b border-muted p-4 lg:border-b-0 lg:border-r">
              <p className="font-bold">{activeGroup.label}</p>
              <p className="mt-1 text-xs text-muted-foreground">{activeGroup.percent}% of daily income</p>
              <p className="mt-4 text-2xl font-extrabold tabular-nums text-primary">{etb(activeSubtotal)}<span className="text-sm font-semibold text-muted-foreground">/day</span></p>
              <p className="mt-1 text-xs text-muted-foreground">from {activeGroup.members.length} member{activeGroup.members.length === 1 ? "" : "s"}</p>
              <div className="mt-4 flex items-center gap-1.5 rounded-xl bg-muted px-3 py-2 text-[11px] text-muted-foreground"><Users className="h-3.5 w-3.5 shrink-0" />Commission stops after the {rewardRules.packageDurationDays}-day window.</div>
            </div>

            <div className="divide-y">
              {activeGroup.members.length === 0 ? (
                <p className="p-6 text-center text-sm text-muted-foreground">
                  {loading
                    ? "Loading your team…"
                    : loadError
                      ? "Team data is temporarily unavailable. Please refresh."
                      : "No members at this level yet."}
                </p>
              ) : activeGroup.members.map((m) => (
                <div key={m.name} className="flex items-center gap-3 p-4 transition hover:bg-muted/40">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-secondary text-primary"><UserRound className="h-5 w-5" /></span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold">{m.name}</p>
                    <p className="text-xs text-muted-foreground">VIP {m.vip} · <span className="tabular-nums">{etb(m.dailyIncome)}/day</span> · {fmtDate(m.joined)}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{memberNote(m)}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-bold ${m.status === "Active" ? "bg-success/15 text-success" : "bg-warning/20 text-primary"}`}>{m.status}</span>
                    {memberCommission(m) > 0 && <p className="mt-1 text-xs font-bold tabular-nums text-primary">+{etb(memberCommission(m))}/day</p>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Section>
    </div>
  );
}
