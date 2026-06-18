import { createSupabaseServiceClient } from '../../../packages/supabase/server';

/** Service-role DB for OM field ops — bypasses site_profiles RLS (see site directory). */
export function getOmServiceDb() {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
    throw new Error('OM service data is not configured (missing SUPABASE_SERVICE_ROLE_KEY).');
  }
  return createSupabaseServiceClient();
}

/** Treat blank / literal "null" SM values as unassigned. */
export function normalizeSmEpf(value: unknown): string | null {
  if (value == null || value === '') return null;
  const s = String(value).trim();
  if (!s || s.toLowerCase() === 'null') return null;
  return s.toUpperCase();
}
