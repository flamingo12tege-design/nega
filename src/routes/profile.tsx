import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { UserRound, ReceiptText, ShoppingBag, Trophy, Users, Bell, ShieldCheck, LifeBuoy, Info, LogOut, ChevronRight, Clock3, ChartColumnIncreasing, HandCoins, Banknote, Sparkles, PiggyBank, Landmark, Check } from "lucide-react";
import { fmtDate, etb, maskAccount } from "@/lib/format";
import { actions, useStore } from "@/lib/store";
import { Logo } from "@/components/cas/Logo";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useSupabaseWallet } from "@/lib/use-supabase-wallet";
import { SecuritySettings, useWithdrawalPasswordStatus } from "@/components/cas/SecuritySettings";

export const Route = createFileRoute("/profile")({
  head: () => ({ meta: [{ title: "Profile — CAS" }, { name: "description", content: "Manage your CAS account, wallet and settings." }, { property: "og:title", content: "Profile — CAS" }, { property: "og:description", content: "Manage your CAS account, wallet and settings." }] }),
  component: Page,
});

function Page() {
  const nav = useNavigate();
  const items = [
    { l: "Transaction History", i: ReceiptText, to: "/wallet" as const },
    { l: "My Purchases", i: ShoppingBag, to: "/wallet" as const },
    { l: "Referral History", i: Users, to: "/team" as const },
    { l: "Notifications", i: Bell, to: "/notifications" as const },
    { l: "Help and Support", i: LifeBuoy, to: "/support" as const },
    { l: "About CAS", i: Info, to: "/about" as const },
  ];
  const [profile, setProfile] = useState<{ member_id?: string; phone?: string; created_at?: string } | null>(null);
  const [email, setEmail] = useState("");
  const [securityOpen, setSecurityOpen] = useState(false);
  const { hasPassword, unavailable, refresh: refreshSecurity } = useWithdrawalPasswordStatus();

  useEffect(() => {
    const loadProfile = async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const authUser = sessionData.session?.user;
      if (!authUser) return;
      setEmail(authUser.email ?? "");
      const { data } = await supabase
        .from("profiles")
        .select("member_id,phone,created_at")
        .eq("id", authUser.id)
        .maybeSingle();
      setProfile(data);
    };
    void loadProfile();
  }, []);
  const wallet = useSupabaseWallet();
  return (
    <div>
      <header className="bg-primary px-5 pb-16 pt-6 text-primary-foreground lg:rounded-b-3xl">
        <div className="flex items-center gap-4">
          <span className="grid h-16 w-16 shrink-0 place-items-center rounded-full bg-accent text-xl font-extrabold text-accent-foreground"><UserRound className="h-7 w-7" /></span>
          <div className="min-w-0">
            <h1 className="truncate text-xl font-extrabold">{profile?.member_id}</h1>
            <p className="text-sm opacity-75">{profile?.phone}</p>
            <p className="text-xs opacity-60">{email}</p>
          </div>
        </div>
      </header>
      <div className="-mt-10 mx-5 rounded-2xl bg-card p-4 shadow-card">
        <p className="text-xs text-muted-foreground">Registered</p><p className="font-bold">{profile?.created_at ? fmtDate(profile.created_at) : "—"}</p>
      </div>
      <WalletStats wallet={wallet} />
      <div className="mx-5 mt-5 divide-y overflow-hidden rounded-2xl bg-card shadow-card">
        <Link to="/wallet" className="flex items-center gap-3 px-4 py-3.5 hover:bg-muted">
          <ReceiptText className="h-5 w-5 text-primary" />
          <span className="flex-1 text-sm font-semibold">Transaction History</span>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </Link>
        <PayoutAccount />
        <button
          type="button"
          onClick={() => setSecurityOpen(true)}
          className="flex w-full items-center gap-3 px-4 py-3.5 text-left hover:bg-muted"
        >
          <ShieldCheck className="h-5 w-5 text-primary" />
          <span className="flex-1">
            <span className="block text-sm font-semibold">Security Settings</span>
            <span className="block text-xs text-muted-foreground">
              {unavailable
                ? "Not available yet"
                : hasPassword === null
                  ? "Loading…"
                  : hasPassword
                    ? "Withdrawal password is on"
                    : "Set a withdrawal password"}
            </span>
          </span>
          {hasPassword ? <Check className="h-4 w-4 text-success" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
        </button>
        {items.filter(({ l }) => l !== "Transaction History").map(({ l, i: Icon, to }) => (
          <Link key={l} to={to} className="flex items-center gap-3 px-4 py-3.5 hover:bg-muted">
            <Icon className="h-5 w-5 text-primary" />
            <span className="flex-1 text-sm font-semibold">{l}</span>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </Link>
        ))}
        <button onClick={async () => { await supabase.auth.signOut(); actions.setLoggedIn(false); nav({ to: "/login" }); }} className="flex w-full items-center gap-3 px-4 py-3.5 text-left text-destructive hover:bg-muted">
          <LogOut className="h-5 w-5" /><span className="text-sm font-semibold">Logout</span>
        </button>
      </div>
      <div className="mt-8 flex justify-center"><Logo className="h-8 opacity-60" /></div>
      <SecuritySettings
        open={securityOpen}
        onClose={() => setSecurityOpen(false)}
        hasPassword={hasPassword}
        unavailable={unavailable}
        refresh={refreshSecurity}
      />
    </div>
  );
}

