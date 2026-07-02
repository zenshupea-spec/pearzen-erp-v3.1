/**
 * D-3 — Build remediation-classification.csv for CVS MNR remediation.
 *
 * Usage: node scripts/build-cvs-mnr-remediation-classification.mjs
 *
 * Reads legacy archives + live Supabase CVS tenant; writes:
 *   data/migration/classic-venture/remediation-classification.csv
 * Appends summary to remediation-audit-report.txt
 */

import { createRequire } from 'module';
import { readFileSync, existsSync, writeFileSync, appendFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const XLSX = require(join(root, 'node_modules/xlsx'));
const outDir = join(root, 'data/migration/classic-venture');
const archive = join(outDir, 'archive/legacy-sources');
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

const CSV_COLUMNS = [
  'epf_no',
  'full_name',
  'mnr_loc_code',
  'sheet1_site_code',
  'sheet1_site_name',
  'intended_site',
  'intended_status',
  'intended_sm_epf',
  'bucket',
  'db_site',
  'db_status',
  'db_group',
  'db_rank',
  'mismatch_site',
  'mismatch_status',
  'mismatch_sm_link',
  'notes',
];

function cellRaw(value) {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).trim();
}

function normStatus(s) {
  return (s ?? '').trim().toLowerCase();
}

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

function loadLegacy() {
  const mnrPath = join(archive, 'MASTER-NOMINAL-ROLL.xlsx');
  const sitesPath = join(archive, 'SITE-CODE-AND-NAMES.xls');
  if (!existsSync(mnrPath) || !existsSync(sitesPath)) {
    throw new Error('Legacy archive files missing under data/migration/classic-venture/archive/legacy-sources/');
  }

  const mnrWb = XLSX.readFile(mnrPath, { cellDates: true });
  const sitesWb = XLSX.readFile(sitesPath, { cellDates: true });
  const mnr = XLSX.utils.sheet_to_json(mnrWb.Sheets.Sheet1, { defval: '' });

  const siteAssignRaw = XLSX.utils.sheet_to_json(sitesWb.Sheets.Sheet1, {
    header: 1,
    defval: '',
    raw: false,
  });
  const siteAssign = siteAssignRaw
    .filter((row) => {
      const empNo = cellRaw(row[1]).replace(/,/g, '');
      return empNo && /^\d+$/.test(empNo);
    })
    .map((row) => ({
      emp_no: cellRaw(row[1]).replace(/,/g, ''),
      site_code: cellRaw(row[6]).trim(),
      site_name: cellRaw(row[8]).trim(),
    }));

  const siteByEpf = new Map(siteAssign.map((r) => [r.emp_no, r]));

  return { mnr, siteByEpf };
}

function lookupSiteAssignment(row, siteByEpf) {
  const epf = cellRaw(row.EPF_no);
  const empNo = cellRaw(row.Emp_no);
  return siteByEpf.get(epf) ?? siteByEpf.get(empNo) ?? null;
}

function pickMnrRowForEpf(epf, rows, siteByEpf) {
  const active = rows.filter((r) => r.ACT_YN === true || r.ACT_YN === 'TRUE' || r.ACT_YN === 1);
  const pool = active.length ? active : rows;
  const inSheet = pool.filter((r) => lookupSiteAssignment(r, siteByEpf));
  if (inSheet.length === 1) return inSheet[0];
  if (inSheet.length > 1) {
    return inSheet.sort((a, b) => Number(a.Emp_no) - Number(b.Emp_no))[0];
  }
  if (pool.length === 1) return pool[0];
  return pool.sort((a, b) => Number(a.Emp_no) - Number(b.Emp_no))[0];
}

function dedupeActiveMnr(mnr, siteByEpf) {
  const byEpf = new Map();
  for (const row of mnr) {
    const epf = cellRaw(row.EPF_no);
    if (!epf) continue;
    if (!byEpf.has(epf)) byEpf.set(epf, []);
    byEpf.get(epf).push(row);
  }

  const chosen = [];
  for (const rows of byEpf.values()) {
    const activeRows = rows.filter((r) => r.ACT_YN === true || r.ACT_YN === 'TRUE' || r.ACT_YN === 1);
    if (!activeRows.length) continue;
    if (activeRows.length === 1) {
      chosen.push(activeRows[0]);
      continue;
    }
    const epf = cellRaw(activeRows[0].EPF_no);
    chosen.push(pickMnrRowForEpf(epf, activeRows, siteByEpf));
  }
  return chosen;
}

function isResignedMnr(row) {
  return row.Resign === true || row.Resign === 'TRUE' || row.Resign === 1;
}

