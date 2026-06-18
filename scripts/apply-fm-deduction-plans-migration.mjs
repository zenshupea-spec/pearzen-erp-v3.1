/**
 * FM employee deduction installment plans.
 * Run: npm run db:apply-fm-deduction-plans
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

  const password = process.env.SUPABASE_DB_PASSWORD || process.env.PGPASSWORD;
  if (!password) return null;

  const poolerPath = join(root, 'supabase/.temp/pooler-url');
  if (!existsSync(poolerPath)) return null;

  const pooler = readFileSync(poolerPath, 'utf8').trim();
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
  'packages/supabase/migrations/20260610260000_fm_employee_deduction_plans.sql',
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
  console.log('✅ Applied fm_employee_deduction_plans migration (Management API)');
  return true;
}

async function applyViaPostgres(dbUrl) {
  const { default: postgres } = await import('postgres');
  const sql = postgres(dbUrl, { max: 1 });
  try {
    await sql.unsafe(sqlText);
    console.log('✅ Applied fm_employee_deduction_plans migration (Postgres)');
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
    'Add SUPABASE_ACCESS_TOKEN, DATABASE_URL, or SUPABASE_DB_PASSWORD.\n' +
    'Or paste in Supabase SQL editor:\n' +
    '  packages/supabase/migrations/20260610260000_fm_employee_deduction_plans.sql',
);
process.exit(1);
