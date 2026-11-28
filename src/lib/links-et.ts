/**
 * Server-only links.et verifier.
 *
 * links.et checks a receipt at the issuing bank and returns one envelope for
 * every provider. We only accept CBE sources (`cbe-pdf` / `mb-json`) and we
 * never approve from the AI detector's guess: the bank-side receipt and its
 * receiver/amount checks are authoritative.
 *
 * The API key is a server secret. Do not import this module from a component.
 */

export type LinksEtResult = {
  ok: boolean;
  approved: boolean;
  transient: boolean;
  message?: string | undefined;
  code?: string | undefined;
  verifiedAmount?: number | undefined;
  verifiedRef?: string | undefined;
  /** Best-effort reference from the image detector, used only as a fallback candidate. */
  candidateRef?: string | undefined;
  source?: "links-image" | "links-url" | undefined;
};

type Expect = {
  receiverAccount: string;
  receiverName?: string;
  amount: number;
};

type Envelope = {
  ok?: boolean;
  error?:
    | string
    | { code?: string; message?: string; detected?: string; index?: number }
    | null;
  httpStatus?: number;
  cached?: boolean;
  cachedFailure?: boolean;
  quotaExceeded?: boolean;
  source?: string;
  processingStatus?: string;
  requestId?: string;
  statusUrl?: string;
  providerKey?: string;
  receipt?: Record<string, unknown> | null;
  history?: { checkedBefore?: boolean; previousChecks?: number };
  receiverCheck?: {
    match?: boolean | null;
    account?: string;
    name?: string;
  } | null;
  amountCheck?: {
    match?: boolean | null;
    result?: string | null;
    paid?: number | null;
  } | null;
  detected?: {
    reference?: string | null;
    provider?: string;
    confidence?: number;
  } | null;
  upstream?: {
    attempted?: boolean;
    reason?: string;
    url?: string;
    error?: string;
    result?: Envelope;
  } | null;
};

const CBE_SOURCES = new Set(["cbe-pdf", "mb-json"]);

const FRIENDLY_ERRORS: Record<string, string> = {
  invalid_json: "Verification request was invalid.",
  invalid_request: "Check the payment details and try again.",
  not_an_image: "Upload a screenshot image, not a PDF or video.",
  image_too_large: "Screenshot is too large. Use a smaller image.",
  invalid_request_id: "Verification could not be resumed. Try again.",
  not_found: "Verification could not be found. Try again.",
  missing_key: "Payment verification is not configured.",
  invalid_key: "Payment verification is not configured.",
  revoked_key: "Payment verification is not configured.",
  rate_limited: "Verification is busy. Try again shortly.",
  quota_exceeded: "Verification is temporarily unavailable.",
  image_cap_reached: "Screenshot verification is temporarily unavailable.",
  ocr_daily_cap_reached: "Screenshot verification is temporarily unavailable.",
  detection_failed: "Screenshot could not be read. Try again shortly.",
  ai_not_configured: "Screenshot verification is not configured.",
  service_unavailable: "Could not reach the payment verification service.",
  none: "The bank could not confirm this receipt. Try again later.",
};

function getApiKey(): string {
  return process.env["LINKS_ET_API_KEY"] ?? "";
}

export function isLinksEtConfigured(): boolean {
  return Boolean(getApiKey().trim());
}

function notConfigured(): LinksEtResult {
  return {
    ok: false,
    approved: false,
    transient: true,
    code: "LINKS_ET_NOT_CONFIGURED",
    message: "Payment verification is not configured",
  };
}

function errorCode(json: Envelope): string | undefined {
  if (json.error && typeof json.error === "object") return json.error.code;
  if (typeof json.error === "string" && json.error.trim()) return "none";
  return undefined;
}

function errorMessage(code: string | undefined): string {
  return (
    (code && FRIENDLY_ERRORS[code]) || "The bank could not confirm this receipt"
  );
}

function failure(
  status: number,
  json: Envelope,
  fallbackCode = "verify_failed",
): LinksEtResult {
  const code = errorCode(json) ?? fallbackCode;
  const retryable =
    status === 0 ||
    status >= 500 ||
    status === 429 ||
    code === "none" ||
    code === "service_unavailable" ||
    code === "rate_limited" ||
    code === "ocr_daily_cap_reached" ||
    code === "detection_failed" ||
    code === "missing_key" ||
    code === "invalid_key" ||
    code === "revoked_key" ||
    code === "quota_exceeded" ||
    code === "image_cap_reached" ||
    code === "ai_not_configured" ||
    code === "not_found";

  return {
    ok: false,
    approved: false,
    transient: retryable,
    code,
    message: errorMessage(code),
  };
}

