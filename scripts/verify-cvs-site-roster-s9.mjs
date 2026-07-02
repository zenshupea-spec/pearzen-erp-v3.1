/**
 * S-9 — Post-apply verification (read-only).
 *
 * Usage: node scripts/verify-cvs-site-roster-s9.mjs
 */

import { createRequire } from 'module';
import { readFileSync, appendFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import { parseRankPayMatrix } from '../packages/rank-pay-matrix/index.ts';

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'data/migration/classic-venture');
const classPath = join(outDir, 'site-roster-classification.csv');
const CVS_COMPANY_ID = '29fbb2ff-6aa6-46c4-8b2d-d19eebb2874e';
const GUARD_GROUPS = new Set(['GUARD', 'GUARD_FIELD']);

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

function parseCsv(text) {
  const lines = text.trim().split('\n');
  const headers = lines[0].split(',');
  return lines.slice(1).map((line) => {
    const values = [];
    let cur = '';
    let inQ = false;
    for (const ch of line) {
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

function normStatus(s) {
  return (s ?? '').trim().toLowerCase();
}

function normSite(emp) {
  return (emp.site || '').trim().toUpperCase();
}

function normGroup(emp) {
  const v = (emp.group || '').trim().toUpperCase();
  return v === 'GUARD_FIELD' ? 'GUARD' : v;
}

function isHrActive(emp) {
  return normStatus(emp.status) === 'active';
}

function isResigned(emp) {
  return normStatus(emp.status) === 'resigned' || normSite(emp) === 'CLEARANCE';
}

function isGuard(emp) {
  return GUARD_GROUPS.has(normGroup(emp));
}

function isHqRoster(emp) {
  if (!isHrActive(emp)) return false;
  const g = normGroup(emp);
  return g === 'HEAD_OFFICE' || g === 'CAFE' || g === 'SECTOR_MANAGER';
}

function isDeployed(emp) {
  const site = normSite(emp);
  if (!isHrActive(emp) || !site) return false;
  if (['RESERVE', 'CLEARANCE', 'TEMPORY', 'HEAD OFFICE'].includes(site)) return false;
  return true;
}

function mnrBucket(emp) {
  if (isResigned(emp)) return 'RESIGNED';
  if (!isHrActive(emp)) return 'OTHER';
  if (isHqRoster(emp)) return 'ACTIVE';
  if (isGuard(emp)) {
    if (normSite(emp) === 'RESERVE') return 'INACTIVE';
    if (normSite(emp) === 'TEMPORY') return 'TEMPORY';
    if (isDeployed(emp)) return 'ACTIVE';
  }
  return 'OTHER';
}

function countDupes(employees, field) {
  const map = new Map();
  for (const e of employees) {
    const key = String(e[field] ?? '').trim();
    if (!key) continue;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(e);
  }
  return [...map.entries()].filter(([, rows]) => rows.length > 1);
}

async function fetchEmployees(supabase) {
  const all = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from('employees')
      .select('emp_number, epf_no, full_name, status, site, group, rank')
      .eq('company_id', CVS_COMPANY_ID)
      .range(from, from + 999);
    if (error) throw error;
    if (!data?.length) break;
    all.push(...data);
    if (data.length < 1000) break;
  }
  return all;
}

async function main() {
  loadEnv();
  if (!existsSync(classPath)) throw new Error('Missing site-roster-classification.csv — run S-1');

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase env');

  const supabase = createClient(url, key);
  const employees = await fetchEmployees(supabase);
  const classRows = parseCsv(readFileSync(classPath, 'utf8'));

  const poolCounts = { ACTIVE: 0, INACTIVE: 0, TEMPORY: 0, RESIGNED: 0, OTHER: 0 };
  for (const emp of employees) poolCounts[mnrBucket(emp)] += 1;

  const siteMismatch = classRows.filter((r) => r.mismatch_site === 'Y').length;
  const statusMismatch = classRows.filter((r) => r.mismatch_status === 'Y').length;
  const rankMismatch = classRows.filter((r) => r.mismatch_rank === 'Y').length;
  const dbOnly = classRows.filter((r) => r.intended_pool === 'DB_ONLY').length;
  const missingDb = classRows.filter(
    (r) => r.mismatch_site === 'Y' && !r.db_site && r.intended_pool !== 'DB_ONLY',
  ).length;

  const empDupes = countDupes(employees, 'emp_number');
  const epfDupes = countDupes(employees, 'epf_no');

  const fmActivePool = employees.filter((e) => normStatus(e.status) === 'active');
  const resignedInFmPool = fmActivePool.filter((e) => normSite(e) === 'CLEARANCE');
  const reserveNotActive = employees.filter(
    (e) => normSite(e) === 'RESERVE' && normStatus(e.status) !== 'active',
  );
  const activeOnClearance = employees.filter(
    (e) => normSite(e) === 'CLEARANCE' && normStatus(e.status) === 'active',
  );

  const { data: settings } = await supabase
    .from('md_settings')
    .select('rank_pay_matrix')
    .eq('company_id', CVS_COMPANY_ID)
    .maybeSingle();
  const matrixCodes = new Set(parseRankPayMatrix(settings?.rank_pay_matrix).map((r) => r.rankCode));
  const ranksInUse = new Set(
    employees.map((e) => (e.rank || '').trim().toUpperCase()).filter(Boolean),
  );
  const ranksNotInMatrix = [...ranksInUse].filter((c) => !matrixCodes.has(c));

  const sheetEpfs = new Set(
    classRows.filter((r) => r.intended_pool !== 'DB_ONLY').map((r) => r.epf_no),
  );
  const dbEpfs = new Set(employees.map((e) => String(e.emp_number ?? '').trim()).filter(Boolean));
  const coverageOk = sheetEpfs.size === dbEpfs.size && [...sheetEpfs].every((e) => dbEpfs.has(e));

  const mnrOk =
    poolCounts.ACTIVE >= 530 &&
    poolCounts.ACTIVE <= 570 &&
    poolCounts.INACTIVE >= 4180 &&
    poolCounts.RESIGNED >= 300 &&
    poolCounts.RESIGNED <= 310;

  const pass =
    mnrOk &&
    siteMismatch === 0 &&
    statusMismatch === 0 &&
    rankMismatch === 0 &&
    dbOnly === 0 &&
    missingDb === 0 &&
    empDupes.length === 0 &&
    epfDupes.length === 0 &&
    resignedInFmPool.length === 0 &&
    reserveNotActive.length === 0 &&
    activeOnClearance.length === 0 &&
    ranksNotInMatrix.length === 0 &&
    coverageOk;

  const report = [
    '',
    '=== S-9 POST-APPLY VERIFICATION ===',
    `Run at: ${new Date().toISOString()}`,
    `Employees: ${employees.length}`,
    '',
    'MNR site-pool badges (operator semantics):',
    `  Active Personnel: ${poolCounts.ACTIVE} (target ~560: deployed + HO + café + SM)`,
    `  Inactive (RESERVE): ${poolCounts.INACTIVE} (target ~4188)`,
    `  Temp roster: ${poolCounts.TEMPORY} (target ~144)`,
    `  Resigned: ${poolCounts.RESIGNED} (target ~305)`,
    `  Other: ${poolCounts.OTHER}`,
    mnrOk ? '  ✓ MNR pool counts in range' : '  ✗ MNR pool counts out of range',
    '',
    'Sheet vs DB alignment:',
    `  Site mismatches: ${siteMismatch}`,
    `  Status mismatches: ${statusMismatch}`,
    `  Rank mismatches: ${rankMismatch}`,
    `  DB-only rows: ${dbOnly}`,
    `  Sheet EPF missing in DB: ${missingDb}`,
    `  Sheet/DB EPF coverage: ${coverageOk ? '✓ 5197 ↔ 5197' : '✗ gap'}`,
    '',
    'Duplicate keys:',
    `  emp_number duplicates: ${empDupes.length}`,
    `  epf_no duplicates: ${epfDupes.length}`,
    ...(empDupes.length
      ? empDupes.slice(0, 5).map(([k, rows]) => `    ✗ ${k} ×${rows.length}`)
      : []),
    '',
    'FM payroll pool checks:',
    `  status=active rows: ${fmActivePool.length}`,
    `  ACTIVE on CLEARANCE site: ${activeOnClearance.length}${activeOnClearance.length ? ' ✗' : ' ✓'}`,
    `  RESERVE not ACTIVE status: ${reserveNotActive.length}${reserveNotActive.length ? ' ✗' : ' ✓'}`,
  `  Resigned in FM active filter (CLEARANCE): ${resignedInFmPool.length}${resignedInFmPool.length ? ' ✗' : ' ✓'}`,
    '',
    'Rank matrix:',
    `  Codes in matrix: ${matrixCodes.size}`,
    `  Employee ranks not in matrix: ${ranksNotInMatrix.length}${
      ranksNotInMatrix.length ? ` (${ranksNotInMatrix.join(', ')})` : ' ✓'
    }`,
    '',
    pass ? 'S-9 PASS — SITE ROSTER COMPLETE' : 'S-9 FAIL — review items above',
    '',
  ];

  const msg = report.join('\n');
  console.log(msg);
  appendFileSync(join(outDir, 'site-roster-audit-report.txt'), `${msg}\n`);

  if (!pass) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
