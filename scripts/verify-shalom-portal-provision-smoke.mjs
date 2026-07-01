/**
 * Step 19 smoke: Shalom portal provision desk + shalom_portal_auth OTP hash flow.
 * Run: node scripts/verify-shalom-portal-provision-smoke.mjs
 */

import { createHash, timingSafeEqual } from 'node:crypto';
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

function hashShalomPortalOtp(otp, epfNumber) {
  const pepper =
    process.env.SHALOM_PORTAL_OTP_PEPPER?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    'dev-shalom-otp-pepper';
  const epf = epfNumber.trim().toUpperCase();
  const payload = `${epf}:${otp.trim()}:${pepper}`;
  return createHash('sha256').update(payload).digest('hex');
}

function verifyShalomPortalOtp(otp, epfNumber, storedHash) {
  if (!storedHash?.trim()) return false;
  const computed = hashShalomPortalOtp(otp, epfNumber);
  try {
    return timingSafeEqual(Buffer.from(computed, 'hex'), Buffer.from(storedHash.trim(), 'hex'));
  } catch {
    return false;
  }
}

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
  if (!authRecord?.current_otp_hash || !authRecord?.otp_expires_at) return false;
  return Date.now() < new Date(authRecord.otp_expires_at).getTime();
}

function isShalomStaffRow(row) {
  const group = String(row.group ?? '').trim().toUpperCase();
  if (group === 'SHALOM') return true;
  const rank = String(row.rank ?? '').trim().toUpperCase();
  return rank === 'CARETAKER' || rank === 'SHALOM_CARETAKER';
}

function staticChecks() {
  const shalomActions = readFileSync(
    join(root, 'apps/back-office/app/hr/shalom-portal/actions.ts'),
    'utf8',
  );
  const shalomPage = readFileSync(
    join(root, 'apps/back-office/app/hr/shalom-portal/page.tsx'),
    'utf8',
  );
  const shalomClient = readFileSync(
    join(root, 'apps/back-office/app/hr/shalom-portal/ShalomPortalClient.tsx'),
    'utf8',
  );
  const shalomAuthServer = readFileSync(
    join(root, 'apps/back-office/lib/shalom-front-auth-server.ts'),
    'utf8',
  );
  const hrPills = readFileSync(join(root, 'apps/back-office/app/hr/HrHubPills.tsx'), 'utf8');

  if (!shalomActions.includes('export async function provisionShalomPortalAccess')) {
    fail('provisionShalomPortalAccess server action exists');
  } else {
    pass('provisionShalomPortalAccess server action exists');
  }

  if (!shalomActions.includes('provisionShalomPortalOtp')) {
    fail('Desk action calls provisionShalomPortalOtp');
  } else {
    pass('Desk action calls provisionShalomPortalOtp');
  }

  if (!shalomActions.includes('success: true') || !shalomActions.includes('otp,')) {
    fail('provisionShalomPortalAccess returns success + otp');
  } else {
    pass('provisionShalomPortalAccess returns success + otp');
  }

  if (!shalomAuthServer.includes("from('shalom_portal_auth').upsert")) {
    fail('provisionShalomPortalOtp upserts shalom_portal_auth');
  } else {
    pass('provisionShalomPortalOtp upserts shalom_portal_auth');
  }

  if (shalomAuthServer.includes('current_otp:')) {
    fail('Shalom OTP stored as hash only (no plaintext current_otp)');
  } else if (!shalomAuthServer.includes('current_otp_hash')) {
    fail('Shalom OTP hash column used');
  } else {
    pass('Shalom OTP stored as hash only (no plaintext current_otp)');
  }

  if (!shalomPage.includes('shalom_portal_provision_flash')) {
    fail('Shalom portal page reads provision flash cookie');
  } else {
    pass('Shalom portal page reads provision flash cookie');
  }

  if (!shalomClient.includes('provisionShalomPortalAccess')) {
    fail('ShalomPortalClient provisions via server action');
  } else {
    pass('ShalomPortalClient provisions via server action');
  }

  if (!shalomClient.includes('/login/shalom-front')) {
    fail('Desk UI references /login/shalom-front');
  } else {
    pass('Desk UI references /login/shalom-front');
  }

  if (!hrPills.includes("'shalom-portal'")) {
    fail('HR hub pill links to /hr/shalom-portal');
  } else {
    pass('HR hub pill links to /hr/shalom-portal');
  }
}

