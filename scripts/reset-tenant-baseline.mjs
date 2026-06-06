/**
 * Reset a tenant to a clean baseline: only MD + OD employees, no sites or guards.
 *
 * Run:
 *   MD_EMAIL=md@client.com OD_EMAIL=owner@pearzen.com npm run db:reset-baseline
 *
 * Optional:
 *   SEED_COMPANY_ID=<uuid>  (defaults to Classic Venture)
 */

import { readFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';

const CLASSIC_VENTURE_COMPANY_ID = '9111dd55-9935-4e26-a630-60e36dcb57b5';

function loadEnv() {
  for (const file of ['.env.seed.tmp', 'apps/back-office/.env.local', '.env']) {
    try {
      const env = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
      for (const line of env.split('\n')) {
        const m = line.match(/^([^#=\s][^=]*)=(.*)$/);
        if (m) process.env[m[1].trim()] = m[2].trim().replace(/^['"]|['"]$/g, '');
      }
      return;
    } catch {
      /* try next */
    }
  }
}

loadEnv();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const companyId = process.env.SEED_COMPANY_ID ?? CLASSIC_VENTURE_COMPANY_ID;
const mdEmail = (process.env.MD_EMAIL ?? '').trim().toLowerCase();
const odEmail = (process.env.OD_EMAIL ?? '').trim().toLowerCase();

if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

if (!mdEmail || !odEmail) {
  console.error('Set MD_EMAIL and OD_EMAIL before running the baseline reset.');
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });
const today = new Date().toISOString().split('T')[0];

async function probeColumn(table, col) {
  const { error } = await supabase.from(table).select(col).limit(1);
  return !error;
}

async function deleteWhere(table, column, value) {
  const { error } = await supabase.from(table).delete().eq(column, value);
  if (error && !error.message.includes('schema cache') && error.code !== '42P01') {
    throw new Error(`${table}: ${error.message}`);
  }
}

async function clearOperationalData(employeeIds, empNumbers) {
  await deleteWhere('time_shifts', 'company_id', companyId);
  await deleteWhere('time_rosters', 'company_id', companyId);
  await deleteWhere('guard_blacklist_vault', 'company_id', companyId);

  if (empNumbers.length) {
    for (let i = 0; i < empNumbers.length; i += 100) {
      const chunk = empNumbers.slice(i, i + 100);
      await supabase.from('sm_guard_assignments').delete().in('guard_epf', chunk);
      await supabase.from('sm_guard_assignments').delete().in('sm_epf', chunk);
      await supabase.from('sm_guard_attendance').delete().in('guard_epf', chunk);
      await supabase.from('sm_guard_attendance').delete().in('sm_epf', chunk);
    }
  }

  if (employeeIds.length) {
    for (let i = 0; i < employeeIds.length; i += 100) {
      const chunk = employeeIds.slice(i, i + 100);
      await supabase.from('employee_monthly_deductions').delete().in('employee_id', chunk);
    }
  }

  console.log('  ✓ cleared operational shift / assignment data');
}

async function deleteAllEmployees() {
  const { data: employees, error } = await supabase
    .from('employees')
    .select('id, emp_number')
    .eq('company_id', companyId);

  if (error) throw new Error(error.message);
  if (!employees?.length) {
    console.log('  ✓ no employees to delete');
    return;
  }

  const ids = employees.map((row) => row.id);
  const empNumbers = employees.map((row) => row.emp_number);
  await clearOperationalData(ids, empNumbers);

  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    const { error: delError } = await supabase.from('employees').delete().in('id', chunk);
    if (delError) throw new Error(delError.message);
  }

  console.log(`  ✓ deleted ${employees.length} employees`);
}

async function clearSites() {
  const { error } = await supabase.from('site_profiles').delete().eq('company_id', companyId);
  if (error) throw new Error(error.message);
  console.log('  ✓ cleared site_profiles');
}

async function upsertExecutive(empNumber, rank, fullName, email) {
  const hasGroup = await probeColumn('employees', 'group');
  const hasEmail = await probeColumn('employees', 'email');

  const row = {
    company_id: companyId,
    emp_number: empNumber,
    full_name: fullName,
    rank,
    status: 'ACTIVE',
    date_joined: today,
    salary_type: 'BANK',
  };
  if (hasGroup) row.group = 'HEAD_OFFICE';
  if (hasEmail) row.email = email;

  const { error } = await supabase.from('employees').insert([row]);
  if (error) throw new Error(error.message);
  console.log(`  ✓ inserted ${empNumber} (${email})`);
}

console.log(`\nResetting tenant ${companyId} to MD + OD baseline…`);

await clearSites();
await deleteAllEmployees();

const { data: company } = await supabase
  .from('companies')
  .select('name')
  .eq('id', companyId)
  .maybeSingle();

const companyName = String(company?.name ?? 'CLASSIC VENTURE').toUpperCase();

await upsertExecutive('MD-001', 'MD', `${companyName} — MANAGING DIRECTOR`, mdEmail);
await upsertExecutive('OD-001', 'OD', `${companyName} — OPERATIONS DIRECTOR`, odEmail);

const rankMatrix = [
  { id: 'rp-1', rankCode: 'CSO', fullTitle: 'Chief Security Officer', basicPay: 35000, annualIncrement: 2000, salaryType: 'BANK', operationalGroup: 'GUARD_FIELD' },
  { id: 'rp-2', rankCode: 'OIC', fullTitle: 'Officer In Charge', basicPay: 33000, annualIncrement: 1800, salaryType: 'BANK', operationalGroup: 'GUARD_FIELD' },
  { id: 'rp-3', rankCode: 'SSO', fullTitle: 'Senior Security Officer', basicPay: 32000, annualIncrement: 1500, salaryType: 'BANK', operationalGroup: 'GUARD_FIELD' },
  { id: 'rp-4', rankCode: 'JSO', fullTitle: 'Junior Security Officer', basicPay: 30000, annualIncrement: 1200, salaryType: 'BANK', operationalGroup: 'GUARD_FIELD' },
  { id: 'rp-5', rankCode: 'LSO', fullTitle: 'Lady Security Officer', basicPay: 30000, annualIncrement: 1200, salaryType: 'BANK', operationalGroup: 'GUARD_FIELD' },
];

let { error: mdErr } = await supabase.from('md_settings').upsert(
  {
    company_id: companyId,
    vat_rate: 18,
    sscl_rate: 2.5641,
    default_geofence_radius_m: 150,
    rank_pay_matrix: rankMatrix,
    penalty_catalog: [],
    replacement_catalog: [],
  },
  { onConflict: 'company_id' },
);
if (mdErr) {
  ({ error: mdErr } = await supabase.from('md_settings').upsert(
    {
      company_id: companyId,
      vat_rate: 18,
      sscl_rate: 2.5641,
      setting_value: JSON.stringify({ rankPayMatrix: rankMatrix }),
    },
    { onConflict: 'company_id' },
  ));
}
if (mdErr) console.warn('  ⚠ md_settings:', mdErr.message);
else console.log('  ✓ md_settings defaults');

console.log('\nDone. OM / Uniform Issue will show empty until HR onboards guards and sites.\n');
