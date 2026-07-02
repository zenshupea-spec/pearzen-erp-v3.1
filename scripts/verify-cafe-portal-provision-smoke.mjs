/**
 * Step 18 smoke: Café portal provision desk + induction auto-provision wiring.
 * Run: node scripts/verify-cafe-portal-provision-smoke.mjs
 */

import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

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

function isOtpActive(authRecord) {
  if (!authRecord?.current_otp || !authRecord?.otp_expires_at) return false;
  return Date.now() < new Date(authRecord.otp_expires_at).getTime();
}

function staticChecks() {
  const onboarding = readFileSync(
    join(root, 'apps/back-office/app/hr/onboarding-actions.ts'),
    'utf8',
  );
  const cafeActions = readFileSync(
    join(root, 'apps/back-office/app/hr/cafe-portal/actions.ts'),
    'utf8',
  );
  const cafePage = readFileSync(
    join(root, 'apps/back-office/app/hr/cafe-portal/page.tsx'),
    'utf8',
  );
  const cafeAuth = readFileSync(
    join(root, 'apps/back-office/lib/cafe-front-auth.ts'),
    'utf8',
  );

  if (onboarding.includes("from '../cafe-portal/actions'")) {
    fail('Onboarding imports café portal actions from ./cafe-portal/actions');
  } else if (!onboarding.includes("from './cafe-portal/actions'")) {
    fail('Onboarding imports provisionCafePortalAccess');
  } else {
    pass('Onboarding imports café portal actions from ./cafe-portal/actions');
  }

  if (!onboarding.includes("corporateGroup === 'CAFE'")) {
    fail('Onboarding handles CAFE corporate group');
  } else {
    pass('Onboarding handles CAFE corporate group');
  }

  if (!onboarding.includes("redirect('/hr/cafe-portal')")) {
    fail('CAFE induction redirects to /hr/cafe-portal');
  } else {
    pass('CAFE induction redirects to /hr/cafe-portal');
  }

  if (!onboarding.includes('cafe_portal_provision_flash')) {
    fail('Onboarding sets cafe_portal_provision_flash cookie');
  } else {
    pass('Onboarding sets cafe_portal_provision_flash cookie');
  }

  if (!cafeActions.includes('provisionCafePortalOtp')) {
    fail('Desk action calls provisionCafePortalOtp');
  } else {
    pass('Desk action calls provisionCafePortalOtp');
  }

  if (!cafeActions.includes('return {') || !cafeActions.includes('success: true')) {
    fail('provisionCafePortalAccess returns success + otp');
  } else {
    pass('provisionCafePortalAccess returns success + otp');
  }

  if (!cafePage.includes('cafe_portal_provision_flash')) {
    fail('Café portal page reads provision flash cookie');
  } else {
    pass('Café portal page reads provision flash cookie');
  }

  if (!cafeAuth.includes("from('cafe_portal_auth').upsert")) {
    fail('provisionCafePortalOtp upserts cafe_portal_auth');
  } else {
    pass('provisionCafePortalOtp upserts cafe_portal_auth');
  }
}

async function remoteChecks(admin) {
  const { error: schemaProbeErr } = await admin
    .from('cafe_portal_auth')
    .select('current_otp, otp_expires_at, needs_pin_setup, is_active')
    .limit(1);

  if (schemaProbeErr?.message?.includes('current_otp')) {
    fail('cafe_portal_auth columns', schemaProbeErr.message);
  } else if (schemaProbeErr?.message?.includes('otp_expires_at')) {
    fail('cafe_portal_auth otp_expires_at column', schemaProbeErr.message);
  } else if (schemaProbeErr && schemaProbeErr.code !== 'PGRST116') {
    fail('cafe_portal_auth columns', schemaProbeErr.message);
  } else {
    pass('cafe_portal_auth has current_otp + otp_expires_at');
  }

  const testEpf = `CAFE${Date.now().toString().slice(-6)}`;
  const testOtp = '593104';
  const expiresAt = new Date(Date.now() + 60_000).toISOString();

  const { error: upsertErr } = await admin.from('cafe_portal_auth').upsert(
    {
      epf_number: testEpf,
      current_otp: testOtp,
      otp_expires_at: expiresAt,
      needs_pin_setup: true,
      is_active: true,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'epf_number' },
  );

  if (upsertErr) {
    fail('cafe_portal_auth upsert', upsertErr.message);
  } else {
    pass('cafe_portal_auth upsert');
  }

  const { data: authRow, error: readErr } = await admin
    .from('cafe_portal_auth')
    .select('epf_number, current_otp, otp_expires_at, needs_pin_setup, is_active')
    .eq('epf_number', testEpf)
    .maybeSingle();

  if (readErr || authRow?.current_otp !== testOtp) {
    fail('cafe_portal_auth read-back', readErr?.message ?? 'OTP mismatch');
  } else if (!isOtpActive(authRow)) {
    fail('OTP expiry window');
  } else {
    pass('OTP read-back + expiry window');
  }

  await admin.from('cafe_portal_auth').delete().eq('epf_number', testEpf);

  const { data: cafeEmployees, error: empErr } = await admin
    .from('employees')
    .select('id, full_name, epf_no, epf_num, group, status, created_at')
    .eq('group', 'CAFE')
    .eq('status', 'ACTIVE')
    .order('created_at', { ascending: false })
    .limit(5);

  if (empErr) {
    fail('employees CAFE query', empErr.message);
  } else {
    pass(`Active CAFE employees query (${cafeEmployees?.length ?? 0} recent)`);
    for (const emp of cafeEmployees ?? []) {
      const epf =
        (emp.epf_no && String(emp.epf_no).trim()) ||
        (emp.epf_num && String(emp.epf_num).trim()) ||
        '';
      if (!epf) {
        checks.push(`  · ${emp.full_name ?? emp.id}: no epf_no/epf_num`);
        continue;
      }
      const normalized = epf.toUpperCase();
      const { data: auth } = await admin
        .from('cafe_portal_auth')
        .select('epf_number, current_otp, otp_expires_at, needs_pin_setup, is_active')
        .eq('epf_number', normalized)
        .maybeSingle();
      if (auth?.is_active && auth.current_otp && isOtpActive(auth)) {
        checks.push(`  · ${emp.full_name ?? epf}: cafe_portal_auth OK (active OTP)`);
      } else if (auth?.is_active) {
        checks.push(`  · ${emp.full_name ?? epf}: auth row active — re-provision OTP via HR desk`);
      } else {
        checks.push(`  · ${emp.full_name ?? epf}: no cafe_portal_auth — provision via HR desk`);
      }
    }
  }

  try {
    const res = await fetch('http://127.0.0.1:3002/login/cafe-front', { redirect: 'manual' });
    if (res.status >= 200 && res.status < 400) {
      pass('Café front login page responds (:3002)');
    } else {
      fail('Café front login page', `HTTP ${res.status}`);
    }
  } catch {
    checks.push('  · Back-office :3002 not running — start npm run dev for browser login test');
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

  console.log('\nCafé portal provision smoke (Step 18)\n');
  console.log(checks.join('\n'));
  console.log(failed ? '\n❌ FAILED\n' : '\n✅ PASSED\n');
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
