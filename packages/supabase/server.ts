import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Supabase SSR client that stores/retrieves the auth session from Next.js cookies.
 * Uses the project's public Supabase URL + anon key.
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        // Next.js server components can't write cookies (in this Next version's typing).
        // Use `packages/supabase/route.ts` for auth mutations in route handlers.
        setAll() {}
      }
    }
  );
}

