import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Check, Copy, Hash, ImageUp, Loader2 } from "lucide-react";
import { etb } from "@/lib/format";
import { ocrImage } from "@/lib/ocr-server";
import { verifyCbePayment } from "@/lib/cbe-server";
import { PageHeader } from "@/components/cas/AppShell";
import { supabase } from "@/lib/supabase";
import { depositAccount as defaultDepositAccount } from "@/lib/mock-data";

export const Route = createFileRoute("/recharge_/payment")({
  validateSearch: (search: Record<string, unknown>) => ({
    amount: Number(search["amount"]) || 0,
    method: String(search["method"] ?? "CBE"),
  }),
  head: () => ({ meta: [{ title: "Complete payment — CAS" }, { name: "description", content: "Send your recharge amount and submit your payment proof." }, { property: "og:title", content: "Complete payment — CAS" }, { property: "og:description", content: "Send your recharge amount and submit your payment proof." }] }),
  component: Page,
});

function Page() {
  const { amount, method } = Route.useSearch();
  const navigate = useNavigate();
  const [proof, setProof] = useState("");
  const [fileName, setFileName] = useState("");
  const [txn, setTxn] = useState("");
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [depositAccount, setDepositAccount] = useState<{ name: string; bank: string; account: string } | null>(null);
  const [ocrState, setOcrState] = useState<"idle" | "scanning" | "found" | "not-found">("idle");

  /** OCR.space's free tier rejects files over 1 MB, so downscale big screenshots first. */
  const compressForOcr = async (file: File): Promise<File> => {
    if (!file.type.startsWith("image/") || file.size <= 900_000) return file;
    try {
      const bitmap = await createImageBitmap(file);
      const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) return file;
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
      if (!blob) return file;
      return new File([blob], `${file.name.replace(/\.[^.]+$/, "")}.jpg`, { type: "image/jpeg" });
    } catch {
      return file;
    }
  };

  const runOcr = async (file: File) => {
    setOcrState("scanning");
    try {
      const scanFile = await compressForOcr(file);
      const formData = new FormData();
      formData.append("file", scanFile);
      const result = await ocrImage({ data: formData });
      if (result?.ok && result.txn) {
        setTxn(result.txn);
        setOcrState("found");
        toast.success("Transaction detected", { description: result.txn });
      } else {
        setOcrState("not-found");
        toast.error("No transaction found", { description: result?.error ?? "Couldn't read a transaction reference from that image — type it manually or upload a clearer screenshot." });
      }
    } catch {
      setOcrState("not-found");
      toast.error("OCR scan failed", { description: "Check your connection and try again." });
    }
  };

  const pick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setProof(URL.createObjectURL(file));
    setFileName(file.name);
    setProofFile(file);
    void runOcr(file);
  };

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from("platform_settings")
        .select("key,value")
        .in("key", ["deposit_name", "deposit_bank", "deposit_account"]);
      const values = Object.fromEntries((data ?? []).map((row) => [row.key, row.value]));
      setDepositAccount({
        name: String(values.deposit_name || defaultDepositAccount.name),
        bank: String(values.deposit_bank || defaultDepositAccount.bank),
        account: String(values.deposit_account || defaultDepositAccount.account),
      });
    };
    void load();
  }, []);

  const copy = async () => {
    if (!depositAccount?.account) { toast.error("Deposit account is not available yet"); return; }
    await navigator.clipboard.writeText(depositAccount.account);
    toast.success("Account number copied");
  };

  const submit = async () => {
    if (!proofFile && !txn.trim()) { toast.error("Add a screenshot or transaction number"); return; }

    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData.session?.user.id;
    if (!userId) { toast.error("Please log in first"); return; }

    let proofUrl: string | null = null;
    if (proofFile) {
      const safeName = proofFile.name.replace(/[^a-zA-Z0-9_.-]/g, "-");
      const path = `${userId}/${crypto.randomUUID()}-${safeName}`;
      const { error: uploadError } = await supabase.storage
        .from("recharge-proofs")
        .upload(path, proofFile, { upsert: false, contentType: proofFile.type });
      if (uploadError) { toast.error("Screenshot upload failed", { description: uploadError.message }); return; }
      proofUrl = path;
    }

    const { data: insertData, error } = await supabase
      .from("wallet_ledger")
      .insert({
        user_id: userId,
        amount,
        type: "recharge",
        status: "pending",
        transaction_ref: txn.trim() || null,
        proof_url: proofUrl,
        description: `CBE recharge via ${method}`,
      })
      .select("id");

    if (error) { toast.error("Recharge submission failed", { description: error.message }); return; }

    const ledgerId = insertData?.[0]?.id ?? null;

    // Verify the CBE payment via the Check API and auto-approve on success.
    // Runs through the server function so the API key stays server-side and
    // no CORS restrictions apply to the outbound bank API call.
    // Falls back to admin manual review when no transaction number is provided.
    let autoApproved = false;
    try {
      const verify = await verifyCbePayment({
        data: { transaction_number: txn.trim() || undefined, account_number: depositAccount?.account ?? "" },
      });
      autoApproved = verify.ok;
      if (verify.ok) toast.success("Payment verified — recharge auto-approved");
    } catch {
      autoApproved = false;
    }

    if (autoApproved && ledgerId) {
      const { error: approveError } = await supabase.rpc("approve_recharge", { p_ledger_id: ledgerId });
      if (!approveError) {
        toast.success("Payment verified — recharge auto-approved");
        navigate({ to: "/recharge/success", search: { amount, method, proof: Boolean(proofFile), txn: txn.trim() } });
        return;
      }
    }

    navigate({ to: "/recharge/success", search: { amount, method, proof: Boolean(proofFile), txn: txn.trim() } });
  };

  if (!depositAccount) return null;

  return (
    <div>
      <PageHeader title="Complete payment" subtitle="Send the amount, then submit your proof" back />
      <div className="-mt-4 mx-5 rounded-3xl bg-card p-5 shadow-card">
        <p className="text-xs text-muted-foreground">Amount to send</p>
        <p className="text-3xl font-extrabold text-primary">{etb(amount)}</p>
        <p className="mt-1 text-xs text-muted-foreground">via {method}</p>

        <div className="mt-4 divide-y rounded-2xl bg-surface px-4">
          <div className="flex items-center justify-between gap-3 py-3"><span className="text-xs text-muted-foreground">Account name</span><span className="text-sm font-bold">{depositAccount?.name || "Not configured"}</span></div>
          <div className="flex items-center justify-between gap-3 py-3"><span className="text-xs text-muted-foreground">Bank</span><span className="text-sm font-bold">{depositAccount?.bank || "—"}</span></div>
          <div className="flex items-center justify-between gap-3 py-3">
            <span className="text-xs text-muted-foreground">Account number</span>
            <span className="flex items-center gap-2 text-sm font-bold">
              {depositAccount?.account || "Not configured"}
              {depositAccount?.account && (
                <button onClick={copy} aria-label="Copy account number" className="press grid h-7 w-7 place-items-center rounded-lg bg-secondary text-primary">
                  <Copy className="h-3.5 w-3.5" />
                </button>
              )}
            </span>
          </div>
        </div>

        <ol className="mt-4 space-y-1.5 text-xs text-muted-foreground">
          <li>1. Send {etb(amount)} to the CBE account above.</li>
          <li>2. Keep your SMS confirmation or take a screenshot.</li>
          <li>3. Submit either one below as your proof.</li>
        </ol>

        <div className="mt-4">
          <p className="text-sm font-semibold">Payment proof</p>
          <p className="mt-0.5 text-xs text-muted-foreground">A screenshot or the transaction number from your SMS is enough.</p>
          {proof ? (
            <div className="mt-2 flex items-center gap-3 rounded-2xl bg-surface p-3">
              <img src={proof} alt="Payment proof preview" className="h-14 w-14 shrink-0 rounded-xl object-cover" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold">{fileName}</p>
                <p className="flex items-center gap-1 text-xs text-success"><Check className="h-3.5 w-3.5" />Screenshot attached</p>
              </div>
              <label className="shrink-0 cursor-pointer text-xs font-bold text-accent">
                Change
                <input type="file" accept="image/*" onChange={pick} className="sr-only" />
              </label>
            </div>
          ) : (
            <label className="mt-2 flex cursor-pointer flex-col items-center gap-2 rounded-2xl border border-dashed border-accent bg-accent/5 p-5 text-center">
              <span className="grid h-10 w-10 place-items-center rounded-full bg-accent text-accent-foreground"><ImageUp className="h-5 w-5" /></span>
              <span className="text-sm font-bold text-primary">Upload screenshot</span>
              <span className="text-xs text-muted-foreground">PNG or JPG of your CBE transfer</span>
              <input type="file" accept="image/*" onChange={pick} className="sr-only" />
            </label>
          )}

          {ocrState === "scanning" && (
            <p className="mt-2 flex items-center gap-2 text-xs font-semibold text-accent">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Scanning receipt with OCR…
            </p>
          )}

          <div className="my-3 flex items-center gap-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            <span className="h-px flex-1 bg-border" />or<span className="h-px flex-1 bg-border" />
          </div>

          <label className="block">
            <span className="text-xs font-semibold">Transaction number / SMS reference</span>
            <span className="mt-1 flex items-center gap-2 rounded-xl border bg-surface px-3 focus-within:border-accent">
              <Hash className="h-4 w-4 shrink-0 text-muted-foreground" />
              <input value={txn} onChange={(e) => setTxn(e.target.value)} placeholder="e.g. FT26A1B2C3D4" className="min-w-0 flex-1 bg-transparent py-2.5 text-sm outline-none" />
            </span>
          </label>
        </div>

        <button onClick={submit} className="press mt-5 w-full rounded-2xl bg-accent py-4 font-extrabold text-accent-foreground">Submit proof</button>
        <p className="mt-3 text-center text-xs text-muted-foreground">Your wallet is credited after the payment is verified.</p>
      </div>
    </div>
  );
}
