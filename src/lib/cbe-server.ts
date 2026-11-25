import { createServerFn } from "@tanstack/react-start";

export type CbeVerifyResult = { ok: boolean; approved: boolean; message?: string };

/**
 * Server-side CBE payment verification via the Check API.
 * Runs on the server so the API key never ships to the browser and no CORS
 * restrictions apply to the outbound bank API call.
 * Expects `{ transaction_number, account_number }`.
 */
const verifyCbePaymentFn = createServerFn({ method: "POST" }).handler(async ({ data }) => {
  const { transaction_number, account_number } = (data ?? {}) as { transaction_number?: string; account_number?: string };
  const apiKey = process.env["CBE_CHECK_API_KEY"] ?? process.env["VITE_CBE_CHECK_API_KEY"] ?? import.meta.env["VITE_CBE_CHECK_API_KEY"] ?? "";
  if (!apiKey) {
    return { ok: false, approved: false, message: "Payment verification is not configured" };
  }

  const res = await fetch("https://api.check.et/api/v1/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ bank: "cbe", transaction_number, account_number }),
  });
  const json = (await res.json().catch(() => ({}))) as { message?: string; status?: string };
  const ok = res.ok;
  return { ok, approved: ok, message: json?.message ?? (ok ? "Payment verified" : "Payment verification failed") };
});

export const verifyCbePayment = verifyCbePaymentFn as unknown as (opts: { data: unknown }) => Promise<CbeVerifyResult>;
