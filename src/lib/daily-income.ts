// Daily income rules for active packages — pure helpers so they stay easy to test.
export type DailyClaim = { id: string; purchaseId: string; date: string; amount: number };

const eatDayFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "Africa/Addis_Ababa",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** EAT calendar day key, e.g. "2026-11-20". Claims unlock at midnight EAT. */
export const todayKey = (now: Date = new Date()) => {
  const parts = Object.fromEntries(
    eatDayFormatter.formatToParts(now).map((part) => [part.type, part.value]),
  );
  return `${parts["year"]}-${parts["month"]}-${parts["day"]}`;
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
