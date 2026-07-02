/**
 * S-2 — Duplicate EPF + sheet/DB coverage report (read-only).
 *
 * Usage: node scripts/verify-cvs-site-roster-s2.mjs
 */

import { createRequire } from 'module';
import { readFileSync, appendFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const XLSX = require(join(root, 'node_modules/xlsx'));
const outDir = join(root, 'data/migration/classic-venture');
const sheetPath = join(
  outDir,
  'archive/operator-sources/SITE-CODE-AND-NAMES-2026-06-26.xlsx',
);
const classPath = join(outDir, 'site-roster-classification.csv');
const CVS_COMPANY_ID = '29fbb2ff-6aa6-46c4-8b2d-d19eebb2874e';

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

function cellRaw(v) {
  if (v == null || v === '') return '';
  return String(v).trim();
}

function isNumericEpf(epf) {
  return /^\d+$/.test(cellRaw(epf));
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

function loadSheetEpfs() {
  const wb = XLSX.readFile(sheetPath, { cellDates: true });
  const rows = XLSX.utils.sheet_to_json(wb.Sheets.Sheet1, {
    defval: '',
    header: [
      'serial',
      'EPF_no',
      'Rank_Code',
      'Name',
      'NIC',
      'Date_Joined',
      'Site_Code',
      'Col7',
      'Site_Name',
      'Col9',
    ],
    range: 0,
  });

  const all = [];
  const numeric = [];
  const junk = [];
  const dupMap = new Map();

  for (const row of rows) {
    const epf = cellRaw(row.EPF_no);
    const name = cellRaw(row.Name);
    if (!epf) continue;
    all.push({ epf, name });
    if (!dupMap.has(epf)) dupMap.set(epf, []);
    dupMap.get(epf).push(name);

    if (isNumericEpf(epf)) numeric.push({ epf, name });
    else junk.push({ epf, name });
  }

  const sheetDupes = [...dupMap.entries()]
    .filter(([, names]) => names.length > 1)
    .map(([epf, names]) => ({ epf, count: names.length, names }));

  return { all, numeric, junk, sheetDupes };
}

async function loadDbEmployees(supabase) {
  const all = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from('employees')
      .select('emp_number, epf_no, epf_num, full_name, status, site')
      .eq('company_id', CVS_COMPANY_ID)
      .range(from, from + 999);
    if (error) throw error;
    if (!data?.length) break;
    all.push(...data);
    if (data.length < 1000) break;
  }
  return all;
}

function countDupes(employees, field) {
  const map = new Map();
  for (const e of employees) {
    const key = cellRaw(e[field]);
    if (!key) continue;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(e);
  }
  return [...map.entries()]
    .filter(([, rows]) => rows.length > 1)
    .map(([key, rows]) => ({
      key,
      count: rows.length,
      samples: rows.slice(0, 3).map((r) => ({
        emp_number: r.emp_number,
        epf_no: r.epf_no,
        name: r.full_name,
        site: r.site,
      })),
    }));
}

async function main() {
  loadEnv();
  if (!existsSync(classPath)) throw new Error('Run S-1 first — missing site-roster-classification.csv');

  const { numeric, junk, sheetDupes } = loadSheetEpfs();
  const sheetNumericSet = new Set(numeric.map((r) => r.epf));

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase env');

  const supabase = createClient(url, key);
  const dbEmployees = await loadDbEmployees(supabase);
  const dbEmpDupes = countDupes(dbEmployees, 'emp_number');
  const dbEpfDupes = countDupes(dbEmployees, 'epf_no');

  const dbByEmp = new Map();
  for (const e of dbEmployees) {
    const k = cellRaw(e.emp_number);
    if (k) dbByEmp.set(k, e);
  }

  const sheetNotDb = numeric.filter((r) => !dbByEmp.has(r.epf));
  const dbNotSheet = dbEmployees.filter((e) => {
    const k = cellRaw(e.emp_number);
    return k && !sheetNumericSet.has(k);
  });

  const classRows = parseCsv(readFileSync(classPath, 'utf8'));
  const dbOnlyFromClass = classRows.filter((r) => r.intended_pool === 'DB_ONLY');

  const pass =
    sheetDupes.length === 0 &&
    dbEmpDupes.length === 0 &&
    dbEpfDupes.length === 0;

  const report = [
    '',
    '=== S-2 DUPLICATE EPF + COVERAGE ===',
    `Run at: ${new Date().toISOString()}`,
    '',
    'Operator sheet:',
    `  Total EPF values .............. ${numeric.length + junk.length}`,
    `  Numeric EPF rows .............. ${numeric.length}`,
    `  Junk / non-numeric EPF ........ ${junk.length}${junk.length ? `: ${junk.map((j) => j.epf).join(', ')}` : ''}`,
    `  Duplicate EPF in sheet ........ ${sheetDupes.length}`,
    ...(sheetDupes.length
      ? sheetDupes.map((d) => `    ✗ ${d.epf} ×${d.count}`)
      : ['    ✓ none']),
    '',
    'Database (CVS tenant):',
    `  Employees ..................... ${dbEmployees.length}`,
    `  Duplicate emp_number .......... ${dbEmpDupes.length}`,
    ...(dbEmpDupes.length
      ? dbEmpDupes.map((d) => `    ✗ ${d.key} ×${d.count}`)
      : ['    ✓ none']),
    `  Duplicate epf_no .............. ${dbEpfDupes.length}`,
    ...(dbEpfDupes.length
      ? dbEpfDupes.map((d) => `    ✗ ${d.key} ×${d.count}`)
      : ['    ✓ none']),
    '',
    'Coverage gaps:',
    `  Sheet numeric EPF missing in DB (${sheetNotDb.length}):`,
    ...(sheetNotDb.length
      ? sheetNotDb.map((r) => `    · EPF ${r.epf} — ${r.name}`)
      : ['    ✓ none']),
    `  DB emp_number not in sheet (${dbNotSheet.length}):`,
    ...dbNotSheet.map(
      (e) =>
        `    · EPF ${e.emp_number} — ${e.full_name} @ ${e.site ?? '—'} (${e.status})`,
    ),
    '',
    'Classification DB_ONLY rows:',
    ...dbOnlyFromClass.map(
      (r) => `    · EPF ${r.epf_no} — ${r.full_name} @ ${r.db_site || '—'}`,
    ),
    '',
    pass ? 'S-2 PASS — no duplicate EPF keys' : 'S-2 FAIL — duplicate keys found',
    '',
    'S-2 COMPLETE — proceed to S-3',
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
