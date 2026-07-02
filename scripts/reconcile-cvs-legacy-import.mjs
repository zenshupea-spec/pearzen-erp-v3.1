/**
 * C-5 — Post-load reconciliation for CVS legacy MNR import.
 * Run: node scripts/reconcile-cvs-legacy-import.mjs
 */

import { createRequire } from 'module';
import { createHash } from 'crypto';
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import { decrypt } from '../apps/back-office/lib/encryption.js';

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const XLSX = require(join(root, 'node_modules/xlsx'));
const CVS_COMPANY_ID = '29fbb2ff-6aa6-46c4-8b2d-d19eebb2874e';
const outDir = join(root, 'data/migration/classic-venture');

const DEFAULT_MNR = join(outDir, 'archive/legacy-sources/MASTER-NOMINAL-ROLL.xlsx');
const FALLBACK_MNR = join(process.env.HOME ?? '', 'Downloads/MASTER NOMINAL ROLL.xlsx');
const PAYROLL_SPOT_EPFS = ['5522', '3239', '13650', '12', '8017'];

function loadEnv() {
  for (const file of ['apps/back-office/.env.local', '.env.seed.tmp', '.env']) {
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

function sensitiveCopy(value) {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return cellRaw(value);
  return String(value).trim();
}

function parseCsv(text) {
  const lines = text.trim().split('\n');
  const headers = lines[0].split(',');
  return lines.slice(1).map((line) => {
    const values = [];
    let cur = '';
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        inQ = !inQ;
        continue;
      }
      if (ch === ',' && !inQ) {
        values.push(cur);
        cur = '';
        continue;
      }
      cur += ch;
    }
    values.push(cur);
    const row = {};
    headers.forEach((h, i) => {
      row[h] = values[i] ?? '';
    });
    return row;
  });
}

function normUpper(v) {
  return String(v ?? '').trim().toUpperCase();
}

function sha256(value) {
  return createHash('sha256').update(String(value ?? ''), 'utf8').digest('hex');
}

function decryptPii(value) {
  if (value == null || value === '') return '';
  return decrypt(String(value)) ?? '';
}

function loadLegacyMnrByEpf(mnrPath) {
  const wb = XLSX.readFile(mnrPath, { cellDates: true });
  const rows = XLSX.utils.sheet_to_json(wb.Sheets.Sheet1, { defval: '', raw: false });
  const byEpf = new Map();
  for (const row of rows) {
    const epf = cellRaw(row.EPF_no);
    if (!epf) continue;
    if (!byEpf.has(epf)) byEpf.set(epf, row);
    else {
      const prev = byEpf.get(epf);
      const prevActive = prev.ACT_YN === true || prev.ACT_YN === 'TRUE' || prev.ACT_YN === 1;
      const curActive = row.ACT_YN === true || row.ACT_YN === 'TRUE' || row.ACT_YN === 1;
      if (curActive && !prevActive) byEpf.set(epf, row);
    }
  }
  return byEpf;
}

async function fetchAllEmployees(supabase) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from('employees')
      .select('emp_number, epf_no, base_salary, nic, account_number, full_name')
      .eq('company_id', CVS_COMPANY_ID)
      .range(from, from + 999);
    if (error) throw new Error(error.message);
    if (!data?.length) break;
    rows.push(...data);
    if (data.length < 1000) break;
  }
  return rows;
}

async function fetchAllSites(supabase) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from('site_profiles')
      .select('site_name')
      .eq('company_id', CVS_COMPANY_ID)
      .range(from, from + 999);
    if (error) throw new Error(error.message);
    if (!data?.length) break;
    rows.push(...data);
    if (data.length < 1000) break;
  }
  return rows;
}

function pickSensitiveSamples(stagingEmployees, count, field, predicate) {
  const pool = stagingEmployees.filter(predicate);
  const picks = [];
  for (let i = 0; i < count && i < pool.length; i++) {
    const idx = Math.floor((i / count) * pool.length);
    picks.push(pool[idx]);
  }
  return picks;
}

