import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { normalizeEthiopianPhone } from "@/lib/phone";
import { AuthLayout, PasswordField, PhoneField } from "@/components/cas/AuthUi";
import { supabase, phoneToEmail } from "@/lib/supabase";
import { queueWelcome } from "@/lib/welcome";

export const Route = createFileRoute("/register")({
  validateSearch: (s: Record<string, unknown>) => ({ ref: typeof s["ref"] === "string" ? s["ref"] : undefined }),
  head: () => ({
    meta: [
      { title: "Join CAS" },
      { name: "description", content: "Create your CAS account with just your phone number. An invitation link is optional." },
      { property: "og:title", content: "Join CAS" },
      { property: "og:description", content: "Create your CAS account with just your phone number. An invitation link is optional." },
    ],
  }),
  component: Page,
});

/** Invitation codes are member IDs: uppercase letters and digits only. */
const normalizeInviteCode = (value: string) => value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");

type InviteStatus = "idle" | "checking" | "valid" | "invalid" | "unavailable";

function Page() {
  const { ref } = Route.useSearch();
  const navigate = useNavigate();
  const [f, setF] = useState({ phone: "", pw: "", pw2: "" });
  const [err, setErr] = useState<Record<string, string | undefined>>({});

  // Invitation code: shown as a normal form field, pre-filled from ?ref=CODE.
  const [inviteInput, setInviteInput] = useState(() => (ref ? normalizeInviteCode(ref) : ""));
  const [inviteStatus, setInviteStatus] = useState<InviteStatus>(ref ? "checking" : "idle");
  const [inviteVerified, setInviteVerified] = useState<string | null>(null);
  // Guards against an older in-flight check overwriting a newer result.
  const inviteRequest = useRef(0);

  /**
   * Ask the database whether an invitation code belongs to a real member.
   * Signed-out visitors cannot read `profiles` (RLS), so this goes through the
   * `referral_code_exists` security-definer RPC.
   */
  const verifyInvite = async (raw: string): Promise<boolean> => {
    const code = normalizeInviteCode(raw);
    const requestId = ++inviteRequest.current;

    if (!code) {
      if (requestId === inviteRequest.current) {
        setInviteStatus("idle");
        setInviteVerified(null);
      }
      return false;
    }

    setInviteStatus("checking");
    const { data, error } = await supabase.rpc("referral_code_exists", { p_code: code });

    if (requestId !== inviteRequest.current) return false;

    if (error) {
      // Most commonly the SQL helper has not been installed yet. Never treat an
      // unverifiable code as valid.
      setInviteStatus("unavailable");
      setInviteVerified(null);
      return false;
    }

    if (data === true) {
      setInviteStatus("valid");
      setInviteVerified(code);
      return true;
    }

    setInviteStatus("invalid");
    setInviteVerified(null);
    return false;
  };

  // Validate the invitation link as soon as the page loads.
  useEffect(() => {
    if (ref) void verifyInvite(ref);
    // Only run for the initial link; manual edits are validated on demand.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ref]);

  const up = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const next = {
      phone: normalizeEthiopianPhone(f.phone) ? undefined : "Enter a valid Ethiopian number",
      pw: f.pw.length >= 8 ? undefined : "At least 8 characters",
      pw2: f.pw === f.pw2 ? undefined : "Passwords do not match",
    };
    setErr(next);
    if (Object.values(next).some(Boolean)) return;
    const phone = normalizeEthiopianPhone(f.phone);
    if (!phone) return;

    // Re-validate right before signup. A code is stored only when the database
    // confirms it belongs to a real member; invalid codes are silently dropped
    // so they can never appear as "applied" or be saved on the profile.
    let referralCode: string | null = null;
    if (normalizeInviteCode(inviteInput)) {
      const ok = await verifyInvite(inviteInput);
      if (ok) {
        referralCode = normalizeInviteCode(inviteInput);
      } else {
        toast.error("Invalid invitation code", {
          description: "That code does not belong to a registered member, so it was not applied.",
        });
      }
    }

    // One ID for the auth metadata, the profile row and the welcome modal.
    const generatedMemberId = `CAS-${Math.floor(100000 + Math.random() * 900000)}`;

    const { data, error } = await supabase.auth.signUp({
      email: phoneToEmail(phone),
      password: f.pw,
      options: { data: { phone, member_id: generatedMemberId, referral_code: referralCode } },
    });

    if (error) {
      const alreadyRegistered = /already registered|already exists|duplicate/i.test(error.message);
      setErr({
        phone: alreadyRegistered
          ? "This mobile number is already registered — please log in instead."
          : error.message,
      });
      toast.error("Could not create account", { description: error.message });
      return;
    }

    if (data.user) {
      const { error: profileError } = await supabase.from("profiles").upsert({
        id: data.user.id,
        member_id: generatedMemberId,
        phone,
        role: "user",
        wallet_balance: 0,
        referral_code: referralCode,
      });

      if (profileError) {
        setErr({ phone: profileError.message });
        toast.error("Could not save your profile", { description: profileError.message });
        return;
      }

      // Credit the ETB 300 welcome bonus.
      const { data: bonus, error: bonusError } = await supabase.rpc("claim_registration_bonus");
      const credited = !bonusError && Number(bonus ?? 0) > 0;
      const signedIn = Boolean(data.session);

      // The root layout owns the announcement and shows it on the homepage.
      queueWelcome({ credited, memberId: generatedMemberId, signedIn });

      if (!signedIn) {
        toast.success("Account created", { description: "Log in to see your welcome bonus." });
        navigate({ to: "/login" });
      }
    }
  };

  const inviteMessage = (() => {
    switch (inviteStatus) {
      case "checking":
        return { tone: "text-muted-foreground", text: "Checking invitation code…" };
      case "valid":
        return { tone: "text-success", text: `Invitation applied: ${inviteVerified ?? ""}` };
      case "invalid":
        return { tone: "text-destructive", text: "Invalid invitation code — it will not be applied." };
      case "unavailable":
        return { tone: "text-muted-foreground", text: "Could not verify this code right now — it will not be applied." };
      default:
        return null;
    }
  })();

  return (
    <AuthLayout title="Join CAS" subtitle="Just your phone and a password.">
      <form onSubmit={submit} className="space-y-3">
        <PhoneField inputMode="tel" placeholder="Enter your mobile number" value={f.phone} onChange={up("phone")} error={err["phone"]} />
        <PasswordField label="Password" placeholder="Min. 8 characters" value={f.pw} onChange={up("pw")} error={err["pw"]} />
        <PasswordField label="Confirm Password" value={f.pw2} onChange={up("pw2")} error={err["pw2"]} />

        {/* Invitation code: always a visible field, pre-filled from ?ref=CODE. */}
        <div className="mt-3">
          <label htmlFor="invite-code" className="text-xs font-semibold text-muted-foreground">
            Invitation code (optional)
          </label>
          <div className="mt-1 flex items-center gap-2">
            <input
              id="invite-code"
              type="text"
              value={inviteInput}
              onChange={(e) => {
                inviteRequest.current += 1;
                setInviteInput(normalizeInviteCode(e.target.value));
                setInviteStatus("idle");
                setInviteVerified(null);
              }}
              placeholder="e.g. CAS321986"
              maxLength={20}
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              className="min-w-0 flex-1 rounded-xl border bg-surface px-3 py-2.5 text-sm outline-none focus:border-accent"
              disabled={inviteStatus === "checking"}
              aria-label="Invitation code"
              aria-describedby="invite-code-status"
            />
            <button
              type="button"
              onClick={() => void verifyInvite(inviteInput)}
              disabled={!inviteInput || inviteStatus === "checking"}
              className="press rounded-xl bg-secondary px-3 py-2.5 text-sm font-bold text-primary disabled:opacity-50"
            >
              Validate
            </button>
          </div>
          {inviteMessage && (
            <p id="invite-code-status" role="status" className={`mt-2 text-xs font-semibold ${inviteMessage.tone}`}>
              {inviteMessage.text}
            </p>
          )}
        </div>

        <button className="press !mt-5 w-full rounded-2xl bg-accent py-4 font-extrabold text-accent-foreground">Create account</button>
        <p className="text-center text-sm">Have an account? <Link to="/login" className="font-semibold text-accent">Log in</Link></p>
      </form>
    </AuthLayout>
  );
}
