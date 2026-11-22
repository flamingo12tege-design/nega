// Daily income rules for active packages — pure helpers so they stay easy to test.
export type DailyClaim = { id: string; purchaseId: string; date: string; amount: number };

/** Local calendar day key, e.g. "2026-11-20". Claims are limited to one per package per day. */
export const todayKey = (now: Date = new Date()) => {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export const claimsForPackage = (claims: DailyClaim[], purchaseId: string) =>
  claims.filter((claim) => claim.purchaseId === purchaseId);

export const claimedDays = (claims: DailyClaim[], purchaseId: string) =>
  claimsForPackage(claims, purchaseId).length;

export const totalClaimed = (claims: DailyClaim[]) =>
  claims.reduce((sum, claim) => sum + claim.amount, 0);

export type ClaimStatus = "claimable" | "claimed" | "completed";

export const claimStatus = (
  claims: DailyClaim[],
  purchaseId: string,
  durationDays: number,
  today: string = todayKey(),
): ClaimStatus => {
  const own = claimsForPackage(claims, purchaseId);
  if (own.length >= durationDays) return "completed";
  if (own.some((claim) => claim.date === today)) return "claimed";
  return "claimable";
};
