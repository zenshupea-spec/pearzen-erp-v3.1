/**
 * Smoke-verify Master Hub modules have live Supabase data (no mock fallbacks needed).
 * Run: npm run verify:master-hub
 */

import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const CLASSIC_VENTURE_COMPANY_ID = '29fbb2ff-6aa6-46c4-8b2d-d19eebb2874e';

function loadEnv() {
  for (const file of ['.env.seed.tmp', 'apps/back-office/.env.local', '.env']) {
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

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

loadEnv();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Missing Supabase env');
  process.exit(1);
}

const companyId = process.env.SEED_COMPANY_ID ?? CLASSIC_VENTURE_COMPANY_ID;
const db = createClient(url, key);
const today = todayIso();
const monthStart = `${today.slice(0, 7)}-01`;

const checks = [];

async function count(table, filter) {
  let q = db.from(table).select('*', { count: 'exact', head: true });
  if (filter) q = filter(q);
  const { count: n, error } = await q;
  if (error) return { ok: false, detail: error.message, n: 0 };
  return { ok: true, n: n ?? 0 };
}

async function run() {
  console.log('\nMaster Hub verification');
  console.log(`  Company: ${companyId}`);
  console.log(`  Date: ${today}\n`);

  const guardPortfolio = await count('employees', (q) =>
    q.eq('company_id', companyId).eq('group', 'GUARD').eq('status', 'ACTIVE'),
  );
  checks.push({
    module: 'FM / Portfolio',
    path: '/fm',
    ...guardPortfolio,
    expect: (n) => n >= 2,
  });

  const mealSuppliers = await count('meal_suppliers', (q) => q.eq('company_id', companyId));
  const deductions = await count('payroll_monthly_deduction_entries', (q) =>
    q.eq('company_id', companyId).eq('payroll_month', monthStart),
  );
  checks.push({
    module: 'HQ Deductions',
    path: '/hq/deductions',
    ok: mealSuppliers.ok && deductions.ok && mealSuppliers.n >= 1 && deductions.n >= 1,
    n: `${mealSuppliers.n} suppliers, ${deductions.n} draft entries`,
    detail: !mealSuppliers.ok ? mealSuppliers.detail : deductions.detail,
    expect: () => true,
  });

  const billing = await count('billing_clients', (q) =>
    q.eq('company_id', companyId).not('client_code', 'in', '(C001,C002,C003,C004)'),
  );
  const smShifts = await count('sm_guard_attendance', (q) =>
    q.gte('shift_date', monthStart).eq('status', 'SUBMITTED'),
  );
  checks.push({
    module: 'Invoice Desk',
    path: '/invoice-desk',
    ok: billing.ok && smShifts.ok && billing.n >= 1 && smShifts.n >= 1,
    n: `${billing.n} clients, ${smShifts.n} SM shifts (${monthStart.slice(0, 7)})`,
    detail: billing.detail ?? smShifts.detail,
    expect: () => true,
  });

  const vacancies = await count('site_profiles', (q) =>
    q.eq('company_id', companyId).gt('required_guards', 0),
  );
  checks.push({
    module: 'HR Vacancies',
    path: '/hr/vacancies',
    ...vacancies,
    expect: (n) => n >= 2,
  });

  const verifyLogs = await count('attendance_logs', (q) =>
    q.eq('company_id', companyId).gte('device_time', `${today}T00:00:00`).like('sync_type', 'SEED_MASTER_HUB%'),
  );
  const smVisits = await count('sm_visit_logs', (q) =>
    q.gte('visit_date', today).like('notes', 'SEED_MASTER_HUB%'),
  );
  checks.push({
    module: 'OM / TM Shift Verification',
    path: '/om',
    ok: verifyLogs.ok && smVisits.ok && verifyLogs.n >= 2 && smVisits.n >= 1,
    n: `${verifyLogs.n} guard logs, ${smVisits.n} SM visits today`,
    detail: verifyLogs.detail ?? smVisits.detail,
    expect: () => true,
  });

  const discrepancies = await count('attendance_logs', (q) =>
    q.eq('company_id', companyId).eq('status', 'PENDING_RESOLUTION'),
  );
  checks.push({
    module: 'OM Integrity',
    path: '/om/discrepancies',
    ...discrepancies,
    expect: (n) => n >= 1,
  });

  const smAuth = await count('sm_portal_auth', (q) => q.eq('is_active', true));
  checks.push({
    module: 'SM PWA auth',
    path: ':3003',
    ...smAuth,
    expect: (n) => n >= 1,
  });

  const cafeStaff = await count('employees', (q) =>
    q.eq('company_id', companyId).eq('group', 'CAFE').eq('status', 'ACTIVE'),
  );
  const cafeCheckins = await count('cafe_staff_checkins', (q) =>
    q.eq('company_id', companyId).eq('checkin_date', today),
  );
  const cafeOrders = await count('cafe_customer_orders', (q) =>
    q.eq('company_id', companyId).in('status', ['PLACED', 'PAYMENT_RECEIVED', 'PREPARING']),
  );
  checks.push({
    module: 'Café Front + Executive Café',
    path: '/executive/cafe, /login/cafe-front',
    ok: cafeStaff.ok && cafeCheckins.ok && cafeOrders.ok && cafeStaff.n >= 1 && cafeOrders.n >= 1,
    n: `${cafeStaff.n} staff, ${cafeCheckins.n} check-ins today, ${cafeOrders.n} open orders`,
    detail: cafeStaff.detail ?? cafeCheckins.detail ?? cafeOrders.detail,
    expect: () => true,
  });

  const mnrActive = await count('employees', (q) =>
    q.eq('company_id', companyId).eq('status', 'ACTIVE'),
  );
  const mnrResigned = await count('employees', (q) =>
    q.eq('company_id', companyId).eq('status', 'RESIGNED'),
  );
  checks.push({
    module: 'HR MNR',
    path: '/hr/mnr',
    ok: mnrActive.ok && mnrResigned.ok && mnrActive.n >= 5 && mnrResigned.n >= 1,
    n: `${mnrActive.n} active, ${mnrResigned.n} resigned`,
    detail: mnrActive.detail ?? mnrResigned.detail,
    expect: () => true,
  });

  let failed = 0;
  for (const row of checks) {
    const pass =
      row.ok !== false &&
      (typeof row.expect === 'function'
        ? row.expect(typeof row.n === 'number' ? row.n : 0)
        : row.expect(row.n));
    if (!pass) failed += 1;
    const icon = pass ? '✓' : '✗';
    console.log(`${icon} ${row.module.padEnd(28)} ${row.path}`);
    console.log(`    ${typeof row.n === 'number' ? `${row.n} record(s)` : row.n}`);
    if (!pass && row.detail) console.log(`    ${row.detail}`);
  }

  console.log('');
  if (failed) {
    console.log(`❌ ${failed} check(s) failed — run npm run seed:master-hub (and seed:cafe / seed:mnr)`);
    process.exit(1);
  }
  console.log('✓ All Master Hub module checks passed.\n');
}

await run();
