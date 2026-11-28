import { supabase } from "@/lib/supabase";

type AuditTarget = {
  table?: string | undefined;
  type?: string | undefined;
  id?: string | undefined;
  memberId?: string | null | undefined;
  metadata?: Record<string, unknown> | undefined;
};

/**
 * Write an admin action through the server-side RPC.
 *
 * Direct table inserts are intentionally blocked: log_admin_action() stamps
 * admin identity, IP, user agent and time from the authenticated request, so a
 * client cannot forge those fields. Best effort: audit failures never block
 * the action that triggered them.
 */
export async function logAdminAction(
  action: string,
  target: AuditTarget = {},
  _admin?: { id: string; email: string },
) {
  try {
    const { error } = await supabase.rpc("log_admin_action", {
      p_action: action,
      p_target_type: target.type ?? target.table ?? null,
      p_target_id: target.id ?? null,
      p_member_id: target.memberId ?? null,
      p_metadata: target.metadata ?? {},
    });

    if (error) console.warn("Admin audit log failed:", error.message);
  } catch (error) {
    console.warn("Admin audit log failed:", error);
  }
}
