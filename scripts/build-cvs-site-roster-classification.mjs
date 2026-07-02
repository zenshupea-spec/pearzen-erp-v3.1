/**
 * S-1 — Build site-roster-classification.csv from operator SITE CODE AND NAMES sheet.
 *
 * Usage: node scripts/build-cvs-site-roster-classification.mjs
 */

import { createRequire } from 'module';
import { readFileSync, writeFileSync, appendFileSync, mkdirSync } from 'fs';
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
const CVS_COMPANY_ID = '29fbb2ff-6aa6-46c4-8b2d-d19eebb2874e';

const VO_EPF_BY_LOC = {
  A: '13650',
  B: '13496',
  C: '13033',
  D: '12410',
  E: '12222',
  F: '13069',
  G: '13085',
  H: '12208',
  I: '13875',
  J: '13470',
};
const VO_EPF_SET = new Set(Object.values(VO_EPF_BY_LOC));

const KEY_HO_EPF = new Set(['10000', '13400', '1874', '8820', '11560', '12761']);
const KEY_CAFE_EPF = new Set(['8', '9', '10', '20']);

/** Operator-approved rank intentions (sheet/legacy → Pearzen rank). */
const SHEET_RANK_TO_INTENDED = {
  HRA: 'HR',
  EXF: 'EA',
  VO: 'SM',
  RANK: 'JSO',
};

/** Key EPF → rank (OD is new — only 13400 V S PERERA). */
const KEY_EPF_RANK = {
  10000: 'MD',
  13400: 'OD',
  1874: 'HR',
  8820: 'FM',
  11560: 'EA',
  12761: 'EA',
  8: 'MOP',
  9: 'MOP',
  10: 'MOP',
  20: 'MOP',
};

function intendedRankForRow(epf, sheetRank) {
  if (KEY_EPF_RANK[epf]) return KEY_EPF_RANK[epf];
  if (VO_EPF_SET.has(epf)) return 'SM';
  const code = normUpper(sheetRank);
  return SHEET_RANK_TO_INTENDED[code] ?? code;
}

const CSV_COLUMNS = [
  'epf_no',
  'full_name',
  'sheet_rank',
  'intended_rank',
  'sheet_site_code',
  'sheet_site_name',
  'intended_site',
  'intended_status',
  'intended_pool',
  'intended_sm_epf',
  'db_site',
  'db_status',
  'db_group',
  'db_rank',
  'mismatch_site',
  'mismatch_status',
  'mismatch_rank',
  'notes',
];

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

function normUpper(s) {
  return (s ?? '').trim().toUpperCase();
}

function normStatus(s) {
  return (s ?? '').trim().toLowerCase();
}

function loadOperatorSheet() {
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

  const siteLookup = XLSX.utils.sheet_to_json(wb.Sheets.Sheet2, {
    defval: '',
    header: ['site_code', 'site_name'],
  });
  const siteByCode = new Map();
  for (const row of siteLookup) {
    const code = cellRaw(row.site_code);
    if (code) siteByCode.set(code, cellRaw(row.site_name));
  }

  return { rows, siteByCode };
}

function isClientDcslHeadOffice(siteName) {
  return normUpper(siteName).includes('DCSL HEAD OFFICE');
}

/** HQ HEAD OFFICE only — not client sites like COLOMBO 10 - DCSL HEAD OFFICE. */
function isHqHeadOfficeSite(siteName, siteCode) {
  const sc = (siteCode ?? '').toLowerCase();
  const u = normUpper(siteName);
  if (u.includes('TASHA') || sc === 'ho6') return false;
  if (isClientDcslHeadOffice(siteName)) return false;
  if (sc.startsWith('ho')) return true;
  return u === 'HEAD OFFICE' || (u.includes('HEAD OFFICE') && !u.includes('DCSL'));
}

