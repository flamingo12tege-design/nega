import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { normalizeEthiopianPhone } from "@/lib/phone";
import { AuthLayout, PasswordField, PhoneField } from "@/components/cas/AuthUi";
import { supabase, phoneToEmail } from "@/lib/supabase";
import { queueWelcome, clearQueuedWelcome } from "@/lib/welcome";
import { WelcomeModal } from "@/components/cas/WelcomeModal";

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

function Page() {
  const { ref } = Route.useSearch();
  const [code, setCode] = useState<string | undefined>(ref?.toUpperCase());
  const [f, setF] = useState({ phone: "", pw: "", pw2: "" });
  const [err, setErr] = useState<Record<string, string | undefined>>({});
  const navigate = useNavigate();

  // State for the welcome modal that appears after successful signup.
  const [showWelcome, setShowWelcome] = useState(false);
  const [welcomedCredited, setWelcomeCredited] = useState(false);
  const [welcomedMemberId, setWelcomeMemberId] = useState<string | undefined>(undefined);

  // Invitations are optional. Accept a ?ref= code or a manual code entry.
  useEffect(() => {
    if (!ref) return;
    let active = true;
    const validate = async () => {
      const { data } = await supabase.from("profiles").select("referral_code").eq("referral_code", ref.toUpperCase()).maybeSingle();
      if (active && !data?.referral_code) setCode(undefined);
    };
    void validate();
    return () => { active = false; };
  }, [ref]);

  // Manual invitation code validation.
  const [manualCode, setManualCode] = useState<string | undefined>(undefined);
  const [manualCodeValid, setManualCodeValid] = useState(false);
  const [manualCodeLoading, setManualCodeLoading] = useState(false);

  const validateManualCode = async (code: string) => {
    setManualCodeLoading(true);
    try {
      const { data, error } = await supabase.from("profiles").select("referral_code").eq("referral_code", code.toUpperCase()).maybeSingle();
      if (error || !data?.referral_code) {
        setManualCodeValid(false);
        toast.error("Invalid invitation code", { description: "This referral code does not belong to a registered member." });
      } else {
        setManualCodeValid(true);
        setManualCode(code.toUpperCase());
        toast.success("Invitation code applied", { description: "Code validated and will be used for this signup." });
      }
    } catch {
      setManualCodeValid(false);
      toast.error("Could not validate invitation code", { description: "Please try again." });
    } finally {
      setManualCodeLoading(false);
    }
  };

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

    const generatedMemberId = `CAS-${Math.floor(100000 + Math.random() * 900000)}`;

    // Determine the referral code to use: URL param takes priority, then manual entry.
    const referralCode = code ?? manualCode ?? null;

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
      // Clear manual code on error so it doesn't persist incorrectly.
      setManualCodeUndefined();
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
        // Clear manual code on error.
        setManualCodeUndefined();
        return;
      }

      // Credit the ETB 300 welcome bonus.
      const { data: bonus, error: bonusError } = await supabase.rpc("claim_registration_bonus");
      const credited = !bonusError && Number(bonus ?? 0) > 0;
      const signedIn = Boolean(data.session);

      // Queue the welcome announcement so it survives a future redirect,
      // then show it immediately on this page without navigating away.
      queueWelcome({ credited, memberId: generatedMemberId, signedIn });
      setWelcomeCredited(credited);
      setWelcomeMemberId(generatedMemberId);
      setShowWelcome(true);
      return;
    }

    navigate({ to: "/login" });
  };

  // Helper to clear manual code state.
  const setManualCodeUndefined = () => {
    setManualCode(undefined);
    setManualCodeValid(false);
  };

  return (
    <AuthLayout title="Join CAS" subtitle="Just your phone and a password.">
      <form onSubmit={submit} className="space-y-3">
        <PhoneField inputMode="tel" placeholder="Enter your mobile number" value={f.phone} onChange={up("phone")} error={err["phone"]} />
        <PasswordField label="Password" placeholder="Min. 8 characters" value={f.pw} onChange={up("pw")} error={err["pw"]} />
        <PasswordField label="Confirm Password" value={f.pw2} onChange={up("pw2")} error={err["pw2"]} />

        {/* Invitation code section - supports both ?ref=CODE URL parameter and manual entry. */}
        <div className="mt-3">
          <p className="text-xs text-muted-foreground">Invitation code (optional)</p>
          {/* URL parameter code */}
          {code && (
            <p className="rounded-xl border border-accent bg-accent/10 px-3 py-2 text-xs font-semibold text-primary">
              Invitation applied: <span className="font-extrabold">{code}</span>
            </p>
          )}
          {/* Manual code entry */}
          {!code && (
            <div className="mt-2 flex items-center gap-2">
              <input
                type="text"
                value={manualCode ?? ""}
                onChange={(e) => setManualCode(e.target.value.trim().toUpperCase() || undefined)}
                placeholder="Enter referral code"
                maxLength="20"
                className="min-w-0 flex-1 rounded-xl border bg-surface px-3 py-2.5 text-sm outline-none focus:border-accent"
                disabled={manualCodeLoading}
                aria-label="Referral code"
              />
              <button
                type="button"
                onClick={() => manualCode && validateManualCode(manualCode)}
                disabled={!manualCode || manualCodeLoading}
                className="press rounded-xl bg-secondary px-3 py-2.5 text-sm font-bold text-primary"
              >
                Validate
              </button>
            </div>
          )}
          {manualCodeValid && !code && (
            <p className="mt-2 rounded-xl border border-accent bg-accent/10 px-3 py-2 text-xs font-semibold text-primary">
              Invitation applied: <span className="font-extrabold">{manualCode}</span>
            </p>
          )}
        </div>

        <button className="press !mt-5 w-full rounded-2xl bg-accent py-4 font-extrabold text-accent-foreground">Create account</button>
        <p className="text-center text-sm">Have an account? <Link to="/login" className="font-semibold text-accent">Log in</Link></p>
      </form>

      {/* Welcome modal that appears after successful registration, without navigating away. */}
      {showWelcome && (
        <WelcomeModal
          credited={welcomedCredited}
          memberId={welcomedMemberId}
          onContinue={() => setShowWelcome(false)}
          continueLabel="Join the channel"
        />
      )}
    </AuthLayout>
  );
}