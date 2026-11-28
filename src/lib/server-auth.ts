export type ServerAuthResult =
  { ok: true; userId: string } | { ok: false; message: string };

/** Validate a Supabase access token on the server. Never trust a client user id. */
export async function requireServerUser(
  accessToken: string,
): Promise<ServerAuthResult> {
  const token = String(accessToken ?? "").trim();
  if (!token) return { ok: false, message: "Please log in again" };

  const { supabaseAdmin } = await import("./supabase-admin");
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data?.user) {
    return { ok: false, message: "Please log in again" };
  }
  return { ok: true, userId: data.user.id };
}

/** Small in-process throttle for expensive server functions. */
const hits = new Map<string, number[]>();

export function isRateLimited(
  key: string,
  limit: number,
  windowMs: number,
): boolean {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((at) => now - at < windowMs);
  if (recent.length >= limit) {
    hits.set(key, recent);
    return true;
  }
  recent.push(now);
  hits.set(key, recent);
  return false;
}