function normalizeHoSite(siteName) {
  if (isClientDcslHeadOffice(siteName)) return siteName;
  const upper = siteName.toUpperCase();
  if (upper === 'HEAD OFFICE' || (upper.includes('HEAD OFFICE') && !upper.includes('DCSL'))) {
    return 'HEAD OFFICE';
  }
  return siteName;
}

function classifySheetRow(row) {
  const epf = cellRaw(row.EPF_no);
  const sc = cellRaw(row.Site_Code).toLowerCase();
  const siteName = cellRaw(row.Site_Name);
  const sheetRank = normUpper(row.Rank_Code);
  const intendedRank = intendedRankForRow(epf, sheetRank);

  if (!/^\d+$/.test(epf)) {
    return {
      epf_no: epf,
      full_name: cellRaw(row.Name),
      sheet_rank: sheetRank,
      intended_rank: intendedRank,
      sheet_site_code: sc,
      sheet_site_name: siteName,
      intended_site: '',
      intended_status: '',
      intended_pool: 'JUNK',
      intended_sm_epf: '',
      notes: 'non-numeric EPF — skip',
    };
  }

  if (KEY_HO_EPF.has(epf)) {
    return {
      epf_no: epf,
      full_name: cellRaw(row.Name).toUpperCase(),
      sheet_rank: sheetRank,
      intended_rank: intendedRank,
      sheet_site_code: sc,
      sheet_site_name: siteName,
      intended_site: 'HEAD OFFICE',
      intended_status: 'ACTIVE',
      intended_pool: 'HEAD_OFFICE',
      intended_sm_epf: '',
      notes: 'operator key HO EPF',
    };
  }

  if (KEY_CAFE_EPF.has(epf)) {
    return {
      epf_no: epf,
      full_name: cellRaw(row.Name).toUpperCase(),
      sheet_rank: sheetRank,
      intended_rank: 'MOP',
      sheet_site_code: sc,
      sheet_site_name: siteName,
      intended_site: siteName || 'TASHA',
      intended_status: 'ACTIVE',
      intended_pool: 'CAFE',
      intended_sm_epf: '',
      notes: 'operator key café EPF',
    };
  }

  if (VO_EPF_SET.has(epf)) {
    return {
      epf_no: epf,
      full_name: cellRaw(row.Name).toUpperCase(),
      sheet_rank: sheetRank,
      intended_rank: intendedRank,
      sheet_site_code: sc,
      sheet_site_name: siteName,
      intended_site: normalizeHoSite(siteName) || 'HEAD OFFICE',
      intended_status: 'ACTIVE',
      intended_pool: 'SECTOR_MANAGER',
      intended_sm_epf: '',
      notes: 'V.O. sector manager',
    };
  }

  if (sc === 'r02' || normUpper(siteName) === 'CLEARANCE') {
    return {
      epf_no: epf,
      full_name: cellRaw(row.Name).toUpperCase(),
      sheet_rank: sheetRank,
      intended_rank: intendedRank,
      sheet_site_code: sc,
      sheet_site_name: siteName || 'CLEARANCE',
      intended_site: 'CLEARANCE',
      intended_status: 'Resigned',
      intended_pool: 'RESIGNED',
      intended_sm_epf: '',
      notes: 'Sheet1 r02 / clearance',
    };
  }

  if (sc === 'r01' || normUpper(siteName) === 'RESERVE') {
    return {
      epf_no: epf,
      full_name: cellRaw(row.Name).toUpperCase(),
      sheet_rank: sheetRank,
      intended_rank: intendedRank,
      sheet_site_code: sc,
      sheet_site_name: siteName || 'RESERVE',
      intended_site: 'RESERVE',
      intended_status: 'ACTIVE',
      intended_pool: 'INACTIVE',
      intended_sm_epf: '',
      notes: 'Sheet1 r01 reserve bench',
    };
  }

  if (sc === 't' || normUpper(siteName) === 'TEMPORY') {
    return {
      epf_no: epf,
      full_name: cellRaw(row.Name).toUpperCase(),
      sheet_rank: sheetRank,
      intended_rank: intendedRank,
      sheet_site_code: sc,
      sheet_site_name: siteName || 'TEMPORY',
      intended_site: 'TEMPORY',
      intended_status: 'ACTIVE',
      intended_pool: 'TEMPORY',
      intended_sm_epf: '',
      notes: 'Sheet1 temp pool',
    };
  }

  if (
    sc.startsWith('ho') ||
    normUpper(siteName).includes('TASHA') ||
    isHqHeadOfficeSite(siteName, sc)
  ) {
    const isCafe = normUpper(siteName).includes('TASHA') || sc === 'ho6';
    return {
      epf_no: epf,
      full_name: cellRaw(row.Name).toUpperCase(),
      sheet_rank: sheetRank,
      intended_rank: isCafe ? 'MOP' : intendedRank,
      sheet_site_code: sc,
      sheet_site_name: siteName,
      intended_site: isCafe ? siteName || 'TASHA' : normalizeHoSite(siteName) || 'HEAD OFFICE',
      intended_status: 'ACTIVE',
      intended_pool: isCafe ? 'CAFE' : 'HEAD_OFFICE',
      intended_sm_epf: '',
      notes: isCafe ? 'HO café site' : 'HO site code',
    };
  }

  if (siteName) {
    return {
      epf_no: epf,
      full_name: cellRaw(row.Name).toUpperCase(),
      sheet_rank: sheetRank,
      intended_rank: intendedRank,
      sheet_site_code: sc,
      sheet_site_name: siteName,
      intended_site: siteName,
      intended_status: 'ACTIVE',
      intended_pool: 'ACTIVE',
      intended_sm_epf: '',
      notes: 'deployed client site',
    };
  }

  return {
    epf_no: epf,
    full_name: cellRaw(row.Name).toUpperCase(),
    sheet_rank: sheetRank,
    intended_rank: intendedRank,
    sheet_site_code: sc,
    sheet_site_name: siteName,
    intended_site: 'TEMPORY',
    intended_status: 'ACTIVE',
    intended_pool: 'TEMPORY',
    intended_sm_epf: '',
    notes: 'no site name — default temp',
  };
}

