/**
 * G-4 — Payroll sanity verification (read-only).
 *
 * Usage: node scripts/verify-cvs-mnr-remediation-g4.mjs
 */

import { createRequire } from 'module';
import { readFileSync, appendFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const XLSX = require(join(root, 'node_modules/xlsx'));
const outDir = join(root, 'data/migration/classic-venture');
const CVS_COMPANY_ID = '29fbb2ff-6aa6-46c4-8b2d-d19eebb2874e';
const MNR_PATH = join(outDir, 'archive/legacy-sources/MASTER-NOMINAL-ROLL.xlsx');
const BUNDLE_PATH = join(outDir, 'remediation-operator-review-bundle.json');

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

function cellRaw(value) {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).trim();
}

function normEpf(v) {
  return String(v ?? '').trim();
}

function normStatus(s) {
  return (s ?? '').trim().toLowerCase();
}

function loadLegacyMnrByEpf() {
  const wb = XLSX.readFile(MNR_PATH, { cellDates: true });
  const rows = XLSX.utils.sheet_to_json(wb.Sheets.Sheet1, { defval: '', raw: false });
  const byEpf = new Map();
  for (const row of rows) {
    const epf = cellRaw(row.EPF_no);
    if (!epf) continue;
    if (!byEpf.has(epf)) byEpf.set(epf, row);
  }
  return byEpf;
}

async function fetchEmployeeByEpf(supabase, epf) {
  for (const col of ['emp_number', 'epf_no', 'epf_num']) {
    const { data, error } = await supabase
      .from('employees')
      .select('emp_number, full_name, status, site, base_salary, basic_salary')
      .eq('company_id', CVS_COMPANY_ID)
      .eq(col, epf)
      .maybeSingle();
    if (error) throw error;
    if (data) return data;
  }
  return null;
}

async function fetchPayrollActiveEpfs(supabase) {
  const epfs = new Set();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from('employees')
      .select('emp_number, epf_no, epf_num')
      .eq('company_id', CVS_COMPANY_ID)
      .ilike('status', 'active')
      .range(from, from + 999);
    if (error) throw error;
    if (!data?.length) break;
    for (const row of data) {
      for (const key of [row.emp_number, row.epf_no, row.epf_num]) {
        const v = normEpf(key);
        if (v) epfs.add(v);
      }
    }
    if (data.length < 1000) break;
  }
  return epfs;
}

async function main() {
  loadEnv();
  mkdirSync(outDir, { recursive: true });

  const bundle = JSON.parse(readFileSync(BUNDLE_PATH, 'utf8'));
  const deployed = bundle.deployed_guards.slice(0, 5);
  const reserve = bundle.reserve_pool.slice(0, 5);
  const resigned = bundle.resigned_clearance.slice(0, 5);

  const legacyByEpf = loadLegacyMnrByEpf();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase env');

  const supabase = createClient(url, key);
  const payrollActiveEpfs = await fetchPayrollActiveEpfs(supabase);

  const deployedResults = [];
  let deployedFail = 0;
  for (const sample of deployed) {
    const epf = normEpf(sample.epf);
    const db = await fetchEmployeeByEpf(supabase, epf);
    const leg = legacyByEpf.get(epf);
    const legacySalary = Math.round(Number(leg?.Basic_EPF) || 0);
    const dbSalary = Math.round(Number(db?.base_salary ?? db?.basic_salary) || 0);
    const ok = db && legacySalary === dbSalary && normStatus(db.status) === 'active';
    if (!ok) deployedFail += 1;
    deployedResults.push({
      epf,
      name: sample.name,
      legacySalary,
      dbSalary,
      ok,
    });
  }

  const reserveResults = [];
  let reserveFail = 0;
  for (const sample of reserve) {
    const epf = normEpf(sample.epf);
    const db = await fetchEmployeeByEpf(supabase, epf);
    const ok =
      db &&
      normStatus(db.status) === 'active' &&
      (db.site ?? '').trim().toUpperCase() === 'RESERVE';
    if (!ok) reserveFail += 1;
    reserveResults.push({ epf, name: sample.name, site: db?.site, status: db?.status, ok });
  }

  const resignedResults = [];
  let resignedFail = 0;
  for (const sample of resigned) {
    const epf = normEpf(sample.epf);
    const db = await fetchEmployeeByEpf(supabase, epf);
    const onPayroll = payrollActiveEpfs.has(epf);
    const ok =
      db &&
      normStatus(db.status) === 'resigned' &&
      !onPayroll &&
      (db.site ?? '').trim().toUpperCase() === 'CLEARANCE';
    if (!ok) resignedFail += 1;
    resignedResults.push({
      epf,
      name: sample.name,
      status: db?.status,
      site: db?.site,
      onPayroll,
      ok,
    });
  }

  const allOk = deployedFail === 0 && reserveFail === 0 && resignedFail === 0;

  const report = [
    '',
    '=== G-4 PAYROLL SANITY ===',
    `Run at: ${new Date().toISOString()}`,
    `FM payroll pool (status ilike active): ${payrollActiveEpfs.size} EPF keys`,
    '',
    'DEPLOYED guards — base_salary vs legacy Basic_EPF:',
    ...deployedResults.map(
      (r) =>
        `  ${r.ok ? '✓' : '✗'} EPF ${r.epf} ${r.name}: legacy=${r.legacySalary} db=${r.dbSalary}`,
    ),
    '',
    'RESERVE pool — ACTIVE on RESERVE:',
    ...reserveResults.map(
      (r) =>
        `  ${r.ok ? '✓' : '✗'} EPF ${r.epf} ${r.name}: ${r.status ?? 'MISSING'} @ ${r.site ?? '—'}`,
    ),
    '',
    'Resigned — excluded from payroll roster:',
    ...resignedResults.map(
      (r) =>
        `  ${r.ok ? '✓' : '✗'} EPF ${r.epf} ${r.name}: ${r.status ?? 'MISSING'} @ ${r.site ?? '—'} payroll=${r.onPayroll ? 'YES' : 'no'}`,
    ),
    '',
    allOk ? 'G-4 PASS' : 'G-4 FAIL',
    '',
    'G-4 COMPLETE — proceed to G-5',
  ];

  const msg = report.join('\n');
  console.log(msg);
  appendFileSync(join(outDir, 'remediation-audit-report.txt'), `${msg}\n`);
  appendFileSync(
    join(outDir, 'remediation-apply-log.txt'),
    `${new Date().toISOString()} [G-4 VERIFY] ${allOk ? 'PASS' : 'FAIL'}\n`,
  );

  if (!allOk) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
