import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { Headset, Users, Megaphone, ExternalLink } from "lucide-react";
import { usePlatformSettings } from "@/lib/queries";
import { PageHeader } from "@/components/cas/AppShell";

export const Route = createFileRoute("/support")({
  head: () => ({
    meta: [
      { title: "Support — CAS" },
      { name: "description", content: "Official support and community links for CAS." },
      { property: "og:title", content: "Support — CAS" },
      { property: "og:description", content: "Official support and community links for CAS." },
    ],
  }),
  component: Page,
});

type SupportChannels = {
  customerService?: string;
  telegramGroup?: string;
  telegramChannel?: string;
};

function normalizeServiceHref(value: string) {
  const raw = value.trim();
  if (!raw) return "";
  if (/^(https?:\/\/|tel:|mailto:)/i.test(raw)) return raw;
  const phone = raw.replace(/\D/g, "");
  if (phone.length >= 9 && /^[\d\s()+-]+$/.test(raw)) return `tel:${phone}`;
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw)) return `mailto:${raw}`;
  const handle = raw.replace(/^@/, "");
  return handle ? `https://t.me/${handle}` : "";
}

const normalizeTelegramHref = normalizeServiceHref;

function pickFirst(...values: Array<string | undefined>) {
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed) return trimmed;
  }
  return undefined;
}

function Page() {
  const settings = usePlatformSettings([
    "support_phone",
    "support_whatsapp",
    "support_telegram",
    "support_telegram_group",
    "support_telegram_channel",
    "support_email",
    "support_customer_service",
  ]);

  const channels = useMemo<SupportChannels>(() => {
    const values = settings.data ?? {};

    const customerService = normalizeServiceHref(pickFirst(
      values["support_customer_service"],
      values["support_whatsapp"],
      values["support_telegram"],
      values["support_phone"],
      values["support_email"],
    ) ?? "");

    const telegramChannel = normalizeTelegramHref(pickFirst(
      values["support_telegram_channel"],
      "https://t.me/CAS_Official_Channel03",
    ) ?? "");
    let telegramGroup = normalizeTelegramHref(pickFirst(
      values["support_telegram_group"],
      values["support_telegram"],
    ) ?? "");
    // Avoid showing the same link as both a group and a channel.
    if (telegramGroup === telegramChannel) telegramGroup = "";

    const next: SupportChannels = {};
    if (customerService) next.customerService = customerService;
    if (telegramGroup) next.telegramGroup = telegramGroup;
    if (telegramChannel) next.telegramChannel = telegramChannel;
    return next;
  }, [settings.data]);

  const items = [
    {
      key: "customer-service",
      icon: Headset,
      label: "Customer Service",
      description: "Get help from the CAS support team.",
      href: channels.customerService,
    },
    {
      key: "telegram-group",
      icon: Users,
      label: "Telegram Group",
      description: "Join the community discussion group.",
      href: channels.telegramGroup ? normalizeTelegramHref(channels.telegramGroup) : undefined,
    },
    {
      key: "telegram-channel",
      icon: Megaphone,
      label: "Telegram Channel",
      description: "Read updates and announcements.",
      href: channels.telegramChannel ? normalizeTelegramHref(channels.telegramChannel) : undefined,
    },
  ].filter((item) => Boolean(item.href));

  return (
    <div>
      <PageHeader title="Support" subtitle="Official support and community links." back />

      <div className="-mt-4 space-y-4 px-5">
        <section className="relative overflow-hidden rounded-3xl bg-primary p-6 text-primary-foreground shadow-card">
          <div className="pointer-events-none absolute -right-10 -top-10 h-36 w-36 rounded-full bg-accent/20 blur-3xl" />
          <p className="relative text-[11px] font-extrabold uppercase tracking-[0.2em] text-accent">Service</p>
          <h2 className="relative mt-2 text-2xl font-extrabold tracking-tight">WE ARE HERE TO HELP</h2>
          <p className="relative mt-2 max-w-sm text-sm text-primary-foreground/75">
            Official support and community links.
          </p>
        </section>

        <section className="space-y-3">
          {items.length > 0 ? (
            items.map(({ key, icon: Icon, label, description, href }) => (
              <a
                key={key}
                href={href}
                target={href?.startsWith("http") ? "_blank" : undefined}
                rel={href?.startsWith("http") ? "noreferrer" : undefined}
                className="press flex items-center gap-4 rounded-2xl bg-card p-4 shadow-card transition-shadow hover:shadow-lift"
              >
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-secondary text-primary">
                  <Icon className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-extrabold">{label}</span>
                  <span className="block text-sm text-muted-foreground">{description}</span>
                </span>
                <ExternalLink className="h-4 w-4 shrink-0 text-muted-foreground" />
              </a>
            ))
          ) : (
            <div className="rounded-2xl bg-card p-5 text-sm text-muted-foreground shadow-card">
              Support channels will appear here once they are configured.
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
