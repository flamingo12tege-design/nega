import { describe, expect, it } from "vitest";
import { claimStatus, claimedDays, claimsForPackage, todayKey, totalClaimed, type DailyClaim } from "./daily-income";

const claim = (overrides: Partial<DailyClaim> = {}): DailyClaim => ({
  id: "c1",
  purchaseId: "p1",
  date: "2026-11-20",
  amount: 120,
  ...overrides,
});

describe("daily income", () => {
  it("builds an East Africa Time day key", () => {
    expect(todayKey(new Date("2026-11-05T12:00:00Z"))).toBe("2026-11-05");
    expect(todayKey(new Date("2026-11-05T22:30:00Z"))).toBe("2026-11-06");
  });

  it("is claimable when nothing was claimed yet", () => {
    expect(claimStatus([], "p1", 90, "2026-11-20")).toBe("claimable");
  });

  it("blocks a second claim on the same day", () => {
    expect(claimStatus([claim()], "p1", 90, "2026-11-20")).toBe("claimed");
  });

  it("allows the next day's claim", () => {
    expect(claimStatus([claim()], "p1", 90, "2026-11-21")).toBe("claimable");
  });

  it("keeps each package's claims separate", () => {
    expect(claimStatus([claim()], "p2", 90, "2026-11-20")).toBe("claimable");
  });

  it("completes once the package duration is reached", () => {
    const claims = Array.from({ length: 90 }, (_, i) => claim({ id: `c${i}`, date: "2026-01-01" }));
    expect(claimStatus(claims, "p1", 90, "2026-11-20")).toBe("completed");
  });

  it("counts claimed days and totals per package", () => {
    const claims = [claim(), claim({ id: "c2", date: "2026-11-19" }), claim({ id: "c3", purchaseId: "p2", amount: 300 })];
    expect(claimsForPackage(claims, "p1")).toHaveLength(2);
    expect(claimedDays(claims, "p1")).toBe(2);
    expect(totalClaimed(claims)).toBe(540);
  });
});
