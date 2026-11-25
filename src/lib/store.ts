import { useSyncExternalStore } from "react";
import {
  appliances as seedAppliances,
  defaultNewsImage,
  defaultPackageImage,
  initialLockedIds,
  initialTasks,
  referralRules,
  rewardRules,
  type AdminUser,
  type Appliance,
  type NewsItem,
  type TaskStatus,
  type TeamMember,
} from "./mock-data";
import { claimStatus, todayKey, type DailyClaim } from "./daily-income";
import {
  highestTier,
  isVipEligible,
  recruitmentBonus,
  recruitmentBonusTotal,
  teamCommissionTotal,
  type ReferralSettings,
} from "./referral";

export type Purchase = { id: string; applianceId: string; method: string; status: "Pending" | "Approved" | "Rejected"; date: string };
export type ClaimResult =
  | { ok: true; amount: number }
  | { ok: false; reason: "not-active" | "already-claimed" | "completed" | "nothing-to-claim" };
export type CommissionClaim = { id: string; date: string; amount: number };
export type RecruitmentCredit = { id: string; member: string; amount: number; date: string };

/**
 * A member may hold up to two purchases of the same package — the second one
 * (VIP package #2) is allowed; further repeats are refused.
 */
export const MAX_PURCHASES_PER_PACKAGE = 2;

type State = {
  purchases: Purchase[];
  tasks: typeof initialTasks;
  loggedIn: boolean;
  walletBalance: number;
  claims: DailyClaim[];
  payoutAccount: string;
  referral: ReferralSettings;
  team: TeamMember[];
  adminUsers: AdminUser[];
  commissionClaims: CommissionClaim[];
  recruitmentCredits: RecruitmentCredit[];
  packages: Appliance[];
  lockedIds: string[];
  news: NewsItem[];
};
let state: State = {
  purchases: [],
  tasks: [],
  loggedIn: false,
  walletBalance: 0,
  claims: [],
  payoutAccount: "",
  referral: { ...referralRules, dailyCommissionPercentByLevel: [...referralRules.dailyCommissionPercentByLevel] },
  team: [],
  adminUsers: [],
  commissionClaims: [],
  recruitmentCredits: [],
  packages: seedAppliances,
  lockedIds: initialLockedIds,
  news: [],
};
const listeners = new Set<() => void>();
const set = (fn: (s: State) => State) => { state = fn(state); listeners.forEach((l) => l()); };

export const useStore = <T,>(sel: (s: State) => T) =>
  useSyncExternalStore((l) => (listeners.add(l), () => listeners.delete(l)), () => sel(state), () => sel(state));

/** Route loaders and non-React code can read the current package list. */
export const getPackage = (id: string) => state.packages.find((p) => p.id === id);

/** Minimum recharge follows the cheapest unlocked package, so any buyer can top up enough. */
export const minimumRechargeAmount = (s: State) => {
  const candidates = s.packages.filter((p) => !s.lockedIds.includes(p.id));
  const list = candidates.length > 0 ? candidates : s.packages;
  const min = list.reduce((lowest, p) => Math.min(lowest, p.price), Infinity);
  return Number.isFinite(min) ? min : 0;
};

/** VIP = highest approved package tier owned; tier 1 or above unlocks referral rewards. */
export const myVip = (s: State) =>
  highestTier(
    s.purchases
      .filter((p) => p.status === "Approved")
      .map((p) => s.packages.find((a) => a.id === p.applianceId)?.tier ?? 0),
  );

export const commissionDue = (s: State) =>
  teamCommissionTotal(s.team, s.referral.dailyCommissionPercentByLevel, myVip(s), rewardRules.packageDurationDays);

export const recruitmentDue = (s: State) =>
  recruitmentBonusTotal(s.team, s.referral.recruitmentBonusPercent, myVip(s));

