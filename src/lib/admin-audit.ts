import { supabase } from "@/lib/supabase";

type AuditTarget = {
  table?: string | undefined;
  type?: string | undefined;
  id?: string | undefined;
  memberId?: string | null | undefined;
  metadata?: Record<string, unknown> | undefined;
};

/**
 * Write an admin action to public.admin_audit_logs.
 *
 * This is a direct insert instead of an RPC so no SQL functions or
 * dollar-quoted strings are needed. Best effort: audit failures never block
 * the action that triggered them.
 */
export async function logAdminAction(
  action: string,
  target: AuditTarget = {},
  admin?: { id: string; email: string },
) {
  try {
    let adminId = admin?.id;
    let adminEmail: string | null | undefined = admin?.email;

    if (!adminId) {
      const { data } = await supabase.auth.getUser();
      adminId = data.user?.id;
      adminEmail = adminEmail ?? data.user?.email ?? null;
    }

    if (!adminId) return;

    const { error } = await supabase.from("admin_audit_logs").insert({
      admin_id: adminId,
      admin_email: adminEmail ?? null,
      action,
      target_table: target.table ?? null,
      target_type: target.type ?? null,
      target_id: target.id ?? null,
      member_id: target.memberId ?? null,
      metadata: target.metadata ?? {},
    });

    if (error) console.warn("Admin audit log failed:", error.message);
  } catch (error) {
    console.warn("Admin audit log failed:", error);
  }
}
