export const etb = (n: number) => `ETB ${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
export const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
