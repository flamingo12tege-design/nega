import { describe, expect, it } from "vitest";
import {
  dailyCommission,
  highestTier,
  isVipEligible,
  recruitmentBonus,
  recruitmentBonusTotal,
  teamCommissionTotal,
  type CommissionMember,
} from "./referral";

const member = (overrides: Partial<CommissionMember> = {}): CommissionMember => ({
  level: 1,
  vip: 1,
  status: "Active",
  dailyIncome: 300,
  daysActive: 10,
  ...overrides,
});

describe("recruitment bonus", () => {
  it("pays 6% of a job/package price", () => {
    expect(recruitmentBonus(600, 6)).toBe(36);
    expect(recruitmentBonus(2000, 6)).toBe(120);
  });

  it("pays only for active direct (level 1) recruits", () => {
    const candidates = [
      { level: 1 as const, vip: 1, status: "Active" as const, packagePrice: 2000 },
      { level: 2 as const, vip: 1, status: "Active" as const, packagePrice: 5000 },
      { level: 1 as const, vip: 0, status: "Pending" as const, packagePrice: 800 },
    ];
    expect(recruitmentBonusTotal(candidates, 6, 1)).toBe(120);
  });

  it("skips a recruit above the inviter's VIP", () => {
    const candidates = [{ level: 1 as const, vip: 2, status: "Active" as const, packagePrice: 5000 }];
    expect(recruitmentBonusTotal(candidates, 6, 1)).toBe(0);
    expect(recruitmentBonusTotal(candidates, 6, 2)).toBe(300);
  });
});

describe("daily commission", () => {
  it("uses the level percentages", () => {
    expect(dailyCommission(120, 6)).toBe(7.2);
    expect(dailyCommission(120, 4)).toBe(4.8);
    expect(dailyCommission(120, 2)).toBe(2.4);
  });

  it("applies the VIP rule from VIP 1 up", () => {
    expect(isVipEligible(0, 0)).toBe(true);
    expect(isVipEligible(0, 1)).toBe(false);
    expect(isVipEligible(1, 1)).toBe(true);
    expect(isVipEligible(2, 1)).toBe(true);
    expect(isVipEligible(1, 2)).toBe(false);
  });

  it("sums eligible members and respects the payout window", () => {
    const members = [
      member({ level: 1, dailyIncome: 300 }), // 6% = 18
      member({ level: 2, dailyIncome: 120 }), // 4% = 4.8
      member({ level: 3, vip: 2, dailyIncome: 750 }), // blocked: VIP 2 > inviter 1
      member({ level: 3, vip: 1, dailyIncome: 120 }), // 2% = 2.4
      member({ level: 1, status: "Pending", dailyIncome: 300 }), // pending
      member({ level: 1, daysActive: 90, dailyIncome: 300 }), // package finished
    ];
    expect(teamCommissionTotal(members, [6, 4, 2], 1, 90)).toBe(25.2);
  });

  it("reads the highest owned tier as VIP", () => {
    expect(highestTier([])).toBe(0);
    expect(highestTier([1, 3, 2])).toBe(3);
  });
});
