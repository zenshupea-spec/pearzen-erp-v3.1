/**
 * Portal security + Forge auth migrations (20260619140000–20260619190000).
 * Run: npm run db:apply-portal-security
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const MIGRATION_FILES = [
  '20260619140000_portal_security_lockout_nic.sql',
  '20260619150000_portal_idle_unlock_pending.sql',
  '20260619160000_vault_sessions_portal_auth_email.sql',
  '20260619170000_forge_portal_auth_gates.sql',
  '20260619180000_forge_email_change_requests.sql',
  '20260619190000_forge_pending_logins.sql',
];

function loadEnv() {
  for (const file of [
    '.env.seed.tmp',
    'apps/back-office/.env.local',
    'apps/client-pwa/.env.local',
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

loadEnv();

const sqlText = MIGRATION_FILES.map((file) =>
  readFileSync(join(root, 'packages/supabase/migrations', file), 'utf8'),
).join('\n\n');

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
  console.log('✅ Applied portal security migrations via Management API');
  return true;
}

async function applyViaPg() {
  if (!dbUrl) return false;
  const { default: postgres } = await import('postgres');
  const sql = postgres(dbUrl, { max: 1 });
  try {
    await sql.unsafe(sqlText);
    console.log('✅ Applied portal security migrations via DATABASE_URL');
    return true;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

const ok = (await applyViaManagementApi()) || (await applyViaPg());
if (!ok) {
  console.error(
    '❌ Could not apply migrations. Set SUPABASE_ACCESS_TOKEN or DATABASE_URL, then re-run.',
  );
  process.exit(1);
}

for (const file of MIGRATION_FILES) {
  console.log(`   · ${file}`);
}