function classifyRow(row, assign) {
  const epf = cellRaw(row.EPF_no);
  const loc = cellRaw(row.Loc_code).toUpperCase();
  const sc = (assign?.site_code ?? '').trim().toLowerCase();
  const siteName = (assign?.site_name ?? '').trim();
  const notes = [];

  if (KEY_HO_EPF.has(epf)) {
    return {
      mnr_loc_code: loc,
      sheet1_site_code: assign?.site_code ?? '',
      sheet1_site_name: siteName,
      intended_site: 'HEAD OFFICE',
      intended_status: 'ACTIVE',
      intended_sm_epf: '',
      bucket: 'HEAD_OFFICE',
      notes: 'operator key HO EPF',
    };
  }

  if (KEY_CAFE_EPF.has(epf)) {
    return {
      mnr_loc_code: loc,
      sheet1_site_code: assign?.site_code ?? '',
      sheet1_site_name: siteName,
      intended_site: siteName || 'TASHA',
      intended_status: 'ACTIVE',
      intended_sm_epf: '',
      bucket: 'OTHER',
      notes: 'operator key café EPF → CAFE/MOP in F-6',
    };
  }

  if (VO_EPF_SET.has(epf)) {
    return {
      mnr_loc_code: loc,
      sheet1_site_code: assign?.site_code ?? '',
      sheet1_site_name: siteName,
      intended_site: siteName || 'HEAD OFFICE',
      intended_status: 'ACTIVE',
      intended_sm_epf: '',
      bucket: 'OTHER',
      notes: 'V.O. sector manager',
    };
  }

  if (isResignedMnr(row) || sc === 'r02') {
    return {
      mnr_loc_code: loc,
      sheet1_site_code: assign?.site_code ?? '',
      sheet1_site_name: siteName || 'CLEARANCE',
      intended_site: siteName || 'CLEARANCE',
      intended_status: 'Resigned',
      intended_sm_epf: '',
      bucket: 'RESIGNED',
      notes: sc === 'r02' ? 'Sheet1 r02' : 'MNR Resign flag',
    };
  }

  if (sc === 'r01') {
    return {
      mnr_loc_code: loc,
      sheet1_site_code: assign?.site_code ?? '',
      sheet1_site_name: siteName || 'RESERVE',
      intended_site: 'RESERVE',
      intended_status: 'ACTIVE',
      intended_sm_epf: '',
      bucket: 'RESERVE',
      notes: 'Sheet1 r01 reserve pool',
    };
  }

  if (sc === 't') {
    return {
      mnr_loc_code: loc,
      sheet1_site_code: assign?.site_code ?? '',
      sheet1_site_name: siteName || 'TEMPORY',
      intended_site: 'TEMPORY',
      intended_status: 'ACTIVE',
      intended_sm_epf: '',
      bucket: 'TEMP',
      notes: 'Sheet1 temp pool',
    };
  }

  if (/^ho\d+$/i.test(sc) || siteName.toUpperCase() === 'HEAD OFFICE') {
    return {
      mnr_loc_code: loc,
      sheet1_site_code: assign?.site_code ?? '',
      sheet1_site_name: siteName,
      intended_site: 'HEAD OFFICE',
      intended_status: 'ACTIVE',
      intended_sm_epf: '',
      bucket: 'HEAD_OFFICE',
      notes: 'HO site code',
    };
  }

  if (!assign) {
    notes.push('no Sheet1 match');
    return {
      mnr_loc_code: loc,
      sheet1_site_code: '',
      sheet1_site_name: '',
      intended_site: 'TEMPORY',
      intended_status: 'ACTIVE',
      intended_sm_epf: '',
      bucket: 'OTHER',
      notes: notes.join('; '),
    };
  }

  const smEpf = VO_EPF_BY_LOC[loc] ?? '';
  if (smEpf && sc && !['r01', 'r02', 't'].includes(sc)) {
    return {
      mnr_loc_code: loc,
      sheet1_site_code: assign.site_code,
      sheet1_site_name: siteName,
      intended_site: siteName,
      intended_status: 'ACTIVE',
      intended_sm_epf: smEpf,
      bucket: 'DEPLOYED',
      notes: `Loc ${loc} → SM ${smEpf}`,
    };
  }

  return {
    mnr_loc_code: loc,
    sheet1_site_code: assign.site_code,
    sheet1_site_name: siteName,
    intended_site: siteName,
    intended_status: 'ACTIVE',
    intended_sm_epf: smEpf,
    bucket: 'OTHER',
    notes: smEpf ? `real site, Loc ${loc}` : `real site, no V.O. sector`,
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

async function fetchSmLinks(supabase) {
  const all = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from('sm_guard_assignments')
      .select('sm_epf, guard_epf')
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

  const { mnr, siteByEpf } = loadLegacy();
  const activeRows = dedupeActiveMnr(mnr, siteByEpf);

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase env');

  const supabase = createClient(url, key);
  const [dbEmployees, smLinks] = await Promise.all([
    fetchDbEmployees(supabase),
    fetchSmLinks(supabase),
  ]);

  const dbByEpf = new Map();
  for (const emp of dbEmployees) {
    const k = dbKey(emp);
    if (k) dbByEpf.set(k, emp);
  }

  const smByGuard = new Map();
  for (const link of smLinks) {
    if (link.guard_epf) smByGuard.set(String(link.guard_epf), String(link.sm_epf));
  }

  const classified = [];
  const classifiedEpf = new Set();

  for (const row of activeRows) {
    const epf = cellRaw(row.EPF_no);
    const assign = lookupSiteAssignment(row, siteByEpf);
    const c = classifyRow(row, assign);
    const db = dbByEpf.get(epf);

    const dbSite = (db?.site ?? '').trim();
    const dbStatus = (db?.status ?? '').trim();
    const mismatchSite = db ? dbSite.toUpperCase() !== c.intended_site.toUpperCase() : true;
    const mismatchStatus = db
      ? normStatus(dbStatus) !== normStatus(c.intended_status)
      : true;
    const needsSm = c.bucket === 'DEPLOYED' && c.intended_sm_epf;
    const dbSm = smByGuard.get(epf) ?? '';
    const mismatchSm = needsSm ? dbSm !== c.intended_sm_epf : false;

    classified.push({
      epf_no: epf,
      full_name: cellRaw(row.Name).toUpperCase(),
      ...c,
      db_site: dbSite,
      db_status: dbStatus,
      db_group: db?.group ?? '',
      db_rank: db?.rank ?? '',
      mismatch_site: mismatchSite ? 'Y' : 'N',
      mismatch_status: mismatchStatus ? 'Y' : 'N',
      mismatch_sm_link: mismatchSm ? 'Y' : 'N',
    });
    classifiedEpf.add(epf);
  }

  for (const emp of dbEmployees) {
    const epf = dbKey(emp);
    if (!epf || classifiedEpf.has(epf)) continue;
    classified.push({
      epf_no: epf,
      full_name: (emp.full_name ?? '').trim(),
      mnr_loc_code: '',
      sheet1_site_code: '',
      sheet1_site_name: '',
      intended_site: (emp.site ?? '').trim(),
      intended_status: (emp.status ?? '').trim(),
      intended_sm_epf: smByGuard.get(epf) ?? '',
      bucket: 'OTHER',
      db_site: (emp.site ?? '').trim(),
      db_status: (emp.status ?? '').trim(),
      db_group: emp.group ?? '',
      db_rank: emp.rank ?? '',
      mismatch_site: 'N',
      mismatch_status: 'N',
      mismatch_sm_link: 'N',
      notes: 'DB-only row (seed/test — not in ACT_YN MNR scope)',
    });
  }

  classified.sort((a, b) => a.epf_no.localeCompare(b.epf_no, undefined, { numeric: true }));

  const csvPath = join(outDir, 'remediation-classification.csv');
  writeFileSync(csvPath, toCsv(CSV_COLUMNS, classified));

  const bucketCounts = {};
  for (const row of classified) {
    bucketCounts[row.bucket] = (bucketCounts[row.bucket] ?? 0) + 1;
  }

  const mismatchStatus = classified.filter((r) => r.mismatch_status === 'Y').length;
  const mismatchSite = classified.filter((r) => r.mismatch_site === 'Y').length;
  const clearanceActive = classified.filter(
    (r) =>
      r.bucket === 'RESIGNED' &&
      normStatus(r.db_status) === 'active',
  ).length;
  const deployedSmMiss = classified.filter((r) => r.mismatch_sm_link === 'Y').length;
  const deployedReserveError = classified.filter(
    (r) => r.bucket === 'DEPLOYED' && (r.db_site ?? '').toUpperCase() === 'RESERVE',
  ).length;

  const lines = [];
  lines.push('');
  lines.push('=== D-3 REMEDIATION CLASSIFICATION ===');
  lines.push(`Run at: ${new Date().toISOString()}`);
  lines.push(`Output: ${csvPath}`);
  lines.push(`Rows: ${classified.length} (${activeRows.length} ACT_YN MNR + ${classified.length - activeRows.length} DB-only)`);
  lines.push('');
  lines.push('Bucket counts:');
  for (const [bucket, count] of Object.entries(bucketCounts).sort((a, b) => b[1] - a[1])) {
    lines.push(`  ${bucket}: ${count}`);
  }
  lines.push('');
  lines.push('Mismatch vs current DB:');
  lines.push(`  status mismatch: ${mismatchStatus}`);
  lines.push(`  site mismatch: ${mismatchSite}`);
  lines.push(`  RESIGNED bucket but DB still ACTIVE: ${clearanceActive}`);
  lines.push(`  DEPLOYED on DB site RESERVE (critical): ${deployedReserveError}`);
  lines.push(`  DEPLOYED missing/wrong SM link: ${deployedSmMiss}`);
  lines.push('');
  lines.push('D-3 COMPLETE — proceed to D-4 (V.O. sector manager verification)');

  appendFileSync(join(outDir, 'remediation-audit-report.txt'), `${lines.join('\n')}\n`);
  console.log(lines.join('\n'));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
