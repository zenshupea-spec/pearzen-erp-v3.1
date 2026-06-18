/**
 * HQ Deductions Admin tables (meal suppliers, monthly entries, month locks).
 * Run: npm run db:apply-deductions-admin
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function loadEnv() {
  for (const file of ['.env.seed.tmp', 'apps/back-office/.env.local', 'apps/client-pwa/.env.local', '.env']) {
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

const migrationFiles = [
  'packages/supabase/migrations/20260604250000_deductions_admin.sql',
  'packages/supabase/migrations/20260604290000_payroll_deduction_month_lock.sql',
  'packages/supabase/migrations/20260610240000_deductions_admin_rls.sql',
];

const sqlText = migrationFiles
  .map((path) => readFileSync(join(root, path), 'utf8'))
  .join('\n\n');

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
  if (!res.ok) {
    const body = await res.text();
    console.error('Management API error:', res.status, body);
    return false;
  }
  console.log('✅ Applied deductions admin migrations via Management API');
  return true;
}

async function applyViaPg() {
  if (!dbUrl) return false;
  const { default: postgres } = await import('postgres');
  const sql = postgres(dbUrl, { max: 1 });
  try {
    await sql.unsafe(sqlText);
    console.log('✅ Applied deductions admin migrations via DATABASE_URL');
    return true;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

const ok = (await applyViaManagementApi()) || (await applyViaPg());
if (!ok) {
  console.error('❌ Could not apply migration. Set SUPABASE_ACCESS_TOKEN or DATABASE_URL.');
  process.exit(1);
}
