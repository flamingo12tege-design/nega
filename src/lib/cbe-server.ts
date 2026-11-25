import { createServerFn } from "@tanstack/react-start";

export type CbeVerifyResult = { ok: boolean; approved: boolean; message?: string; code?: string };

type CbeVerifyResponse = {
  success?: boolean;
  exists?: boolean;
  duplicate?: boolean;
  code?: string;
  message?: string;
  retryable?: boolean;
};

/**
 * Server-side CBE payment verification via the Check API.
 * Runs on the server so the API key never ships to the browser and no CORS
 * restrictions apply to the outbound bank API call.
 * Expects `{ transaction_number, account_number }`.
 */
const verifyCbePaymentFn = createServerFn({ method: "POST" }).handler(async ({ data }) => {
  const input = (data ?? {}) as { transaction_number?: string; account_number?: string };
  const transactionNumber = (input.transaction_number ?? "").trim().toUpperCase();
  const accountNumber = (input.account_number ?? "").replace(/\D/g, "");

  const apiKey = process.env["CBE_CHECK_API_KEY"] ?? process.env["VITE_CBE_CHECK_API_KEY"] ?? import.meta.env["VITE_CBE_CHECK_API_KEY"] ?? "";
  if (!apiKey) {
    return { ok: false, approved: false, message: "Payment verification is not configured" };
  }
  if (!transactionNumber || !accountNumber) {
    return { ok: false, approved: false, message: "Add a transaction number before verifying" };
  }

  let json: CbeVerifyResponse = {};
  try {
    const res = await fetch("https://api.check.et/api/v1/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ bank: "cbe", transaction_number: transactionNumber, account_number: accountNumber }),
    });
    json = (await res.json().catch(() => ({}))) as CbeVerifyResponse;
  } catch {
    return { ok: false, approved: false, message: "Could not reach the payment verification service" };
  }

  // Only a confirmed, non-duplicate payment counts as verified.
  const verified = json.success === true && json.exists === true && json.duplicate !== true;
  return {
    ok: verified,
    approved: verified,
    code: json.code,
    message:
      json.message ??
      (verified
        ? "Payment verified"
        : json.duplicate
          ? "This transaction reference was already used"
          : "No CBE payment found for that reference and receiving account"),
  };
});

export const verifyCbePayment = verifyCbePaymentFn as unknown as (opts: { data: unknown }) => Promise<CbeVerifyResult>;
