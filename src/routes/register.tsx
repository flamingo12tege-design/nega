import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { RefreshCw, BadgeCheck, Copy } from "lucide-react";
import { normalizeEthiopianPhone } from "@/lib/phone";
import { AuthLayout, Field, PasswordField, newCode } from "@/components/cas/AuthUi";
import { supabase, phoneToEmail } from "@/lib/supabase";

export const Route = createFileRoute("/register")({
  validateSearch: (s: Record<string, unknown>) => ({ ref: typeof s["ref"] === "string" ? s["ref"] : undefined }),
  head: () => ({ meta: [{ title: "Join CAS" }, { name: "description", content: "Create your CAS account with an invitation link." }, { property: "og:title", content: "Join CAS" }, { property: "og:description", content: "Create your CAS account with an invitation link." }] }),
  component: Page,
});

function Page() {
  const { ref } = Route.useSearch();
  const code = ref?.toUpperCase();
  const [f, setF] = useState({ phone: "", pw: "", pw2: "", cap: "" });
  const [cap, setCap] = useState("····");
  const [err, setErr] = useState<Record<string, string | undefined>>({});
  const [memberId, setMemberId] = useState<string | null>(null);
  useEffect(() => setCap(newCode()), []);

  if (memberId) {
    return (
      <AuthLayout title="You're in!" subtitle="Welcome to CAS. Your account has been created.">
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
      options: { data: { phone, member_id: generatedMemberId, referral_code: code ?? null } },
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
        wallet_balance: 0,
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
      <form onSubmit={submit} className="space-y-3">
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
