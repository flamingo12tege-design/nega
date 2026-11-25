import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Users, ShoppingBag, Gift, ListChecks, Newspaper, ReceiptText, BarChart3,
  Plus, Trash2, Check, X, Clock3, Wallet, TrendingUp, Search, Lock, Unlock,
  Ban, RotateCcw, ArrowDownRight, ArrowUpRight, ArrowLeft, LockKeyhole, Eye, EyeOff,
} from "lucide-react";
import { dailyCommission } from "@/lib/referral";
import { etb, fmtDate } from "@/lib/format";
import { rewardRules } from "@/lib/mock-data";
import { actions, useReferral, useStore } from "@/lib/store";
import type { AdminUser } from "@/lib/mock-data";
import { Logo } from "@/components/cas/Logo";
import { StatusPill } from "@/components/cas/StatusPill";
import { supabase } from "@/lib/supabase";

export const Route = createFileRoute("/casadmin")({
  head: () => ({ meta: [{ title: "Admin Dashboard — CAS" }, { name: "description", content: "Manage CAS users, appliances, bonuses, tasks and news." }, { property: "og:title", content: "Admin Dashboard — CAS" }, { property: "og:description", content: "Manage CAS users, appliances, bonuses, tasks and news." }] }),
  component: AdminRoute,
});

const tabs = [
  { k: "analytics", l: "Overview", i: BarChart3 }, { k: "users", l: "Users", i: Users }, { k: "appliances", l: "Packages", i: ShoppingBag },
  { k: "bonuses", l: "Bonuses", i: Gift }, { k: "tasks", l: "Tasks", i: ListChecks }, { k: "news", l: "News", i: Newspaper }, { k: "transactions", l: "Ledger", i: ReceiptText },
] as const;
type Tab = (typeof tabs)[number]["k"];

const card = "rounded-2xl bg-card p-4 shadow-card";

function AdminSignIn({ onSuccess }: { onSuccess: (email: string) => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();

    const email = username.trim().toLowerCase();
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error || !data.user) {
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
      setError("This account does not have admin access.");
      return;
    }

    sessionStorage.setItem("cas_admin_authenticated", "true");
    onSuccess(email);
  };

  return (
    <div className="grid min-h-screen place-items-center bg-surface px-5">
      <form onSubmit={submit} className="w-full max-w-sm rounded-3xl bg-card p-6 shadow-card">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-tint-green text-primary"><LockKeyhole className="h-6 w-6" /></span>
        <h1 className="mt-4 text-center text-2xl font-extrabold">Admin Sign In</h1>
        <p className="mt-1 text-center text-sm text-muted-foreground">Restricted CAS operations access</p>

        <label className="mt-6 block">
          <span className="text-sm font-semibold">Email</span>
          <input type="email" value={username} onChange={(e) => { setUsername(e.target.value); setError(""); }} autoComplete="email" className="mt-2 w-full rounded-xl border bg-surface px-4 py-3 outline-none focus:border-accent" placeholder="tegene@tegene.com" />
        </label>

        <label className="mt-4 block">
          <span className="text-sm font-semibold">Password</span>
          <div className="mt-2 flex rounded-xl border bg-surface focus-within:border-accent">
            <input type={showPassword ? "text" : "password"} value={password} onChange={(e) => { setPassword(e.target.value); setError(""); }} autoComplete="current-password" className="min-w-0 flex-1 bg-transparent px-4 py-3 outline-none" placeholder="••••••••" />
            <button type="button" onClick={() => setShowPassword((v) => !v)} className="px-3 text-muted-foreground" aria-label={showPassword ? "Hide password" : "Show password"}>{showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}</button>
          </div>
        </label>

        {error && <p className="mt-3 rounded-xl bg-destructive/10 px-3 py-2 text-sm font-semibold text-destructive">{error}</p>}
        <button className="press mt-5 w-full rounded-2xl bg-accent py-4 font-extrabold text-accent-foreground">Sign In</button>
        <Link to="/" className="mt-4 block text-center text-sm font-semibold text-primary">Back to CAS</Link>
      </form>
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

  const signOut = () => {
    sessionStorage.removeItem("cas_admin_authenticated");
    setAuthenticated(false);
  };

  return <Page onSignOut={signOut} adminEmail={adminEmail} />;
}

