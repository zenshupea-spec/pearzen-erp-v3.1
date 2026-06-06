/**
 * Applies employees epf_no + passport_no migration to remote Supabase.
 * Run: npm run db:apply-epf-columns
 *
 * Requires one of:
 *   • DATABASE_URL or SUPABASE_DB_URL (Postgres URI)
 *   • SUPABASE_DB_PASSWORD (+ linked pooler URL in supabase/.temp/pooler-url)
 *   • SUPABASE_ACCESS_TOKEN (Management API)
 */

import { existsSync, readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function loadEnv() {
  for (const file of [
    '.env.seed.tmp',
    'apps/back-office/.env.local',
    'apps/field-pwa/.env.local',
    '.env',
  ]) {
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

function resolveDbUrl() {
  const direct = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;
  if (direct) return direct;

  const password =
    process.env.SUPABASE_DB_PASSWORD || process.env.PGPASSWORD;
  if (!password) return null;

  const poolerPath = join(root, 'supabase/.temp/pooler-url');
  if (!existsSync(poolerPath)) return null;

  const pooler = readFileSync(poolerPath, 'utf8').trim();
  // postgresql://postgres.<ref>@host:port/postgres
  const m = pooler.match(
    /^postgresql:\/\/postgres\.([^@]+)@([^:]+):(\d+)\/(.+)$/,
  );
  if (!m) return null;

  const [, ref, host, port, database] = m;
  const user = `postgres.${ref}`;
  const enc = encodeURIComponent(password);
  return `postgresql://${user}:${enc}@${host}:${port}/${database}`;
}

loadEnv();

const migrationPath = join(
  root,
  'packages/supabase/migrations/20260604210000_employees_epf_no_passport_no.sql',
);
const sqlText = readFileSync(migrationPath, 'utf8');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const projectRef = supabaseUrl.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1];
const accessToken = process.env.SUPABASE_ACCESS_TOKEN;

async function applyViaManagementApi() {
  if (!accessToken || !projectRef) return false;
  const res = await fetch(
    `https://api.supabase.com/v1/projects/${projectRef}/database/query`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: sqlText }),
    },
  );
  const body = await res.text();
  if (!res.ok) {
    console.error('Management API failed:', res.status, body.slice(0, 400));
    return false;
  }
  console.log('✅ Applied employees epf_no + passport_no (Management API)');
  return true;
}

async function applyViaPostgres(dbUrl) {
  const { default: postgres } = await import('postgres');
  const sql = postgres(dbUrl, { max: 1 });
  try {
    await sql.unsafe(sqlText);
    console.log('✅ Applied employees epf_no + passport_no (Postgres)');
    return true;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

if (await applyViaManagementApi()) {
  process.exit(0);
}

const dbUrl = resolveDbUrl();
if (dbUrl) {
  try {
    if (await applyViaPostgres(dbUrl)) process.exit(0);
  } catch (err) {
    console.error('Postgres migration failed:', err?.message || err);
    process.exit(1);
  }
}

console.error(
  'Could not apply migration automatically.\n' +
    'Add one of:\n' +
    '  • SUPABASE_ACCESS_TOKEN — https://supabase.com/dashboard/account/tokens\n' +
    '  • DATABASE_URL — Project Settings → Database → Connection string (URI)\n' +
    '  • SUPABASE_DB_PASSWORD — database password (uses supabase/.temp/pooler-url host)\n' +
    'Then run: npm run db:apply-epf-columns\n\n' +
    'Or paste in Supabase SQL editor:\n' +
    '  packages/supabase/migrations/20260604210000_employees_epf_no_passport_no.sql',
);
process.exit(1);
