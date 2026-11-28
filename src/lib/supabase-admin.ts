import { createClient } from "@supabase/supabase-js";

const url = import.meta.env["VITE_SUPABASE_URL"];
const serviceRoleKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];

if (!url || !serviceRoleKey) {
  throw new Error(
    "Missing server Supabase configuration. Set SUPABASE_SERVICE_ROLE_KEY in the deployment environment.",
  );
}

/**
 * Server-only Supabase client. This file must never be imported from a React
 * component. The service role key bypasses RLS; only trusted server functions
 * may use it, and only after validating the caller's access token.
 */
export const supabaseAdmin = createClient(url, serviceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});
