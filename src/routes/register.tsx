import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Lock, Ticket, RefreshCw, BadgeCheck, Copy } from "lucide-react";
import { normalizeEthiopianPhone } from "@/lib/phone";
import { etb } from "@/lib/format";
import { rewardRules } from "@/lib/mock-data";
import { AuthLayout, Field, PasswordField, newCode } from "@/components/cas/AuthUi";
import { supabase, phoneToEmail } from "@/lib/supabase";

// Sample invitation codes until the backend is connected (code -> inviter member ID).
const INVITES: Record<string, string> = { CAS482: "CAS-100482", CAS513: "CAS-100513" };

export const Route = createFileRoute("/register")({
  validateSearch: (s: Record<string, unknown>) => ({ ref: typeof s["ref"] === "string" ? s["ref"] : undefined }),
  head: () => ({ meta: [{ title: "Join CAS" }, { name: "description", content: "Create your CAS account with an invitation link." }, { property: "og:title", content: "Join CAS" }, { property: "og:description", content: "Create your CAS account with an invitation link." }] }),
  component: Page,
});

function Page() {
  const { ref } = Route.useSearch();
  const code = ref?.toUpperCase();
  const inviter = code ? INVITES[code] : undefined;
  const [f, setF] = useState({ phone: "", pw: "", pw2: "", cap: "" });
  const [cap, setCap] = useState("····");
  const [err, setErr] = useState<Record<string, string | undefined>>({});
  const [memberId, setMemberId] = useState<string | null>(null);
  useEffect(() => setCap(newCode()), []);

  if (!inviter) {
    return (
      <AuthLayout title="Invitation only" subtitle={code ? "This invitation link is invalid or no longer active." : undefined}>
        <div className="grid place-items-center gap-4 text-center">
          <span className="grid h-16 w-16 place-items-center rounded-full bg-secondary text-primary"><Lock className="h-7 w-7" /></span>
          <p className="text-sm text-muted-foreground">CAS is an invitation-only community. You need an invitation link from an existing member to join.</p>
          <Link to="/" className="press w-full rounded-2xl bg-primary py-3 font-bold text-primary-foreground">Return to home</Link>
          <Link to="/login" className="text-sm font-semibold text-accent">I already have an account</Link>
        </div>
      </AuthLayout>
    );
  }

  if (memberId) {
    return (
      <AuthLayout title="You're in!" subtitle={`Welcome to CAS. Your ${etb(rewardRules.registrationBonus)} registration bonus has been credited.`}>
        <div className="rounded-3xl bg-primary p-6 text-center text-primary-foreground">
          <BadgeCheck className="mx-auto h-8 w-8 text-accent" />
          <p className="mt-2 text-xs uppercase tracking-[0.2em] opacity-70">Your member ID</p>
          <p className="mt-1 text-3xl font-extrabold tracking-wide">{memberId}</p>
          <button onClick={() => { navigator.clipboard.writeText(memberId); toast.success("Member ID copied"); }} className="press mt-4 inline-flex items-center gap-1.5 rounded-full bg-accent px-4 py-2 text-sm font-bold text-accent-foreground"><Copy className="h-4 w-4" />Copy</button>
        </div>
        <Link to="/" className="press mt-4 block w-full rounded-2xl bg-accent py-4 text-center font-extrabold text-accent-foreground">Start exploring</Link>
      </AuthLayout>
    );
  }

  const up = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const next = {
      phone: normalizeEthiopianPhone(f.phone) ? undefined : "Enter a valid Ethiopian number",
      pw: f.pw.length >= 8 ? undefined : "At least 8 characters",
      pw2: f.pw === f.pw2 ? undefined : "Passwords do not match",
      cap: f.cap === cap ? undefined : "Code does not match",
    };
    setErr(next);
    if (Object.values(next).some(Boolean)) { if (next.cap !== undefined) { setCap(newCode()); setF({ ...f, cap: "" }); } return; }
    const phone = normalizeEthiopianPhone(f.phone);
    if (!phone) return;

    const generatedMemberId = `CAS-${Math.floor(100000 + Math.random() * 900000)}`;
    const { data, error } = await supabase.auth.signUp({
      email: phoneToEmail(phone),
      password: f.pw,
      options: { data: { phone, member_id: generatedMemberId } },
    });

    if (error) {
      setErr({ phone: error.message });
      return;
    }

    if (data.user) {
      const { error: profileError } = await supabase.from("profiles").upsert({
        id: data.user.id,
        member_id: generatedMemberId,
        phone,
        role: "user",
        wallet_balance: rewardRules.registrationBonus,
        referral_code: code ?? null,
      });

      if (profileError) {
        setErr({ phone: profileError.message });
        return;
      }
    }

    setMemberId(generatedMemberId);
  };

  return (
    <AuthLayout title="Join CAS" subtitle="Just your phone and a password.">
      <div className="mb-5 flex items-center gap-3 rounded-2xl bg-tint-orange p-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-accent text-accent-foreground"><Ticket className="h-5 w-5" /></span>
        <div className="min-w-0 flex-1">
          <p className="text-xs text-muted-foreground">Invited by {inviter}</p>
          <p className="font-extrabold tracking-wide">{code}</p>
        </div>
        <Lock className="h-4 w-4 shrink-0 text-muted-foreground" />
      </div>
      <form onSubmit={submit} className="space-y-3">
        <div>
          <Field label="Invite code" value={code ?? ""} readOnly aria-readonly="true" />
          <p className="mt-1 text-xs text-muted-foreground">Set by your invitation link — it can't be changed.</p>
        </div>
        <Field label="Phone Number" inputMode="tel" placeholder="09XX XXX XXX" value={f.phone} onChange={up("phone")} error={err["phone"]} />
        <PasswordField label="Password" placeholder="Min. 8 characters" value={f.pw} onChange={up("pw")} error={err["pw"]} />
        <PasswordField label="Confirm Password" value={f.pw2} onChange={up("pw2")} error={err["pw2"]} />
        <div>
          <span className="text-sm font-semibold">Security code</span>
          <div className="mt-1 flex items-stretch gap-2">
            <div className="flex w-28 shrink-0 select-none items-center justify-center gap-1 rounded-xl bg-primary font-mono text-xl font-extrabold text-accent">
              {cap.split("").map((d, i) => <span key={i} style={{ transform: `rotate(${(i % 2 ? 1 : -1) * 8}deg)` }}>{d}</span>)}
            </div>
            <input inputMode="numeric" maxLength={4} placeholder="Enter code" value={f.cap} onChange={(e) => setF({ ...f, cap: e.target.value.replace(/\D/g, "") })} className="min-w-0 flex-1 rounded-xl border bg-surface px-3 py-3 text-base outline-none focus:border-accent" />
            <button type="button" onClick={() => setCap(newCode())} aria-label="New code" className="press grid w-12 shrink-0 place-items-center rounded-xl bg-secondary"><RefreshCw className="h-5 w-5" /></button>
          </div>
          {err["cap"] && <span className="mt-1 block text-xs text-destructive">{err["cap"]}</span>}
        </div>
        <button className="press !mt-5 w-full rounded-2xl bg-accent py-4 font-extrabold text-accent-foreground">Create account</button>
        <p className="text-center text-sm">Have an account? <Link to="/login" className="font-semibold text-accent">Log in</Link></p>
      </form>
    </AuthLayout>
  );
}
