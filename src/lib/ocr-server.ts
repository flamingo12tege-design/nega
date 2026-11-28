import { createServerFn } from "@tanstack/react-start";
import { isRateLimited, requireServerUser } from "@/lib/server-auth";

export type OcrScanResult = { ok: boolean; txn?: string; error?: string; text?: string };

type OcrPage = {
  ParsedText?: string | null;
  FileParseExitCode?: number | string;
  ErrorMessage?: string | null;
  ErrorDetails?: string | null;
};
type OcrResponse = {
  ParsedResults?: OcrPage[] | null;
  IsErroredOnProcessing?: boolean;
  ErrorMessage?: string | null;
  ErrorDetails?: string | null;
};

/** Pull an FT/CHK transaction reference out of raw OCR text. */
function extractTxn(rawText: string): string | null {
  let text = rawText.toUpperCase().replace(/\s+/g, " ");

  // OCR sometimes splits the reference: "FT 25161 234567" -> "FT25161234567".
  let previous: string;
  do {
    previous = text;
    text = text.replace(/(\d)[\s-]+(\d)/g, "$1$2").replace(/FT[\s-]+(?=[A-Z0-9])/g, "FT");
  } while (text !== previous);

  // CBE refs are FT + digits; take the leading digit run so trailing words don't stick.
  for (const candidate of text.match(/FT[A-Z0-9]{6,}/g) ?? []) {
    const digits = (candidate.slice(2).match(/^\d{8,}/) ?? [])[0];
    if (digits) return `FT${digits}`;
  }

  // Fallback: alphanumeric FT ref (must contain at least 4 digits to avoid words).
  for (const candidate of text.match(/FT[A-Z0-9]{8,}/g) ?? []) {
    if ((candidate.match(/\d/g) ?? []).length >= 4) return candidate;
  }

  const chk = text.match(/CHK_[A-Z0-9]+/);
  if (chk) return chk[0];

  return null;
}

async function callOcr(apiKey: string, file: File, engine: "2" | "3"): Promise<OcrResponse | null> {
  const form = new FormData();
  form.append("apikey", apiKey);
  form.append("OCREngine", engine);
  form.append("language", "auto");
  form.append("scale", "true");
  form.append("isTable", "true");
  form.append("detectOrientation", "true");
  form.append("file", file, file.name);

  const res = await fetch("https://api.ocr.space/parse/image", {
    method: "POST",
    headers: { apikey: apiKey },
    body: form,
  });
  if (!res.ok) return null;
  return (await res.json().catch(() => null)) as OcrResponse | null;
}

/**
 * Authenticated server-side OCR.space receipt scan. The API key is server-only
 * and each signed-in member is throttled so anonymous callers cannot exhaust
 * the OCR quota.
 */
const ocrImageFn = createServerFn({ method: "POST" }).handler(
  async ({ data }): Promise<OcrScanResult> => {
    const formData = data as unknown as FormData;
    const auth = await requireServerUser(String(formData.get("access_token") ?? ""));
    if (!auth.ok) return { ok: false, error: auth.message };

    if (isRateLimited(`ocr:${auth.userId}`, 12, 60_000)) {
      return { ok: false, error: "Too many scans. Please try again shortly." };
    }

    const file = formData.get("file");
    if (!(file instanceof File)) return { ok: false, error: "No file uploaded" };
    if (!file.type.startsWith("image/")) {
      return { ok: false, error: "Upload an image file" };
    }
    if (file.size > 1_500_000) {
      return { ok: false, error: "Screenshot is too large" };
    }

    const apiKey = process.env["OCR_SPACE_API_KEY"] ?? "";
    if (!apiKey) return { ok: false, error: "OCR service is not configured" };

    let lastError = "No transaction found";
    let lastText = "";

    for (const engine of ["2", "3"] as const) {
      const json = await callOcr(apiKey, file, engine);
      if (!json) {
        lastError = "OCR request failed";
        continue;
      }

      const page = json.ParsedResults?.[0];
      const text = String(page?.ParsedText ?? "");
      if (text) lastText = text;

      const txn = extractTxn(text);
      if (txn) return { ok: true, txn, text };

      lastError = json.ErrorMessage || page?.ErrorMessage || page?.ErrorDetails || "No transaction found";
    }

    return { ok: false, error: lastError, text: lastText };
  },
);

export const ocrImage = ocrImageFn as unknown as (opts: {
  data: FormData;
}) => Promise<OcrScanResult>;
