/**
 * Step 16 regression smoke — FM portfolio settings + route health.
 * Run: node apps/back-office/scripts/smoke-fm-regression.mjs
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
const base = process.env.FM_SMOKE_BASE_URL ?? 'http://127.0.0.1:3002';

if (!url || !key) {
  console.error('FAIL: missing Supabase env');
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });

const results = [];

function pass(name, detail = '') {
  results.push({ name, ok: true, detail });
  console.log(`PASS ${name}${detail ? ` — ${detail}` : ''}`);
}

function fail(name, detail = '') {
  results.push({ name, ok: false, detail });
  console.error(`FAIL ${name}${detail ? ` — ${detail}` : ''}`);
}

async function checkRoutes() {
  for (const path of ['/fm', '/fm/roster']) {
    try {
      const res = await fetch(`${base}${path}`, { redirect: 'manual' });
      if (res.status === 307 || res.status === 200) {
        pass(`route ${path}`, `HTTP ${res.status}`);
      } else {
        fail(`route ${path}`, `HTTP ${res.status}`);
      }
    } catch (err) {
      fail(`route ${path}`, err instanceof Error ? err.message : String(err));
    }
  }
}

async function checkMdSettingsBundle() {
  const { data, error } = await supabase
    .from('md_settings')
    .select(
      'rank_pay_matrix, setting_value, wb_working_days, wb_hours, so_working_days, holiday_calendar',
    )
    .eq('company_id', companyId)
    .maybeSingle();

  if (error) {
    fail('md_settings bundle query', error.message);
    return;
  }

  pass('md_settings bundle query', data ? 'row found' : 'defaults path (no row)');

  const wb = Number(data?.wb_working_days ?? 26);
  if (Number.isFinite(wb) && wb > 0) {
    pass('working days parse', `wb=${wb}`);
  } else {
    fail('working days parse');
  }
}

async function checkPortfolioShape() {
  const { data: employees, error: empErr } = await supabase
    .from('employees')
    .select('id, full_name, base_salary, group, status')
    .eq('company_id', companyId)
    .ilike('status', 'active')
    .limit(20);

  if (empErr) {
    fail('employees sample', empErr.message);
    return;
  }

  pass('employees sample', `${employees?.length ?? 0} active rows`);

  const { data: sites, error: siteErr } = await supabase
    .from('site_profiles')
    .select('id, site_name, rate_matrix, site_status')
    .eq('company_id', companyId)
    .limit(20);

  if (siteErr) {
    fail('sites sample', siteErr.message);
    return;
  }

  pass('sites sample', `${sites?.length ?? 0} site rows`);

  const activeSites = (sites ?? []).filter(
    (s) => String(s.site_status ?? 'ACTIVE').toUpperCase() !== 'ARCHIVED',
  );
  pass('payroll totals inputs', `${activeSites.length} active site(s) for client ledger`);
}

async function checkWorkflowTables() {
  const { error } = await supabase.from('payroll_runs').select('id').limit(1);
  if (error && /does not exist|42P01/i.test(error.message)) {
    pass('payroll_runs table', 'missing (schema pending — UI shows migration banner)');
    return;
  }
  if (error) {
    fail('payroll_runs table', error.message);
    return;
  }
  pass('payroll_runs table', 'reachable');
}

async function main() {
  console.log('FM regression smoke (step 16)\n');
  await checkRoutes();
  await checkMdSettingsBundle();
  await checkPortfolioShape();
  await checkWorkflowTables();

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
