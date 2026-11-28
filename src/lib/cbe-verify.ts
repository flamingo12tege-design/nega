/**
 * Server-only CBE check helper. No VITE_ fallback: the API key must remain a
 * server secret. This module contains no createServerFn wrapper so it can be
 * reused by both the verification endpoint and the deposit finalizer.
 */

export type CbeVerifyResult = {
  ok: boolean;
  approved: boolean;
  transient: boolean;
  message?: string | undefined;
  code?: string | undefined;
  /** Present only when the bank API itself reports the paid amount. */
  verifiedAmount?: number | undefined;
  /** Bank-reported reference, which is safer than an OCR/client guess. */
  verifiedRef?: string | undefined;
  /** Detector/OCR candidate, never trusted for approval on its own. */
  candidateRef?: string | undefined;
  source?: "check-et" | "links-image" | "links-url" | undefined;
};

type CbeVerifyResponse = {
  success?: boolean;
  exists?: boolean;
  duplicate?: boolean;
  code?: string;
  message?: string;
  retryable?: boolean;
  amount?: number | string;
  transfer_amount?: number | string;
  transaction_amount?: number | string;
  paid_amount?: number | string;
};

export type VerifyCbeInput = {
  transactionNumber: string;
  accountNumber: string;
};

function parseBankAmount(value: unknown): number | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  const amount =
    typeof value === "string"
      ? Number(value.replace(/,/g, "").trim())
      : Number(value);
  return Number.isFinite(amount) && amount > 0
    ? Math.round(amount * 100) / 100
    : undefined;
}

export async function verifyCbePaymentRequest({
  transactionNumber,
  accountNumber,
}: VerifyCbeInput): Promise<CbeVerifyResult> {
  const transaction = (transactionNumber ?? "").trim().toUpperCase();
  const account = (accountNumber ?? "").replace(/\D/g, "");

  const apiKey = process.env["CBE_CHECK_API_KEY"] ?? "";
  if (!apiKey) {
    return {
      ok: false,
      approved: false,
      transient: true,
      message: "Payment verification is not configured",
    };
  }
  if (!transaction) {
    return {
      ok: false,
      approved: false,
      transient: true,
      message: "Add a transaction number before verifying",
    };
  }
  if (!/^\d{13}$/.test(account)) {
    return {
      ok: false,
      approved: false,
      transient: true,
      message: "The receiving CBE account must be a 13-digit account",
    };
  }

  let json: CbeVerifyResponse = {};
  let httpStatus = 0;
  try {
    const res = await fetch("https://api.check.et/api/v1/verify", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        bank: "cbe",
        transaction_number: transaction,
        account_number: account,
      }),
    });
    httpStatus = res.status;
    json = (await res.json().catch(() => ({}))) as CbeVerifyResponse;
  } catch {
    return {
      ok: false,
      approved: false,
      transient: true,
      message: "Could not reach the payment verification service",
    };
  }

  const verified =
    json.success === true && json.exists === true && json.duplicate !== true;
  const verifiedAmount = [
    json.amount,
    json.transfer_amount,
    json.transaction_amount,
    json.paid_amount,
  ]
    .map(parseBankAmount)
    .find((value) => value !== undefined);

  if (verified) {
    return {
      ok: true,
      approved: true,
      transient: false,
      code: json.code,
      message: "Payment verified",
      verifiedAmount,
    };
  }

  const transient =
    json.retryable === true ||
    httpStatus >= 500 ||
    Object.keys(json).length === 0;

  return {
    ok: false,
    approved: false,
    transient,
    code: json.code,
    message:
      json.message ??
      (json.duplicate
        ? "This transaction reference was already used"
        : "No CBE payment found for that reference and receiving account"),
  };
}