function buildExpect(input: {
  accountNumber: string;
  amount: number;
  receiverName?: string;
}): Expect {
  return {
    receiverAccount: input.accountNumber,
    ...(input.receiverName ? { receiverName: input.receiverName } : {}),
    amount: input.amount,
  };
}

async function post(
  path: string,
  body: unknown,
  idempotent = false,
): Promise<{
  status: number;
  json: Envelope;
}> {
  const key = getApiKey();
  try {
    const res = await fetch(`https://links.et${path}`, {
      method: "POST",
      headers: {
        "x-api-key": key,
        "content-type": "application/json",
        ...(idempotent ? { "Idempotency-Key": crypto.randomUUID() } : {}),
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(45_000),
    });
    const json = (await res.json().catch(() => ({}))) as Envelope;
    return { status: res.status, json };
  } catch {
    return { status: 0, json: { error: { code: "service_unavailable" } } };
  }
}

async function pollRequest(
  statusUrl: string,
): Promise<{ status: number; json: Envelope }> {
  const url = statusUrl.startsWith("/")
    ? `https://links.et${statusUrl}`
    : statusUrl;
  const key = getApiKey();

  for (let attempt = 0; attempt < 4; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    try {
      const res = await fetch(url, {
        headers: { "x-api-key": key },
        signal: AbortSignal.timeout(15_000),
      });
      const json = (await res.json().catch(() => ({}))) as Envelope;
      if (
        res.status !== 202 ||
        json.processingStatus === "completed" ||
        json.processingStatus === "failed"
      ) {
        return { status: res.status, json };
      }
    } catch {
      return { status: 0, json: { error: { code: "service_unavailable" } } };
    }
  }

  return {
    status: 202,
    json: {
      processingStatus: "queued",
      error: { code: "verification_pending" },
    },
  };
}

/**
 * Turn a links.et envelope into a deposit decision. Exported for unit tests.
 * It deliberately never includes `resolvedUrl` in a user-facing message.
 */
export function evaluateLinksEtResponse(
  json: Envelope,
  expectedAmount: number,
  source: "links-image" | "links-url",
): LinksEtResult {
  if (json.quotaExceeded) {
    return failure(429, { error: { code: "quota_exceeded" } });
  }

  if (json.ok !== true) {
    return failure(json.httpStatus ?? 502, json);
  }

  let result = json;
  if (source === "links-image") {
    if (json.upstream?.attempted !== true) {
      const reason = json.upstream?.reason ?? "not_verified";
      const code =
        reason === "provider_needs_full_url"
          ? "RECEIPT_URL_REQUIRED"
          : reason === "no_reference"
            ? "NO_REFERENCE"
            : reason === "unsupported_provider"
              ? "UNSUPPORTED_RECEIPT"
              : "IMAGE_NOT_VERIFIED";
      return {
        ok: false,
        approved: false,
        transient: reason === "verifier_threw",
        code,
        message:
          "Screenshot could not be verified at the bank. Type the FT reference or try again.",
        candidateRef: json.detected?.reference ?? undefined,
        source,
      };
    }
    result = json.upstream.result ?? json;
    if (result.ok !== true) {
      return failure(result.httpStatus ?? 502, result);
    }
  }

  if (result.history?.checkedBefore === true) {
    return {
      ok: false,
      approved: false,
      transient: false,
      code: "DUPLICATE_RECEIPT",
      message: "This CBE receipt has already been used",
      source,
    };
  }

  const receipt = result.receipt ?? {};
  const receiptSource = String(receipt["source"] ?? "");
  if (!CBE_SOURCES.has(receiptSource)) {
    return {
      ok: false,
      approved: false,
      transient: false,
      code: "UNSUPPORTED_RECEIPT",
      message: "Only CBE receipts are accepted",
      source,
    };
  }

  const receiverCheck = json.receiverCheck ?? result.receiverCheck;
  if (!receiverCheck || receiverCheck.match !== true) {
    return {
      ok: false,
      approved: false,
      transient: receiverCheck?.match === null,
      code: "RECEIVER_MISMATCH",
      message:
        receiverCheck?.match === false
          ? "Payment was sent to a different account"
          : "Receipt does not show the receiving account",
      source,
    };
  }

  const amountCheck = json.amountCheck ?? result.amountCheck;
  if (!amountCheck || amountCheck.match !== true) {
    return {
      ok: false,
      approved: false,
      transient: amountCheck?.match === null,
      code: "AMOUNT_MISMATCH",
      message: "Paid amount could not be confirmed from the receipt",
      source,
    };
  }

  const paid = Number(amountCheck.paid);
  if (!Number.isFinite(paid) || paid <= 0) {
    return {
      ok: false,
      approved: false,
      transient: true,
      code: "AMOUNT_UNREADABLE",
      message: "Paid amount could not be read from the receipt",
      source,
    };
  }
  if (paid !== expectedAmount) {
    return {
      ok: false,
      approved: false,
      transient: false,
      code: "AMOUNT_MISMATCH",
      message: `Paid amount ETB ${paid} does not match the declared deposit of ETB ${expectedAmount}`,
      source,
    };
  }

  const verifiedRef = String(
    receipt["reference"] ?? receipt["transactionReference"] ?? "",
  )
    .trim()
    .toUpperCase();
  if (!/^FT[A-Z0-9]+/.test(verifiedRef)) {
    return {
      ok: false,
      approved: false,
      transient: true,
      code: "MISSING_RECEIPT_REFERENCE",
      message: "Receipt confirmed but no FT reference was readable",
      source,
    };
  }

  return {
    ok: true,
    approved: true,
    transient: false,
    verifiedAmount: paid,
    verifiedRef,
    source,
  };
}

function normalizeReference(value: string): string {
  return String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
}

/** Verify a typed CBE FT reference by building its bank receipt URL. */
export async function verifyCbeByReference(input: {
  reference: string;
  accountNumber: string;
  amount: number;
  receiverName?: string;
}): Promise<LinksEtResult> {
  if (!isLinksEtConfigured()) return notConfigured();

  const reference = normalizeReference(input.reference);
  // CBE short links carry the FT reference plus the last 8 digits of the
  // receiving account: https://mbreciept.cbe.com.et/FT...-12345678
  if (!/^FT[A-Z0-9]+(?:-\d+)?$/.test(reference)) {
    return {
      ok: false,
      approved: false,
      transient: false,
      code: "INVALID_REFERENCE",
      message: "Enter a valid CBE FT reference",
      source: "links-url",
    };
  }

  const account = String(input.accountNumber ?? "").replace(/\D/g, "");
  if (!/^\d{13}$/.test(account)) {
    return {
      ok: false,
      approved: false,
      transient: true,
      code: "INVALID_DEPOSIT_ACCOUNT",
      message: "The receiving CBE account must be a 13-digit account",
      source: "links-url",
    };
  }

  const id = reference.includes("-")
    ? reference
    : `${reference}-${account.slice(-8)}`;
  const url = `https://mbreciept.cbe.com.et/${id}`;

  const submitted = await post(
    "/api/verify",
    { url, waitMs: 8000, expect: buildExpect(input) },
    true,
  );
  let final = submitted;
  if (submitted.status === 202 && submitted.json.statusUrl) {
    final = await pollRequest(submitted.json.statusUrl);
  }

  if (final.status === 202) {
    return {
      ok: false,
      approved: false,
      transient: true,
      code: "VERIFICATION_PENDING",
      message: "Verification is still in progress. Try again shortly.",
      source: "links-url",
    };
  }

  return evaluateLinksEtResponse(final.json, input.amount, "links-url");
}

/** Verify a CBE screenshot end-to-end: image read + bank-side receipt. */
export async function verifyCbeByImage(input: {
  imageBase64: string;
  accountNumber: string;
  amount: number;
  receiverName?: string;
}): Promise<LinksEtResult> {
  if (!isLinksEtConfigured()) return notConfigured();
  if (!String(input.imageBase64 ?? "").trim()) {
    return {
      ok: false,
      approved: false,
      transient: false,
      code: "INVALID_IMAGE",
      message: "Upload a screenshot image",
      source: "links-image",
    };
  }

  const response = await post("/api/verify-image", {
    imageBase64: input.imageBase64,
    expect: buildExpect(input),
  });
  if (response.status !== 200) {
    return failure(response.status, response.json);
  }
  return evaluateLinksEtResponse(response.json, input.amount, "links-image");
}
