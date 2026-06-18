/**
 * Enrich HR MNR desk fixtures on the live tenant (no mock UI):
 * - fill missing employment/bank fields on existing staff
 * - guard ID photos + clearance doc URLs
 * - one resigned guard with shift history for clearance / rejoin flows
 *
 * Run: npm run seed:mnr
 */

import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const CLASSIC_VENTURE_COMPANY_ID = '29fbb2ff-6aa6-46c4-8b2d-d19eebb2874e';
const SEED_SYNC = 'SEED_MNR_OPS';

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

function monthsAgo(n) {
  const d = new Date();
  d.setMonth(d.getMonth() - n);
  return d.toISOString().split('T')[0];
}

function payrollMonthFirstDay() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
}

loadEnv();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error('Missing Supabase env — run: npm run wire:backend');
  process.exit(1);
}

const companyId = process.env.SEED_COMPANY_ID ?? CLASSIC_VENTURE_COMPANY_ID;
const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const PHOTO = (seed) => `https://picsum.photos/seed/pearzen-mnr-${seed}/400/400`;
const DOC = (seed) => `https://picsum.photos/seed/pearzen-doc-${seed}/800/1100`;

async function columnExists(table, column) {
  const { error } = await admin.from(table).select(column).limit(1);
  return !error;
}

async function enrichActiveEmployees() {
  const { data: rows, error } = await admin
    .from('employees')
    .select(
      'id, full_name, emp_number, group, rank, basic_salary, date_joined, bank_name, account_number, bank_code, branch_code, id_photo_url, mod_clearance_url, police_clearance_url, mod_expiry, police_expiry, epf_yn',
    )
    .eq('company_id', companyId)
    .eq('status', 'ACTIVE');

  if (error) throw new Error(`employees: ${error.message}`);

  let updated = 0;
  for (const row of rows ?? []) {
    const patch = {};
    if (row.basic_salary == null) patch.basic_salary = row.group === 'GUARD' ? 32000 : 45000;
    if (!row.date_joined) patch.date_joined = monthsAgo(row.group === 'GUARD' ? 14 : 24);
    if (!row.bank_name) patch.bank_name = 'Commercial Bank';
    if (!row.account_number) patch.account_number = `80100${String(row.emp_number ?? '0').replace(/\D/g, '').padStart(6, '0').slice(-6)}`;
    if (!row.bank_code) patch.bank_code = '7056';
    if (!row.branch_code) patch.branch_code = '120';
    if (row.epf_yn == null) patch.epf_yn = true;

    const group = String(row.group ?? '').toUpperCase();
    if (group === 'GUARD' && !row.id_photo_url) {
      patch.id_photo_url = PHOTO(row.emp_number ?? row.id);
    }
    if (group === 'GUARD' && !row.mod_clearance_url) {
      patch.mod_clearance_url = DOC(`${row.emp_number}-mod`);
      patch.mod_expiry = monthsAgo(-6);
    }
    if (group === 'GUARD' && !row.police_clearance_url) {
      patch.police_clearance_url = DOC(`${row.emp_number}-police`);
      patch.police_expiry = monthsAgo(-4);
    }

    if (!Object.keys(patch).length) continue;

    const { error: updErr } = await admin.from('employees').update(patch).eq('id', row.id);
    if (updErr) {
      console.warn(`  ⚠ ${row.full_name}: ${updErr.message}`);
      continue;
    }
    updated += 1;
    console.log(`  ✓ ${row.full_name} (${row.emp_number ?? '—'}): ${Object.keys(patch).join(', ')}`);
  }
  return updated;
}

