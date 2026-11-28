import { describe, expect, it } from "vitest";
import { evaluateLinksEtResponse } from "./links-et";

const confirmed = {
  ok: true,
  history: { checkedBefore: false, previousChecks: 0 },
  receipt: {
    source: "cbe-pdf",
    reference: "FT25161234567",
    transferredAmount: 1300,
  },
  receiverCheck: { match: true, account: "match", name: "not_shown" },
  amountCheck: { match: true, result: "exact", paid: 1300 },
};

describe("evaluateLinksEtResponse", () => {
  it("approves a CBE receipt paid to the configured receiver for the exact amount", () => {
    expect(evaluateLinksEtResponse(confirmed, 1300, "links-url")).toMatchObject(
      {
        ok: true,
        approved: true,
        transient: false,
        verifiedAmount: 1300,
        verifiedRef: "FT25161234567",
      },
    );
  });

  it("rejects a real receipt paid to someone else", () => {
    const result = evaluateLinksEtResponse(
      {
        ...confirmed,
        receiverCheck: { match: false, account: "mismatch", name: "not_shown" },
      },
      1300,
      "links-url",
    );
    expect(result).toMatchObject({
      approved: false,
      transient: false,
      code: "RECEIVER_MISMATCH",
    });
  });

  it("rejects an amount mismatch", () => {
    const result = evaluateLinksEtResponse(
      {
        ...confirmed,
        amountCheck: { match: false, result: "under", paid: 1200 },
      },
      1300,
      "links-url",
    );
    expect(result).toMatchObject({
      approved: false,
      transient: false,
      code: "AMOUNT_MISMATCH",
    });
  });

  it("rejects a reused receipt", () => {
    const result = evaluateLinksEtResponse(
      { ...confirmed, history: { checkedBefore: true, previousChecks: 1 } },
      1300,
      "links-url",
    );
    expect(result).toMatchObject({
      approved: false,
      transient: false,
      code: "DUPLICATE_RECEIPT",
    });
  });

  it("does not approve non-CBE receipt sources", () => {
    const result = evaluateLinksEtResponse(
      {
        ...confirmed,
        receipt: { ...confirmed.receipt, source: "telebirr-html" },
      },
      1300,
      "links-url",
    );
    expect(result).toMatchObject({
      approved: false,
      transient: false,
      code: "UNSUPPORTED_RECEIPT",
    });
  });

  it("returns the detector reference as a candidate when no bank receipt was fetched", () => {
    const result = evaluateLinksEtResponse(
      {
        ok: true,
        detected: {
          provider: "cbe",
          reference: "FT25161234567",
          confidence: 0.9,
        },
        upstream: { attempted: false, reason: "verifier_threw" },
      },
      1300,
      "links-image",
    );
    expect(result).toMatchObject({
      approved: false,
      transient: true,
      code: "IMAGE_NOT_VERIFIED",
      candidateRef: "FT25161234567",
    });
  });

  it("only approves an image when the upstream bank result is confirmed", () => {
    const result = evaluateLinksEtResponse(
      {
        ok: true,
        source: "image",
        detected: {
          provider: "cbe",
          reference: "FT25161234567",
          confidence: 0.9,
        },
        upstream: { attempted: true, result: confirmed },
        receiverCheck: confirmed.receiverCheck,
        amountCheck: confirmed.amountCheck,
      },
      1300,
      "links-image",
    );
    expect(result).toMatchObject({
      approved: true,
      verifiedAmount: 1300,
      verifiedRef: "FT25161234567",
    });
  });
});
