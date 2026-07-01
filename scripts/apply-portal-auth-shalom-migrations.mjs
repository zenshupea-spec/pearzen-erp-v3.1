/**
 * Portal auth matrix + Shalom front office migrations (20260615120000–20260701210000).
 * Run: npm run db:apply-portal-auth-shalom
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const MIGRATION_FILES = [
  '20260615120000_portal_auth_otp_expires_at.sql',
  '20260623140000_verification_photo_storage_private.sql',
  '20260623150000_sm_portal_auth_otp_hash.sql',
  '20260625120000_sm_portal_auth_login_selfie.sql',
  '20260625130000_cafe_portal_auth_login_selfie.sql',
  '20260625140000_shalom_portal_auth.sql',
  '20260625160000_head_office_portal_recovery_email.sql',
  '20260625170000_head_office_recovery_email_change_requests.sql',
  '20260625180000_head_office_work_email_change_requests.sql',
  '20260629120000_sm_consent_selfie_storage.sql',
  '20260630120000_shalom_stay_ops.sql',
  '20260701210000_shalom_pre_handover_photos.sql',
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
  console.log('✅ Applied portal auth + Shalom migrations via Management API');
  return true;
}

async function applyViaPg() {
  if (!dbUrl) return false;
  const { default: postgres } = await import('postgres');
  const sql = postgres(dbUrl, { max: 1 });
  try {
    await sql.unsafe(sqlText);
    console.log('✅ Applied portal auth + Shalom migrations via DATABASE_URL');
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
