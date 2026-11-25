import { createServerFn } from "@tanstack/react-start";

export type OcrScanResult = { ok: boolean; txn?: string; error?: string; text?: string };

/**
 * Server-side OCR.space receipt scan.
 * Runs on the server so the OCR API key never ships to the browser.
 * Expects a multipart FormData with a `file` field (the receipt screenshot).
 * Returns the extracted text and the first transaction reference found (FT… / CHK_…).
 */
const ocrImageFn = createServerFn({ method: "POST" }).handler(async ({ data }) => {
  const formData = data as unknown as FormData;
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return { ok: false, error: "No file uploaded" };
  }

  const apiKey = process.env["OCR_SPACE_API_KEY"] ?? process.env["VITE_OCR_SPACE_API_KEY"] ?? import.meta.env["VITE_OCR_SPACE_API_KEY"] ?? "";
  if (!apiKey) {
    return { ok: false, error: "OCR service is not configured" };
  }

  const ocrForm = new FormData();
  ocrForm.append("apikey", apiKey);
  ocrForm.append("OCREngine", "8");
  ocrForm.append("language", "eng");
  ocrForm.append("file", file, file.name);

  const res = await fetch("https://api.ocr.space/ocr", { method: "POST", body: ocrForm });
  const json = (await res.json().catch(() => ({}))) as { ParsedResults?: Array<{ ParsedText?: string }> };
  const text = String(json?.ParsedResults?.[0]?.ParsedText ?? "");
  const match = text.toUpperCase().match(/FT[A-Z0-9]{5,}/) ?? text.toUpperCase().match(/CHK_[A-Z0-9]+/);

  if (!match) {
    return { ok: false, error: "No transaction found", text };
  }

  return { ok: true, txn: match[0], text };
});

export const ocrImage = ocrImageFn as unknown as (opts: { data: FormData }) => Promise<OcrScanResult>;
