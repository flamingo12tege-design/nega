import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { normalizeEthiopianPhone } from "@/lib/phone";
import { AuthLayout, Field, PasswordField, PhoneField } from "@/components/cas/AuthUi";
import { WelcomeModal } from "@/components/cas/WelcomeModal";
import { supabase, phoneToEmail } from "@/lib/supabase";

export const Route = createFileRoute("/register")({
  validateSearch: (s: Record<string, unknown>) => ({ ref: typeof s["ref"] === "string" ? s["ref"] : undefined }),
  head: () => ({ meta: [{ title: "Join CAS" }, { name: "description", content: "Create your CAS account with an invitation link." }, { property: "og:title", content: "Join CAS" }, { property: "og:description", content: "Create your CAS account with an invitation link." }] }),
  component: Page,
});

function Page() {
  const { ref } = Route.useSearch();
  const [code, setCode] = useState<string | undefined>(ref?.toUpperCase());
  const [f, setF] = useState({ phone: "", pw: "", pw2: "" });
  const [err, setErr] = useState<Record<string, string | undefined>>({});
  const [welcome, setWelcome] = useState<{ open: boolean; credited: boolean; memberId: string; signedIn: boolean }>({
    open: false,
    credited: false,
    memberId: "",
    signedIn: false,
  });

  const navigate = useNavigate();

  // Only accept invitation codes that belong to a real registered user.
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
    if (!code) {
      setErr({ ...next, code: "Invitation code is required" });
      return;
    }
    const phone = normalizeEthiopianPhone(f.phone);
    if (!phone) return;

    const generatedMemberId = `CAS-${Math.floor(100000 + Math.random() * 900000)}`;
    const { data, error } = await supabase.auth.signUp({
      email: phoneToEmail(phone),
      password: f.pw,
      options: { data: { phone, member_id: generatedMemberId, referral_code: code ?? null } },
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
        referral_code: code ?? null,
      });

      if (profileError) {
        setErr({ phone: profileError.message });
        toast.error("Could not save your profile", { description: profileError.message });
        return;
      }

      // Credit the ETB 300 welcome bonus before showing the announcement.
      const { data: bonus, error: bonusError } = await supabase.rpc("claim_registration_bonus");
      const credited = !bonusError && Number(bonus ?? 0) > 0;

      setWelcome({ open: true, credited, memberId: generatedMemberId, signedIn: Boolean(data.session) });
      return;
    }

    navigate({ to: "/login" });
  };

  const closeWelcome = () => {
    setWelcome((w) => ({ ...w, open: false }));
    navigate({ to: welcome.signedIn ? "/" : "/login" });
  };

  return (
    <AuthLayout title="Join CAS" subtitle="Just your phone and a password.">
      <form onSubmit={submit} className="space-y-3">
        <PhoneField inputMode="tel" placeholder="Enter your mobile number" value={f.phone} onChange={up("phone")} error={err["phone"]} />
        <PasswordField label="Password" placeholder="Min. 8 characters" value={f.pw} onChange={up("pw")} error={err["pw"]} />
        <PasswordField label="Confirm Password" value={f.pw2} onChange={up("pw2")} error={err["pw2"]} />
        <Field label="Invitation code" value={code ?? ""} placeholder="No invitation code" readOnly tabIndex={-1} aria-readonly="true" error={err["code"]} />
        <button className="press !mt-5 w-full rounded-2xl bg-accent py-4 font-extrabold text-accent-foreground">Create account</button>
        <p className="text-center text-sm">Have an account? <Link to="/login" className="font-semibold text-accent">Log in</Link></p>
      </form>

      {welcome.open && (
        <WelcomeModal
          credited={welcome.credited}
          memberId={welcome.memberId}
          continueLabel={welcome.signedIn ? "Start earning" : "Continue to log in"}
          onContinue={closeWelcome}
        />
      )}
    </AuthLayout>
  );
}
