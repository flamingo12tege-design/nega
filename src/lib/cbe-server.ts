import { createServerFn } from "@tanstack/react-start";
import {
  verifyCbePaymentRequest,
  type CbeVerifyResult,
} from "@/lib/cbe-verify";
import { isRateLimited, requireServerUser } from "@/lib/server-auth";
import { depositAccount as defaultDepositAccount } from "@/lib/mock-data";

export type { CbeVerifyResult };

/**
 * Authenticated server-side CBE verification endpoint. The deposit account is
 * read from platform_settings on the server; callers cannot choose it.
 */
const verifyCbePaymentFn = createServerFn({ method: "POST" }).handler(
  async ({ data }): Promise<CbeVerifyResult> => {
    const input = (data ?? {}) as {
      access_token?: string;
      transaction_number?: string;
    };

    const auth = await requireServerUser(String(input.access_token ?? ""));
    if (!auth.ok) {
      return {
        ok: false,
        approved: false,
        transient: false,
        message: auth.message,
      };
    }

    if (isRateLimited(`cbe:${auth.userId}`, 10, 60_000)) {
      return {
        ok: false,
        approved: false,
        transient: false,
        message: "Too many verification attempts. Please try again shortly.",
      };
    }

    const { supabaseAdmin } = await import("./supabase-admin");
    const { data: setting } = await supabaseAdmin
      .from("platform_settings")
      .select("value")
      .eq("key", "deposit_account")
      .maybeSingle();

    const account =
      String(setting?.value ?? "").trim() || defaultDepositAccount.account;

    return verifyCbePaymentRequest({
      transactionNumber: String(input.transaction_number ?? ""),
      accountNumber: account,
    });
  },
);

export const verifyCbePayment = verifyCbePaymentFn as unknown as (opts: {
  data: unknown;
}) => Promise<CbeVerifyResult>;
