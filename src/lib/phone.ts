/** Normalize Ethiopian phone numbers (+2519..., 2519..., 09..., 07..., 9...) to +251XXXXXXXXX. Returns null if invalid. */
export function normalizeEthiopianPhone(input: string): string | null {
  const digits = input.replace(/[^\d+]/g, "").replace(/^\+/, "");
  let local: string;
  if (digits.startsWith("251")) local = digits.slice(3);
  else if (digits.startsWith("0")) local = digits.slice(1);
  else local = digits;
  if (!/^[79]\d{8}$/.test(local)) return null;
  return `+251${local}`;
}
