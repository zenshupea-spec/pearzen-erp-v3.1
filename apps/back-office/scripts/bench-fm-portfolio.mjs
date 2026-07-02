/**
 * Benchmark FM portfolio hot-path DB phases (dev Supabase, CVS tenant).
 * Run: node apps/back-office/scripts/bench-fm-portfolio.mjs
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '../../..');

function loadEnvFile(path) {
  try {
    const raw = readFileSync(path, 'utf8');
    for (const line of raw.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = value;
    }
  } catch {
    // optional
  }
}

loadEnvFile(resolve(root, '.env'));
loadEnvFile(resolve(root, '.env.local'));
loadEnvFile(resolve(root, 'apps/back-office/.env.local'));

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const companyId = '29fbb2ff-6aa6-46c4-8b2d-d19eebb2874e';
const payrollMonth = '2026-07';

if (!url || !key) {
  console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });

async function time(label, fn) {
  const start = performance.now();
  const result = await fn();
  const ms = Math.round(performance.now() - start);
  console.log(`${label}: ${ms}ms`);
  return { ms, result };
}

async function fetchEmployees() {
  const { data } = await supabase
    .from('employees')
    .select(
      'id, emp_number, epf_no, epf_num, full_name, rank, site, group, status, base_salary, date_joined, bank_name, site_allowance_lkr, meal_allowance_lkr, transport_allowance_lkr',
    )
    .eq('company_id', companyId)
    .ilike('status', 'active');
  return data ?? [];
}

async function fetchSites() {
  const { data } = await supabase
    .from('site_profiles')
    .select('id, site_name, client_name, address, rate_matrix, site_type, site_status, verification_mode')
    .eq('company_id', companyId);
  return data ?? [];
}

async function fetchMdSettingsBundle() {
  const { data } = await supabase
    .from('md_settings')
    .select(
      'rank_pay_matrix, setting_value, wb_working_days, wb_hours, so_working_days, holiday_calendar',
    )
    .eq('company_id', companyId)
    .maybeSingle();
  return data;
}

async function fetchMdSettingsSeparate() {
  const [rank, engine, working, holiday] = await Promise.all([
    supabase
      .from('md_settings')
      .select('rank_pay_matrix, setting_value')
      .eq('company_id', companyId)
      .maybeSingle(),
    supabase.from('md_settings').select('setting_value').eq('company_id', companyId).maybeSingle(),
    supabase
      .from('md_settings')
      .select('wb_working_days, wb_hours, so_working_days')
      .eq('company_id', companyId)
      .maybeSingle(),
    supabase
      .from('md_settings')
      .select('holiday_calendar, setting_value')
      .eq('company_id', companyId)
      .maybeSingle(),
  ]);
  return [rank.data, engine.data, working.data, holiday.data];
}

async function fetchDeductions(employeeIds) {
  const [hq, advances, plans] = await Promise.all([
    supabase
      .from('payroll_monthly_deduction_entries')
      .select('employee_id')
      .eq('company_id', companyId)
      .eq('payroll_month', payrollMonth),
    supabase
      .from('salary_advance_requests')
      .select('id')
      .eq('company_id', companyId)
      .eq('status', 'APPROVED'),
    supabase
      .from('fm_employee_deduction_plans')
      .select('employee_id')
      .eq('company_id', companyId)
      .in('employee_id', employeeIds.length ? employeeIds : ['00000000-0000-0000-0000-000000000000']),
  ]);
  return [hq.data, advances.data, plans.data];
}

async function main() {
  console.log('FM portfolio benchmark (CVS dev DB)\n');

  const phaseAOld = await time('phase-a OLD (6 parallel + 4 md_settings)', async () => {
    const [employees, sites] = await Promise.all([fetchEmployees(), fetchSites()]);
    await fetchMdSettingsSeparate();
    return { employees, sites };
  });

  const phaseANew = await time('phase-a NEW (6 parallel + 1 md_settings bundle)', async () => {
    const [employees, sites] = await Promise.all([fetchEmployees(), fetchSites()]);
    await fetchMdSettingsBundle();
    return { employees, sites };
  });

  const employees = phaseANew.result.employees;
  const guardIds = employees.filter((e) => String(e.group ?? '').toUpperCase().includes('GUARD')).map((e) => e.id);
  const allIds = employees.map((e) => e.id);

  const phaseBOld = await time('phase-b guard shifts (time_shifts only probe)', async () => {
    if (guardIds.length === 0) return [];
    const { data } = await supabase
      .from('time_shifts')
      .select('employee_id, location_id, shift_date')
      .eq('company_id', companyId)
      .eq('verification_status', 'VERIFIED')
      .gte('shift_date', `${payrollMonth}-01`)
      .lte('shift_date', `${payrollMonth}-31`)
      .in('employee_id', guardIds);
    return data ?? [];
  });

  const phaseDOld = await time('phase-d deductions (sequential after build)', async () => {
    await fetchDeductions(allIds);
  });

  const overlapped = await time('phase-b+d NEW (shifts then overlap deductions)', async () => {
    let shiftMs = 0;
    const shiftStart = performance.now();
    if (guardIds.length > 0) {
      await supabase
        .from('time_shifts')
        .select('employee_id, location_id, shift_date')
        .eq('company_id', companyId)
        .eq('verification_status', 'VERIFIED')
        .gte('shift_date', `${payrollMonth}-01`)
        .lte('shift_date', `${payrollMonth}-31`)
        .in('employee_id', guardIds);
    }
    shiftMs = Math.round(performance.now() - shiftStart);
    const deductionsPromise = fetchDeductions(allIds);
    // simulate minimal CPU build
    await new Promise((r) => setTimeout(r, 2));
    await deductionsPromise;
    return shiftMs;
  });

  const oldTotal = phaseAOld.ms + phaseBOld.ms + phaseDOld.ms;
  const newTotal = phaseANew.ms + overlapped.ms;
  const pct = oldTotal > 0 ? Math.round(((oldTotal - newTotal) / oldTotal) * 100) : 0;

  console.log('\n--- summary ---');
  console.log(`step-05 baseline (approx): phase-a ${phaseAOld.ms}ms + phase-b ${phaseBOld.ms}ms + phase-d ${phaseDOld.ms}ms = ${oldTotal}ms`);
  console.log(`optimized (approx): phase-a ${phaseANew.ms}ms + overlapped b+d ${overlapped.ms}ms = ${newTotal}ms`);
  console.log(`improvement: ${pct}% (${oldTotal - newTotal}ms saved)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