function WalletStats({ wallet }: { wallet: ReturnType<typeof useSupabaseWallet> }) {
  const tiles = [
    { l: "This week", v: wallet.thisWeek, i: Clock3, t: "bg-tint-orange" },
    { l: "This month", v: wallet.thisMonth, i: ChartColumnIncreasing, t: "bg-tint-green" },
  ];
  const rows = [
    { l: "This week", v: wallet.thisWeek, i: Sparkles },
    { l: "Total deposit", v: wallet.totalDeposit, i: PiggyBank },
    { l: "Total withdrawal", v: wallet.totalWithdrawal, i: Landmark },
  ];
  return (
    <section className="mx-5 mt-5">
      <div className="mb-3 flex items-center justify-between"><h2 className="text-lg font-extrabold">My Wallet</h2><Link to="/wallet" className="text-sm font-bold text-accent">Details</Link></div>
      <div className="grid grid-cols-2 gap-3">
        {tiles.map(({ l, v, i: Icon, t }) => (
          <div key={l} className="rounded-2xl bg-card p-4 shadow-card">
            <span className={`grid h-10 w-10 place-items-center rounded-full text-primary ${t}`}><Icon className="h-5 w-5" /></span>
            <p className="mt-3 font-extrabold">{etb(v)}</p>
            <p className="text-xs text-muted-foreground">{l}</p>
          </div>
        ))}
      </div>
      <div className="mt-3 space-y-3">
        {rows.map(({ l, v, i: Icon }) => (
          <div key={l} className="flex items-center gap-3 rounded-2xl bg-card p-4 shadow-card">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-tint-green text-primary"><Icon className="h-5 w-5" /></span>
            <span className="flex-1 text-sm font-semibold">{l}</span>
            <span className="font-extrabold text-accent">{etb(v)}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function PayoutAccount() {
  const saved = useStore((s) => s.payoutAccount);
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(saved);

  // Restore the saved account from Supabase so it is remembered across sessions.
  useEffect(() => {
    let active = true;
    const load = async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData.session?.user.id;
      if (!userId) return;
      const { data } = await supabase.from("profiles").select("payout_account").eq("id", userId).maybeSingle();
      const account = typeof data?.payout_account === "string" ? data.payout_account : "";
      if (!active || !account) return;
      actions.setPayoutAccount(account);
      setValue(account);
    };
    void load();
    return () => { active = false; };
  }, []);

  const save = async () => {
    if (!/^\d{13}$/.test(value)) { toast.error("Enter a valid 13-digit CBE account number"); return; }
    const { error } = await supabase.rpc("set_payout_account", { p_account: value });
    if (error && !/could not find the function|does not exist/i.test(error.message)) {
      toast.error("Could not save bank account", { description: error.message });
      return;
    }
    actions.setPayoutAccount(value);
    setOpen(false);
    toast.success("Bank account saved", { description: "Your CBE account details are attached." });
  };
  return (
    <div>
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-3 px-4 py-3.5 text-left hover:bg-muted">
        <Landmark className="h-5 w-5 text-primary" />
        <span className="flex-1">
          <span className="block text-sm font-semibold">Bank Account Attachment</span>
          {saved && <span className="block text-xs text-muted-foreground">CBE {maskAccount(saved)}</span>}
        </span>
        {saved ? <Check className="h-4 w-4 text-success" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
      </button>
      {open && (
        <div className="border-t px-4 py-4">
          <label className="block">
            <span className="text-sm font-semibold">CBE account number</span>
            <input inputMode="numeric" maxLength={13} value={value} onChange={(e) => setValue(e.target.value.replace(/\D/g, "").slice(0, 13))} placeholder="13-digit CBE account" className="mt-2 w-full rounded-xl border bg-surface px-3 py-3 text-sm font-bold outline-none focus:border-accent" />
          </label>
          <button type="button" onClick={save} className="press mt-3 w-full rounded-xl bg-accent py-3 text-sm font-bold text-accent-foreground">Save Bank Account</button>
        </div>
      )}
    </div>
  );
}