function Page({ onSignOut, adminEmail }: { onSignOut: () => void; adminEmail: string }) {
  const [tab, setTab] = useState<Tab>("analytics");
  const purchases = useStore((s) => s.purchases);
  const tasks = useStore((s) => s.tasks);
  const team = useStore((s) => s.team);
  const referral = useStore((s) => s.referral);
  const balance = useStore((s) => s.walletBalance);
  const packages = useStore((s) => s.packages);
  const lockedIds = useStore((s) => s.lockedIds);
  const news = useStore((s) => s.news);
  const [members, setMembers] = useState<AdminUser[]>([]);
  const { vip, recruitmentBonus, dailyCommission: teamCommission } = useReferral();
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
  const [pendingWithdrawals, setPendingWithdrawals] = useState<Array<{ id: string; user_id: string; amount: number; description: string | null; created_at: string }>>([]);

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

  const approveRecharge = async (id: string) => {
    const { error } = await supabase.rpc("approve_recharge", { p_ledger_id: id });
    if (error) { toast.error("Could not approve deposit", { description: error.message }); return; }
    toast.success("Deposit approved and balance credited");
    await loadPendingRecharges();
  };

  const rejectRecharge = async (id: string) => {
    const { error } = await supabase.rpc("reject_recharge", { p_ledger_id: id });
    if (error) { toast.error("Could not reject deposit", { description: error.message }); return; }
    toast("Deposit rejected");
    await loadPendingRecharges();
  };

  const approveWithdrawal = async (id: string) => {
    const { error } = await supabase.rpc("approve_withdrawal", { p_ledger_id: id });
    if (error) { toast.error("Could not approve withdrawal", { description: error.message }); return; }
    toast.success("Withdrawal approved and balance updated");
    await loadPendingWithdrawals();
  };

  const rejectWithdrawal = async (id: string) => {
    const { error } = await supabase.rpc("reject_withdrawal", { p_ledger_id: id });
    if (error) { toast.error("Could not reject withdrawal", { description: error.message }); return; }
    toast("Withdrawal rejected");
    await loadPendingWithdrawals();
  };

  const pendingPurchases = purchases.filter((p) => p.status === "Pending");
  const pendingMembers = team.filter((m) => m.status === "Pending");
  const addTask = () => {
    const reward = Number(draft.reward);
    if (!draft.title.trim()) { toast.error("Enter a task title"); return; }
    if (!reward) { toast.error("Enter a reward amount"); return; }
    actions.addTask(draft.title.trim(), draft.desc.trim() || "Complete this task to earn a reward.", reward);
    setDraft({ title: "", desc: "", reward: "" });
    toast.success("Bonus task added");
  };
  const approve = (id: string) => {
    actions.setTask(id, "Completed");
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

  useEffect(() => {
    void loadMembers();
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
  }, []);

  return (
    <div className="min-h-screen bg-surface">
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
        <nav aria-label="Admin sections" className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-1 lg:sticky lg:top-20 lg:mx-0 lg:h-fit lg:flex-col lg:overflow-visible lg:px-0">
          {tabs.map(({ k, l, i: Icon }) => (
            <button
              key={k}
              onClick={() => { setTab(k); setSelectedUserId(null); }}
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
                <div>
                  <p className="text-[11px] font-extrabold uppercase tracking-[0.2em] text-accent">Overview</p>
                  <h2 className="mt-1 text-2xl font-extrabold tracking-tight text-primary">Operations snapshot</h2>
                  <p className="mt-1 text-sm text-muted-foreground">Live counters across the referral tree, package approvals and wallet credits.</p>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  {[
                    { i: Users, l: "Members", v: members.length.toLocaleString(), s: "Registered accounts" },
                    { i: ShoppingBag, l: "Package requests", v: String(purchases.length), s: `${pendingPurchases.length} awaiting review` },
                    { i: BarChart3, l: "Your VIP", v: String(vip), s: "Highest approved VIP" },
                    { i: Wallet, l: "Wallet balance", v: etb(balance), s: "Withdrawable credit" },
                  ].map(({ i: Icon, l, v, s }) => (
                    <div key={l} className={card}>
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-xs font-semibold text-muted-foreground">{l}</p>
                        <span className="rounded-xl bg-secondary px-3 py-2 text-primary"><Icon className="h-4 w-4" /></span>
                      </div>
                      <p className="mt-2 text-2xl font-extrabold tracking-tight text-primary">{v}</p>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">{s}</p>
                    </div>
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
                      <button onClick={() => { actions.setPurchaseStatus(p.id, "Approved"); toast.success("Purchase approved"); }} className="shrink-0 rounded-lg bg-success px-2 py-1 text-xs font-bold text-success-foreground">Approve</button>
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
                    onClick={() => { const status = selectedUser.status === "Banned" ? "Active" : "Banned"; actions.setUserStatus(selectedUser.id, status); toast.success(`${selectedUser.name} ${status === "Banned" ? "banned" : "restored"}`); }}
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
                    <button onClick={() => { const amount = Number(adjustment); if (!amount) { toast.error("Enter an amount"); return; } actions.adjustUserBalance(selectedUser.id, amount); setAdjustment(""); toast.success(`${etb(amount)} credited`); }} className="press flex items-center gap-1.5 rounded-xl bg-success px-4 py-2.5 text-sm font-bold text-success-foreground"><ArrowUpRight className="h-4 w-4" />Add</button>
                    <button onClick={() => { const amount = Number(adjustment); if (!amount) { toast.error("Enter an amount"); return; } actions.adjustUserBalance(selectedUser.id, -amount); setAdjustment(""); toast.success(`${etb(amount)} removed`); }} className="press flex items-center gap-1.5 rounded-xl bg-secondary px-4 py-2.5 text-sm font-bold text-destructive"><ArrowDownRight className="h-4 w-4" />Remove</button>
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
                        <p className="text-xs text-muted-foreground">{etb(a.dailyPayout)}/day · {etb(a.dailyPayout * rewardRules.packageDurationDays)} in {rewardRules.packageDurationDays} days</p>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-bold text-primary">VIP {a.tier}</span>
                          <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${locked ? "bg-warning/20 text-primary" : "bg-success/15 text-success"}`}>{locked ? "Locked" : "Open"}</span>
                        </div>
                      </div>
                      <div className="flex shrink-0 flex-col gap-1">
                        <button onClick={() => { actions.togglePackageLock(a.id); toast.success(locked ? `${a.name} unlocked` : `${a.name} locked`); }} aria-label={locked ? `Unlock ${a.name}` : `Lock ${a.name}`} className="grid h-8 w-8 place-items-center rounded-lg bg-secondary text-primary">{locked ? <Unlock className="h-4 w-4" /> : <Lock className="h-4 w-4" />}</button>
                        <button onClick={() => { actions.removePackage(a.id); toast(`${a.name} removed`); }} aria-label={`Remove ${a.name}`} className="grid h-8 w-8 place-items-center rounded-lg bg-secondary text-destructive"><Trash2 className="h-4 w-4" /></button>
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
                            <button onClick={() => { actions.setPurchaseStatus(p.id, "Approved"); toast.success("Purchase approved"); }} aria-label="Approve purchase" className="grid h-8 w-8 place-items-center rounded-lg bg-success text-success-foreground"><Check className="h-4 w-4" /></button>
                            <button onClick={() => { actions.setPurchaseStatus(p.id, "Rejected"); toast("Purchase rejected"); }} aria-label="Reject purchase" className="grid h-8 w-8 place-items-center rounded-lg bg-secondary text-destructive"><X className="h-4 w-4" /></button>
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
                      <button onClick={() => { actions.removeTask(t.id); toast("Task removed"); }} aria-label={`Remove ${t.title}`} className="grid h-8 w-8 place-items-center rounded-lg bg-secondary text-destructive"><Trash2 className="h-4 w-4" /></button>
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
                  onClick={() => { if (!actions.addNews(newsDraft)) { toast.error("Enter a title and body"); return; } setNewsDraft({ title: "", tag: "", body: "" }); toast.success("News published"); }}
                  className="press mt-3 flex items-center gap-1.5 rounded-xl bg-accent px-4 py-2.5 text-sm font-bold text-accent-foreground"><Plus className="h-4 w-4" />Publish</button>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {news.map((n) => (
                  <div key={n.id} className={`${card} flex items-start gap-3`}>
                    <img src={n.image} alt="" className="h-14 w-20 shrink-0 rounded-lg object-cover" />
                    <div className="min-w-0 flex-1"><p className="truncate font-bold">{n.title}</p><p className="text-xs text-muted-foreground">{n.tag} · {fmtDate(n.date)}</p></div>
                    <button onClick={() => { actions.removeNews(n.id); toast("News removed"); }} aria-label={`Remove ${n.title}`} className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-secondary text-destructive"><Trash2 className="h-4 w-4" /></button>
                  </div>
                ))}
              </div>
            </>
          )}

          {tab === "transactions" && (
            <>
              <div className={card}>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-bold">Pending deposits</p>
                    <p className="mt-1 text-xs text-muted-foreground">Approve deposits only after verifying payment proof.</p>
                  </div>
                  <button type="button" onClick={() => void loadPendingRecharges()} className="rounded-lg bg-secondary px-3 py-2 text-xs font-bold">Refresh</button>
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
                        {proofPreview?.id === row.id && (
                          <img src={proofPreview.url} alt="Payment proof preview" className="mt-2 h-24 w-24 rounded-xl object-cover" />
                        )}
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
                <p className="font-bold">Pending withdrawals</p>
                <p className="mt-1 text-xs text-muted-foreground">Approve withdrawals only after verifying bank details.</p>
                <div className="mt-3 divide-y">
                  {pendingWithdrawals.length === 0 ? (
                    <p className="py-3 text-sm text-muted-foreground">No withdrawals awaiting approval.</p>
                  ) : pendingWithdrawals.map((row) => (
                    <div key={row.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                      <div className="min-w-0 flex-1">
                        <p className="font-bold">{etb(Math.abs(row.amount))}</p>
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
                <p className="font-bold">Transaction ledger</p>
                <p className="mt-3 text-sm text-muted-foreground">Approved deposits and withdrawals appear in the two sections above.</p>
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
