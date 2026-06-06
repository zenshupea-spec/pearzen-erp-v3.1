import { createClient } from '@supabase/supabase-js';

/**
 * Service-role client — bypasses RLS. Safe to import from shared server modules
 * that must not pull in `next/headers` (e.g. company branding).
 */
export function createSupabaseServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}
