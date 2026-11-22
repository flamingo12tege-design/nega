// Referral / recruitment rules: 6% one-time on a direct recruit's package,
// then 6% / 4% / 2% of each downline member's daily income for levels A / B / C.
export type ReferralLevel = 1 | 2 | 3;

/** Admin-editable rates, persisted in the in-memory store. */
export type ReferralSettings = {
  /** One-time bonus on a direct (level 1) recruit's package price. */
  recruitmentBonusPercent: number;
  /** Daily commission on a downline member's daily income, for levels 1/2/3. */
  dailyCommissionPercentByLevel: [number, number, number];
};

export type CommissionMember = {
  level: ReferralLevel;
  vip: number;
  status: "Active" | "Pending";
  dailyIncome: number;
  daysActive: number;
};

export const round2 = (n: number) => Math.round(n * 100) / 100;

/** One-time bonus for the direct (A-level) recruit's package. */
export const recruitmentBonus = (packagePrice: number, percent: number) =>
  round2((packagePrice * percent) / 100);

/** Recurring commission on a downline member's daily income. */
export const dailyCommission = (dailyIncome: number, percent: number) =>
  round2((dailyIncome * percent) / 100);

/** From VIP 1 up, the inviter must be at least the invitee's VIP to earn from them. */
export const isVipEligible = (inviterVip: number, inviteeVip: number) =>
  inviteeVip < 1 || inviterVip >= inviteeVip;

/** A member pays commission only while active and inside the package payout window. */
export const isCommissionable = (member: CommissionMember, durationDays: number) =>
  member.status === "Active" && member.daysActive < durationDays;

export const highestTier = (tiers: number[]) => tiers.reduce((max, tier) => Math.max(max, tier), 0);

export const teamCommissionTotal = (
  members: CommissionMember[],
  percents: [number, number, number],
  inviterVip: number,
  durationDays: number,
) =>
  round2(
    members.reduce((sum, member) => {
      if (!isCommissionable(member, durationDays)) return sum;
      if (!isVipEligible(inviterVip, member.vip)) return sum;
      return sum + dailyCommission(member.dailyIncome, percents[member.level - 1] ?? 0);
    }, 0),
  );

export type RecruitmentCandidate = {
  level: ReferralLevel;
  vip: number;
  status: "Active" | "Pending";
  packagePrice: number;
};

export const recruitmentBonusTotal = (
  members: RecruitmentCandidate[],
  percent: number,
  inviterVip: number,
) =>
  round2(
    members.reduce((sum, member) => {
      if (member.level !== 1 || member.status !== "Active") return sum;
      if (!isVipEligible(inviterVip, member.vip)) return sum;
      return sum + recruitmentBonus(member.packagePrice, percent);
    }, 0),
  );
