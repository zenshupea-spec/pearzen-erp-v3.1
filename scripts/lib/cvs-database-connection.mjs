/** Resolve direct Postgres URI for CVS pg_dump (shared by backup scripts). */

export function projectRefFromSupabaseUrl(url) {
  return url?.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1] ?? null;
}

/**
 * Priority:
 *  1. DATABASE_URL / SUPABASE_DB_URL / CVS_DATABASE_URL
 *  2. SUPABASE_DB_PASSWORD or PGPASSWORD + NEXT_PUBLIC_SUPABASE_URL
 *
 * Note: SUPABASE_ACCESS_TOKEN is for the Management API only — not a postgres password.
 */
export function resolveCvsDirectDbUrl(env = process.env) {
  const direct = env.DATABASE_URL || env.SUPABASE_DB_URL || env.CVS_DATABASE_URL;
  if (direct?.trim()) return direct.trim();

  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
  const ref = projectRefFromSupabaseUrl(supabaseUrl);
  const password = env.SUPABASE_DB_PASSWORD?.trim() || env.PGPASSWORD?.trim();
  if (!password || !ref) return null;

  const enc = encodeURIComponent(password);
  return `postgresql://postgres:${enc}@db.${ref}.supabase.co:5432/postgres`;
}
