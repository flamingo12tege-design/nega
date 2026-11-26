import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  LifeBuoy, Phone, MessageCircle, Send, Mail, Copy, Check, ChevronDown,
  ArrowDownToLine, ArrowUpFromLine, ListChecks, Info, UserRound,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { rewardRules } from "@/lib/mock-data";
import { MAX_PURCHASES_PER_PACKAGE } from "@/lib/store";
import { PageHeader } from "@/components/cas/AppShell";

export const Route = createFileRoute("/support")({
  head: () => ({
    meta: [
      { title: "Support — CAS" },
      { name: "description", content: "Get help with CAS deposits, withdrawals, daily income and your account." },
      { property: "og:title", content: "Support — CAS" },
      { property: "og:description", content: "Get help with CAS deposits, withdrawals, daily income and your account." },
    ],
  }),
  component: Page,
});

const quickLinks = [
  { to: "/recharge", label: "Deposit & payments", hint: "Pay and track a recharge", icon: ArrowDownToLine },
  { to: "/withdraw", label: "Withdraw funds", hint: "Request a CBE payout", icon: ArrowUpFromLine },
  { to: "/tasks", label: "Daily income", hint: "Claim and check bonuses", icon: ListChecks },
  { to: "/how-it-works", label: "How CAS works", hint: "Packages, VIP and rewards", icon: Info },
] as const;

const faqs = [
  {
    q: "My deposit is still pending. How long does it take?",
    a: "Every deposit is checked against the bank reference automatically. If we cannot confirm it right away, our team reviews it manually. You can follow the status on the Wallet page at any time.",
  },
  {
    q: "My payment was rejected. What should I do?",
    a: "A rejected payment is never created as a pending deposit, so no money is stuck in the system. Double-check the transaction number and amount on your receipt, then send the correct reference to CAS support.",
  },
  {
    q: "Do I have to buy a package before I can withdraw?",
    a: "No. Your deposited balance and your earned income are both withdrawable. Add your 13-digit CBE account on the Withdraw page and request the amount you need.",
  },
  {
    q: "How often can I claim daily income?",
    a: `Once per day. Every active package pays daily income for ${rewardRules.packageDurationDays} days, and you claim it from the Tasks page.`,
  },
  {
    q: "How many times can I buy the same package?",
    a: `Each package can be purchased a maximum of ${MAX_PURCHASES_PER_PACKAGE} times. The buy button locks with a clear message once you reach the limit.`,
  },
  {
    q: "What is the minimum withdrawal and the fee?",
    a: `The minimum withdrawal is ETB ${rewardRules.minimumWithdrawal.toLocaleString()} and a ${rewardRules.withdrawalFeePercent}% processing fee is applied to each payout.`,
  },
];

