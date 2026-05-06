import { createBrowserClient } from "@supabase/ssr";

/**
 * Supabase browser client for client-side OAuth initiation.
 * Session persistence is handled by @supabase/ssr (via cookies).
 */
export function createSupabaseBrowserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

