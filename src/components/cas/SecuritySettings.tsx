import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { ShieldCheck, KeyRound, X, Eye, EyeOff, Check, Trash2, Loader2, LockKeyhole, HelpCircle } from "lucide-react";
import { supabase } from "@/lib/supabase";

const missingRpc = (message: string) => /could not find the function|does not exist|not found/i.test(message);

type SecurityStatus = { hasPassword: boolean | null; hasKeywords: boolean | null; unavailable: boolean };

/** Withdrawal password and recovery keyword status for the signed-in member. */
export function useWithdrawalPasswordStatus() {
  const [status, setStatus] = useState<SecurityStatus>({
    hasPassword: null,
    hasKeywords: null,
    unavailable: false,
  });

  const refresh = useCallback(async () => {
    const { data, error } = await supabase.rpc("withdrawal_security_status");
    if (error) {
      // Fallback for databases that only have the original password RPC.
      const { data: legacy } = await supabase.rpc("has_withdrawal_password");
      setStatus({
        hasPassword: legacy === true,
        hasKeywords: false,
        unavailable: missingRpc(error.message),
      });
      return;
    }
    const row = Array.isArray(data) ? data[0] : data;
    setStatus({
      hasPassword: row?.has_password === true,
      hasKeywords: row?.has_keywords === true,
      unavailable: false,
    });
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { ...status, refresh };
}

/**
 * Profile -> Security Settings.
 * Withdrawal password is optional. Members can add 2-3 recovery keywords that
 * reset the withdrawal password if it is forgotten.
 */
export function SecuritySettings({
  open,
  onClose,
  hasPassword,
  hasKeywords,
  unavailable = false,
  refresh,
}: {
  open: boolean;
  onClose: () => void;
  hasPassword: boolean | null;
  hasKeywords: boolean | null;
  unavailable?: boolean;
  refresh: () => Promise<void>;
}) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [keywords, setKeywords] = useState(["", "", ""]);
  const [recovering, setRecovering] = useState(false);
  const [recoverKeywords, setRecoverKeywords] = useState(["", "", ""]);
  const [recoverNext, setRecoverNext] = useState("");
  const [recoverConfirm, setRecoverConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  // Portals only exist in the browser, so wait until after hydration.
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (!open) {
      setCurrent("");
      setNext("");
      setConfirm("");
      setKeywords(["", "", ""]);
      setRecovering(false);
      setRecoverKeywords(["", "", ""]);
      setRecoverNext("");
      setRecoverConfirm("");
      setShow(false);
    }
  }, [open]);

  if (!open) return null;
  if (!mounted) return null;

  const enabled = hasPassword === true;
  const keywordsOn = hasKeywords === true;

  const keywordValues = (values: string[]) => values.map((k) => k.trim()).filter(Boolean);

  const save = async () => {
    const supplied = keywordValues(keywords);
    if (supplied.length === 1) { toast.error("Use at least 2 keywords, or leave them empty"); return; }
    if (next && next.length < 4) { toast.error("Use a password of at least 4 characters"); return; }
    if (next && next !== confirm) { toast.error("Passwords do not match"); return; }

    setBusy(true);
    const { error } = await supabase.rpc("set_withdrawal_security", {
      p_password: next ? next : null,
      p_current_password: enabled ? current : null,
      p_keywords: keywords,
    });
    setBusy(false);

    if (error) {
      toast.error(
        missingRpc(error.message) ? "Security settings are not available yet" : "Could not save security settings",
        { description: missingRpc(error.message) ? "Run WITHDRAWAL_SECURITY_UPDATE.sql in Supabase." : error.message },
      );
      return;
    }

    setCurrent("");
    setNext("");
    setConfirm("");
    await refresh();
    toast.success("Security settings saved", {
      description: enabled
        ? "Your withdrawal password and keywords are up to date."
        : "Your optional recovery keywords are saved.",
    });
  };

  const remove = async () => {
    setBusy(true);
    const { error } = await supabase.rpc("set_withdrawal_security", {
      p_password: "",
      p_current_password: current,
      p_keywords: null,
    });
    setBusy(false);
    if (error) {
      toast.error("Could not remove the password", { description: error.message });
      return;
    }
    setCurrent("");
    await refresh();
    toast.success("Withdrawal password removed", { description: "Your keywords were kept." });
  };

  const recover = async () => {
    const supplied = keywordValues(recoverKeywords);
    if (supplied.length < 2) { toast.error("Enter at least 2 recovery keywords"); return; }
    if (recoverNext.length < 4) { toast.error("Use a password of at least 4 characters"); return; }
    if (recoverNext !== recoverConfirm) { toast.error("Passwords do not match"); return; }

    setBusy(true);
    const { error } = await supabase.rpc("recover_withdrawal_password", {
      p_keywords: recoverKeywords,
      p_new_password: recoverNext,
    });
    setBusy(false);
    if (error) {
      toast.error("Could not reset the password", { description: error.message });
      return;
    }
    setRecovering(false);
    setRecoverKeywords(["", "", ""]);
    setRecoverNext("");
    setRecoverConfirm("");
    await refresh();
    toast.success("Withdrawal password reset", { description: "You can now use your new password." });
  };

  const passwordField = (
    label: string,
    value: string,
    onChange: (value: string) => void,
    placeholder: string,
  ) => (
    <label className="block">
      <span className="text-sm font-semibold">{label}</span>
      <span className="mt-1 flex rounded-xl border bg-surface focus-within:border-accent">
        <input
          type={show ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete="off"
          placeholder={placeholder}
          className="min-w-0 flex-1 bg-transparent px-4 py-3 text-sm outline-none"
        />
        <button type="button" onClick={() => setShow((v) => !v)} aria-label={show ? "Hide passwords" : "Show passwords"} className="px-3 text-muted-foreground">
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </span>
    </label>
  );

  const keywordFields = (
    values: string[],
    onChange: (index: number, value: string) => void,
  ) => (
    <div className="grid gap-2">
      {[0, 1, 2].map((i) => (
        <input
          key={i}
          value={values[i] ?? ""}
          onChange={(e) => onChange(i, e.target.value)}
          placeholder={`Keyword ${i + 1}${i === 2 ? " (optional)" : ""}`}
          className="w-full rounded-xl border bg-surface px-4 py-3 text-sm outline-none focus:border-accent"
        />
      ))}
    </div>
  );

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-5">
      <button type="button" aria-label="Close security settings" onClick={onClose} className="absolute inset-0 h-full w-full bg-black/55 backdrop-blur-sm" />

      <div role="dialog" aria-modal="true" aria-labelledby="security-title" className="rise relative max-h-[92dvh] w-full max-w-sm overflow-y-auto rounded-t-3xl bg-card shadow-lift sm:rounded-3xl">
        <div className="flex items-start gap-3 border-b px-5 pb-4 pt-5">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-primary text-accent"><ShieldCheck className="h-5 w-5" /></span>
          <div className="min-w-0 flex-1">
            <h2 id="security-title" className="text-lg font-extrabold tracking-tight">Security settings</h2>
            <p className="text-xs text-muted-foreground">Both the password and keywords are optional.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="press grid h-8 w-8 shrink-0 place-items-center rounded-full bg-secondary text-primary">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-[70vh] space-y-4 overflow-y-auto px-5 py-4">
          <div className="flex items-center justify-between gap-3 rounded-2xl bg-surface p-3">
            <span className="flex min-w-0 items-center gap-2">
              <KeyRound className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0">
                <span className="block text-sm font-bold">Withdrawal password</span>
                <span className="block text-[11px] text-muted-foreground">
                  {hasPassword === null ? "Checking…" : enabled ? "Required for withdrawals" : "Optional — not set"}
                </span>
              </span>
            </span>
            <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ${enabled ? "bg-success/15 text-success" : "bg-secondary text-muted-foreground"}`}>
              {enabled ? "On" : "Off"}
            </span>
          </div>

          <div className="flex items-center justify-between gap-3 rounded-2xl bg-surface p-3">
            <span className="flex min-w-0 items-center gap-2">
              <LockKeyhole className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0">
                <span className="block text-sm font-bold">Recovery keywords</span>
                <span className="block text-[11px] text-muted-foreground">
                  {hasKeywords === null ? "Checking…" : keywordsOn ? "Set — can reset your password" : "Optional — not set"}
                </span>
              </span>
            </span>
            <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ${keywordsOn ? "bg-success/15 text-success" : "bg-secondary text-muted-foreground"}`}>
              {keywordsOn ? "On" : "Off"}
            </span>
          </div>

          {!recovering && enabled && (
            <div className="space-y-3">
              {passwordField("Current withdrawal password", current, setCurrent, "Current password")}
            </div>
          )}

          {!recovering && (
            <>
              <div className="space-y-3">
                <p className="text-sm font-semibold">Withdrawal password <span className="text-xs font-normal text-muted-foreground">(optional)</span></p>
                {passwordField(enabled ? "New withdrawal password" : "Create withdrawal password", next, setNext, "Leave empty to keep it off")}
                {passwordField("Confirm password", confirm, setConfirm, "Repeat the password")}
              </div>

              <div className="space-y-2">
                <p className="text-sm font-semibold">Recovery keywords <span className="text-xs font-normal text-muted-foreground">(2 or 3, optional)</span></p>
                {keywordFields(keywords, (i, value) => setKeywords((prev) => prev.map((k, idx) => idx === i ? value : k)))}
                <p className="text-[11px] text-muted-foreground">Used only to reset your withdrawal password if you forget it. Leave empty to clear them.</p>
              </div>

              <button
                type="button"
                onClick={() => setRecovering(true)}
                className="flex items-center gap-1.5 text-xs font-bold text-accent"
              >
                <HelpCircle className="h-3.5 w-3.5" />Forgot your withdrawal password?
              </button>
            </>
          )}

          {recovering && (
            <div className="space-y-3 rounded-2xl border border-accent bg-accent/10 p-3">
              <p className="text-sm font-bold">Reset with keywords</p>
              {keywordFields(recoverKeywords, (i, value) => setRecoverKeywords((prev) => prev.map((k, idx) => idx === i ? value : k)))}
              {passwordField("New withdrawal password", recoverNext, setRecoverNext, "At least 4 characters")}
              {passwordField("Confirm new password", recoverConfirm, setRecoverConfirm, "Repeat the password")}
              <button type="button" onClick={() => setRecovering(false)} className="text-xs font-bold text-muted-foreground">Cancel</button>
            </div>
          )}

          <p className="flex items-start gap-2 rounded-xl bg-accent/10 p-3 text-[11px] text-muted-foreground">
            <LockKeyhole className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
            The password is separate from your login password and is stored only as a hash. If you set one, withdrawals require it. Keywords let you reset it without admin help.
          </p>

          {unavailable && (
            <p className="rounded-xl border border-accent bg-accent/10 p-3 text-[11px] font-semibold text-primary">
              Run WITHDRAWAL_SECURITY_UPDATE.sql in Supabase to enable recovery keywords.
            </p>
          )}

          <div className="space-y-2">
            <button
              type="button"
              onClick={recovering ? recover : save}
              disabled={busy}
              className="press flex w-full items-center justify-center gap-2 rounded-2xl bg-accent py-3.5 font-extrabold text-accent-foreground disabled:opacity-70"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              {recovering ? "Reset password" : enabled ? "Update security settings" : "Save security settings"}
            </button>

            {enabled && !recovering && (
              <button
                type="button"
                onClick={remove}
                disabled={busy}
                className="press flex w-full items-center justify-center gap-2 rounded-2xl bg-secondary py-3 text-sm font-bold text-destructive disabled:opacity-70"
              >
                <Trash2 className="h-4 w-4" />Remove password
              </button>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
