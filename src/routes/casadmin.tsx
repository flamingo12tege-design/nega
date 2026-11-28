import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Users, ShoppingBag, Gift, ListChecks, Newspaper, ReceiptText, BarChart3, TicketPercent,
  Plus, Trash2, Check, X, Clock3, Wallet, TrendingUp, Search, Lock, Unlock,
  Ban, RotateCcw, ArrowDownRight, ArrowUpRight, ArrowLeft, LockKeyhole, Eye, EyeOff,
  ScrollText, ShieldCheck, Globe, Monitor, KeyRound, ArrowRight, LayoutGrid,
} from "lucide-react";
import { dailyCommission } from "@/lib/referral";
import { etb, fmtDate, fmtDateTime } from "@/lib/format";
import { defaultNewsImage, rewardRules } from "@/lib/mock-data";
import { actions, useReferral, useStore } from "@/lib/store";
import type { AdminUser } from "@/lib/mock-data";
import { Logo } from "@/components/cas/Logo";
import { StatusPill } from "@/components/cas/StatusPill";
import { supabase } from "@/lib/supabase";
import { logAdminAction } from "@/lib/admin-audit";

export const Route = createFileRoute("/casadmin")({
  head: () => ({ meta: [{ title: "Admin Dashboard — CAS" }, { name: "description", content: "Manage CAS users, appliances, bonuses, tasks and news." }, { property: "og:title", content: "Admin Dashboard — CAS" }, { property: "og:description", content: "Manage CAS users, appliances, bonuses, tasks and news." }] }),
  component: AdminRoute,
});

const tabs = [
  { k: "analytics", l: "Overview", i: BarChart3 }, { k: "users", l: "Users", i: Users }, { k: "appliances", l: "Packages", i: ShoppingBag },
  { k: "bonuses", l: "Bonuses", i: Gift }, { k: "giftcodes", l: "Gift codes", i: TicketPercent }, { k: "tasks", l: "Tasks", i: ListChecks }, { k: "news", l: "News", i: Newspaper }, { k: "transactions", l: "Ledger", i: ReceiptText },
  { k: "audit", l: "Audit log", i: ScrollText },
] as const;
type Tab = (typeof tabs)[number]["k"];

const card = "rounded-2xl bg-card p-4 shadow-card";

/** CAS keeps the fee; admins pay out the whole-birr net amount. */
const withdrawalPayout = (gross: number) =>
  Math.abs(gross) - Math.round(Math.abs(gross) * rewardRules.withdrawalFeePercent / 100);

/** Friendly label for a raw audit action such as `deposit.approved`. */
const auditActionLabel = (action: string) => {
  const labels: Record<string, string> = {
    "admin.login": "Signed in",
    "admin.logout": "Signed out",
    "deposit.approved": "Approved deposit",
    "deposit.rejected": "Rejected deposit",
    "withdrawal.approved": "Approved withdrawal",
    "withdrawal.rejected": "Rejected withdrawal",
    "purchase.approved": "Approved package request",
    "purchase.rejected": "Rejected package request",
    "package.added": "Added package",
    "package.removed": "Removed package",
    "package.locked": "Locked package",
    "package.unlocked": "Unlocked package",
    "member.banned": "Banned member",
    "member.restored": "Restored member",
    "member.balance_adjusted": "Adjusted member balance",
    "rules.updated": "Updated commission rules",
    "task.added": "Added bonus task",
    "task.approved": "Approved bonus task",
    "task.removed": "Removed bonus task",
    "news.published": "Published news",
    "news.removed": "Removed news",
  };
  return labels[action] ?? action.replace(/[._]/g, " ");
};

/** Colour-coded tone for an audit action badge. */
const auditActionTone = (action: string) => {
  if (/approved|login|restored|added|published/.test(action)) return "bg-success/15 text-success";
  if (/rejected|removed|banned/.test(action)) return "bg-destructive/10 text-destructive";
  if (/locked|adjusted|rules/.test(action)) return "bg-warning/20 text-primary";
  return "bg-secondary text-primary";
};

/** Short, readable device name from a user-agent string. */
const deviceLabel = (ua: string | null) => {
  if (!ua) return "Unknown device";
  if (/iphone|ipad|ipod/i.test(ua)) return "iOS";
  if (/android/i.test(ua)) return "Android";
  if (/windows/i.test(ua)) return "Windows";
  if (/mac os|macintosh/i.test(ua)) return "macOS";
  if (/linux/i.test(ua)) return "Linux";
  return "Web browser";
};

const adminSecurityPoints = [
  { icon: ShieldCheck, title: "Role-protected", text: "Only administrator accounts can open this console." },
  { icon: Globe, title: "IP address logged", text: "Every action records the source IP and device." },
  { icon: ScrollText, title: "Full audit trail", text: "Sign-ins, reviews and settings are kept for audit." },
] as const;

function AdminSignIn({ onSuccess }: { onSuccess: (email: string) => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);

    const email = username.trim().toLowerCase();
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error || !data.user) {
      setBusy(false);
      setError("Incorrect email or password.");
      return;
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", data.user.id)
      .maybeSingle();

    if (profileError || profile?.role !== "admin") {
      await supabase.auth.signOut();
      setBusy(false);
      setError("This account does not have admin access.");
      return;
    }

    // Record the successful sign-in. Best effort so login still works.
    await logAdminAction(
      "admin.login",
      { type: "auth", id: data.user.id, metadata: { email } },
      { id: data.user.id, email },
    );

    sessionStorage.setItem("cas_admin_authenticated", "true");
    onSuccess(email);
  };

  const securityPoints = adminSecurityPoints;

  return (
    <div className="min-h-dvh bg-surface lg:grid lg:grid-cols-[1.05fr_1fr]">
      {/* Compact brand banner on phones and tablets. */}
      <div className="relative overflow-hidden bg-primary px-5 pb-12 pt-6 text-primary-foreground sm:px-8 lg:hidden">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.12]"
          style={{ backgroundImage: "radial-gradient(circle at 1px 1px, white 1px, transparent 0)", backgroundSize: "22px 22px" }}
        />
        <div className="pointer-events-none absolute -right-12 -top-16 h-48 w-48 rounded-full bg-accent/25 blur-3xl" />
        <div className="relative flex items-center justify-between gap-3">
          <span className="rounded-xl bg-background/95 px-2.5 py-1.5 shadow-card"><Logo className="h-7" /></span>
          <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em]">Restricted</span>
        </div>
        <p className="relative mt-6 flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-[0.2em] text-accent">
          <KeyRound className="h-4 w-4" />Operations console
        </p>
        <h1 className="relative mt-1 text-2xl font-extrabold tracking-tight">Admin access</h1>
      </div>

      {/* Full security panel on desktop. */}
      <aside className="relative hidden overflow-hidden bg-primary text-primary-foreground lg:flex lg:flex-col lg:justify-between lg:px-12 lg:py-12">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.12]"
          style={{ backgroundImage: "radial-gradient(circle at 1px 1px, white 1px, transparent 0)", backgroundSize: "22px 22px" }}
        />
        <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-accent/25 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-28 -left-16 h-72 w-72 rounded-full bg-white/10 blur-3xl" />

        <div className="relative flex items-center justify-between gap-3">
          <span className="rounded-2xl bg-background/95 px-3 py-2 shadow-card"><Logo className="h-8" /></span>
          <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em]">Restricted access</span>
        </div>

        <div className="relative mt-14">
          <p className="flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-[0.22em] text-accent">
            <KeyRound className="h-4 w-4" />Operations console
          </p>
          <h1 className="mt-3 max-w-md text-4xl font-extrabold leading-[1.1] tracking-tight">
            Secure access for the CAS admin team.
          </h1>
          <p className="mt-3 max-w-md text-sm leading-relaxed text-primary-foreground/70">
            Every sign-in and review action is written to the audit trail with the admin email, IP address and device.
          </p>

          <ul className="mt-7 grid max-w-md gap-3">
            {securityPoints.map(({ icon: Icon, title, text }) => (
              <li key={title} className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.06] p-3.5">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-accent/15 text-accent"><Icon className="h-4 w-4" /></span>
                <span className="min-w-0">
                  <span className="block text-sm font-bold">{title}</span>
                  <span className="mt-0.5 block text-xs text-primary-foreground/60">{text}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs text-primary-foreground/50">CAS · Authorized personnel only. Activity is monitored.</p>
      </aside>

      {/* Sign-in form. */}
      <main className="-mt-6 flex items-center justify-center rounded-t-[2rem] bg-surface px-5 py-10 sm:px-8 lg:mt-0 lg:rounded-none lg:px-12 lg:py-12">
        <form onSubmit={submit} className="rise w-full max-w-sm">
          <span className="mx-auto mb-6 block h-1.5 w-12 rounded-full bg-border lg:hidden" />
          <p className="text-[11px] font-extrabold uppercase tracking-[0.2em] text-accent">Admin sign in</p>
          <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-primary">Welcome back</h2>
          <p className="mt-1 text-sm text-muted-foreground">Use your administrator email and password.</p>

          <label className="mt-7 block">
            <span className="text-sm font-semibold">Email address</span>
            <input
              type="email"
              value={username}
              onChange={(e) => { setUsername(e.target.value); setError(""); }}
              autoComplete="email"
              className="mt-2 w-full rounded-xl border bg-background px-4 py-3 text-base outline-none transition focus:border-accent focus:ring-2 focus:ring-ring/30"
              placeholder="admin@caset.casacam.net"
            />
          </label>

          <label className="mt-4 block">
            <span className="text-sm font-semibold">Password</span>
            <div className="mt-2 flex rounded-xl border bg-background transition focus-within:border-accent focus-within:ring-2 focus-within:ring-ring/30">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => { setPassword(e.target.value); setError(""); }}
                autoComplete="current-password"
                className="min-w-0 flex-1 bg-transparent px-4 py-3 text-base outline-none"
                placeholder="••••••••"
              />
              <button type="button" onClick={() => setShowPassword((v) => !v)} className="px-3 text-muted-foreground" aria-label={showPassword ? "Hide password" : "Show password"}>
                {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
            </div>
          </label>

          {error && (
            <p className="mt-4 flex items-start gap-2 rounded-xl bg-destructive/10 px-3 py-2.5 text-sm font-semibold text-destructive">
              <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0" />{error}
            </p>
          )}

          <button
            disabled={busy}
            className="press mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-accent py-4 font-extrabold text-accent-foreground transition disabled:opacity-70"
          >
            {busy ? (
              <>
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-accent-foreground/30 border-t-accent-foreground" aria-hidden="true" />
                Signing in…
              </>
            ) : (
              <>Sign in <ArrowRight className="h-4 w-4" /></>
            )}
          </button>

          <p className="mt-4 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5 text-success" />Protected by role-based access
          </p>

          <div className="mt-6 border-t pt-4 text-center">
            <Link to="/" className="text-sm font-semibold text-primary hover:text-accent">Back to CAS</Link>
          </div>
        </form>
      </main>
    </div>
  );
}

