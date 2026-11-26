export const etb = (n: number) => `ETB ${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;

/** Hide most of a bank account number while keeping it identifiable. */
export const maskAccount = (account: string) => {
  const digits = account.replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length <= 4) return digits;
  if (digits.length <= 7) return `${"*".repeat(digits.length - 4)}${digits.slice(-4)}`;
  return `${digits.slice(0, 3)}${"*".repeat(digits.length - 7)}${digits.slice(-4)}`;
};
const ADDIS_ABABA_TIMEZONE = "Africa/Addis_Ababa";

export const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: ADDIS_ABABA_TIMEZONE,
  });

export const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: ADDIS_ABABA_TIMEZONE,
  });
