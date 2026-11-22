import { describe, expect, it } from "vitest";
import { normalizeEthiopianPhone } from "./phone";

describe("normalizeEthiopianPhone", () => {
  it("accepts local 09 format", () => expect(normalizeEthiopianPhone("0911 234 567")).toBe("+251911234567"));
  it("accepts local 07 format", () => expect(normalizeEthiopianPhone("0712345678")).toBe("+251712345678"));
  it("accepts +251 format", () => expect(normalizeEthiopianPhone("+251 911234567")).toBe("+251911234567"));
  it("rejects other prefixes", () => expect(normalizeEthiopianPhone("0811234567")).toBeNull());
  it("rejects short numbers", () => expect(normalizeEthiopianPhone("09112")).toBeNull());
});
