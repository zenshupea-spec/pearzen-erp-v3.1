/**
 * Step 02 smoke: SM portal auth schema + OTP hash round-trip + recent SM rows.
 * Run: node scripts/verify-sm-induction-smoke.mjs
 */

import { createHash, timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
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
const SM_OR_FILTER = 'group.eq.SECTOR_MANAGER,and(group.eq.HEAD_OFFICE,rank.eq.SM)';

function isSectorManagerEmployee(row) {
  const group = String(row.group ?? '').trim().toUpperCase();
  if (group === 'SECTOR_MANAGER' || group === 'SM') return true;
  return String(row.rank ?? '').trim().toUpperCase() === 'SM';
}

function sectorManagerEpfKey(row) {
  const emp = row.emp_number != null ? String(row.emp_number).trim() : '';
  if (emp) return emp.toUpperCase();
  const epf =
    (row.epf_no != null ? String(row.epf_no).trim() : '') ||
    (row.epf_num != null ? String(row.epf_num).trim() : '');
  return epf ? epf.toUpperCase() : '';
}

function hashSmPortalOtp(otp, epfNumber) {
  const pepper =
    process.env.SM_PORTAL_OTP_PEPPER?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    'dev-sm-otp-pepper';
  const epf = epfNumber.trim().toUpperCase();
  const payload = `${epf}:${otp.trim()}:${pepper}`;
  return createHash('sha256').update(payload).digest('hex');
}

function verifySmPortalOtp(otp, epfNumber, storedHash) {
  if (!storedHash?.trim()) return false;
  const computed = hashSmPortalOtp(otp, epfNumber);
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

async function main() {
  if (!supabaseUrl || !serviceKey) {
    fail('Env', 'NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required');
    console.log(checks.join('\n'));
    process.exit(1);
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // 1. Schema columns — verify via select (works without Management API JWT)
  const { error: schemaProbeErr } = await admin
    .from('sm_portal_auth')
    .select('current_otp_hash, otp_expires_at')
    .limit(1);

  if (schemaProbeErr?.message?.includes('current_otp_hash')) {
    fail('sm_portal_auth columns', schemaProbeErr.message);
  } else if (schemaProbeErr && !schemaProbeErr.message?.includes('0 rows')) {
    // PGRST116 or empty table is fine
    if (schemaProbeErr.code !== 'PGRST116') {
      fail('sm_portal_auth columns', schemaProbeErr.message);
    } else {
      pass('sm_portal_auth has current_otp_hash + otp_expires_at');
    }
  } else {
    pass('sm_portal_auth has current_otp_hash + otp_expires_at');
  }

  // 2. Upsert + read round-trip (test EPF, then delete)
  const testEpf = `SMOKE${Date.now().toString().slice(-6)}`;
  const testOtp = '482910';
  const testHash = hashSmPortalOtp(testOtp, testEpf);
  const expiresAt = new Date(Date.now() + 60_000).toISOString();

  const { error: upsertErr } = await admin.from('sm_portal_auth').upsert(
    {
      epf_number: testEpf,
      current_otp: null,
      current_otp_hash: testHash,
      otp_expires_at: expiresAt,
      needs_pin_setup: true,
      is_active: true,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'epf_number' },
  );

  if (upsertErr) {
    fail('sm_portal_auth upsert with current_otp_hash', upsertErr.message);
  } else {
    pass('sm_portal_auth upsert with current_otp_hash');
  }

  const { data: authRow, error: readErr } = await admin
    .from('sm_portal_auth')
    .select('epf_number, current_otp_hash, otp_expires_at, needs_pin_setup, is_active')
    .eq('epf_number', testEpf)
    .maybeSingle();

  if (readErr || !authRow?.current_otp_hash) {
    fail('sm_portal_auth read-back', readErr?.message ?? 'no hash stored');
  } else if (!verifySmPortalOtp(testOtp, testEpf, authRow.current_otp_hash)) {
    fail('OTP hash verify round-trip');
  } else {
    pass('OTP hash verify round-trip');
  }

  await admin.from('sm_portal_auth').delete().eq('epf_number', testEpf);

  // 3. Active sector managers (HEAD_OFFICE+SM or legacy) with auth rows
  const { data: smEmployees, error: empErr } = await admin
    .from('employees')
    .select('id, full_name, emp_number, epf_no, epf_num, group, rank, status, created_at')
    .eq('status', 'ACTIVE')
    .or(SM_OR_FILTER)
    .order('created_at', { ascending: false })
    .limit(10);

  if (empErr) {
    fail('active sector manager employees query', empErr.message);
  } else {
    const managers = (smEmployees ?? []).filter((row) => isSectorManagerEmployee(row));
    pass(`Active sector manager employees query (${managers.length} recent)`);
    for (const emp of managers) {
      const epf = sectorManagerEpfKey(emp);
      if (!epf) {
        checks.push(`  · ${emp.full_name ?? emp.id}: no emp_number/epf_no`);
        continue;
      }
      const shape =
        String(emp.group ?? '').toUpperCase() === 'HEAD_OFFICE' ? 'HEAD_OFFICE+SM' : emp.group;
      const { data: auth } = await admin
        .from('sm_portal_auth')
        .select('epf_number, current_otp_hash, needs_pin_setup, is_active')
        .eq('epf_number', epf)
        .maybeSingle();
      if (auth?.is_active && auth.current_otp_hash) {
        checks.push(`  · ${emp.full_name ?? epf} (${shape}): sm_portal_auth OK (hash on file)`);
      } else if (auth?.is_active) {
        checks.push(`  · ${emp.full_name ?? epf} (${shape}): auth row but no hash — re-provision via HR`);
      } else {
        checks.push(`  · ${emp.full_name ?? epf} (${shape}): no sm_portal_auth — provision via HR`);
      }
    }
  }

  // 4. SM PWA health
  try {
    const res = await fetch('http://127.0.0.1:3003/login', { redirect: 'manual' });
    if (res.status >= 200 && res.status < 400) {
      pass('SM PWA login page responds (:3003)');
    } else {
      fail('SM PWA login page', `HTTP ${res.status}`);
    }
  } catch {
    checks.push('  · SM PWA :3003 not running — start npm run dev for browser login test');
  }

  console.log('\nSM induction smoke\n');
  console.log(checks.join('\n'));
  console.log(failed ? '\n❌ FAILED\n' : '\n✅ PASSED\n');
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
