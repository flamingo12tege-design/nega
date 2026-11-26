import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";

type CreateResult = { ok: boolean; message: string; id?: string };
type AdminRow = { id: string; email: string; member_id: string | null };

function getAdminClient() {
  const url = process.env["VITE_SUPABASE_URL"] ?? import.meta.env["VITE_SUPABASE_URL"];
  const key = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  if (!url || !key) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set on the server");
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

const createCoAdminFn = createServerFn({ method: "POST" }).handler(async ({ data }) => {
  const input = (data ?? {}) as { email?: string; password?: string };
  const email = (input.email ?? "").trim().toLowerCase();
  const password = input.password ?? "";

  if (!/^\S+@\S+\.\S+$/.test(email)) {
    return { ok: false, message: "Enter a valid email address" } as CreateResult;
  }
  if (password.length < 8) {
    return { ok: false, message: "Password must be at least 8 characters" } as CreateResult;
  }

  try {
    const admin = getAdminClient();
    const { data: created, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      app_metadata: { role: "admin" },
    });

    if (error) return { ok: false, message: error.message } as CreateResult;

    const user = created.user;
    if (user) {
      const memberId = `CAS-${Math.floor(100000 + Math.random() * 900000)}`;
      await admin.from("profiles").upsert({
        id: user.id,
        member_id: memberId,
        phone: null,
        role: "admin",
        wallet_balance: 0,
      });
    }

    return { ok: true, message: `Co-admin ${email} created`, id: user?.id } as CreateResult;
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Could not create co-admin",
    } as CreateResult;
  }
});

const listCoAdminsFn = createServerFn({ method: "POST" }).handler(async () => {
  try {
    const admin = getAdminClient();
    const [usersResult, profilesResult] = await Promise.all([
      admin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
      admin.from("profiles").select("id,member_id").eq("role", "admin"),
    ]);

    if (usersResult.error) {
      return { ok: false, message: usersResult.error.message, admins: [] as AdminRow[] };
    }

    const ids = new Set((profilesResult.data ?? []).map((p) => p.id));
    const memberMap = new Map((profilesResult.data ?? []).map((p) => [p.id, p.member_id]));
    const admins: AdminRow[] = usersResult.data.users
      .filter((u) => ids.has(u.id) || u.app_metadata?.["role"] === "admin")
      .map((u) => ({ id: u.id, email: u.email ?? "Unknown", member_id: memberMap.get(u.id) ?? null }));

    return { ok: true, message: "", admins };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Could not load co-admins",
      admins: [] as AdminRow[],
    };
  }
});

export const createCoAdmin = createCoAdminFn as unknown as (opts: {
  data: { email: string; password: string };
}) => Promise<CreateResult>;

export const listCoAdmins = listCoAdminsFn as unknown as () => Promise<{
  ok: boolean;
  message: string;
  admins: AdminRow[];
}>;
