import { createServerFn } from "@tanstack/react-start";
import {
  verifyCbePaymentRequest,
  type CbeVerifyResult,
} from "@/lib/cbe-verify";
import {
  isLinksEtConfigured,
  verifyCbeByImage,
  verifyCbeByReference,
} from "@/lib/links-et";
import { depositAccount as defaultDepositAccount } from "@/lib/mock-data";

export type SubmitRechargeInput = {
  /** Supabase access token; validated server-side before any write. */
  accessToken: string;
  amount: number;
  transactionRef: string;
  proofPath?: string | null;
  method?: string;
};

export type SubmitRechargeResult = {
  ok: boolean;
  outcome: "approved" | "manual_review" | "rejected" | "error";
  ledgerId?: string | null;
  amount?: number | undefined;
  verifiedRef?: string | undefined;
  message?: string | undefined;
  code?: string | undefined;
};

function normalizeEthiopianPhone(value: unknown): string | null {
  const phone = String(value ?? "").replace(/[^\d+]/g, "");
  if (/^\+251[79]\d{8}$/.test(phone)) return phone;
  if (/^251[79]\d{8}$/.test(phone)) return `+${phone}`;
  if (/^0[79]\d{8}$/.test(phone)) return `+251${phone.slice(1)}`;
  return null;
}

