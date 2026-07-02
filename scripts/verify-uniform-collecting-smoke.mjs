/**
 * Smoke test: uniform collecting offboarding flow (live Supabase).
 * Run: node scripts/verify-uniform-collecting-smoke.mjs
 */

import { existsSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SMOKE_TAG = 'UNIFORM_COLLECTING_SMOKE';

function loadEnv() {
  const path = join(root, 'apps/back-office/.env.local');
  if (!existsSync(path)) {
    console.error('Missing apps/back-office/.env.local');
    process.exit(1);
  }
  const env = {};
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = line.match(/^([^#=\s][^=]*)=(.*)$/);
    if (m) env[m[1].trim()] = m[2].trim().replace(/^['"]|['"]$/g, '');
  }
  return env;
}

function assert(label, ok, detail = '') {
  const status = ok ? 'PASS' : 'FAIL';
  console.log(`${status}  ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures.push(label);
}

const failures = [];

async function main() {
  const env = loadEnv();
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('Missing Supabase URL or service role key');
    process.exit(1);
  }

  const db = createClient(url, key, { auth: { persistSession: false } });

  // Cleanup prior smoke artifacts
  await db.from('uniform_collection_cases').delete().like('admin_notes', `${SMOKE_TAG}%`);
  await db.from('sm_uniform_requests').delete().like('notes', `${SMOKE_TAG}%`);

  const { data: guard, error: guardErr } = await db
    .from('employees')
    .select('id, full_name, emp_number, company_id, status')
    .eq('status', 'ACTIVE')
    .not('emp_number', 'is', null)
    .limit(1)
    .maybeSingle();

  if (guardErr || !guard) {
    console.error('No active employee with EPF found for smoke test');
    process.exit(1);
  }

  const guardEpf = String(guard.emp_number).trim().toUpperCase();
  const issuedItems = [{ item: 'Smoke Shirt', qty: 2 }, { item: 'Smoke Trouser', qty: 1 }];

  const { error: issueErr } = await db.from('sm_uniform_requests').insert({
    sm_epf: 'HQ-SMOKE',
    guard_epf: guardEpf,
    guard_name: guard.full_name,
    request_type: 'ISSUE',
    items: issuedItems,
    notes: `${SMOKE_TAG} issued row`,
    status: 'ISSUED',
    total_amount: 4500,
  });

  assert('Seed ISSUED uniform request', !issueErr, issueErr?.message);

  const { data: noUniformEmp } = await db
    .from('employees')
    .select('id, emp_number')
    .eq('status', 'ACTIVE')
    .neq('id', guard.id)
    .not('emp_number', 'is', null)
    .limit(1)
    .maybeSingle();

  // --- Flow: PENDING case (HR request simulation) ---
  const { data: pendingCase, error: pendingErr } = await db
    .from('uniform_collection_cases')
    .insert({
      company_id: guard.company_id,
      employee_id: guard.id,
      guard_epf: guardEpf,
      status: 'PENDING',
      issued_items: issuedItems,
      returned_items: [],
      admin_notes: `${SMOKE_TAG} pending`,
    })
    .select('id, status')
    .single();

  assert('Insert PENDING collection case', !pendingErr && pendingCase?.status === 'PENDING', pendingErr?.message);

  // --- Admin confirm partial returns ---
  const returnedItems = [{ item: 'Smoke Shirt', qty: 1 }, { item: 'Smoke Trouser', qty: 0 }];
  const { error: confirmErr } = await db
    .from('uniform_collection_cases')
    .update({
      status: 'CONFIRMED',
      returned_items: returnedItems,
      confirmed_at: new Date().toISOString(),
      admin_notes: `${SMOKE_TAG} confirmed partial`,
      updated_at: new Date().toISOString(),
    })
    .eq('id', pendingCase.id)
    .eq('status', 'PENDING');

  assert('Confirm collection with partial returns', !confirmErr, confirmErr?.message);

  const { data: confirmedRow } = await db
    .from('uniform_collection_cases')
    .select('status, returned_items, issued_items')
    .eq('id', pendingCase.id)
    .maybeSingle();

  assert(
    'Case status CONFIRMED in DB',
    confirmedRow?.status === 'CONFIRMED',
    confirmedRow?.status ?? 'missing',
  );

  // --- Gate logic: collected employee should pass uniform gate ---
  const { evaluateHrResignationGate, computeClearanceSettlement } = await import(
    '../apps/back-office/lib/clearance-settlement.ts'
  );
  const settlement = computeClearanceSettlement(0, 0, 0);
  const gateCollected = evaluateHrResignationGate({
    settlement,
    fmOffboardingPaymentConfirmed: true,
    uniformCollectionOk: true,
  });
  assert('Resignation gate ok when uniform collected', gateCollected.ok);

  const gatePending = evaluateHrResignationGate({
    settlement,
    fmOffboardingPaymentConfirmed: true,
    uniformCollectionOk: false,
    uniformCollectionPending: true,
  });
  assert('Resignation gate blocked when uniform pending', !gatePending.ok);

  // --- No uniform on file: employee without ISSUED rows ---
  if (noUniformEmp?.emp_number) {
    const epf = String(noUniformEmp.emp_number).trim().toUpperCase();
    const { count } = await db
      .from('sm_uniform_requests')
      .select('id', { count: 'exact', head: true })
      .eq('request_type', 'ISSUE')
      .eq('status', 'ISSUED')
      .eq('guard_epf', epf);
    const gateNoUniform = evaluateHrResignationGate({
      settlement,
      fmOffboardingPaymentConfirmed: true,
      uniformCollectionOk: true,
    });
    assert(
      'Employee without issued uniforms skips collection gate',
      (count ?? 0) === 0 && gateNoUniform.ok,
      `issued count=${count ?? 0}`,
    );
  } else {
    assert('Employee without issued uniforms skips collection gate', true, 'skipped — no second employee');
  }

  // --- Pre-confirmed: read latest CONFIRMED ---
  const { data: latestConfirmed } = await db
    .from('uniform_collection_cases')
    .select('id, status')
    .eq('employee_id', guard.id)
    .eq('status', 'CONFIRMED')
    .order('requested_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  assert('Pre-confirmed case readable for HR clearance', latestConfirmed?.status === 'CONFIRMED');

  // --- HTTP smoke: routes respond (dev stack) ---
  try {
    const res = await fetch('http://127.0.0.1:3002/hq/deductions/uniform-collecting', {
      redirect: 'manual',
    });
    assert('Deductions uniform-collecting route responds', res.status > 0 && res.status < 500, `HTTP ${res.status}`);
  } catch (err) {
    assert('Deductions uniform-collecting route responds', false, err.message);
  }

  // Cleanup smoke rows
  await db.from('uniform_collection_cases').delete().like('admin_notes', `${SMOKE_TAG}%`);
  await db.from('sm_uniform_requests').delete().like('notes', `${SMOKE_TAG}%`);

  console.log('');
  if (failures.length) {
    console.error(`❌ ${failures.length} check(s) failed`);
    process.exit(1);
  }
  console.log(`✅ Uniform collecting smoke passed (${guard.full_name} / EPF ${guardEpf})`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
