/**
 * Step 24 smoke: portal auth + Shalom/HO migration bundle applied on remote DB.
 * Run: node scripts/verify-portal-auth-bundle-gate.mjs
 * Apply: npm run db:apply-portal-auth-shalom
 */

import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const EXPECTED_MIGRATIONS = [
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
];

function loadEnv() {
  for (const file of ['apps/back-office/.env.local', '.env']) {
    try {
      const text = readFileSync(join(root, file), 'utf8');
      for (const line of text.split('\n')) {
        const m = line.match(/^([^#=\s][^=]*)=(.*)$/);
        if (m) process.env[m[1].trim()] = m[2].trim().replace(/^['"]|['"]$/g, '');
      }
      return;
    } catch {
      /* next */
    }
  }
}

loadEnv();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const checks = [];
let failed = false;

function pass(label) {
  checks.push(`  ✓ ${label}`);
}

function fail(label, detail = '') {
  failed = true;
  checks.push(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
}

async function probeSelect(admin, label, table, columns) {
  const { error } = await admin.from(table).select(columns).limit(1);
  if (error?.message?.includes('does not exist')) {
    fail(`${label} table`, error.message);
    return false;
  }
  for (const column of columns.split(',').map((c) => c.trim())) {
    if (error?.message?.includes(column)) {
      fail(`${label}.${column}`, error.message);
      return false;
    }
  }
  if (error && error.code !== 'PGRST116') {
    fail(`${label} probe`, error.message);
    return false;
  }
  pass(`${label} schema (${columns})`);
  return true;
}

function staticChecks() {
  const applyScript = readFileSync(
    join(root, 'scripts/apply-portal-auth-shalom-migrations.mjs'),
    'utf8',
  );

  for (const file of EXPECTED_MIGRATIONS) {
    if (!applyScript.includes(file)) {
      fail(`apply-portal-auth-shalom includes ${file}`);
    } else {
      pass(`apply-portal-auth-shalom includes ${file}`);
    }
  }
}

async function remoteChecks(admin) {
  await probeSelect(
    admin,
    'sm_portal_auth',
    'sm_portal_auth',
    'current_otp_hash, otp_expires_at, last_login_selfie_url',
  );
  await probeSelect(
    admin,
    'cafe_portal_auth',
    'cafe_portal_auth',
    'current_otp, otp_expires_at, last_login_selfie_url',
  );
  await probeSelect(
    admin,
    'shalom_portal_auth',
    'shalom_portal_auth',
    'current_otp_hash, otp_expires_at, needs_pin_setup, is_active',
  );
  await probeSelect(
    admin,
    'head_office_portal_auth',
    'head_office_portal_auth',
    'otp_expires_at, recovery_email, recovery_email_verified_at',
  );
  await probeSelect(
    admin,
    'head_office_recovery_email_change_requests',
    'head_office_recovery_email_change_requests',
    'employee_id, new_recovery_email, code_hash, expires_at',
  );
  await probeSelect(
    admin,
    'head_office_work_email_change_requests',
    'head_office_work_email_change_requests',
    'employee_id, new_work_email, code_hash, expires_at',
  );

  for (const bucket of ['uniform-consent-selfies', 'penalty-consent-selfies']) {
    const { data, error } = await admin.storage.from(bucket).list('', { limit: 1 });
    if (error?.message?.toLowerCase().includes('bucket') || error?.message?.includes('not found')) {
      fail(`storage bucket ${bucket}`, error.message);
    } else if (error) {
      fail(`storage bucket ${bucket}`, error.message);
    } else {
      pass(`storage bucket ${bucket} (${data?.length ?? 0} object(s) at root)`);
    }
  }
}

async function main() {
  staticChecks();

  if (!supabaseUrl || !serviceKey) {
    fail('Env', 'NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required for remote checks');
  } else {
    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    await remoteChecks(admin);
  }

  console.log('\nPortal auth bundle gate smoke (Step 24)\n');
  console.log(checks.join('\n'));
  if (failed) {
    console.log('\nIf schema checks failed, run: npm run db:apply-portal-auth-shalom\n');
  }
  console.log(failed ? '\n❌ FAILED\n' : '\n✅ PASSED\n');
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
