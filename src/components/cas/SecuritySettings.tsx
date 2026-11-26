import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { ShieldCheck, KeyRound, X, Eye, EyeOff, Check, Trash2, Loader2, LockKeyhole } from "lucide-react";
import { supabase } from "@/lib/supabase";

const missingRpc = (message: string) => /could not find the function|does not exist|not found/i.test(message);

/** Whether the signed-in member has a withdrawal password set. */
export function useWithdrawalPasswordStatus() {
  const [hasPassword, setHasPassword] = useState<boolean | null>(null);
  const [unavailable, setUnavailable] = useState(false);

  const refresh = useCallback(async () => {
    const { data, error } = await supabase.rpc("has_withdrawal_password");
    if (error) {
      // The RPC is missing until WITHDRAWAL_PASSWORD.sql has been run.
      setHasPassword(false);
      setUnavailable(true);
      return;
    }
    setUnavailable(false);
    setHasPassword(data === true);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { hasPassword, unavailable, refresh };
}

/**
 * Profile -> Security Settings.
 * Lets a member set a separate password that is required for every withdrawal
 * request. The password is hashed in the database and never sent back.
 */
export function SecuritySettings({
  open,
  onClose,
  hasPassword,
  unavailable = false,
  refresh,
}: {
  open: boolean;
  onClose: () => void;
  hasPassword: boolean | null;
  unavailable?: boolean;
  refresh: () => Promise<void>;
}) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
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
      setShow(false);
    }
  }, [open]);

  if (!open) return null;
  if (!mounted) return null;

  const enabled = hasPassword === true;

  const save = async () => {
    if (next.length < 4) { toast.error("Use a password of at least 4 characters"); return; }
    if (next !== confirm) { toast.error("Passwords do not match"); return; }
    setBusy(true);
    const { error } = await supabase.rpc("set_withdrawal_password", {
      p_password: next,
      p_current_password: enabled ? current : null,
    });
    setBusy(false);
    if (error) {
      toast.error(
        missingRpc(error.message) ? "Security settings are not available yet" : "Could not save the password",
        { description: missingRpc(error.message) ? "Please run WITHDRAWAL_PASSWORD.sql in Supabase." : error.message },
      );
      return;
    }
    setCurrent("");
    setNext("");
    setConfirm("");
    await refresh();
    toast.success(enabled ? "Withdrawal password updated" : "Withdrawal password set", {
      description: "It is now required for every withdrawal request.",
    });
  };

  const remove = async () => {
    setBusy(true);
    const { error } = await supabase.rpc("remove_withdrawal_password", { p_current_password: current });
    setBusy(false);
    if (error) {
      toast.error(
        missingRpc(error.message) ? "Security settings are not available yet" : "Could not remove the password",
        { description: missingRpc(error.message) ? "Please run WITHDRAWAL_PASSWORD.sql in Supabase." : error.message },
      );
      return;
    }
    setCurrent("");
    setNext("");
    setConfirm("");
    await refresh();
    toast.success("Withdrawal password removed");
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

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-5">
      <button type="button" aria-label="Close security settings" onClick={onClose} className="absolute inset-0 h-full w-full bg-black/55 backdrop-blur-sm" />

      <div role="dialog" aria-modal="true" aria-labelledby="security-title" className="rise relative max-h-[92dvh] w-full max-w-sm overflow-y-auto rounded-t-3xl bg-card shadow-lift sm:rounded-3xl">
        <div className="flex items-start gap-3 border-b px-5 pb-4 pt-5">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-primary text-accent"><ShieldCheck className="h-5 w-5" /></span>
          <div className="min-w-0 flex-1">
            <h2 id="security-title" className="text-lg font-extrabold tracking-tight">Security settings</h2>
            <p className="text-xs text-muted-foreground">Protect your withdrawals with a second password.</p>
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
                  {hasPassword === null ? "Checking…" : enabled ? "Required for every withdrawal" : "Not set — withdrawals only need your login"}
                </span>
              </span>
            </span>
            <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ${enabled ? "bg-success/15 text-success" : "bg-secondary text-muted-foreground"}`}>
              {enabled ? "On" : "Off"}
            </span>
          </div>

          {enabled && (
            <div className="space-y-3">
              {passwordField("Current withdrawal password", current, setCurrent, "Current password")}
            </div>
          )}

          <div className="space-y-3">
            {passwordField(enabled ? "New withdrawal password" : "Create withdrawal password", next, setNext, "At least 4 characters")}
            {passwordField("Confirm password", confirm, setConfirm, "Repeat the password")}
          </div>

          <p className="flex items-start gap-2 rounded-xl bg-accent/10 p-3 text-[11px] text-muted-foreground">
            <LockKeyhole className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
            This is separate from your login password. When it is on, every withdrawal request must include it. Only you and the CAS admin can see this setting.
          </p>

          {unavailable && (
            <p className="rounded-xl border border-accent bg-accent/10 p-3 text-[11px] font-semibold text-primary">
              Security settings are not available on the server yet. Run WITHDRAWAL_PASSWORD.sql in Supabase to enable the withdrawal password.
            </p>
          )}

          <div className="space-y-2">
            <button
              type="button"
              onClick={save}
              disabled={busy}
              className="press flex w-full items-center justify-center gap-2 rounded-2xl bg-accent py-3.5 font-extrabold text-accent-foreground disabled:opacity-70"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              {enabled ? "Update password" : "Set withdrawal password"}
            </button>

            {enabled && (
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