async function remoteChecks(admin) {
  const { error: schemaProbeErr } = await admin
    .from('shalom_portal_auth')
    .select('current_otp_hash, otp_expires_at, needs_pin_setup, is_active')
    .limit(1);

  if (schemaProbeErr?.message?.includes('current_otp_hash')) {
    fail('shalom_portal_auth columns', schemaProbeErr.message);
  } else if (schemaProbeErr?.message?.includes('does not exist')) {
    fail('shalom_portal_auth table', schemaProbeErr.message);
  } else if (schemaProbeErr && schemaProbeErr.code !== 'PGRST116') {
    fail('shalom_portal_auth columns', schemaProbeErr.message);
  } else {
    pass('shalom_portal_auth has current_otp_hash + otp_expires_at');
  }

  const testEpf = `SHLM${Date.now().toString().slice(-6)}`;
  const testOtp = '718204';
  const testHash = hashShalomPortalOtp(testOtp, testEpf);
  const expiresAt = new Date(Date.now() + 60_000).toISOString();

  const { error: upsertErr } = await admin.from('shalom_portal_auth').upsert(
    {
      epf_number: testEpf,
      current_otp_hash: testHash,
      otp_expires_at: expiresAt,
      needs_pin_setup: true,
      is_active: true,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'epf_number' },
  );

  if (upsertErr) {
    fail('shalom_portal_auth upsert', upsertErr.message);
  } else {
    pass('shalom_portal_auth upsert');
  }

  const { data: authRow, error: readErr } = await admin
    .from('shalom_portal_auth')
    .select('epf_number, current_otp_hash, otp_expires_at, needs_pin_setup, is_active')
    .eq('epf_number', testEpf)
    .maybeSingle();

  if (readErr || !authRow?.current_otp_hash) {
    fail('shalom_portal_auth read-back', readErr?.message ?? 'no hash stored');
  } else if (!verifyShalomPortalOtp(testOtp, testEpf, authRow.current_otp_hash)) {
    fail('OTP hash verify round-trip');
  } else if (!isOtpActive(authRow)) {
    fail('OTP expiry window');
  } else {
    pass('OTP hash verify round-trip + expiry window');
  }

  await admin.from('shalom_portal_auth').delete().eq('epf_number', testEpf);

  const { data: employees, error: empErr } = await admin
    .from('employees')
    .select('id, full_name, epf_no, epf_num, emp_number, group, rank, status, created_at')
    .eq('status', 'ACTIVE')
    .order('created_at', { ascending: false })
    .limit(25);

  if (empErr) {
    fail('employees query for Shalom staff', empErr.message);
  } else {
    const shalomStaff = (employees ?? []).filter(isShalomStaffRow).slice(0, 5);
    pass(`Active Shalom caretaker staff query (${shalomStaff.length} recent)`);
    for (const emp of shalomStaff) {
      const epf =
        (emp.epf_no && String(emp.epf_no).trim()) ||
        (emp.epf_num && String(emp.epf_num).trim()) ||
        (emp.emp_number && String(emp.emp_number).trim()) ||
        '';
      if (!epf) {
        checks.push(`  · ${emp.full_name ?? emp.id}: no EPF`);
        continue;
      }
      const normalized = epf.toUpperCase();
      const { data: auth } = await admin
        .from('shalom_portal_auth')
        .select('epf_number, current_otp_hash, otp_expires_at, needs_pin_setup, is_active')
        .eq('epf_number', normalized)
        .maybeSingle();
      if (auth?.is_active && auth.current_otp_hash && isOtpActive(auth)) {
        checks.push(`  · ${emp.full_name ?? epf}: shalom_portal_auth OK (active OTP hash)`);
      } else if (auth?.is_active) {
        checks.push(`  · ${emp.full_name ?? epf}: auth row active — re-provision OTP via HR desk`);
      } else {
        checks.push(`  · ${emp.full_name ?? epf}: no shalom_portal_auth — provision via HR desk`);
      }
    }
  }

  try {
    const res = await fetch('http://127.0.0.1:3002/login/shalom-front', { redirect: 'manual' });
    if (res.status >= 200 && res.status < 400) {
      pass('Shalom front login page responds (:3002)');
    } else {
      fail('Shalom front login page', `HTTP ${res.status}`);
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

  console.log('\nShalom portal provision smoke (Step 19)\n');
  console.log(checks.join('\n'));
  console.log(failed ? '\n❌ FAILED\n' : '\n✅ PASSED\n');
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
