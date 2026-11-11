import { createClient } from "@supabase/supabase-js";

/**
 * Creates a privileged Supabase client using the Service Role Key.
 * STRICTLY FOR SERVER-SIDE USE ONLY. NEVER EXPOSE TO CLIENT.
 * Used for admin operations: checking registration status, executing hardened server RPCs,
 * and background retention purges.
 */
export function createServiceRoleClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co";
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "placeholder-service-key";

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