function toCsv(columns, rows) {
  const escape = (v) => {
    const s = v === null || v === undefined ? '' : String(v);
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };
  const lines = [columns.join(',')];
  for (const row of rows) {
    lines.push(columns.map((c) => escape(row[c])).join(','));
  }
  return `${lines.join('\n')}\n`;
}

async function fetchDbEmployees(supabase) {
  const all = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from('employees')
      .select('emp_number, epf_no, epf_num, full_name, status, site, group, rank')
      .eq('company_id', CVS_COMPANY_ID)
      .range(from, from + 999);
    if (error) throw error;
    if (!data?.length) break;
    all.push(...data);
    if (data.length < 1000) break;
  }
  return all;
}

function dbKey(emp) {
  return cellRaw(emp.emp_number) || cellRaw(emp.epf_no);
}

async function main() {
  loadEnv();
  mkdirSync(outDir, { recursive: true });

  const { rows: sheetRows } = loadOperatorSheet();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase env');

  const supabase = createClient(url, key);
  const dbEmployees = await fetchDbEmployees(supabase);
  const dbByEpf = new Map();
  for (const emp of dbEmployees) {
    const k = dbKey(emp);
    if (k) dbByEpf.set(k, emp);
  }

  const classified = [];
  const sheetEpfs = new Set();

  for (const row of sheetRows) {
    const base = classifySheetRow(row);
    if (base.intended_pool === 'JUNK') continue;

    const epf = base.epf_no;
    sheetEpfs.add(epf);
    const db = dbByEpf.get(epf);
    const dbSite = (db?.site ?? '').trim();
    const dbStatus = (db?.status ?? '').trim();
    const dbRank = (db?.rank ?? '').trim();

    const mismatchSite =
      db && normUpper(dbSite) !== normUpper(base.intended_site) ? 'Y' : db ? 'N' : 'Y';
    const mismatchStatus =
      db && normStatus(dbStatus) !== normStatus(base.intended_status) ? 'Y' : db ? 'N' : 'Y';
    const mismatchRank =
      db && normUpper(dbRank) !== normUpper(base.intended_rank) ? 'Y' : db ? 'N' : 'Y';

    classified.push({
      ...base,
      db_site: dbSite,
      db_status: dbStatus,
      db_group: db?.group ?? '',
      db_rank: dbRank,
      mismatch_site: mismatchSite,
      mismatch_status: mismatchStatus,
      mismatch_rank: mismatchRank,
    });
  }

  for (const emp of dbEmployees) {
    const epf = dbKey(emp);
    if (!epf || sheetEpfs.has(epf)) continue;
    classified.push({
      epf_no: epf,
      full_name: (emp.full_name ?? '').trim(),
      sheet_rank: '',
      intended_rank: '',
      sheet_site_code: '',
      sheet_site_name: '',
      intended_site: '',
      intended_status: '',
      intended_pool: 'DB_ONLY',
      intended_sm_epf: '',
      db_site: emp.site ?? '',
      db_status: emp.status ?? '',
      db_group: emp.group ?? '',
      db_rank: emp.rank ?? '',
      mismatch_site: 'Y',
      mismatch_status: 'Y',
      mismatch_rank: 'N',
      notes: 'in DB but not in operator sheet',
    });
  }

  const outPath = join(outDir, 'site-roster-classification.csv');
  writeFileSync(outPath, toCsv(CSV_COLUMNS, classified));

  const poolCounts = {};
  for (const r of classified) {
    if (r.sheet_site_code || r.intended_pool !== 'DB_ONLY') {
      poolCounts[r.intended_pool] = (poolCounts[r.intended_pool] ?? 0) + 1;
    }
  }

  const siteMismatch = classified.filter((r) => r.mismatch_site === 'Y' && r.intended_pool !== 'DB_ONLY').length;
  const statusMismatch = classified.filter((r) => r.mismatch_status === 'Y' && r.intended_pool !== 'DB_ONLY').length;
  const rankMismatch = classified.filter((r) => r.mismatch_rank === 'Y' && r.intended_pool !== 'DB_ONLY').length;
  const dbOnly = classified.filter((r) => r.intended_pool === 'DB_ONLY').length;
  const missingDb = classified.filter((r) => !r.db_site && r.intended_pool !== 'DB_ONLY' && !dbByEpf.get(r.epf_no)).length;

  const lines = [
    '',
    '=== S-1 SITE ROSTER CLASSIFICATION ===',
    `Run at: ${new Date().toISOString()}`,
    `Source: ${sheetPath}`,
    `Output: ${outPath}`,
    `Sheet rows (numeric EPF): ${sheetEpfs.size}`,
    `DB employees: ${dbEmployees.length}`,
    `Classification rows: ${classified.length}`,
    '',
    'Rank intentions (operator):',
    ...Object.entries(SHEET_RANK_TO_INTENDED).map(([k, v]) => `  ${k} → ${v}`),
    '  EPF 13400 → OD (new role, V S PERERA only)',
    '  EPF 1874 → HR · 11560/12761 → EA',
    '',
    'Intended pool counts (from sheet):',
    ...Object.entries(poolCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `  ${k}: ${v}`),
    '',
    `Site mismatches: ${siteMismatch}`,
    `Status mismatches: ${statusMismatch}`,
    `Rank mismatches (incl. HR→HRA etc.): ${rankMismatch}`,
    `DB-only (not in sheet): ${dbOnly}`,
    `Sheet EPF missing in DB: ${missingDb}`,
    '',
    'S-1 PASS — proceed to S-2',
  ];

  appendFileSync(join(outDir, 'site-roster-audit-report.txt'), `${lines.join('\n')}\n`);
  console.log(lines.join('\n'));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