/** One hook for pages that need the live referral settings, team and computed rewards. */
export const useReferral = () => {
  const team = useStore((s) => s.team);
  const settings = useStore((s) => s.referral);
  const purchases = useStore((s) => s.purchases);
  const packages = useStore((s) => s.packages);
  const commissionClaims = useStore((s) => s.commissionClaims);
  const recruitmentCredits = useStore((s) => s.recruitmentCredits);
  const vip = highestTier(
    purchases
      .filter((p) => p.status === "Approved")
      .map((p) => packages.find((a) => a.id === p.applianceId)?.tier ?? 0),
  );
  return {
    team,
    settings,
    vip,
    commissionClaims,
    recruitmentCredits,
    commissionClaimedToday: commissionClaims.some((c) => c.date === todayKey()),
    recruitmentBonus: recruitmentBonusTotal(team, settings.recruitmentBonusPercent, vip),
    dailyCommission: teamCommissionTotal(team, settings.dailyCommissionPercentByLevel, vip, rewardRules.packageDurationDays),
  };
};

export const actions = {
  addPurchase: (applianceId: string, method: string) => {
    const owned = state.purchases.filter((purchase) => purchase.applianceId === applianceId).length;
    if (owned >= MAX_PURCHASES_PER_PACKAGE) return false;
    set((s) => ({ ...s, purchases: [{ id: crypto.randomUUID(), applianceId, method, status: "Approved", date: new Date().toISOString() }, ...s.purchases] }));
    return true;
  },
  setTask: (id: string, status: TaskStatus) =>
    set((s) => ({ ...s, tasks: s.tasks.map((t) => (t.id === id ? { ...t, status } : t)) })),
  /** Admin-only: publish a bonus task to the user Tasks page. */
  addTask: (title: string, desc: string, reward: number) => {
    const task = { id: crypto.randomUUID(), title, desc, reward, status: "Available" as TaskStatus, icon: "Sparkles" };
    set((s) => ({ ...s, tasks: [task, ...s.tasks] }));
  },
  /** Admin-only: remove a bonus task. */
  removeTask: (id: string) => set((s) => ({ ...s, tasks: s.tasks.filter((t) => t.id !== id) })),
  /** Admin-only: review a purchase request. */
  setPurchaseStatus: (id: string, status: Purchase["status"]) =>
    set((s) => ({ ...s, purchases: s.purchases.map((p) => (p.id === id ? { ...p, status } : p)) })),
  /** Admin-only: lock or unlock a package for buyers. */
  togglePackageLock: (id: string) =>
    set((s) => ({ ...s, lockedIds: s.lockedIds.includes(id) ? s.lockedIds.filter((x) => x !== id) : [...s.lockedIds, id] })),
  /** Admin-only: create a package; uses the standard package image. */
  addPackage: (input: { name: string; tier: number; price: number; dailyPayout: number }) => {
    if (!input.name.trim() || input.price <= 0 || input.dailyPayout <= 0) return false;
    const appliance: Appliance = {
      id: `pkg-${crypto.randomUUID()}`,
      tier: input.tier,
      name: input.name.trim(),
      price: input.price,
      dailyPayout: input.dailyPayout,
      image: defaultPackageImage,
      short: "Admin-created CAS package.",
      details: ["Contents confirmed by CAS admin"],
    };
    set((s) => ({ ...s, packages: [...s.packages, appliance] }));
    return true;
  },
  /** Admin-only: remove a package from the catalogue. */
  removePackage: (id: string) =>
    set((s) => ({ ...s, packages: s.packages.filter((p) => p.id !== id), lockedIds: s.lockedIds.filter((x) => x !== id) })),
  /** Admin-only: publish or remove a news item. */
  addNews: (input: { title: string; body: string; tag: string }) => {
    if (!input.title.trim() || !input.body.trim()) return false;
    const item: NewsItem = {
      id: crypto.randomUUID(),
      title: input.title.trim(),
      body: input.body.trim(),
      tag: input.tag.trim() || "Announcement",
      date: todayKey(),
      image: defaultNewsImage,
    };
    set((s) => ({ ...s, news: [item, ...s.news] }));
    return true;
  },
  removeNews: (id: string) => set((s) => ({ ...s, news: s.news.filter((n) => n.id !== id) })),
  /** Admin-only: credit or debit a member's balance and record it in their history. */
  adjustUserBalance: (id: string, amount: number) => {
    if (!Number.isFinite(amount) || amount === 0) return false;
    set((s) => ({
      ...s,
      adminUsers: s.adminUsers.map((u) => {
        if (u.id !== id) return u;
        const entry = {
          id: crypto.randomUUID(),
          type: amount > 0 ? "Deposit" as const : "Adjustment" as const,
          amount,
          date: todayKey(),
          status: "Completed" as const,
        };
        return {
          ...u,
          balance: u.balance + amount,
          history: [entry, ...u.history],
          deposits: amount > 0 ? [{ id: entry.id, amount, date: entry.date, method: "Admin", status: "Completed" }, ...u.deposits] : u.deposits,
        };
      }),
    }));
    return true;
  },
  /** Admin-only: ban or restore a member. */
  setUserStatus: (id: string, status: AdminUser["status"]) =>
    set((s) => ({ ...s, adminUsers: s.adminUsers.map((u) => (u.id === id ? { ...u, status } : u)) })),
  /** Claim today's income for one active package. Returns why a claim was refused. */
  claimDaily: (purchaseId: string, applianceId?: string, status?: Purchase["status"]): ClaimResult => {
    const purchase = state.purchases.find((p) => p.id === purchaseId);
    const appliance = purchase ? state.packages.find((a) => a.id === (applianceId ?? purchase.applianceId)) : applianceId ? state.packages.find((a) => a.id === applianceId) : undefined;
    const purchaseStatus = status ?? purchase?.status;
    if (!appliance || purchaseStatus !== "Approved") return { ok: false, reason: "not-active" };
    if (state.lockedIds.includes(appliance.id)) return { ok: false, reason: "not-active" };

    const statusResult = claimStatus(state.claims, purchaseId, rewardRules.packageDurationDays);
    if (statusResult !== "claimable") return { ok: false, reason: statusResult === "claimed" ? "already-claimed" : "completed" };

    const claim: DailyClaim = { id: crypto.randomUUID(), purchaseId, date: todayKey(), amount: appliance.dailyPayout };
    set((s) => ({ ...s, claims: [claim, ...s.claims], walletBalance: s.walletBalance + claim.amount }));
    return { ok: true, amount: claim.amount };
  },
  /** Admin-edited referral percentages are used by every calculation immediately. */
  setReferralRules: (rules: ReferralSettings) =>
    set((s) => ({ ...s, referral: { ...rules, dailyCommissionPercentByLevel: [...rules.dailyCommissionPercentByLevel] } })),
  /** Admin-only: approving a pending direct recruit pays their one-time recruitment bonus. */
  setTeamMemberStatus: (name: string, status: TeamMember["status"]) => {
    const member = state.team.find((m) => m.name === name);
    if (!member || member.status === status) return false;
    set((s) => {
      const team = s.team.map((m) => (m.name === name ? { ...m, status } : m));
      const canPay = status === "Active" && member.level === 1 && isVipEligible(myVip(s), member.vip) && !s.recruitmentCredits.some((c) => c.member === name);
      if (!canPay) return { ...s, team };
      const amount = recruitmentBonus(member.packagePrice, s.referral.recruitmentBonusPercent);
      const credit: RecruitmentCredit = { id: crypto.randomUUID(), member: name, amount, date: todayKey() };
      return { ...s, team, recruitmentCredits: [credit, ...s.recruitmentCredits], walletBalance: s.walletBalance + amount };
    });
    return true;
  },
  /** Claim all A / B / C commissions due today in one go. */
  claimTeamCommission: (): ClaimResult => {
    const amount = commissionDue(state);
    if (amount <= 0) return { ok: false, reason: "nothing-to-claim" };
    if (state.commissionClaims.some((c) => c.date === todayKey())) return { ok: false, reason: "already-claimed" };
    const claim: CommissionClaim = { id: crypto.randomUUID(), date: todayKey(), amount };
    set((s) => ({ ...s, commissionClaims: [claim, ...s.commissionClaims], walletBalance: s.walletBalance + amount }));
    return { ok: true, amount };
  },
  /** Saved once in Profile; every withdrawal reuses it. */
  setPayoutAccount: (account: string) => set((s) => ({ ...s, payoutAccount: account })),
  setLoggedIn: (v: boolean) => set((s) => ({ ...s, loggedIn: v })),
  setPackages: (packages: Appliance[]) => set((s) => ({ ...s, packages, lockedIds: packages.filter((p) => p.tier >= 5).map((p) => p.id) })),
};
