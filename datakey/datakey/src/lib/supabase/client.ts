import { createBrowserClient } from "@supabase/ssr";

/**
 * Creates a Supabase client for use in browser client components.
 * Automatically synchronizes sessions using cookies.
 */
export function createClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co";
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder-anon-key";

  return createBrowserClient(supabaseUrl, supabaseAnonKey);
}