function Page() {
  const [memberId, setMemberId] = useState("");
  const [copied, setCopied] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [channels, setChannels] = useState<{ phone?: string; whatsapp?: string; telegram?: string; email?: string }>({});

  useEffect(() => {
    const load = async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData.session?.user.id;
      if (!userId) return;

      const [{ data: profile }, { data: settings }] = await Promise.all([
        supabase.from("profiles").select("member_id").eq("id", userId).maybeSingle(),
        supabase.from("platform_settings").select("key,value").in("key", ["support_phone", "support_whatsapp", "support_telegram", "support_email"]),
      ]);

      if (profile?.member_id) setMemberId(String(profile.member_id));

      const values = Object.fromEntries((settings ?? []).map((row) => [String(row.key), String(row.value ?? "").trim()]));
      const next: { phone?: string; whatsapp?: string; telegram?: string; email?: string } = {};
      const phone = values["support_phone"];
      if (phone) next.phone = phone;
      const whatsapp = values["support_whatsapp"];
      if (whatsapp) next.whatsapp = whatsapp;
      const telegram = values["support_telegram"];
      if (telegram) next.telegram = telegram;
      const email = values["support_email"];
      if (email) next.email = email;
      setChannels(next);
    };
    void load();
  }, []);

  const copyMemberId = async () => {
    if (!memberId) return;
    await navigator.clipboard.writeText(memberId);
    setCopied(true);
    toast.success("Member ID copied");
    setTimeout(() => setCopied(false), 2000);
  };

  const whatsappNumber = channels.whatsapp?.replace(/\D/g, "") ?? "";
  const telegramHandle = channels.telegram ? channels.telegram.replace(/^https?:\/\/t\.me\//i, "").replace(/^@/, "") : "";
  const contactLinks = [
    channels.phone ? { icon: Phone, label: "Call us", value: channels.phone, href: `tel:${channels.phone.replace(/\s/g, "")}` } : null,
    whatsappNumber ? { icon: MessageCircle, label: "WhatsApp", value: channels.whatsapp!, href: `https://wa.me/${whatsappNumber}` } : null,
    telegramHandle ? { icon: Send, label: "Telegram", value: `@${telegramHandle}`, href: `https://t.me/${telegramHandle}` } : null,
    channels.email ? { icon: Mail, label: "Email", value: channels.email!, href: `mailto:${channels.email}` } : null,
  ].filter((item): item is NonNullable<typeof item> => Boolean(item));

  return (
    <div>
      <PageHeader title="Support" subtitle="Answers, next steps and a way to reach CAS" back />

      <div className="-mt-4 space-y-4 px-5">
        {/* Hero */}
        <section className="relative overflow-hidden rounded-3xl bg-primary p-5 text-primary-foreground shadow-card">
          <div className="pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full bg-accent/20 blur-3xl" />
          <div className="relative flex items-start gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-accent/15 text-accent"><LifeBuoy className="h-5 w-5" /></span>
            <div className="min-w-0">
              <p className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-accent">Help centre</p>
              <h2 className="mt-1 text-xl font-extrabold tracking-tight">How can we help?</h2>
              <p className="mt-1 text-sm text-primary-foreground/70">Pick a topic below or scroll down for the most common questions.</p>
            </div>
          </div>
        </section>

        {/* Quick links */}
        <section className="grid gap-3 sm:grid-cols-2">
          {quickLinks.map(({ to, label, hint, icon: Icon }) => (
            <Link key={to} to={to} className="press flex items-center gap-3 rounded-2xl bg-card p-4 shadow-card transition-shadow hover:shadow-lift">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-secondary text-primary"><Icon className="h-5 w-5" /></span>
              <span className="min-w-0">
                <span className="block truncate font-bold">{label}</span>
                <span className="block truncate text-xs text-muted-foreground">{hint}</span>
              </span>
            </Link>
          ))}
        </section>

        {/* Contact */}
        <section className="rounded-2xl bg-card p-5 shadow-card">
          <p className="flex items-center gap-2 font-extrabold"><MessageCircle className="h-4 w-4 text-accent" />Contact CAS</p>

          {contactLinks.length > 0 ? (
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {contactLinks.map(({ icon: Icon, label, value, href }) => (
                <a
                  key={label}
                  href={href}
                  target={href.startsWith("http") ? "_blank" : undefined}
                  rel={href.startsWith("http") ? "noreferrer" : undefined}
                  className="press flex items-center gap-3 rounded-xl border bg-surface px-3 py-3"
                >
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground"><Icon className="h-4 w-4" /></span>
                  <span className="min-w-0">
                    <span className="block text-xs font-semibold text-muted-foreground">{label}</span>
                    <span className="block truncate text-sm font-bold">{value}</span>
                  </span>
                </a>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">
              Direct support channels are published by the CAS team. Use the quick links above — or share your member ID with us so we can find your account quickly.
            </p>
          )}

          {memberId && (
            <div className="mt-4 flex items-center justify-between gap-3 rounded-xl bg-surface px-3 py-3">
              <span className="flex min-w-0 items-center gap-2">
                <UserRound className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0">
                  <span className="block text-xs font-semibold text-muted-foreground">Your member ID</span>
                  <span className="block truncate text-sm font-bold">{memberId}</span>
                </span>
              </span>
              <button type="button" onClick={copyMemberId} className="press flex shrink-0 items-center gap-1.5 rounded-lg bg-secondary px-3 py-2 text-xs font-bold text-primary">
                {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
          )}
        </section>

        {/* FAQ */}
        <section className="rounded-2xl bg-card p-5 shadow-card">
          <p className="flex items-center gap-2 font-extrabold"><Info className="h-4 w-4 text-accent" />Frequently asked questions</p>
          <div className="mt-2 divide-y">
            {faqs.map((faq, index) => {
              const open = openFaq === index;
              return (
                <div key={faq.q}>
                  <button
                    type="button"
                    onClick={() => setOpenFaq(open ? null : index)}
                    aria-expanded={open}
                    className="flex w-full items-center justify-between gap-3 py-3 text-left"
                  >
                    <span className="text-sm font-bold">{faq.q}</span>
                    <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
                  </button>
                  {open && <p className="pb-3 pr-6 text-sm leading-relaxed text-muted-foreground">{faq.a}</p>}
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}
