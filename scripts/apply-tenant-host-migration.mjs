/**
 * Apply companies slug + is_suspended columns and backfill tenant slugs.
 * Run: npm run db:apply-tenant-host
 */

import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

function loadEnv() {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  for (const file of ['.env.seed.tmp', 'apps/back-office/.env.local', '.env']) {
    try {
      const env = readFileSync(join(root, file), 'utf8');
      for (const line of env.split('\n')) {
        const m = line.match(/^([^#=\s][^=]*)=(.*)$/);
        if (m) process.env[m[1].trim()] = m[2].trim().replace(/^['"]|['"]$/g, '');
      }
    } catch {
      /* try next */
    }
  }
}

loadEnv();

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const sqlText = readFileSync(
  join(root, 'packages/supabase/migrations/20260606120000_companies_tenant_slug.sql'),
  'utf8',
);

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const projectRef = supabaseUrl.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1];
const accessToken = process.env.SUPABASE_ACCESS_TOKEN;
const dbUrl = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;

async function applyViaManagementApi() {
  if (!accessToken || !projectRef) return false;
  const res = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: sqlText }),
  });
  const body = await res.text();
  if (!res.ok) {
    console.error('Management API failed:', res.status, body.slice(0, 400));
    return false;
  }
  console.log('✅ Tenant host migration applied (Management API)');
  return true;
}

async function applyViaPostgres() {
  const { default: postgres } = await import('postgres');
  const sql = postgres(dbUrl, { max: 1 });
  try {
    await sql.unsafe(sqlText);
    console.log('✅ Tenant host migration applied (Postgres)');
    return true;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

if (await applyViaManagementApi()) process.exit(0);

if (dbUrl) {
  try {
    if (await applyViaPostgres()) process.exit(0);
  } catch (err) {
    console.error('Postgres failed:', err?.message || err);
  }
}

console.error(
  '\nCould not apply migration. Set SUPABASE_ACCESS_TOKEN or DATABASE_URL, or run SQL in Supabase dashboard.',
);
process.exit(1);
