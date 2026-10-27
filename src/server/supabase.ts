import "server-only";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { getEnv } from "./env";

let admin: SupabaseClient | undefined;

/**
 * Service-role client. It bypasses RLS, so it is used only from server code that
 * has already authenticated and authorised the caller. Never import into a
 * client component (the `server-only` import enforces that at build time).
 */
export function adminClient(): SupabaseClient {
  if (!admin) {
    const env = getEnv();
    admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return admin;
}