function numericSetting(
  values: Record<string, string>,
  key: string,
  fallback: number,
): number {
  const parsed = Number(values[key] ?? "");
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function safeProofPath(
  value: unknown,
  userId: string,
): string | null | "invalid" {
  const path = String(value ?? "").trim();
  if (!path) return null;
  if (
    !path.startsWith(`${userId}/`) ||
    path.includes("..") ||
    path.includes("\\")
  ) {
    return "invalid";
  }
  return path;
}

const submitVerifiedRechargeFn = createServerFn({ method: "POST" }).handler(
  async ({ data }): Promise<SubmitRechargeResult> => {
    const input = (data ?? {}) as SubmitRechargeInput;
    const amount = Number(input.amount);
    const transactionRef = String(input.transactionRef ?? "")
      .trim()
      .toUpperCase();
    const method = String(input.method ?? "CBE").slice(0, 40) || "CBE";
    // The bank-reported reference replaces any client/OCR guess once verified.
    let ledgerRef = transactionRef;

    if (
      !Number.isFinite(amount) ||
      amount <= 0 ||
      amount !== Math.floor(amount)
    ) {
      return {
        ok: false,
        outcome: "error",
        message: "Enter a whole ETB amount",
      };
    }

    const { supabaseAdmin } = await import("./supabase-admin");

    // Never trust a client-supplied user id. The access token is the only
    // identity proof accepted here.
    const { data: authData, error: authError } =
      await supabaseAdmin.auth.getUser(String(input.accessToken ?? ""));
    if (authError || !authData?.user) {
      return { ok: false, outcome: "error", message: "Please log in again" };
    }
    const userId = authData.user.id;

    const proofPath = safeProofPath(input.proofPath, userId);
    if (proofPath === "invalid") {
      return {
        ok: false,
        outcome: "error",
        message: "The uploaded proof is not linked to this account",
      };
    }

    const [{ data: profile }, { data: settingRows }] = await Promise.all([
      supabaseAdmin
        .from("profiles")
        .select("phone")
        .eq("id", userId)
        .maybeSingle(),
      supabaseAdmin
        .from("platform_settings")
        .select("key,value")
        .in("key", [
          "minimum_deposit_amount",
          "maximum_deposit_amount",
          "deposit_account",
          "deposit_name",
        ]),
    ]);

    if (!normalizeEthiopianPhone(profile?.phone)) {
      return {
        ok: false,
        outcome: "error",
        message: "A valid Ethiopian phone number is required before depositing",
      };
    }

    const settings: Record<string, string> = {};
    for (const row of settingRows ?? []) {
      settings[String(row.key)] = String(row.value ?? "");
    }
    const minDeposit = numericSetting(settings, "minimum_deposit_amount", 1300);
    const maxDeposit = numericSetting(
      settings,
      "maximum_deposit_amount",
      300000,
    );

    if (amount < minDeposit || amount > maxDeposit) {
      return {
        ok: false,
        outcome: "error",
        message: `Deposits must be between ETB ${minDeposit} and ETB ${maxDeposit}`,
      };
    }

    const logFailure = async (
      outcome: "rejected" | "manual_review",
      reason: string,
    ) => {
      try {
        await supabaseAdmin.from("deposit_verification_logs").insert({
          user_id: userId,
          amount,
          transaction_ref: ledgerRef || null,
          proof_url: proofPath || null,
          reason: reason || "Payment verification failed",
          outcome,
        });
      } catch {
        // Logging is best effort; it must never block a valid deposit.
      }
    };

    const depositAccount =
      String(settings["deposit_account"] ?? "").trim() ||
      defaultDepositAccount.account;
    const receiverName = String(settings["deposit_name"] ?? "").trim();
    const linksEnabled = isLinksEtConfigured();

    let verification: CbeVerifyResult = {
      ok: false,
      approved: false,
      transient: true,
      code: "MISSING_PROOF",
      message: "No screenshot or transaction reference was provided",
    };

    // A screenshot is verified at the source by links.et. We read the stored
    // file on the server so the browser never handles the API key or the
    // bank-side request.
    if (proofPath && linksEnabled) {
      try {
        const { data: imageBlob } = await supabaseAdmin.storage
          .from("recharge-proofs")
          .download(proofPath);
        if (imageBlob) {
          const bytes = new Uint8Array(await imageBlob.arrayBuffer());
          verification = await verifyCbeByImage({
            imageBase64: Buffer.from(bytes).toString("base64"),
            accountNumber: depositAccount,
            amount,
            receiverName,
          });
        }
      } catch {
        verification = {
          ok: false,
          approved: false,
          transient: true,
          code: "IMAGE_READ_FAILED",
          message: "Screenshot could not be read for verification",
        };
      }
    }

    // If the screenshot could not be confirmed for a temporary reason, fall
    // back to transaction verification. The detector's reference is only a
    // candidate; the bank verifier decides whether it is real.
    const fallbackRef = transactionRef || verification.candidateRef || "";
    // A detector guess is a candidate, not proof. Only a member-typed
    // reference is safe to reject; a bad guess should go to manual review.
    const canTrustRejection = Boolean(transactionRef);
    if (verification.transient && fallbackRef) {
      const linksRefResult = linksEnabled
        ? await verifyCbeByReference({
            reference: fallbackRef,
            accountNumber: depositAccount,
            amount,
            receiverName,
          })
        : null;

      const referenceResult =
        linksRefResult && (!linksRefResult.transient || linksRefResult.approved)
          ? linksRefResult
          : await verifyCbePaymentRequest({
              transactionNumber: fallbackRef,
              accountNumber: depositAccount,
            });

      if (
        referenceResult.approved ||
        (canTrustRejection && !referenceResult.transient)
      ) {
        verification = referenceResult;
      }
    }

    ledgerRef = String(verification.verifiedRef || transactionRef || "")
      .replace(/\s+/g, "")
      .trim()
      .toUpperCase()
      .slice(0, 80);

    // If the bank API reports the paid amount, it is authoritative.
    if (
      verification.approved &&
      verification.verifiedAmount !== undefined &&
      verification.verifiedAmount !== amount
    ) {
      const message = `Paid amount ETB ${verification.verifiedAmount} does not match the declared deposit of ETB ${amount}`;
      await logFailure("rejected", message);
      return {
        ok: false,
        outcome: "rejected",
        message,
        code: "AMOUNT_MISMATCH",
      };
    }

    if (!verification.approved && !verification.transient) {
      const message = verification.message ?? "Payment could not be verified";
      await logFailure("rejected", message);
      return {
        ok: false,
        outcome: "rejected",
        message,
        code: verification.code,
      };
    }

    // Create the ledger row only from this trusted server path. The database
    // still enforces phone, amount range, whole birr and one pending row.
    const { data: inserted, error: insertError } = await supabaseAdmin
      .from("wallet_ledger")
      .insert({
        user_id: userId,
        amount,
        type: "recharge",
        status: "pending",
        transaction_ref: ledgerRef || null,
        proof_url: proofPath || null,
        description: `CBE recharge via ${method}`,
      })
      .select("id")
      .single();

    if (insertError || !inserted?.id) {
      const duplicate = /duplicate|unique|already used/i.test(
        insertError?.message ?? "",
      );
      const message = duplicate
        ? "This transaction reference was already used"
        : (insertError?.message ?? "Recharge submission failed");
      await logFailure("rejected", message);
      return {
        ok: false,
        outcome: duplicate ? "rejected" : "error",
        message,
      };
    }

    const ledgerId = String(inserted.id);

    if (verification.approved) {
      const { data: creditedAmount, error: finalizeError } =
        await supabaseAdmin.rpc("finalize_verified_recharge", {
          p_ledger_id: ledgerId,
          p_verified_amount: amount,
          p_verified_ref: ledgerRef,
        });

      if (!finalizeError) {
        return {
          ok: true,
          outcome: "approved",
          ledgerId,
          amount: Number(creditedAmount ?? amount),
          verifiedRef: ledgerRef || undefined,
          message: "Payment verified — recharge auto-approved",
        };
      }

      await logFailure(
        "manual_review",
        `Verified but automatic approval failed: ${finalizeError.message}`,
      );
      return {
        ok: true,
        outcome: "manual_review",
        ledgerId,
        amount,
        verifiedRef: ledgerRef || undefined,
        message: `Payment verified, awaiting admin approval: ${finalizeError.message}`,
      };
    }

    const message =
      verification.message ??
      "We could not verify this payment automatically. An admin will review it.";
    await logFailure("manual_review", message);
    return {
      ok: true,
      outcome: "manual_review",
      ledgerId,
      amount,
      verifiedRef: ledgerRef || undefined,
      message: "Sent for manual review",
    };
  },
);

export const submitVerifiedRecharge =
  submitVerifiedRechargeFn as unknown as (opts: {
    data: SubmitRechargeInput;
  }) => Promise<SubmitRechargeResult>;