function AdminRoute() {
  const [authenticated, setAuthenticated] = useState(false);
  const [adminEmail, setAdminEmail] = useState("");

  // Read the flag after mount so SSR HTML and the first client render agree.
  useEffect(() => {
    setAuthenticated(typeof window !== "undefined" && sessionStorage.getItem("cas_admin_authenticated") === "true");
  }, []);

  if (!authenticated) return <AdminSignIn onSuccess={(email) => { setAdminEmail(email); setAuthenticated(true); }} />;

  const signOut = async () => {
    // Record the sign-out while the admin session still exists.
    await logAdminAction("admin.logout");
    sessionStorage.removeItem("cas_admin_authenticated");
    await supabase.auth.signOut();
    setAuthenticated(false);
  };

  return <Page onSignOut={() => { void signOut(); }} adminEmail={adminEmail} />;
}

function Page({ onSignOut, adminEmail }: { onSignOut: () => void; adminEmail: string }) {
  const [tab, setTab] = useState<Tab>("analytics");
  const purchases = useStore((s) => s.purchases);
  const tasks = useStore((s) => s.tasks);
  const team = useStore((s) => s.team);
  const referral = useStore((s) => s.referral);
  const packages = useStore((s) => s.packages);
  const lockedIds = useStore((s) => s.lockedIds);
  const news = useStore((s) => s.news);
  const [members, setMembers] = useState<AdminUser[]>([]);
  const { recruitmentBonus, dailyCommission: teamCommission } = useReferral();
  const [bonus, setBonus] = useState({
    recruit: referral.recruitmentBonusPercent,
    level1: referral.dailyCommissionPercentByLevel[0],
    level2: referral.dailyCommissionPercentByLevel[1],
    level3: referral.dailyCommissionPercentByLevel[2],
  });
  const [draft, setDraft] = useState({ title: "", desc: "", reward: "" });
  const [packageDraft, setPackageDraft] = useState({ name: "", tier: "1", price: "", dailyPayout: "" });
  const [newsDraft, setNewsDraft] = useState({ title: "", tag: "", body: "" });
  const [search, setSearch] = useState("");
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [adjustment, setAdjustment] = useState("");
  const [pendingRecharges, setPendingRecharges] = useState<Array<{ id: string; user_id: string; member_id: string | null; amount: number; transaction_ref: string | null; proof_url: string | null; created_at: string }>>([]);
  const [proofPreview, setProofPreview] = useState<{ id: string; url: string } | null>(null);
  const [depositStats, setDepositStats] = useState({ users: 0, amount: 0 });
  const [activePackages, setActivePackages] = useState(0);
  const [pendingWithdrawals, setPendingWithdrawals] = useState<Array<{ id: string; user_id: string; amount: number; description: string | null; created_at: string }>>([]);
  const [depositHistory, setDepositHistory] = useState<Array<{ id: string; user_id: string; amount: number; status: string; description: string | null; transaction_ref: string | null; proof_url: string | null; adminApproved: boolean; created_at: string; member_id: string | null }>>([]);
  const [withdrawalHistory, setWithdrawalHistory] = useState<Array<{ id: string; user_id: string; amount: number; status: string; description: string | null; created_at: string; member_id: string | null }>>([]);
  const [verificationLogs, setVerificationLogs] = useState<Array<{ id: string; user_id: string; member_id: string | null; amount: number; transaction_ref: string | null; proof_url: string | null; reason: string | null; outcome: string; created_at: string }>>([]);
  const [auditLogs, setAuditLogs] = useState<Array<{ id: string; admin_email: string | null; action: string; target_type: string | null; target_id: string | null; member_id: string | null; ip_address: string | null; user_agent: string | null; metadata: Record<string, unknown> | null; created_at: string }>>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [giftCodes, setGiftCodes] = useState<Array<{ id: string; code: string; amount: number; max_redemptions: number; redeemed_count: number; active: boolean; created_at: string }>>([]);
  const [giftDraft, setGiftDraft] = useState({ amount: "", maxRedemptions: "1", count: "1" });
  const [giftLoading, setGiftLoading] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  /** Write an audit entry. Best effort: never block the underlying action. */
  const logAdmin = async (
    action: string,
    target?: { type?: string; id?: string; memberId?: string | null; metadata?: Record<string, unknown> },
  ) => {
    await logAdminAction(action, {
      type: target?.type,
      id: target?.id,
      memberId: target?.memberId,
      metadata: target?.metadata,
    });
  };

  const loadAuditLogs = async () => {
    setAuditLoading(true);
    const { data, error } = await supabase
      .from("admin_audit_logs")
      .select("id,admin_email,action,target_type,target_id,member_id,ip_address,user_agent,metadata,created_at")
      .order("created_at", { ascending: false })
      .limit(100);
    setAuditLoading(false);
    if (error) return;
    const rows = (Array.isArray(data) ? data : []) as Array<Record<string, unknown>>;
    setAuditLogs(rows.map((row) => ({
      id: String(row["id"] ?? ""),
      admin_email: row["admin_email"] ? String(row["admin_email"]) : null,
      action: String(row["action"] ?? "unknown"),
      target_type: row["target_type"] ? String(row["target_type"]) : null,
      target_id: row["target_id"] ? String(row["target_id"]) : null,
      member_id: row["member_id"] ? String(row["member_id"]) : null,
      ip_address: row["ip_address"] ? String(row["ip_address"]) : null,
      user_agent: row["user_agent"] ? String(row["user_agent"]) : null,
      metadata: (row["metadata"] && typeof row["metadata"] === "object" ? row["metadata"] : null) as Record<string, unknown> | null,
      created_at: String(row["created_at"] ?? ""),
    })));
  };

  const loadGiftCodes = async () => {
    setGiftLoading(true);
    const { data, error } = await supabase
      .from("gift_codes")
      .select("id,code,amount,max_redemptions,redeemed_count,active,created_at")
      .order("created_at", { ascending: false })
      .limit(100);
    setGiftLoading(false);
    if (error) {
      if (/relation .* does not exist|could not find the table|schema cache/i.test(error.message)) {
        toast.error("Gift codes table missing", { description: "Run GIFT_CODES.sql in Supabase." });
      }
      return;
    }
    setGiftCodes((data ?? []).map((row) => ({
      id: String(row.id),
      code: String(row.code ?? ""),
      amount: Number(row.amount) || 0,
      max_redemptions: Number(row.max_redemptions) || 0,
      redeemed_count: Number(row.redeemed_count) || 0,
      active: row.active !== false,
      created_at: String(row.created_at ?? ""),
    })));
  };

  const generateGiftCodes = async () => {
    const amount = Number(giftDraft.amount);
    const maxRedemptions = Math.max(1, Math.floor(Number(giftDraft.maxRedemptions) || 1));
    const count = Math.min(20, Math.max(1, Math.floor(Number(giftDraft.count) || 1)));
    if (!Number.isFinite(amount) || amount <= 0) { toast.error("Enter a valid reward amount"); return; }

    setGiftLoading(true);
    const { data, error } = await supabase.rpc("generate_gift_codes", {
      p_amount: amount,
      p_max_redemptions: maxRedemptions,
      p_count: count,
    });
    setGiftLoading(false);

    if (error) {
      const message = error.message ?? "Could not generate gift codes.";
      if (/could not find the function|does not exist|unknown function/i.test(message)) {
        toast.error("Gift code setup missing", { description: "Run GIFT_CODES.sql in Supabase." });
        return;
      }
      toast.error("Could not generate gift codes", { description: message });
      return;
    }

    const created = Array.isArray(data) ? data.length : count;
    void logAdmin("gift_codes.generated", { type: "gift_code", metadata: { amount, maxRedemptions, count: created } });
    toast.success(`${created} gift code${created === 1 ? "" : "s"} generated`);
    setGiftDraft({ amount: "", maxRedemptions: "1", count: "1" });
    void loadGiftCodes();
  };

  const loadPendingRecharges = async () => {
    const { data, error } = await supabase
      .from("wallet_ledger")
      .select("id,user_id,amount,transaction_ref,proof_url,created_at")
      .eq("type", "recharge")
      .eq("status", "pending")
      .order("created_at", { ascending: false });
    if (error) return;
    const rows = (data ?? []).map((row) => ({ ...row, amount: Number(row.amount) }));
    setPendingRecharges(rows.map((r) => ({ ...r, member_id: null })));
    const userIds = [...new Set(rows.map((r) => r.user_id).filter(Boolean))];
    if (userIds.length === 0) return;
    const { data: profiles } = await supabase.from("profiles").select("id,member_id").in("id", userIds);
    const memberMap = new Map((profiles ?? []).map((p) => [p.id, p.member_id]));
    setPendingRecharges(rows.map((r) => ({ ...r, member_id: memberMap.get(r.user_id) ?? null })));
  };

  const loadPendingWithdrawals = async () => {
    const { data, error } = await supabase
      .from("wallet_ledger")
      .select("id,user_id,amount,description,created_at")
      .eq("type", "withdrawal")
      .eq("status", "pending")
      .order("created_at", { ascending: false });
    if (!error) setPendingWithdrawals((data ?? []).map((row) => ({ ...row, amount: Number(row.amount) })));
  };

  const loadLedgerHistory = async () => {
    const [deposits, withdrawals, approvals] = await Promise.all([
      supabase
        .from("wallet_ledger")
        .select("id,user_id,amount,status,description,transaction_ref,proof_url,created_at")
        .in("type", ["deposit", "recharge"])
        .in("status", ["completed", "rejected"])
        .order("created_at", { ascending: false })
        .limit(100),
      supabase
        .from("wallet_ledger")
        .select("id,user_id,amount,status,description,transaction_ref,proof_url,created_at")
        .eq("type", "withdrawal")
        .in("status", ["completed", "rejected"])
        .order("created_at", { ascending: false })
        .limit(100),
      supabase
        .from("admin_audit_logs")
        .select("target_id")
        .eq("action", "deposit.approved")
        .limit(1000),
    ]);

    const rows = [...(deposits.data ?? []), ...(withdrawals.data ?? [])];
    const ids = [...new Set(rows.map((row) => row.user_id).filter(Boolean))];
    const { data: profiles } = ids.length
      ? await supabase.from("profiles").select("id,member_id").in("id", ids)
      : { data: [] };
    const memberMap = new Map((profiles ?? []).map((p) => [p.id, p.member_id]));
    const adminApprovedIds = new Set(
      (approvals.data ?? []).map((row) => String(row.target_id ?? "")).filter(Boolean),
    );

    const mapRows = (data: typeof rows, isDeposit: boolean) =>
      data.map((row) => ({
        id: row.id,
        user_id: row.user_id,
        amount: Number(row.amount),
        status: row.status,
        description: row.description ?? null,
        transaction_ref: row.transaction_ref ?? null,
        proof_url: row.proof_url ?? null,
        adminApproved: isDeposit && row.status === "completed" && adminApprovedIds.has(row.id),
        created_at: row.created_at,
        member_id: memberMap.get(row.user_id) ?? null,
      }));

    if (!deposits.error) setDepositHistory(mapRows(deposits.data ?? [], true));
    if (!withdrawals.error) setWithdrawalHistory(mapRows(withdrawals.data ?? [], false));
  };

  const loadVerificationLogs = async () => {
    const { data, error } = await supabase
      .from("deposit_verification_logs")
      .select("id,user_id,amount,transaction_ref,proof_url,reason,outcome,created_at")
      .order("created_at", { ascending: false })
      .limit(50);
    // The table only exists after DEPOSIT_VERIFICATION_LOG.sql has been run.
    if (error) return;
    const rows = (data ?? []).map((row) => ({ ...row, amount: Number(row.amount) || 0, member_id: null }));
    setVerificationLogs(rows);
    const userIds = [...new Set(rows.map((r) => r.user_id).filter(Boolean))];
    if (userIds.length === 0) return;
    const { data: profiles } = await supabase.from("profiles").select("id,member_id").in("id", userIds);
    const memberMap = new Map((profiles ?? []).map((p) => [p.id, p.member_id]));
    setVerificationLogs(rows.map((r) => ({ ...r, member_id: memberMap.get(r.user_id) ?? null })));
  };

  const approveRecharge = async (id: string) => {
    const { error } = await supabase.rpc("approve_recharge", { p_ledger_id: id });
    if (error) { toast.error("Could not approve deposit", { description: error.message }); return; }
    await logAdmin("deposit.approved", { type: "wallet_ledger", id });
    toast.success("Deposit approved and balance credited");
    await loadPendingRecharges();
    await loadLedgerHistory();
  };

  const rejectRecharge = async (id: string) => {
    const { error } = await supabase.rpc("reject_recharge", { p_ledger_id: id });
    if (error) { toast.error("Could not reject deposit", { description: error.message }); return; }
    await logAdmin("deposit.rejected", { type: "wallet_ledger", id });
    toast("Deposit rejected");
    await loadPendingRecharges();
    await loadLedgerHistory();
  };

  const approveWithdrawal = async (id: string) => {
    const { error } = await supabase.rpc("approve_withdrawal", { p_ledger_id: id });
    if (error) { toast.error("Could not approve withdrawal", { description: error.message }); return; }
    await logAdmin("withdrawal.approved", { type: "wallet_ledger", id });
    toast.success("Withdrawal approved and balance updated");
    await loadPendingWithdrawals();
    await loadLedgerHistory();
  };

  const rejectWithdrawal = async (id: string) => {
    const { error } = await supabase.rpc("reject_withdrawal", { p_ledger_id: id });
    if (error) { toast.error("Could not reject withdrawal", { description: error.message }); return; }
    await logAdmin("withdrawal.rejected", { type: "wallet_ledger", id });
    toast("Withdrawal rejected");
    await loadPendingWithdrawals();
    await loadLedgerHistory();
  };

  const pendingPurchases = purchases.filter((p) => p.status === "Pending");
  const pendingMembers = team.filter((m) => m.status === "Pending");

  // Secondary sections live behind the mobile "More" sheet.
  const moreTabs = tabs.filter((entry) => entry.k !== "analytics" && entry.k !== "users" && entry.k !== "transactions");
  const moreActive = moreTabs.some((entry) => entry.k === tab);
  const ledgerBadge = pendingRecharges.length + pendingWithdrawals.length;
  const selectTab = (nextTab: Tab) => {
    setTab(nextTab);
    setSelectedUserId(null);
    setMoreOpen(false);
    if (nextTab === "audit") void loadAuditLogs();
    if (nextTab === "giftcodes") void loadGiftCodes();
  };

  const addTask = () => {
    const reward = Number(draft.reward);
    if (!draft.title.trim()) { toast.error("Enter a task title"); return; }
    if (!reward) { toast.error("Enter a reward amount"); return; }
    actions.addTask(draft.title.trim(), draft.desc.trim() || "Complete this task to earn a reward.", reward);
    void logAdmin("task.added", { type: "task", metadata: { title: draft.title.trim(), reward } });
    setDraft({ title: "", desc: "", reward: "" });
    toast.success("Bonus task added");
  };
  const approve = (id: string) => {
    actions.setTask(id, "Completed");
    void logAdmin("task.approved", { type: "task", id });
    toast.success("Reward approved");
  };
  const preview = [
    { label: "A-Level · 20 people", amount: dailyCommission(3000 * 20, bonus.level1) },
    { label: "B-Level · 40 people", amount: dailyCommission(3000 * 40, bonus.level2) },
    { label: "C-Level · 90 people", amount: dailyCommission(3000 * 90, bonus.level3) },
  ];
  const previewTotal = preview.reduce((sum, row) => sum + row.amount, 0);
  const filteredUsers = members.filter((u) => `${u.id} ${u.name} ${u.phone}`.toLowerCase().includes(search.toLowerCase().trim()));
  const selectedUser = members.find((u) => u.id === selectedUserId) ?? null;

  const loadMembers = async () => {
    const { data, error } = await supabase.rpc("get_admin_members");
    if (error) { toast.error("Failed to load member directory", { description: error.message }); return; }
    const rows = (Array.isArray(data) ? data : data?.members ?? []) as Array<Record<string, unknown>>;
    const typed = rows.map((row) => ({
      id: String(row["id"] ?? ""),
      member_id: String(row["member_id"] ?? ""),
      phone: String(row["phone"] ?? ""),
      wallet_balance: Number(row["wallet_balance"] ?? 0),
      created_at: String(row["created_at"] ?? ""),
    }));
    setMembers(
      typed.map((row) => ({
        id: row.id,
        name: row.member_id || row.id,
        phone: row.phone,
        status: "Active" as const,
        balance: row.wallet_balance,
        purchases: [],
        deposits: [],
        history: [],
        joined: row.created_at,
      })),
    );
  };

  const loadOverviewStats = async () => {
    const [{ data: deposits }, { count }] = await Promise.all([
      supabase
        .from("wallet_ledger")
        .select("user_id,amount,type,status")
        .in("type", ["deposit", "recharge"])
        .eq("status", "completed"),
      supabase.from("purchases").select("id", { count: "exact", head: true }).eq("status", "approved"),
    ]);
    const rows = (deposits ?? []).map((row) => ({ user_id: row.user_id, amount: Math.abs(Number(row.amount) || 0) }));
    setDepositStats({
      users: new Set(rows.map((row) => row.user_id)).size,
      amount: rows.reduce((sum, row) => sum + row.amount, 0),
    });
    setActivePackages(count ?? 0);
  };

  useEffect(() => {
    void loadMembers();
    void loadOverviewStats();
  }, []);

  useEffect(() => {
    const channel = supabase.channel("admin_recharge_updates");

    channel.on("postgres_changes", { event: "*", schema: "public", table: "recharges" }, (payload) => {
      console.log("Change received!", payload);
      // Handle the change payload, e.g., by refetching data or updating state
    });

    channel.subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, []);

  useEffect(() => {
    void loadPendingRecharges();
    void loadPendingWithdrawals();
    void loadLedgerHistory();
    void loadVerificationLogs();
    void loadAuditLogs();
  }, []);

  return (
    <div className="min-h-screen bg-surface pb-24 lg:pb-0">
      <header className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <Logo className="h-8" />
            <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-bold text-primary-foreground">Admin</span>
            <span className="hidden text-sm text-muted-foreground sm:block">Operations console</span>
            {adminEmail ? <span className="hidden max-w-[10rem] truncate text-xs text-muted-foreground md:inline">{adminEmail}</span> : null}
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden text-xs text-muted-foreground md:block">{fmtDate(new Date().toISOString())}</span>
            <Link to="/" className="press rounded-lg bg-secondary px-3 py-1.5 text-sm font-semibold">Exit</Link>
            <button type="button" onClick={onSignOut} className="press rounded-lg bg-destructive px-3 py-1.5 text-sm font-semibold text-destructive-foreground">Sign out</button>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-6xl gap-4 px-4 py-4 sm:px-6 lg:grid-cols-[200px_minmax(0,1fr)] lg:gap-6">
        <nav aria-label="Admin sections" className="hidden lg:sticky lg:top-20 lg:flex lg:h-fit lg:flex-col lg:gap-2">
          {tabs.map(({ k, l, i: Icon }) => (
            <button
              key={k}
              onClick={() => selectTab(k)}
              className={`press flex shrink-0 items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm font-semibold ${tab === k ? "bg-primary text-primary-foreground" : "bg-card shadow-card"}`}
            >
              <Icon className="h-4 w-4 shrink-0" />{l}
              {k === "appliances" && pendingPurchases.length > 0 && <span className="ml-auto rounded-full bg-warning/20 px-1.5 text-[11px] font-bold text-primary">{pendingPurchases.length}</span>}
              {k === "users" && pendingMembers.length > 0 && <span className="ml-auto rounded-full bg-warning/20 px-1.5 text-[11px] font-bold text-primary">{pendingMembers.length}</span>}
            </button>
          ))}
        </nav>

        <main key={tab} className="rise min-w-0 space-y-4">
          {tab === "analytics" && (
            <>
              <section className="space-y-3">
                <div className="flex flex-wrap items-end justify-between gap-2">
                  <div>
                    <p className="text-[11px] font-extrabold uppercase tracking-[0.2em] text-accent">Overview</p>
                    <h2 className="mt-1 text-2xl font-extrabold tracking-tight text-primary">Operations snapshot</h2>
                    <p className="mt-1 text-sm text-muted-foreground">Live counters across deposits, packages and review queues.</p>
                  </div>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-success/10 px-3 py-1 text-[11px] font-bold text-success">
                    <span className="h-1.5 w-1.5 rounded-full bg-success" /> Live data
                  </span>
                </div>

                {/* Featured money card: the headline number plus member context. */}
                <div className="relative overflow-hidden rounded-3xl bg-primary p-5 text-primary-foreground shadow-card sm:p-6">
                  <div className="pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full bg-accent/20 blur-3xl" />
                  <div className="relative flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <p className="flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-[0.18em] text-accent">
                        <ReceiptText className="h-4 w-4" />Total deposits
                      </p>
                      <p className="mt-2 break-words text-3xl font-extrabold tracking-tight tabular-nums sm:text-4xl">{etb(depositStats.amount)}</p>
                      <p className="mt-1 text-xs text-primary-foreground/70">Confirmed recharge volume across all members</p>
                    </div>
                    <div className="grid grid-cols-2 gap-3 sm:w-auto sm:min-w-[15rem]">
                      <div className="rounded-2xl bg-white/10 p-3">
                        <p className="text-[11px] font-semibold text-primary-foreground/70">Deposited users</p>
                        <p className="mt-1 text-xl font-extrabold text-accent tabular-nums">{depositStats.users.toLocaleString()}</p>
                      </div>
                      <div className="rounded-2xl bg-white/10 p-3">
                        <p className="text-[11px] font-semibold text-primary-foreground/70">Members</p>
                        <p className="mt-1 text-xl font-extrabold text-accent tabular-nums">{members.length.toLocaleString()}</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Actionable queue cards, two-up on phones and four-up on desktop. */}
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                  {[
                    { i: ShoppingBag, l: "Active packages", v: activePackages.toLocaleString(), s: "Approved purchases", tint: "bg-tint-green", to: "appliances" as Tab },
                    { i: Wallet, l: "Pending deposits", v: pendingRecharges.length.toLocaleString(), s: "Awaiting approval", tint: "bg-tint-orange", to: "transactions" as Tab },
                    { i: ArrowUpRight, l: "Pending withdrawals", v: pendingWithdrawals.length.toLocaleString(), s: "Awaiting approval", tint: "bg-tint-violet", to: "transactions" as Tab },
                    { i: ReceiptText, l: "Failed verifications", v: verificationLogs.length.toLocaleString(), s: "Recent rejected attempts", tint: "bg-tint-rose", to: "transactions" as Tab },
                  ].map(({ i: Icon, l, v, s, tint, to }) => (
                    <button
                      key={l}
                      type="button"
                      onClick={() => { setTab(to); setSelectedUserId(null); }}
                      className="press group rounded-2xl bg-card p-4 text-left shadow-card transition-shadow hover:shadow-lift"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-xs font-semibold text-muted-foreground">{l}</p>
                        <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl text-primary ${tint}`}><Icon className="h-4 w-4" /></span>
                      </div>
                      <p className="mt-3 text-2xl font-extrabold tracking-tight text-primary tabular-nums">{v}</p>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">{s}</p>
                    </button>
                  ))}
                </div>
              </section>

              <div className="grid gap-3 lg:grid-cols-2">
                <div className={card}>
                  <p className="flex items-center gap-2 font-bold"><TrendingUp className="h-4 w-4 text-accent" />Commission rules in effect</p>
                  <div className="mt-3 divide-y rounded-xl bg-surface px-3 text-sm">
                    <div className="flex items-center justify-between gap-2 py-2"><span>Recruitment bonus · direct</span><span className="font-bold text-primary">{referral.recruitmentBonusPercent}%</span></div>
                    <div className="flex items-center justify-between gap-2 py-2"><span>Daily commission · A / B / C</span><span className="font-bold text-primary">{referral.dailyCommissionPercentByLevel.join(" / ")}%</span></div>
                    <div className="flex items-center justify-between gap-2 py-2"><span>Recruitment earned</span><span className="font-bold text-primary">{etb(recruitmentBonus)}</span></div>
                    <div className="flex items-center justify-between gap-2 py-2"><span>Team commission / day</span><span className="font-bold text-primary">{etb(teamCommission)}</span></div>
                  </div>
                  <p className="mt-3 text-xs text-muted-foreground">Daily commissions stop after the member's {rewardRules.packageDurationDays}-day payout window. From VIP 1 up, the inviter must be at least the invitee's VIP.</p>
                </div>

                <div className={card}>
                  <p className="flex items-center gap-2 font-bold"><Clock3 className="h-4 w-4 text-accent" />Needs attention</p>
                  <p className="mt-3 text-xs font-semibold text-muted-foreground">PENDING PACKAGE REQUESTS · {pendingPurchases.length}</p>
                  {pendingPurchases.length === 0 ? <p className="mt-1 text-sm text-muted-foreground">Nothing to review.</p> : pendingPurchases.slice(0, 3).map((p) => (
                    <div key={p.id} className="mt-2 flex items-center justify-between gap-2 text-sm">
                      <span className="min-w-0 truncate">{packages.find((a) => a.id === p.applianceId)?.name} · {p.method}</span>
                      <button onClick={() => { actions.setPurchaseStatus(p.id, "Approved"); void logAdmin("purchase.approved", { type: "purchase", id: p.id }); toast.success("Purchase approved"); }} className="shrink-0 rounded-lg bg-success px-2 py-1 text-xs font-bold text-success-foreground">Approve</button>
                    </div>
                  ))}
                  <p className="mt-4 text-xs font-semibold text-muted-foreground">PENDING MEMBERS · {pendingMembers.length}</p>
                  {pendingMembers.length === 0 ? <p className="mt-1 text-sm text-muted-foreground">Nothing to review.</p> : pendingMembers.map((m) => (
                    <div key={m.name} className="mt-2 flex items-center justify-between gap-2 text-sm">
                      <span className="min-w-0 truncate">{m.name} · level {m.level} · VIP {m.vip}</span>
                      <button onClick={() => { actions.setTeamMemberStatus(m.name, "Active"); toast.success(`${m.name} approved`); }} className="shrink-0 rounded-lg bg-success px-2 py-1 text-xs font-bold text-success-foreground">Approve</button>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {tab === "users" && (
            selectedUser ? (
              <div className="space-y-4">
                <button onClick={() => setSelectedUserId(null)} className="press flex items-center gap-1.5 rounded-lg bg-secondary px-3 py-2 text-sm font-semibold"><ArrowLeft className="h-4 w-4" />All members</button>

                <div className={`${card} flex flex-wrap items-center justify-between gap-3`}>
                  <div>
                    <p className="font-bold">{selectedUser.name}</p>
                    <p className="text-xs text-muted-foreground">{selectedUser.id} · joined {fmtDate(selectedUser.joined)} · {selectedUser.phone}</p>
                  </div>
                  <button
                    onClick={() => { const status = selectedUser.status === "Banned" ? "Active" : "Banned"; actions.setUserStatus(selectedUser.id, status); void logAdmin(status === "Banned" ? "member.banned" : "member.restored", { type: "member", id: selectedUser.id, metadata: { name: selectedUser.name } }); toast.success(`${selectedUser.name} ${status === "Banned" ? "banned" : "restored"}`); }}
                    className={`press flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold ${selectedUser.status === "Banned" ? "bg-success text-success-foreground" : "bg-secondary text-destructive"}`}
                  >
                    {selectedUser.status === "Banned" ? <RotateCcw className="h-3.5 w-3.5" /> : <Ban className="h-3.5 w-3.5" />}
                    {selectedUser.status === "Banned" ? "Restore" : "Ban"}
                  </button>
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <div className={card}><p className="text-xs text-muted-foreground">Balance</p><p className="mt-1 text-xl font-extrabold text-primary">{etb(selectedUser.balance)}</p></div>
                  <div className={card}><p className="text-xs text-muted-foreground">Active packages</p><p className="mt-1 text-xl font-extrabold">{selectedUser.purchases.filter((p) => p.status === "Approved").length}</p></div>
                  <div className={card}><p className="text-xs text-muted-foreground">Total deposits</p><p className="mt-1 text-xl font-extrabold">{etb(selectedUser.deposits.reduce((sum, d) => sum + d.amount, 0))}</p></div>
                </div>

                <div className={card}>
                  <p className="font-bold">Adjust balance</p>
                  <p className="mt-1 text-xs text-muted-foreground">Credits are recorded as deposits; debits as adjustments.</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <input inputMode="numeric" value={adjustment} onChange={(e) => setAdjustment(e.target.value.replace(/\D/g, ""))} placeholder="Amount (ETB)" className="min-w-0 flex-1 rounded-xl border bg-surface px-4 py-2.5" />
                    <button onClick={() => { const amount = Number(adjustment); if (!amount) { toast.error("Enter an amount"); return; } actions.adjustUserBalance(selectedUser.id, amount); void logAdmin("member.balance_adjusted", { type: "member", id: selectedUser.id, memberId: selectedUser.name, metadata: { amount, direction: "credit" } }); setAdjustment(""); toast.success(`${etb(amount)} credited`); }} className="press flex items-center gap-1.5 rounded-xl bg-success px-4 py-2.5 text-sm font-bold text-success-foreground"><ArrowUpRight className="h-4 w-4" />Add</button>
                    <button onClick={() => { const amount = Number(adjustment); if (!amount) { toast.error("Enter an amount"); return; } actions.adjustUserBalance(selectedUser.id, -amount); void logAdmin("member.balance_adjusted", { type: "member", id: selectedUser.id, memberId: selectedUser.name, metadata: { amount, direction: "debit" } }); setAdjustment(""); toast.success(`${etb(amount)} removed`); }} className="press flex items-center gap-1.5 rounded-xl bg-secondary px-4 py-2.5 text-sm font-bold text-destructive"><ArrowDownRight className="h-4 w-4" />Remove</button>
                  </div>
                </div>

                <div className="grid gap-3 lg:grid-cols-2">
                  <div className={card}>
                    <p className="font-bold">Packages</p>
                    <div className="mt-3 divide-y">
                      {selectedUser.purchases.length === 0 ? <p className="py-3 text-sm text-muted-foreground">No package requests.</p> : selectedUser.purchases.map((p) => (
                        <div key={p.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                          <span className="min-w-0 truncate">{packages.find((a) => a.id === p.applianceId)?.name ?? p.applianceId} · {fmtDate(p.date)}</span>
                          <StatusPill s={p.status} />
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className={card}>
                    <p className="font-bold">Deposits</p>
                    <div className="mt-3 divide-y">
                      {selectedUser.deposits.length === 0 ? <p className="py-3 text-sm text-muted-foreground">No deposits recorded.</p> : selectedUser.deposits.map((d) => (
                        <div key={d.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                          <span className="min-w-0 truncate">{d.method} · {fmtDate(d.date)} · <span className="text-xs text-muted-foreground">{d.status}</span></span>
                          <span className="shrink-0 font-bold text-success">+{etb(d.amount)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className={card}>
                  <p className="font-bold">Transaction history</p>
                  <div className="mt-3 divide-y">
                    {selectedUser.history.map((h) => (
                      <div key={h.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                        <span className="min-w-0 truncate">{h.type} · {fmtDate(h.date)} <span className="text-xs text-muted-foreground">· {h.status}</span></span>
                        <span className={`shrink-0 font-bold ${h.amount < 0 ? "text-destructive" : "text-success"}`}>{h.amount > 0 ? "+" : ""}{etb(h.amount)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className={card}>
                  <p className="font-bold">Member directory <span className="text-sm font-normal text-muted-foreground">· {members.length} members</span></p>
                  <p className="mt-1 text-xs text-muted-foreground">Search by ID, name or phone. Select a member to open their profile.</p>
                  <label className="mt-3 flex items-center gap-2 rounded-xl border bg-surface px-3">
                    <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search members…" className="min-w-0 flex-1 bg-transparent py-2.5 outline-none" />
                  </label>
                  <div className="mt-3 divide-y">
                    {filteredUsers.length === 0 ? (
                      <p className="py-5 text-center text-sm text-muted-foreground">No members match “{search}”.</p>
                    ) : filteredUsers.map((u) => (
                      <button key={u.id} onClick={() => { setSelectedUserId(u.id); setAdjustment(""); }} className="flex w-full items-center justify-between gap-2 py-3 text-left hover:text-primary">
                        <span className="min-w-0">
                          <span className="block truncate font-bold">{u.name}</span>
                          <span className="text-xs text-muted-foreground">{u.id} · {u.phone}</span>
                        </span>
                        <span className="flex shrink-0 items-center gap-2">
                          <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${u.status === "Banned" ? "bg-destructive/15 text-destructive" : "bg-success/15 text-success"}`}>{u.status}</span>
                          <span className="font-bold">{etb(u.balance)}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className={card}>
                  <p className="font-bold">Pending recruit approvals</p>
                  <p className="mt-1 text-xs text-muted-foreground">Approving a direct recruit credits their one-time recruitment bonus.</p>
                  <div className="mt-3 divide-y">
                    {team.filter((u) => u.status === "Pending").length === 0 ? <p className="py-3 text-sm text-muted-foreground">Nothing to review.</p> : team.filter((u) => u.status === "Pending").map((u) => (
                      <div key={u.name} className="flex flex-wrap items-center justify-between gap-2 py-3">
                        <div className="min-w-0"><p className="truncate font-bold">{u.name}</p><p className="text-xs text-muted-foreground">Level {u.level} · VIP {u.vip} · {etb(u.dailyIncome)}/day</p></div>
                        <button onClick={() => { actions.setTeamMemberStatus(u.name, "Active"); toast.success(`${u.name} approved`, { description: u.level === 1 ? "Recruitment bonus credited." : "Team commission is now active." }); }} className="shrink-0 rounded-lg bg-success px-3 py-1.5 text-xs font-bold text-success-foreground">Approve</button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )
          )}

          {tab === "appliances" && (
            <>
              <div className={card}>
                <p className="font-bold">Add a package</p>
                <p className="mt-1 text-xs text-muted-foreground">New packages use the standard CAS image and appear in the catalogue immediately.</p>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {([
                    ["name", "Package name", "text"],
                    ["tier", "VIP", "number"],
                    ["price", "Price (ETB)", "number"],
                    ["dailyPayout", "Daily payout (ETB)", "number"],
                  ] as const).map(([k, label, type]) => (
                    <label key={k} className="block"><span className="text-xs font-semibold">{label}</span>
                      <input type={type} value={packageDraft[k]} onChange={(e) => setPackageDraft({ ...packageDraft, [k]: e.target.value })} placeholder={label} className="mt-1 w-full rounded-xl border bg-surface px-4 py-2.5" />
                    </label>
                  ))}
                </div>
                <button
                  onClick={() => {
                    if (!actions.addPackage({ name: packageDraft.name, tier: Number(packageDraft.tier), price: Number(packageDraft.price), dailyPayout: Number(packageDraft.dailyPayout) })) { toast.error("Enter a name, price and daily payout"); return; }
                    void logAdmin("package.added", { type: "package", metadata: { name: packageDraft.name, tier: Number(packageDraft.tier), price: Number(packageDraft.price), dailyPayout: Number(packageDraft.dailyPayout) } });
                    setPackageDraft({ name: "", tier: "1", price: "", dailyPayout: "" });
                    toast.success("Package added");
                  }}
                  className="press mt-3 flex items-center gap-1.5 rounded-xl bg-accent px-4 py-2.5 text-sm font-bold text-accent-foreground"><Plus className="h-4 w-4" />Add package</button>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {packages.map((a) => {
                  const locked = lockedIds.includes(a.id);
                  return (
                    <div key={a.id} className={`${card} flex items-start gap-3`}>
                      <img src={a.image} alt="" className="h-14 w-14 shrink-0 rounded-xl object-cover" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-bold">{a.name}</p>
                        <p className="text-sm font-semibold text-primary">{etb(a.price)}</p>
                        <p className="text-xs text-muted-foreground">{etb(Math.round(a.dailyPayout))}/day · {etb(Math.round(a.dailyPayout * rewardRules.packageDurationDays))} in {rewardRules.packageDurationDays} days</p>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-bold text-primary">VIP {a.tier}</span>
                          <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${locked ? "bg-warning/20 text-primary" : "bg-success/15 text-success"}`}>{locked ? "Locked" : "Open"}</span>
                        </div>
                      </div>
                      <div className="flex shrink-0 flex-col gap-1">
                        <button onClick={() => { actions.togglePackageLock(a.id); void logAdmin(locked ? "package.unlocked" : "package.locked", { type: "package", id: a.id, metadata: { name: a.name } }); toast.success(locked ? `${a.name} unlocked` : `${a.name} locked`); }} aria-label={locked ? `Unlock ${a.name}` : `Lock ${a.name}`} className="grid h-8 w-8 place-items-center rounded-lg bg-secondary text-primary">{locked ? <Unlock className="h-4 w-4" /> : <Lock className="h-4 w-4" />}</button>
                        <button onClick={() => { actions.removePackage(a.id); void logAdmin("package.removed", { type: "package", id: a.id, metadata: { name: a.name } }); toast(`${a.name} removed`); }} aria-label={`Remove ${a.name}`} className="grid h-8 w-8 place-items-center rounded-lg bg-secondary text-destructive"><Trash2 className="h-4 w-4" /></button>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className={card}>
                <p className="font-bold">Purchase requests</p>
                <p className="mt-1 text-xs text-muted-foreground">Approving a request makes the package active for daily income claims.</p>
                <div className="mt-3 divide-y">
                  {purchases.map((p) => (
                    <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                      <span className="min-w-0 flex-1 truncate">{packages.find((a) => a.id === p.applianceId)?.name ?? p.applianceId} · {p.method} · {fmtDate(p.date)}</span>
                      <div className="flex shrink-0 items-center gap-2">
                        <StatusPill s={p.status} />
                        {p.status === "Pending" && (
                          <>
                            <button onClick={() => { actions.setPurchaseStatus(p.id, "Approved"); void logAdmin("purchase.approved", { type: "purchase", id: p.id }); toast.success("Purchase approved"); }} aria-label="Approve purchase" className="grid h-8 w-8 place-items-center rounded-lg bg-success text-success-foreground"><Check className="h-4 w-4" /></button>
                            <button onClick={() => { actions.setPurchaseStatus(p.id, "Rejected"); void logAdmin("purchase.rejected", { type: "purchase", id: p.id }); toast("Purchase rejected"); }} aria-label="Reject purchase" className="grid h-8 w-8 place-items-center rounded-lg bg-secondary text-destructive"><X className="h-4 w-4" /></button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {tab === "bonuses" && (
            <>
              <div className={card}>
                <p className="font-bold">Referral & commission rules</p>
                <p className="mt-1 text-xs text-muted-foreground">These percentages drive the Team page, the daily commission claim and all previews. Changes save to the live store.</p>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {([
                    ["recruit", "Recruitment bonus · direct (%)"],
                    ["level1", "Daily commission · A-Level (%)"],
                    ["level2", "Daily commission · B-Level (%)"],
                    ["level3", "Daily commission · C-Level (%)"],
                  ] as const).map(([k, l]) => (
                    <label key={k} className="block"><span className="text-sm font-semibold">{l}</span>
                      <input type="number" min={0} value={bonus[k]} onChange={(e) => setBonus({ ...bonus, [k]: Number(e.target.value) })} className="mt-1 w-full rounded-xl border bg-surface px-4 py-2.5" /></label>
                  ))}
                </div>
                <p className="mt-3 text-xs text-muted-foreground">Rules: {rewardRules.packageDurationDays}-day payout cap per package · inviter VIP must be equal or higher from VIP 1 up · recruitment bonus is direct invites only.</p>
                <button
                  onClick={() => {
                    actions.setReferralRules({ recruitmentBonusPercent: bonus.recruit, dailyCommissionPercentByLevel: [bonus.level1, bonus.level2, bonus.level3] });
                    void logAdmin("rules.updated", { type: "settings", metadata: { ...bonus } });
                    toast.success("Bonus rules saved");
                  }}
                  className="press mt-4 w-full rounded-xl bg-accent py-3 font-bold text-accent-foreground sm:w-auto sm:px-6"
                >
                  Save rules
                </button>
              </div>
              <div className={card}>
                <p className="font-bold">Live preview</p>
                <p className="mt-1 text-xs text-muted-foreground">What a 20 / 40 / 90 team earns each day when every member earns ETB 3,000.</p>
                <div className="mt-3 divide-y rounded-xl bg-surface px-3 text-sm">
                  {preview.map((row) => <div key={row.label} className="flex items-center justify-between gap-2 py-2"><span>{row.label}</span><span className="font-bold text-primary">+{etb(row.amount)}</span></div>)}
                  <div className="flex items-center justify-between gap-2 py-2"><span className="font-bold">Total team daily income</span><span className="text-base font-extrabold text-primary">{etb(previewTotal)}</span></div>
                </div>
              </div>
            </>
          )}

          {tab === "giftcodes" && (
            <>
              <div className={card}>
                <p className="font-bold">Generate gift codes</p>
                <p className="mt-1 text-xs text-muted-foreground">Create redemption codes with a reward amount and a maximum number of users who can redeem each code.</p>
                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  <label className="block">
                    <span className="text-sm font-semibold">Amount (ETB)</span>
                    <input
                      inputMode="numeric"
                      value={giftDraft.amount}
                      onChange={(e) => setGiftDraft({ ...giftDraft, amount: e.target.value.replace(/\D/g, "") })}
                      placeholder="e.g. 100"
                      className="mt-1 w-full rounded-xl border bg-surface px-4 py-2.5"
                    />
                  </label>
                  <label className="block">
                    <span className="text-sm font-semibold">Users per code</span>
                    <input
                      inputMode="numeric"
                      value={giftDraft.maxRedemptions}
                      onChange={(e) => setGiftDraft({ ...giftDraft, maxRedemptions: e.target.value.replace(/\D/g, "") })}
                      placeholder="e.g. 1"
                      className="mt-1 w-full rounded-xl border bg-surface px-4 py-2.5"
                    />
                  </label>
                  <label className="block">
                    <span className="text-sm font-semibold">Codes to generate</span>
                    <input
                      inputMode="numeric"
                      value={giftDraft.count}
                      onChange={(e) => setGiftDraft({ ...giftDraft, count: e.target.value.replace(/\D/g, "") })}
                      placeholder="e.g. 1"
                      className="mt-1 w-full rounded-xl border bg-surface px-4 py-2.5"
                    />
                  </label>
                </div>
                <button
                  onClick={() => void generateGiftCodes()}
                  disabled={giftLoading}
                  className="press mt-4 w-full rounded-xl bg-accent py-3 font-bold text-accent-foreground disabled:opacity-60 sm:w-auto sm:px-6"
                >
                  {giftLoading ? "Generating..." : "Generate codes"}
                </button>
              </div>

              <div className={card}>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-bold">Gift codes</p>
                    <p className="mt-1 text-xs text-muted-foreground">Users redeem these codes from the Gifts page.</p>
                  </div>
                  <button onClick={() => void loadGiftCodes()} className="press rounded-xl bg-secondary px-3 py-2 text-xs font-bold text-primary">Refresh</button>
                </div>
                <div className="mt-3 divide-y">
                  {giftCodes.length === 0 ? (
                    <p className="py-4 text-sm text-muted-foreground">No gift codes yet.</p>
                  ) : giftCodes.map((gift) => {
                    const usedUp = gift.redeemed_count >= gift.max_redemptions;
                    return (
                      <div key={gift.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
                        <div className="min-w-0">
                          <p className="font-extrabold tracking-wide">{gift.code}</p>
                          <p className="text-xs text-muted-foreground">
                            {etb(gift.amount)} · {gift.redeemed_count}/{gift.max_redemptions} redeemed · {fmtDate(gift.created_at)}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${!gift.active ? "bg-muted text-muted-foreground" : usedUp ? "bg-warning/20 text-primary" : "bg-success/15 text-success"}`}>
                            {!gift.active ? "Inactive" : usedUp ? "Used up" : "Active"}
                          </span>
                          <button
                            onClick={async () => {
                              await navigator.clipboard.writeText(gift.code);
                              toast.success("Gift code copied");
                            }}
                            className="press rounded-lg bg-secondary px-3 py-1.5 text-xs font-bold text-primary"
                          >
                            Copy
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}

          {tab === "tasks" && (
            <>
              <div className={card}>
                <p className="font-bold">Add bonus task</p>
                <p className="mt-1 text-xs text-muted-foreground">Only tasks you add here appear on the user Tasks page.</p>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="Task title" className="w-full rounded-xl border bg-surface px-4 py-2.5" />
                  <input value={draft.desc} onChange={(e) => setDraft({ ...draft, desc: e.target.value })} placeholder="Short description" className="w-full rounded-xl border bg-surface px-4 py-2.5" />
                </div>
                <div className="mt-2 flex gap-2">
                  <input inputMode="numeric" value={draft.reward} onChange={(e) => setDraft({ ...draft, reward: e.target.value.replace(/\D/g, "") })} placeholder="Reward (ETB)" className="min-w-0 flex-1 rounded-xl border bg-surface px-4 py-2.5" />
                  <button onClick={addTask} className="press flex shrink-0 items-center gap-1.5 rounded-xl bg-accent px-4 py-2.5 font-bold text-accent-foreground"><Plus className="h-4 w-4" />Add</button>
                </div>
              </div>
              {tasks.length === 0 ? (
                <div className={`${card} text-center text-sm text-muted-foreground`}>No bonus tasks yet. Users only see daily income and team commission until you add one.</div>
              ) : (
                tasks.map((t) => (
                  <div key={t.id} className={`${card} flex flex-wrap items-center justify-between gap-3`}>
                    <div className="min-w-0 flex-1"><p className="truncate font-bold">{t.title}</p><p className="text-xs text-muted-foreground">{etb(t.reward)} · {t.status}</p></div>
                    <div className="flex shrink-0 items-center gap-2">
                      {t.status === "Under Review" && <button onClick={() => approve(t.id)} className="rounded-lg bg-success px-3 py-1.5 text-xs font-bold text-success-foreground">Approve</button>}
                      <button onClick={() => { actions.removeTask(t.id); void logAdmin("task.removed", { type: "task", id: t.id, metadata: { title: t.title } }); toast("Task removed"); }} aria-label={`Remove ${t.title}`} className="grid h-8 w-8 place-items-center rounded-lg bg-secondary text-destructive"><Trash2 className="h-4 w-4" /></button>
                    </div>
                  </div>
                ))
              )}
            </>
          )}

          {tab === "news" && (
            <>
              <div className={card}>
                <p className="font-bold">Publish news</p>
                <p className="mt-1 text-xs text-muted-foreground">New posts appear on the user News page right away.</p>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <input value={newsDraft.title} onChange={(e) => setNewsDraft({ ...newsDraft, title: e.target.value })} placeholder="Title" className="w-full rounded-xl border bg-surface px-4 py-2.5" />
                  <input value={newsDraft.tag} onChange={(e) => setNewsDraft({ ...newsDraft, tag: e.target.value })} placeholder="Tag (e.g. Announcement)" className="w-full rounded-xl border bg-surface px-4 py-2.5" />
                </div>
                <textarea value={newsDraft.body} onChange={(e) => setNewsDraft({ ...newsDraft, body: e.target.value })} placeholder="Article body" rows={3} className="mt-2 w-full rounded-xl border bg-surface px-4 py-2.5" />
                <button
                  onClick={async () => {
                    const title = newsDraft.title.trim();
                    const body = newsDraft.body.trim();
                    const tag = newsDraft.tag.trim() || "Announcement";
                    if (!title || !body) { toast.error("Enter a title and body"); return; }
                    const { data, error } = await supabase.from("news").insert({ title, body, tag }).select("id,title,body,tag,image_url,created_at").single();
                    if (error) {
                      toast.error("Could not publish news", { description: error.message });
                      return;
                    }
                    const row = data as { id: string; title: string; body: string; tag: string; image_url: string | null; created_at: string };
                    actions.setNews([{
                      id: String(row.id),
                      title: String(row.title),
                      body: String(row.body),
                      tag: String(row.tag ?? "Announcement"),
                      image: row.image_url ? String(row.image_url) : defaultNewsImage,
                      date: String(row.created_at ?? "").slice(0, 10),
                    }, ...news]);
                    void logAdmin("news.published", { type: "news", id: String(row.id), metadata: { title } });
                    setNewsDraft({ title: "", tag: "", body: "" });
                    toast.success("News published");
                  }}
                  className="press mt-3 flex items-center gap-1.5 rounded-xl bg-accent px-4 py-2.5 text-sm font-bold text-accent-foreground"><Plus className="h-4 w-4" />Publish</button>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {news.map((n) => (
                  <div key={n.id} className={`${card} flex items-start gap-3`}>
                    <img src={n.image} alt="" className="h-14 w-20 shrink-0 rounded-lg object-cover" />
                    <div className="min-w-0 flex-1"><p className="truncate font-bold">{n.title}</p><p className="text-xs text-muted-foreground">{n.tag} · {fmtDate(n.date)}</p></div>
                    <button onClick={async () => {
                      const { error } = await supabase.from("news").delete().eq("id", n.id);
                      if (error) { toast.error("Could not remove news", { description: error.message }); return; }
                      actions.removeNews(n.id);
                      void logAdmin("news.removed", { type: "news", id: n.id, metadata: { title: n.title } });
                      toast("News removed");
                    }} aria-label={`Remove ${n.title}`} className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-secondary text-destructive"><Trash2 className="h-4 w-4" /></button>
                  </div>
                ))}
              </div>
            </>
          )}

          {tab === "transactions" && (
            <>
              <div className="mt-1 flex items-center gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-tint-orange text-primary"><Wallet className="h-5 w-5" /></span>
                <div>
                  <p className="font-bold">Deposits</p>
                  <p className="text-xs text-muted-foreground">Pending, failed checks and completed credits.</p>
                </div>
              </div>

              <div className={card}>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-bold">Pending deposits</p>
                    <p className="mt-1 text-xs text-muted-foreground">All deposits stay pending until an admin approves them.</p>
                  </div>
                  <button type="button" onClick={() => { void loadPendingRecharges(); void loadLedgerHistory(); }} className="rounded-lg bg-secondary px-3 py-2 text-xs font-bold">Refresh</button>
                </div>
                <div className="mt-3 divide-y">
                  {pendingRecharges.length === 0 ? (
                    <p className="py-3 text-sm text-muted-foreground">No deposits awaiting approval.</p>
                  ) : pendingRecharges.map((row) => (
                    <div key={row.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                      <div className="min-w-0 flex-1">
                        <p className="font-bold">{etb(row.amount)}</p>
                        <p className="truncate text-xs text-muted-foreground">Member {row.member_id || row.user_id} · {row.transaction_ref || "No transaction reference"} · {fmtDate(row.created_at)}</p>
                        {row.proof_url && <button type="button" onClick={async () => { const { data } = await supabase.storage.from("recharge-proofs").createSignedUrl(row.proof_url!, 300); if (data?.signedUrl) setProofPreview({ id: row.id, url: data.signedUrl }); }} className="mt-1 text-xs font-bold text-accent">View screenshot</button>}
                      </div>
                      <div className="flex gap-2">
                        <button type="button" onClick={() => void approveRecharge(row.id)} className="rounded-lg bg-success px-3 py-2 text-xs font-bold text-success-foreground">Approve</button>
                        <button type="button" onClick={() => void rejectRecharge(row.id)} className="rounded-lg bg-secondary px-3 py-2 text-xs font-bold text-destructive">Reject</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className={card}>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-bold">Failed deposit verifications</p>
                    <p className="mt-1 text-xs text-muted-foreground">Rejected or unverifiable CBE payments. Rejected attempts are logged here but never added to pending deposits.</p>
                  </div>
                  <button type="button" onClick={() => void loadVerificationLogs()} className="rounded-lg bg-secondary px-3 py-2 text-xs font-bold">Refresh</button>
                </div>
                <div className="mt-3 divide-y">
                  {verificationLogs.length === 0 ? (
                    <p className="py-3 text-sm text-muted-foreground">No failed deposit verifications logged.</p>
                  ) : verificationLogs.map((row) => (
                    <div key={row.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                      <div className="min-w-0 flex-1">
                        <p className="flex flex-wrap items-center gap-2 font-bold">
                          {etb(row.amount)}
                          <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${row.outcome === "rejected" ? "bg-destructive/10 text-destructive" : "bg-warning/20 text-primary"}`}>
                            {row.outcome === "rejected" ? "Rejected" : "Manual review"}
                          </span>
                        </p>
                        <p className="truncate text-xs text-muted-foreground">Member {row.member_id || row.user_id} · {row.transaction_ref || "No transaction reference"} · {fmtDate(row.created_at)}</p>
                        {row.reason && <p className="mt-1 text-xs text-muted-foreground">{row.reason}</p>}
                        {row.proof_url && <button type="button" onClick={async () => { const { data } = await supabase.storage.from("recharge-proofs").createSignedUrl(row.proof_url!, 300); if (data?.signedUrl) setProofPreview({ id: row.id, url: data.signedUrl }); }} className="mt-1 text-xs font-bold text-accent">View screenshot</button>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className={card}>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-bold">Deposit history</p>
                    <p className="mt-1 text-xs text-muted-foreground">Completed and rejected deposits with reference, method and proof — separate from withdrawals.</p>
                  </div>
                  <button type="button" onClick={() => void loadLedgerHistory()} className="rounded-lg bg-secondary px-3 py-2 text-xs font-bold">Refresh</button>
                </div>
                <div className="mt-3 divide-y">
                  {depositHistory.length === 0 ? (
                    <p className="py-3 text-sm text-muted-foreground">No deposits recorded yet.</p>
                  ) : depositHistory.map((row) => (
                    <div key={row.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                      <div className="min-w-0 flex-1">
                        <p className="flex flex-wrap items-center gap-2 font-bold">
                          {etb(Math.abs(row.amount))}
                          <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${row.status === "completed" ? "bg-success/15 text-success" : "bg-destructive/10 text-destructive"}`}>
                            {row.status === "completed" ? "Completed" : "Rejected"}
                          </span>
                          {row.adminApproved && (
                            <span className="rounded-full bg-tint-violet px-2 py-0.5 text-[11px] font-bold text-primary">
                              Admin approved
                            </span>
                          )}
                        </p>
                        <p className="mt-1 truncate text-xs text-muted-foreground">
                          {row.transaction_ref ? `Ref ${row.transaction_ref}` : "No transaction reference"}
                          {row.description ? ` · ${row.description}` : ""}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">Member {row.member_id || row.user_id} · {fmtDate(row.created_at)}</p>
                        {row.proof_url && <button type="button" onClick={async () => { const { data } = await supabase.storage.from("recharge-proofs").createSignedUrl(row.proof_url!, 300); if (data?.signedUrl) setProofPreview({ id: row.id, url: data.signedUrl }); }} className="mt-1 text-xs font-bold text-accent">View screenshot</button>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-6 flex items-center gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-tint-violet text-primary"><ArrowUpRight className="h-5 w-5" /></span>
                <div>
                  <p className="font-bold">Withdrawals</p>
                  <p className="text-xs text-muted-foreground">Pending requests and completed payouts.</p>
                </div>
              </div>

              <div className={card}>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-bold">Pending withdrawals</p>
                    <p className="mt-1 text-xs text-muted-foreground">Approve withdrawals only after verifying bank details.</p>
                  </div>
                  <button type="button" onClick={() => { void loadPendingWithdrawals(); void loadLedgerHistory(); }} className="rounded-lg bg-secondary px-3 py-2 text-xs font-bold">Refresh</button>
                </div>
                <div className="mt-3 divide-y">
                  {pendingWithdrawals.length === 0 ? (
                    <p className="py-3 text-sm text-muted-foreground">No withdrawals awaiting approval.</p>
                  ) : pendingWithdrawals.map((row) => (
                    <div key={row.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                      <div className="min-w-0 flex-1">
                        <p className="font-bold">{etb(Math.abs(row.amount))} <span className="text-xs font-semibold text-muted-foreground">· Pay {etb(withdrawalPayout(row.amount))}</span></p>
                        <p className="truncate text-xs text-muted-foreground">{row.description || "Withdrawal request"} · {fmtDate(row.created_at)}</p>
                      </div>
                      <div className="flex gap-2">
                        <button type="button" onClick={() => void approveWithdrawal(row.id)} className="rounded-lg bg-success px-3 py-2 text-xs font-bold text-success-foreground">Approve</button>
                        <button type="button" onClick={() => void rejectWithdrawal(row.id)} className="rounded-lg bg-secondary px-3 py-2 text-xs font-bold text-destructive">Reject</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className={card}>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-bold">Withdrawal history</p>
                    <p className="mt-1 text-xs text-muted-foreground">Completed and rejected withdrawals, separate from deposits.</p>
                  </div>
                  <button type="button" onClick={() => void loadLedgerHistory()} className="rounded-lg bg-secondary px-3 py-2 text-xs font-bold">Refresh</button>
                </div>
                <div className="mt-3 divide-y">
                  {withdrawalHistory.length === 0 ? (
                    <p className="py-3 text-sm text-muted-foreground">No withdrawals recorded yet.</p>
                  ) : withdrawalHistory.map((row) => (
                    <div key={row.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                      <div className="min-w-0 flex-1">
                        <p className="flex flex-wrap items-center gap-2 font-bold">
                          {etb(Math.abs(row.amount))}
                          <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${row.status === "completed" ? "bg-success/15 text-success" : "bg-destructive/10 text-destructive"}`}>
                            {row.status === "completed" ? "Completed" : "Rejected"}
                          </span>
                        </p>
                        <p className="truncate text-xs text-muted-foreground">Member {row.member_id || row.user_id} · {row.description || "Withdrawal request"} · {fmtDate(row.created_at)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {tab === "audit" && (
            <>
              <section className="relative overflow-hidden rounded-3xl bg-primary p-5 text-primary-foreground shadow-card sm:p-6">
                <div className="pointer-events-none absolute -right-12 -top-12 h-44 w-44 rounded-full bg-accent/20 blur-3xl" />
                <div className="pointer-events-none absolute -bottom-16 -left-10 h-40 w-40 rounded-full bg-white/10 blur-3xl" />
                <div className="relative flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-[0.18em] text-accent">
                      <ShieldCheck className="h-4 w-4" />Audit trail
                    </p>
                    <h2 className="mt-2 text-2xl font-extrabold tracking-tight">Every admin action, recorded</h2>
                    <p className="mt-1 max-w-lg text-sm text-primary-foreground/70">
                      Sign-ins, approvals, rejections and rule changes, with the admin email, IP address and device.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void loadAuditLogs()}
                    className="press shrink-0 self-start rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-xs font-bold text-primary-foreground"
                  >
                    {auditLoading ? "Refreshing…" : "Refresh"}
                  </button>
                </div>
                <div className="relative mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
                  <div className="rounded-2xl bg-white/10 p-3">
                    <p className="text-[11px] font-semibold text-primary-foreground/70">Logged events</p>
                    <p className="mt-1 text-xl font-extrabold text-accent tabular-nums">{auditLogs.length.toLocaleString()}</p>
                  </div>
                  <div className="rounded-2xl bg-white/10 p-3">
                    <p className="text-[11px] font-semibold text-primary-foreground/70">Admins seen</p>
                    <p className="mt-1 text-xl font-extrabold text-accent tabular-nums">
                      {new Set(auditLogs.map((row) => row.admin_email ?? "unknown")).size.toLocaleString()}
                    </p>
                  </div>
                  <div className="col-span-2 rounded-2xl bg-white/10 p-3 sm:col-span-1">
                    <p className="text-[11px] font-semibold text-primary-foreground/70">Latest activity</p>
                    <p className="mt-1 truncate text-sm font-bold text-accent">{auditLogs[0] ? fmtDateTime(auditLogs[0].created_at) : "No entries yet"}</p>
                  </div>
                </div>
              </section>

              <div className={card}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="flex items-center gap-2 font-bold"><ScrollText className="h-4 w-4 text-accent" />Recent admin activity</p>
                  <span className="rounded-full bg-secondary px-2.5 py-1 text-[11px] font-bold text-primary">{auditLogs.length} entries</span>
                </div>
                <div className="mt-3 divide-y">
                  {auditLoading && auditLogs.length === 0 ? (
                    <div className="space-y-3 py-4">
                      {[0, 1, 2].map((i) => (
                        <div key={i} className="space-y-2">
                          <div className="h-3.5 w-32 animate-pulse rounded-full bg-secondary" />
                          <div className="h-3 w-56 animate-pulse rounded-full bg-secondary" />
                        </div>
                      ))}
                    </div>
                  ) : auditLogs.length === 0 ? (
                    <p className="py-5 text-sm text-muted-foreground">
                      No admin activity logged yet. Run <span className="font-semibold text-primary">ENABLE_AUDIT_LOGGING.sql</span> in Supabase, then sign in again.
                    </p>
                  ) : auditLogs.map((row) => (
                    <div key={row.id} className="flex flex-col gap-2 py-3.5 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <p className="flex flex-wrap items-center gap-2">
                          <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${auditActionTone(row.action)}`}>{auditActionLabel(row.action)}</span>
                          <span className="truncate text-xs font-semibold text-foreground">{row.admin_email ?? "Unknown admin"}</span>
                        </p>
                        <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                          <span className="inline-flex items-center gap-1"><Globe className="h-3 w-3" />{row.ip_address || "Unknown IP"}</span>
                          <span className="inline-flex items-center gap-1"><Monitor className="h-3 w-3" />{deviceLabel(row.user_agent)}</span>
                          {row.member_id && <span className="truncate">Member {row.member_id}</span>}
                          {row.target_type && row.target_id && <span className="truncate">Target {row.target_type} · {row.target_id}</span>}
                        </p>
                      </div>
                      <time dateTime={row.created_at} className="shrink-0 text-[11px] font-semibold text-muted-foreground">{fmtDateTime(row.created_at)}</time>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

        </main>
      </div>

      {/* Mobile bottom navigation: the three daily destinations plus a More sheet. */}
      <nav aria-label="Admin quick navigation" className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
        <div className="mx-auto grid max-w-md grid-cols-4 px-2">
          {([
            { k: "analytics" as Tab, l: "Home", i: BarChart3, badge: 0 },
            { k: "users" as Tab, l: "Users", i: Users, badge: pendingMembers.length },
            { k: "transactions" as Tab, l: "Ledger", i: ReceiptText, badge: ledgerBadge },
          ]).map(({ k, l, i: Icon, badge }) => {
            const active = tab === k;
            return (
              <button
                key={k}
                type="button"
                onClick={() => selectTab(k)}
                aria-current={active ? "page" : undefined}
                className="press flex flex-col items-center gap-1 py-2 text-[11px] font-bold"
              >
                <span className={`relative grid h-9 w-12 place-items-center rounded-xl transition ${active ? "bg-primary text-primary-foreground shadow-card" : "text-muted-foreground"}`}>
                  <Icon className="h-5 w-5" />
                  {badge > 0 && (
                    <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-destructive px-1 text-[9px] font-bold text-destructive-foreground">
                      {badge > 9 ? "9+" : badge}
                    </span>
                  )}
                </span>
                <span className={active ? "text-primary" : "text-muted-foreground"}>{l}</span>
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            aria-expanded={moreOpen}
            aria-haspopup="dialog"
            className="press flex flex-col items-center gap-1 py-2 text-[11px] font-bold"
          >
            <span className={`relative grid h-9 w-12 place-items-center rounded-xl transition ${moreActive ? "bg-primary text-primary-foreground shadow-card" : "text-muted-foreground"}`}>
              <LayoutGrid className="h-5 w-5" />
              {moreActive && <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-accent" />}
            </span>
            <span className={moreActive ? "text-primary" : "text-muted-foreground"}>More</span>
          </button>
        </div>
      </nav>

      {/* Bottom sheet with the remaining admin sections. */}
      {moreOpen && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="More admin sections">
          <button type="button" aria-label="Close menu" onClick={() => setMoreOpen(false)} className="absolute inset-0 h-full w-full bg-black/40 backdrop-blur-sm" />
          <div className="rise absolute inset-x-0 bottom-0 rounded-t-3xl bg-background p-4 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] shadow-lift">
            <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-border" />
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="font-extrabold text-primary">More sections</p>
                <p className="text-[11px] text-muted-foreground">Packages, bonuses, tasks, news and the audit log.</p>
              </div>
              <button type="button" onClick={() => setMoreOpen(false)} aria-label="Close" className="press grid h-8 w-8 shrink-0 place-items-center rounded-full bg-secondary text-primary">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              {moreTabs.map(({ k, l, i: Icon }) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => selectTab(k)}
                  className={`press flex items-center gap-3 rounded-2xl border p-3 text-left ${tab === k ? "border-primary/30 bg-primary/5" : "border-border bg-card"}`}
                >
                  <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${tab === k ? "bg-primary text-primary-foreground" : "bg-secondary text-primary"}`}>
                    <Icon className="h-5 w-5" />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-bold">{l}</span>
                    <span className="block truncate text-[11px] text-muted-foreground">
                      {k === "appliances" ? "Catalogue & requests" : k === "bonuses" ? "Commission rules" : k === "giftcodes" ? "Generate & manage codes" : k === "tasks" ? "Bonus tasks" : k === "news" ? "Announcements" : "Admin activity"}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {proofPreview && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Payment proof preview"
          onClick={() => setProofPreview(null)}
          className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4 backdrop-blur-sm"
        >
          <div className="relative w-full max-w-lg" onClick={(event) => event.stopPropagation()}>
            <button
              type="button"
              aria-label="Close preview"
              onClick={() => setProofPreview(null)}
              className="press absolute -right-2 -top-2 z-10 grid h-9 w-9 place-items-center rounded-full bg-background text-foreground shadow-card ring-1 ring-border"
            >
              <X className="h-4 w-4" />
            </button>
            <img src={proofPreview.url} alt="Payment proof" className="max-h-[85vh] w-full rounded-2xl bg-card object-contain shadow-card" />
          </div>
        </div>
      )}
    </div>
  );
}
