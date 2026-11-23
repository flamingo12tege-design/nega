const authImg = "/image.jpg";
import { ShieldCheck, Gift, Users } from "lucide-react";
import { useState, type InputHTMLAttributes, type ReactNode } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Logo } from "./Logo";

export function AuthLayout({ title, subtitle, children }: { title: string; subtitle?: string | undefined; children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background lg:grid lg:grid-cols-2">
      <div className="relative h-[42vh] min-h-72 overflow-hidden lg:sticky lg:top-0 lg:h-screen">
        <img src={authImg} alt="Couple enjoying their modern CAS kitchen" width={1450} height={664} className="absolute inset-0 h-full w-full object-cover" />
        <div className="auth-scrim absolute inset-0" />
        <div className="absolute left-5 top-5 rounded-2xl bg-background/95 px-3 py-2 shadow-card"><Logo className="h-8" /></div>
        <div className="absolute inset-x-0 bottom-10 px-6 text-primary-foreground lg:bottom-16 lg:px-12">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-accent">Welcome home</p>
          <p className="mt-2 max-w-sm text-2xl font-extrabold leading-tight lg:text-4xl">Better appliances. Better everyday life.</p>
          <div className="mt-4 hidden gap-4 text-sm opacity-90 lg:flex">
            <span className="flex items-center gap-1.5"><ShieldCheck className="h-4 w-4 text-accent" />Trusted</span>
            <span className="flex items-center gap-1.5"><Gift className="h-4 w-4 text-accent" />Rewards</span>
            <span className="flex items-center gap-1.5"><Users className="h-4 w-4 text-accent" />Community</span>
          </div>
        </div>
      </div>
      <div className="relative -mt-6 rounded-t-[2rem] bg-background px-6 pb-10 pt-7 lg:mt-0 lg:flex lg:items-center lg:justify-center lg:rounded-none">
        <div className="rise mx-auto w-full max-w-md">
          <span className="mx-auto mb-5 block h-1.5 w-12 rounded-full bg-border lg:hidden" />
          <h1 className="text-3xl font-extrabold tracking-tight">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
          <div className="mt-6">{children}</div>
        </div>
      </div>
    </div>
  );
}

export function Field({ label, error, ...p }: { label: string; error?: string | undefined } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block">
      <span className="text-sm font-semibold">{label}</span>
      <input {...p} className="mt-1 w-full rounded-xl border bg-surface px-4 py-3 text-base outline-none focus:border-accent focus:ring-2 focus:ring-ring/30 read-only:opacity-70" />
      {error && <span className="mt-1 block text-xs text-destructive">{error}</span>}
    </label>
  );
}

export function PasswordField({ label, error, ...p }: { label: string; error?: string | undefined } & InputHTMLAttributes<HTMLInputElement>) {
  const [show, setShow] = useState(false);
  return (
    <label className="block">
      <span className="text-sm font-semibold">{label}</span>
      <div className="relative mt-1">
        <input {...p} type={show ? "text" : "password"} className="w-full rounded-xl border bg-surface px-4 py-3 pr-12 text-base outline-none focus:border-accent focus:ring-2 focus:ring-ring/30" />
        <button type="button" onClick={() => setShow(!show)} aria-label={show ? "Hide password" : "Show password"} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
          {show ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
        </button>
      </div>
      {error && <span className="mt-1 block text-xs text-destructive">{error}</span>}
    </label>
  );
}
