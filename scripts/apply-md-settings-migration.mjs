/**
 * Applies md_settings column bundle to remote Supabase.
 * Run: npm run db:apply-md-settings
 *
 * Requires DATABASE_URL or SUPABASE_DB_URL (direct Postgres connection string).
 * Loads env from .env.seed.tmp, apps/back-office/.env.local, then .env
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

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

const migrationPath = join(
  dirname(fileURLToPath(import.meta.url)),
  '../packages/supabase/migrations/20260604120000_md_settings_missing_columns_bundle.sql',
);
const sqlText = readFileSync(migrationPath, 'utf8');

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
  console.log('✅ Applied md_settings column bundle (Management API)');
  return true;
}

async function applyViaPostgres() {
  const { default: postgres } = await import('postgres');
  const sql = postgres(dbUrl, { max: 1 });
  try {
    await sql.unsafe(sqlText);
    console.log('✅ Applied md_settings column bundle (direct Postgres)');
    return true;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

if (await applyViaManagementApi()) {
  process.exit(0);
}

if (dbUrl) {
  try {
    if (await applyViaPostgres()) process.exit(0);
  } catch (err) {
    console.error('Postgres migration failed:', err?.message || err);
    process.exit(1);
  }
}

console.error(
  'Could not apply migration automatically.\n' +
    'Add one of:\n' +
    '  • SUPABASE_ACCESS_TOKEN (https://supabase.com/dashboard/account/tokens) in .env.seed.tmp\n' +
    '  • DATABASE_URL (Project Settings → Database → Connection string URI) in .env.seed.tmp\n' +
    'Then run: npm run db:apply-md-settings\n\n' +
    'Or run manually: npm run db:md-settings-sql → paste in Supabase SQL editor.',
);
process.exit(1);