async function main() {
  loadEnv();
  process.env.NODE_ENV ??= 'development';

  const mnrPath =
    process.env.CVS_MNR_XLSX ||
    (existsSync(DEFAULT_MNR) ? DEFAULT_MNR : FALLBACK_MNR);
  const stagingEmpPath = join(outDir, 'staging-employees.csv');
  const stagingSitePath = join(outDir, 'staging-sites.csv');

  for (const p of [stagingEmpPath, stagingSitePath]) {
    if (!existsSync(p)) {
      console.error(`Missing ${p}`);
      process.exit(1);
    }
  }
  if (!existsSync(mnrPath)) {
    console.error(`Legacy MNR not found: ${mnrPath}`);
    process.exit(1);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('Missing Supabase env');
    process.exit(1);
  }

  const stagingEmployees = parseCsv(readFileSync(stagingEmpPath, 'utf8')).filter((r) => cellRaw(r.emp_number));
  const stagingSites = parseCsv(readFileSync(stagingSitePath, 'utf8')).filter((r) => cellRaw(r.site_name));
  const legacyByEpf = loadLegacyMnrByEpf(mnrPath);

  const supabase = createClient(url, key);
  const dbEmployees = await fetchAllEmployees(supabase);
  const dbSites = await fetchAllSites(supabase);

  const dbByEmp = new Map(dbEmployees.map((e) => [normUpper(e.emp_number), e]));
  const dbSiteNames = new Set(dbSites.map((s) => normUpper(s.site_name)));

  const report = [];
  const errors = [];
  const push = (line) => report.push(line);

  push(`C-5 post-load reconciliation ${new Date().toISOString()}`);
  push(`Legacy MNR: ${mnrPath}`);
  push(`Supabase: ${url}`);
  push('');

  // 1. Employee count
  push('=== EMPLOYEE COUNT ===');
  const missingStaging = stagingEmployees.filter((e) => !dbByEmp.has(normUpper(e.emp_number)));
  push(`Staging rows: ${stagingEmployees.length}`);
  push(`DB rows (company): ${dbEmployees.length}`);
  push(`Staging missing from DB: ${missingStaging.length}`);
  if (missingStaging.length) {
    errors.push(`${missingStaging.length} staging employees missing from DB`);
    push(`  First missing: ${missingStaging.slice(0, 5).map((e) => e.emp_number).join(', ')}`);
  } else {
    push('  All staging employees present in DB ✓');
  }

  // 2. Site count
  push('');
  push('=== SITE COUNT ===');
  const missingSites = stagingSites.filter((s) => !dbSiteNames.has(normUpper(s.site_name)));
  push(`Staging sites: ${stagingSites.length}`);
  push(`DB sites (company): ${dbSites.length} (${dbSites.length - stagingSites.length} extra seed/non-staging)`);
  push(`Staging sites missing from DB: ${missingSites.length}`);
  if (missingSites.length) {
    errors.push(`${missingSites.length} staging sites missing from DB`);
  } else {
    push('  All staging sites present in DB ✓');
  }

  // 3. Duplicate emp_number
  push('');
  push('=== DUPLICATE emp_number ===');
  const empCounts = new Map();
  for (const e of dbEmployees) {
    const k = normUpper(e.emp_number);
    if (!k) continue;
    empCounts.set(k, (empCounts.get(k) ?? 0) + 1);
  }
  const dupEmps = [...empCounts.entries()].filter(([, n]) => n > 1);
  push(`Duplicate emp_number values: ${dupEmps.length}`);
  if (dupEmps.length) {
    errors.push(`Duplicate emp_number: ${dupEmps.map(([k, n]) => `${k}×${n}`).join(', ')}`);
    for (const [k, n] of dupEmps.slice(0, 5)) push(`  ✗ ${k} appears ${n} times`);
  } else {
    push('  No duplicate emp_number in CVS tenant ✓');
  }

  const epfCounts = new Map();
  for (const e of dbEmployees) {
    const k = cellRaw(e.epf_no);
    if (!k) continue;
    epfCounts.set(k, (epfCounts.get(k) ?? 0) + 1);
  }
  const dupEpfs = [...epfCounts.entries()].filter(([, n]) => n > 1);
  push(`Duplicate epf_no values: ${dupEpfs.length}${dupEpfs.length ? ' (constraint violation risk)' : ' ✓'}`);
  if (dupEpfs.length) errors.push(`Duplicate epf_no: ${dupEpfs.length}`);

  // 4. Payroll spot-check
  push('');
  push('=== PAYROLL SPOT-CHECK (Basic_EPF → base_salary) ===');
  let payrollMismatch = 0;
  for (const epf of PAYROLL_SPOT_EPFS) {
    const st = stagingEmployees.find((e) => normUpper(e.emp_number) === epf);
    const db = dbByEmp.get(epf);
    const leg = legacyByEpf.get(epf);
    const legacyBasic = Math.round(Number(leg?.Basic_EPF) || 0);
    const stagingSalary = Math.round(Number(st?.base_salary) || 0);
    const dbSalary = Math.round(Number(db?.base_salary) || 0);

    const ok = db && legacyBasic === dbSalary && stagingSalary === dbSalary;
    if (!ok) payrollMismatch++;
    push(
      `  ${ok ? '✓' : '✗'} EPF ${epf} ${db?.full_name ?? leg?.Name ?? '?'}: legacy=${legacyBasic} staging=${stagingSalary} db=${dbSalary}`,
    );
  }
  if (payrollMismatch) errors.push(`Payroll spot-check: ${payrollMismatch}/5 mismatches`);
  else push('  5/5 payroll spot-checks pass ✓');

  // 5. Sensitive audit (hash compare — no PII in report)
  push('');
  push('=== SENSITIVE AUDIT (SHA-256 legacy vs DB decrypt) ===');
  const nicSamples = pickSensitiveSamples(
    stagingEmployees,
    10,
    'nic',
    (e) => cellRaw(e.nic) && !['-', '='].includes(cellRaw(e.nic)),
  );
  const bankSamples = pickSensitiveSamples(
    stagingEmployees,
    10,
    'account_number',
    (e) => {
      const ba = cellRaw(e.account_number);
      return ba && ba !== '0' && ba !== '-';
    },
  );

  let nicHashMismatch = 0;
  for (const st of nicSamples) {
    const epf = normUpper(st.emp_number);
    const db = dbByEmp.get(epf);
    const leg = legacyByEpf.get(epf);
    const legacyNic = normUpper(sensitiveCopy(leg?.NIC));
    const dbNic = normUpper(decryptPii(db?.nic));
    const legacyHash = sha256(legacyNic);
    const dbHash = sha256(dbNic);
    if (legacyHash !== dbHash) {
      nicHashMismatch++;
      push(`  ✗ NIC hash mismatch EPF ${epf}`);
    }
  }
  push(`  NIC samples: ${nicSamples.length - nicHashMismatch}/${nicSamples.length} hash match`);

  let bankHashMismatch = 0;
  for (const st of bankSamples) {
    const epf = normUpper(st.emp_number);
    const db = dbByEmp.get(epf);
    const leg = legacyByEpf.get(epf);
    const legacyBank = cellRaw(sensitiveCopy(leg?.Bank_Acc));
    const dbBank = cellRaw(decryptPii(db?.account_number));
    if (sha256(legacyBank) !== sha256(dbBank)) {
      bankHashMismatch++;
      push(`  ✗ Bank_Acc hash mismatch EPF ${epf}`);
    }
  }
  push(`  Bank_Acc samples: ${bankSamples.length - bankHashMismatch}/${bankSamples.length} hash match`);

  if (nicHashMismatch || bankHashMismatch) {
    errors.push(`Sensitive audit: NIC=${nicHashMismatch}, Bank=${bankHashMismatch} hash mismatches`);
  } else {
    push('  10 NIC + 10 Bank_Acc hash comparisons pass ✓');
  }

  push('');
  if (errors.length === 0) {
    push('RESULT: PASS — C-5 reconciliation complete');
  } else {
    push(`RESULT: FAIL — ${errors.length} issue(s):`);
    for (const e of errors) push(`  ! ${e}`);
  }

  const text = report.join('\n') + '\n';
  console.log(text);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'c-5-reconciliation-report.txt'), text);

  process.exit(errors.length ? 1 : 0);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