async function ensureResignedGuardFixture() {
  const empNumber = 'MNR-R001';
  const epf = 'MNR-R001';

  const { data: existing } = await admin
    .from('employees')
    .select('id, full_name, status')
    .eq('company_id', companyId)
    .eq('emp_number', empNumber)
    .maybeSingle();

  let employeeId = existing?.id;
  if (!employeeId) {
    const insert = {
      company_id: companyId,
      full_name: 'PERERA MNR RESIGNED',
      emp_number: empNumber,
      epf_no: epf,
      group: 'GUARD',
      rank: 'JSO',
      status: 'RESIGNED',
      site: 'Unassigned (Bench)',
      date_joined: monthsAgo(36),
      date_resigned: monthsAgo(1),
      basic_salary: 30000,
      bank_name: 'Sampath Bank',
      account_number: '1023456789',
      bank_code: '7278',
      branch_code: '045',
      epf_yn: true,
      id_photo_url: PHOTO('mnr-r001'),
      mod_clearance_url: DOC('mnr-r001-mod'),
      police_clearance_url: DOC('mnr-r001-police'),
      mod_expiry: monthsAgo(-3),
      police_expiry: monthsAgo(-2),
    };

    const { data, error } = await admin.from('employees').insert(insert).select('id').single();
    if (error) throw new Error(`resigned guard insert: ${error.message}`);
    employeeId = data.id;
    console.log(`  ✓ created resigned guard ${empNumber}`);
  } else if (String(existing.status).toUpperCase() !== 'RESIGNED') {
    await admin
      .from('employees')
      .update({ status: 'RESIGNED', date_resigned: monthsAgo(1) })
      .eq('id', employeeId);
    console.log(`  ✓ marked ${empNumber} as RESIGNED`);
  } else {
    console.log(`  · resigned guard ${empNumber} already exists`);
  }

  const { data: smRow } = await admin
    .from('employees')
    .select('emp_number, epf_no')
    .eq('company_id', companyId)
    .eq('group', 'SECTOR_MANAGER')
    .eq('status', 'ACTIVE')
    .limit(1)
    .maybeSingle();

  const smEpf = String(smRow?.emp_number ?? smRow?.epf_no ?? '144').trim();
  const { data: siteRow } = await admin
    .from('site_profiles')
    .select('site_name')
    .eq('company_id', companyId)
    .gt('required_guards', 0)
    .limit(1)
    .maybeSingle();

  const siteName = siteRow?.site_name ?? 'test site — test';
  const prevMonth = payrollMonthFirstDay();
  const prevDate = monthsAgo(1);
  const prevMonthIso = `${prevDate.slice(0, 7)}-01`;

  if (await columnExists('sm_guard_attendance', 'guard_epf')) {
    for (const [monthIso, days] of [
      [prevMonthIso, [3, 7, 11, 15, 19]],
      [prevMonth, [2, 9]],
    ]) {
      for (const day of days) {
        const shiftDate = `${monthIso.slice(0, 8)}${String(day).padStart(2, '0')}`;
        await admin.from('sm_guard_attendance').upsert(
          {
            sm_epf: smEpf,
            shift_date: shiftDate,
            shift_type: 'DAY',
            site_name: siteName,
            guard_epf: epf,
            status: 'SUBMITTED',
          },
          { onConflict: 'sm_epf,shift_date,shift_type,guard_epf' },
        );
      }
    }
    console.log(`  ✓ shift history for clearance (${epf})`);
  }

  return employeeId;
}

async function seedPayrollDeductionDraftForGuards() {
  const { data: guards } = await admin
    .from('employees')
    .select('id, emp_number')
    .eq('company_id', companyId)
    .eq('group', 'GUARD')
    .in('status', ['ACTIVE', 'RESIGNED']);

  if (!(await columnExists('payroll_monthly_deduction_entries', 'employee_id'))) {
    console.log('  · payroll_monthly_deduction_entries not available');
    return 0;
  }

  const payrollMonth = payrollMonthFirstDay();
  let count = 0;
  for (const guard of guards ?? []) {
    if (guard.emp_number === 'MNR-R001') continue;
    const { error } = await admin.from('payroll_monthly_deduction_entries').upsert(
      {
        company_id: companyId,
        employee_id: guard.id,
        payroll_month: payrollMonth,
        uniform_amount_lkr: 2000,
        meals_amount_lkr: 1200,
        status: 'DRAFT',
        notes: SEED_SYNC,
      },
      { onConflict: 'employee_id,payroll_month' },
    );
    if (!error) count += 1;
  }
  console.log(`  ✓ MNR-linked deduction drafts: ${count}`);
  return count;
}

console.log('\nHR MNR operational seed');
console.log(`  Company: ${companyId}`);
console.log(`  Supabase: ${url}\n`);

console.log('1/3 Enrich active employee HR fields…');
const enriched = await enrichActiveEmployees();
console.log(`   → ${enriched} updated\n`);

console.log('2/3 Resigned guard + shift history (clearance / rejoin)…');
await ensureResignedGuardFixture();
console.log('');

console.log('3/3 Guard deduction drafts (FM cross-link)…');
await seedPayrollDeductionDraftForGuards();
console.log('');

console.log('✓ HR MNR operational seed complete.');
console.log('  Open /hr/mnr — active roster + resigned MNR-R001 for clearance/rejoin\n');
