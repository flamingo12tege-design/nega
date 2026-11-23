import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { normalizeEthiopianPhone } from "@/lib/phone";
import { actions } from "@/lib/store";
import { AuthLayout, Field, PasswordField } from "@/components/cas/AuthUi";
import { supabase, phoneToEmail } from "@/lib/supabase";

export const Route = createFileRoute("/login")({
  head: () => ({ meta: [{ title: "Log in — CAS" }, { name: "description", content: "Log in to your CAS account with your phone number." }, { property: "og:title", content: "Log in — CAS" }, { property: "og:description", content: "Log in to your CAS account with your phone number." }] }),
  component: Page,
});

function Page() {
  const nav = useNavigate();
  const [phone, setPhone] = useState("");
  const [pw, setPw] = useState("");
  const [err, setErr] = useState<{ phone?: string | undefined; pw?: string | undefined }>({});
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const n = normalizeEthiopianPhone(phone);
    const next = { phone: n ? undefined : "Enter a valid Ethiopian number (09…, 07… or +251…)", pw: pw.length >= 8 ? undefined : "Password must be at least 8 characters" };
    setErr(next);
    if (next.phone || next.pw) return;

    const { error } = await supabase.auth.signInWithPassword({
      email: phoneToEmail(n!),
      password: pw,
    });

    if (error) {
      toast.error("Login failed", { description: error.message });
      return;
    }

    actions.setLoggedIn(true);
    toast.success("Welcome back!");
    nav({ to: "/" });
  };
  return (
    <AuthLayout title="Welcome back" subtitle="Log in with your phone number">
      <form onSubmit={submit} className="space-y-4">
        <Field label="Phone Number" inputMode="tel" placeholder="09XX XXX XXX" value={phone} onChange={(e) => setPhone(e.target.value)} error={err.phone} />
        <PasswordField label="Password" placeholder="••••••••" value={pw} onChange={(e) => setPw(e.target.value)} error={err.pw} />
        <div className="flex items-center justify-between text-sm">
          <label className="flex items-center gap-2"><input type="checkbox" defaultChecked className="h-4 w-4 accent-accent" />Remember me</label>
          <button type="button" onClick={async () => { const n = normalizeEthiopianPhone(phone); if (!n) { toast.error("Enter your phone number first"); return; } const { error } = await supabase.auth.resetPasswordForEmail(phoneToEmail(n), { redirectTo: `${window.location.origin}/login` }); if (error) toast.error("Reset failed", { description: error.message }); else toast.success("Reset link sent", { description: "Check your email inbox." }); }} className="font-semibold text-accent">Forgot password?</button>
        </div>
        <button className="press w-full rounded-2xl bg-accent py-4 font-extrabold text-accent-foreground">Log in</button>
        <p className="text-center text-xs text-muted-foreground">New here? CAS is invitation-only — ask a member for an invite link.</p>
      </form>
    </AuthLayout>
  );
}
