import { describe, expect, it } from "vitest";
import { appliances, isLocked } from "./mock-data";

describe("locked tiers", () => {
  it("tiers 1-4 are open", () => expect(appliances.filter((a) => a.tier <= 4).every((a) => !isLocked(a))).toBe(true));
  it("tiers 5-8 are locked", () => expect(appliances.filter((a) => a.tier >= 5).every(isLocked)).toBe(true));
});
