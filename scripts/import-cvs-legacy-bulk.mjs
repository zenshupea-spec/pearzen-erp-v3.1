/**
 * C-2 — Apply CVS legacy staging workbook to Supabase (local dry-run).
 * Run: node scripts/import-cvs-legacy-bulk.mjs [--dry-run] [--skip-ranks]
 */

import { createRequire } from 'module';
import { readFileSync, existsSync, writeFileSync, mkdtempSync, rmSync } from 'fs';
import { execSync } from 'child_process';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import { encrypt } from '../apps/back-office/lib/encryption.js';

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const legacyOutDir = join(root, 'data/migration/classic-venture');
const XLSX = require(join(root, 'node_modules/xlsx'));
const CVS_COMPANY_ID = '29fbb2ff-6aa6-46c4-8b2d-d19eebb2874e';
const stagingPath = (() => {
  const candidates = [
    'pearzen-migration-import-CLASSIC-VENTURE-STAGING.xlsx',
    'pearzen-roster-import-CLASSIC-VENTURE-STAGING.xlsx',
    'pearzen-bulk-import-CLASSIC-VENTURE-STAGING.xlsx',
  ];
  for (const name of candidates) {
    const path = join(root, 'data/migration/classic-venture', name);
    if (existsSync(path)) return path;
  }
  return join(root, 'data/migration/classic-venture', candidates[0]);
})();

const EMPLOYEE_COLUMNS = [
  'employee_id', 'emp_number', 'full_name', 'nic', 'passport_no', 'epf_no', 'phone',
  'dob', 'gender', 'nationality', 'religion', 'home_address', 'role', 'group', 'rank',
  'site', 'date_joined', 'status', 'base_salary', 'salary_type', 'epf_yn', 'bank_code',
  'bank_name', 'branch_code', 'account_number', 'mod_expiry', 'police_expiry', 'maternity_leave',
];

const SITE_COLUMNS = [
  'site_id', 'site_name', 'site_type', 'address', 'required_guards', 'assigned_sm_epf',
  'latitude', 'longitude', 'geofence_radius_m', 'verification_mode', 'provides_food',
  'food_allowance_lkr', 'provides_accommodation', 'nfc_tag_id',
];

const ENCRYPTED_FIELDS = [
  'nic', 'phone', 'passport_no', 'home_address', 'bank_code', 'branch_code', 'account_number',
];

const SITE_TYPES = new Set(['OFFICE', 'BANK', 'PHARMACY', 'STORAGE', 'HOTEL', 'RESIDENTIAL', 'OTHER']);
const VERIFICATION_MODES = new Set(['A', 'B', 'C']);
const DEFAULT_GEOFENCE_RADIUS_M = 10;

const CORPORATE_GROUP_OPS = {
  GUARD: ['GUARD_FIELD', 'GUARD'],
  SECTOR_MANAGER: ['SECTOR_MANAGER'],
  HEAD_OFFICE: ['HEAD_OFFICE'],
  CAFE: ['CAFE'],
};

const DEFAULT_RANK_MATRIX = [
  { rank_code: 'CSO', full_title: 'CHIEF SECURITY OFFICER', basic_pay: 35000, salary_type: 'BANK', operational_group: 'GUARD_FIELD', annual_increment: 2000 },
  { rank_code: 'OIC', full_title: 'OFFICER IN CHARGE', basic_pay: 33000, salary_type: 'BANK', operational_group: 'GUARD_FIELD', annual_increment: 1800 },
  { rank_code: 'SSO', full_title: 'SENIOR SECURITY OFFICER', basic_pay: 32000, salary_type: 'BANK', operational_group: 'GUARD_FIELD', annual_increment: 1500 },
  { rank_code: 'JSO', full_title: 'JUNIOR SECURITY OFFICER', basic_pay: 30000, salary_type: 'BANK', operational_group: 'GUARD_FIELD', annual_increment: 1200 },
  { rank_code: 'LSO', full_title: 'LADY SECURITY OFFICER', basic_pay: 30000, salary_type: 'BANK', operational_group: 'GUARD_FIELD', annual_increment: 1200 },
];

function loadLegacyMigrationRankMatrix() {
  const byCode = new Map(DEFAULT_RANK_MATRIX.map((r) => [r.rank_code, { ...r }]));
  const tsvPath = join(legacyOutDir, 'ranks-to-add.tsv');
  if (!existsSync(tsvPath)) return [...byCode.values()];

  const lines = readFileSync(tsvPath, 'utf8').split('\n');
  for (const line of lines) {
    if (!line.trim() || line.startsWith('CVS') || line.startsWith('Generated') || line.startsWith('Scope')) continue;
    if (line.startsWith('rank_code')) continue;
    const [rank_code, , , operational_group, median_basic, suggested_title] = line.split('\t');
    if (!rank_code?.trim()) continue;
    const code = rank_code.trim().toUpperCase();
    byCode.set(code, {
      rank_code: code,
      full_title: (suggested_title ?? code).trim().toUpperCase(),
      basic_pay: Number(median_basic) || 30000,
      salary_type: 'BANK',
      operational_group: (operational_group ?? 'GUARD_FIELD').trim(),
      annual_increment: 1200,
    });
  }
  return normalizeRankMatrixEntries([...byCode.values()]);
}

const args = new Set(process.argv.slice(2));
const dryRun = args.has('--dry-run');
const skipRanks = args.has('--skip-ranks');

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

function cellStr(value) {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).trim();
}

function parseBool(value) {
  const s = cellStr(value).toUpperCase();
  return s === 'TRUE' || s === 'YES' || s === '1' || s === 'Y';
}

function parseOptionalNumber(value) {
  const s = cellStr(value);
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function isBlankRow(row, keys) {
  return keys.every((key) => {
    const v = row[key];
    return v === '' || v === null || v === undefined;
  });
}

function clampGeofenceRadiusM(value) {
  if (!Number.isFinite(value)) return DEFAULT_GEOFENCE_RADIUS_M;
  return Math.min(500, Math.max(5, Math.round(value)));
}

function encryptPiiValue(value) {
  if (value == null || value === '') return null;
  const str = String(value).trim();
  if (!str) return null;
  return encrypt(str);
}

function encryptEmployeeRecord(record) {
  const out = { ...record };
  for (const field of ENCRYPTED_FIELDS) {
    if (!(field in out)) continue;
    const raw = out[field];
    if (raw == null || raw === '') {
      out[field] = null;
      continue;
    }
    out[field] = encryptPiiValue(raw);
  }
  return out;
}

function normalizeRankMatrixEntries(rows) {
  return rows
    .map((row) => {
      const rankCode = cellStr(row.rank_code ?? row.rankCode).toUpperCase();
      const fullTitle = cellStr(row.full_title ?? row.fullTitle).toUpperCase();
      if (!rankCode || !fullTitle) return null;
      return {
        id: `rp-${rankCode.toLowerCase()}`,
        rankCode,
        fullTitle,
        basicPay: Math.max(0, Math.round(Number(row.basic_pay ?? row.basicPay) || 0)),
        annualIncrement: Math.max(
          0,
          Math.round(Number(row.annual_increment ?? row.annualIncrement) || 0),
        ),
        salaryType:
          cellStr(row.salary_type ?? row.salaryType).toUpperCase() === 'CASH' ? 'CASH' : 'BANK',
        operationalGroup:
          cellStr(row.operational_group ?? row.operationalGroup) || 'GUARD_FIELD',
      };
    })
    .filter(Boolean);
}

function parseRankMatrixSheet(wb) {
  const rows = XLSX.utils.sheet_to_json(wb.Sheets.Rank_Matrix ?? {}, { defval: '' });
  return normalizeRankMatrixEntries(rows);
}

function ranksForCorporateGroup(matrix, corporateGroup) {
  const ops = CORPORATE_GROUP_OPS[cellStr(corporateGroup).toUpperCase()];
  if (!ops) return [];
  return matrix.filter((r) => ops.includes(r.operationalGroup));
}

function isRankInMatrix(matrix, rank) {
  if (!cellStr(rank)) return true;
  const code = cellStr(rank).toUpperCase();
  return matrix.some((r) => r.rankCode === code);
}

function isRankValidForCorporateGroup(matrix, corporateGroup, rank) {
  if (!cellStr(rank)) return false;
  const code = cellStr(rank).toUpperCase();
  return ranksForCorporateGroup(matrix, corporateGroup).some((r) => r.rankCode === code);
}

function parseMultiSheetMigrationWorkbook(buffer) {
  const converter = join(root, 'scripts/lib/migration-workbook-legacy-shape.mts');
  const tmpDir = mkdtempSync(join(tmpdir(), 'cvs-migration-import-'));
  const tmpXlsx = join(tmpDir, 'workbook.xlsx');
  writeFileSync(tmpXlsx, buffer);
  try {
    const json = execSync(`npx tsx "${converter}" "${tmpXlsx}"`, {
      cwd: root,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    });
    return JSON.parse(json);
  } catch (err) {
    if (err.status === 2) return null;
    throw err;
  } finally {
    try {
      rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
}

function parseWorkbook(buffer) {
  const multi = parseMultiSheetMigrationWorkbook(buffer);
  if (multi) {
    return {
      wb: null,
      employees: multi.employees,
      sites: multi.sites,
      smGuardLinks: multi.smGuardLinks,
      multiSheet: true,
    };
  }

  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const employees = XLSX.utils.sheet_to_json(wb.Sheets.Employees ?? {}, { defval: '' })
    .filter((row) => !isBlankRow(row, EMPLOYEE_COLUMNS));
  const sites = XLSX.utils.sheet_to_json(wb.Sheets.Sites ?? {}, { defval: '' })
    .filter((row) => !isBlankRow(row, SITE_COLUMNS))
    .filter((row) => cellStr(row.site_name) || cellStr(row.site_id));
  const smGuardLinks = XLSX.utils.sheet_to_json(wb.Sheets.SM_Guard_Links ?? {}, { defval: '' })
    .filter((row) => !isBlankRow(row, ['sm_epf', 'guard_epf']));
  return { wb, employees, sites, smGuardLinks, multiSheet: false };
}

function validateBulkImport(parsed, rankMatrix) {
  const errors = [];
  if (!parsed.employees.length && !parsed.sites.length && !parsed.smGuardLinks.length) {
    errors.push('Workbook has no data rows.');
    return errors;
  }

  const empNumbers = new Set();
  parsed.employees.forEach((row, index) => {
    const line = index + 2;
    const empNumber = cellStr(row.emp_number).toUpperCase();
    const fullName = cellStr(row.full_name);
    const employeeId = cellStr(row.employee_id);
    if (!empNumber && !employeeId) errors.push(`Employees row ${line}: emp_number or employee_id required.`);
    if (!fullName) errors.push(`Employees row ${line}: full_name required.`);
    if (empNumber) {
      if (empNumbers.has(empNumber)) errors.push(`Employees row ${line}: duplicate emp_number "${empNumber}".`);
      empNumbers.add(empNumber);
    }
    const group = cellStr(row.group);
    const rank = cellStr(row.rank).toUpperCase();
    if (rank) {
      if (group) {
        if (!isRankValidForCorporateGroup(rankMatrix, group, rank)) {
          errors.push(`Employees row ${line}: rank "${rank}" not valid for group "${group}".`);
        }
      } else if (!isRankInMatrix(rankMatrix, rank)) {
        errors.push(`Employees row ${line}: rank "${rank}" not in Rank Pay Matrix.`);
      }
    }
  });

  const siteNames = new Set();
  parsed.sites.forEach((row, index) => {
    const line = index + 2;
    const siteName = cellStr(row.site_name);
    const siteId = cellStr(row.site_id);
    if (!siteName && !siteId) errors.push(`Sites row ${line}: site_name or site_id required.`);
    if (siteName) {
      const key = siteName.toLowerCase();
      if (siteNames.has(key)) errors.push(`Sites row ${line}: duplicate site_name "${siteName}".`);
      siteNames.add(key);
    }
    const siteType = cellStr(row.site_type).toUpperCase();
    if (siteType && !SITE_TYPES.has(siteType)) {
      errors.push(`Sites row ${line}: invalid site_type "${siteType}".`);
    }
  });

  parsed.smGuardLinks.forEach((row, index) => {
    const line = index + 2;
    if (!cellStr(row.sm_epf) || !cellStr(row.guard_epf)) {
      errors.push(`SM_Guard_Links row ${line}: sm_epf and guard_epf required.`);
    }
  });

  return errors;
}

function mapEmployeeImportRow(row) {
  const empNumber = cellStr(row.emp_number).toUpperCase();
  const rank = cellStr(row.rank).toUpperCase() || null;
  const group = cellStr(row.group).toUpperCase() || null;
  const baseSalary = parseOptionalNumber(row.base_salary);
  return {
    employeeId: cellStr(row.employee_id) || null,
    empNumber: empNumber || null,
    payload: {
      emp_number: empNumber || undefined,
      full_name: cellStr(row.full_name).toUpperCase(),
      passport_no: cellStr(row.passport_no).toUpperCase() || null,
      epf_no: cellStr(row.epf_no) || null,
      dob: cellStr(row.dob) || null,
      gender: cellStr(row.gender).toUpperCase() || null,
      nationality: cellStr(row.nationality).toUpperCase() || null,
      religion: cellStr(row.religion).toUpperCase() || null,
      home_address: cellStr(row.home_address).toUpperCase() || null,
      role: cellStr(row.role).toUpperCase() || null,
      group,
      rank,
      site: cellStr(row.site) || null,
      date_joined: cellStr(row.date_joined) || null,
      status: cellStr(row.status) || 'ACTIVE',
      base_salary: baseSalary,
      salary_type: cellStr(row.salary_type).toUpperCase() || null,
      epf_yn: parseBool(row.epf_yn),
      bank_code: cellStr(row.bank_code) || null,
      bank_name: cellStr(row.bank_name).toUpperCase() || null,
      branch_code: cellStr(row.branch_code) || null,
      account_number: cellStr(row.account_number) || null,
      mod_expiry: cellStr(row.mod_expiry) || null,
      police_expiry: cellStr(row.police_expiry) || null,
      maternity_leave: parseBool(row.maternity_leave),
      nicPlain: cellStr(row.nic).toUpperCase(),
      phonePlain: cellStr(row.phone),
    },
  };
}

function mapSiteImportRow(row) {
  const lat = parseOptionalNumber(row.latitude);
  const lng = parseOptionalNumber(row.longitude);
  const radius = parseOptionalNumber(row.geofence_radius_m);
  return {
    siteId: cellStr(row.site_id) || null,
    siteName: cellStr(row.site_name),
    payload: {
      site_name: cellStr(row.site_name),
      site_type: cellStr(row.site_type).toUpperCase() || 'OTHER',
      address: cellStr(row.address).toUpperCase() || null,
      required_guards: parseOptionalNumber(row.required_guards) ?? 1,
      assigned_sm_epf: cellStr(row.assigned_sm_epf).toUpperCase() || null,
      latitude: lat,
      longitude: lng,
      geofence_radius: radius,
      verification_mode: cellStr(row.verification_mode).toUpperCase() || 'B',
      provides_food: parseBool(row.provides_food),
      food_allowance_lkr: parseOptionalNumber(row.food_allowance_lkr) ?? 0,
      provides_accommodation: parseBool(row.provides_accommodation),
      nfc_tag_id: cellStr(row.nfc_tag_id) || null,
      needs_om_gps_capture: lat == null || lng == null,
    },
  };
}

async function seedRankMatrix(supabase, rankMatrix) {
  if (!rankMatrix.length) throw new Error('Rank_Matrix sheet is empty.');
  const { data: existing, error: fetchErr } = await supabase
    .from('md_settings')
    .select('id')
    .eq('company_id', CVS_COMPANY_ID)
    .maybeSingle();
  if (fetchErr) throw new Error(`Rank matrix lookup: ${fetchErr.message}`);

  if (existing?.id) {
    const { error } = await supabase
      .from('md_settings')
      .update({ rank_pay_matrix: rankMatrix })
      .eq('company_id', CVS_COMPANY_ID);
    if (error) throw new Error(`Rank matrix update: ${error.message}`);
  } else {
    const { error } = await supabase.from('md_settings').insert({
      company_id: CVS_COMPANY_ID,
      rank_pay_matrix: rankMatrix,
      default_geofence_radius_m: DEFAULT_GEOFENCE_RADIUS_M,
    });
    if (error) throw new Error(`Rank matrix insert: ${error.message}`);
  }
  return rankMatrix.length;
}

async function fetchAllRows(supabase, table, companyId, columns) {
  const pageSize = 1000;
  const rows = [];
  for (let from = 0; ; from += pageSize) {
    let q = supabase.from(table).select(columns).range(from, from + pageSize - 1);
    if (companyId) q = q.eq('company_id', companyId);
    const { data, error } = await q;
    if (error) throw new Error(`${table} fetch: ${error.message}`);
    if (!data?.length) break;
    rows.push(...data);
    if (data.length < pageSize) break;
  }
  return rows;
}

async function batchInsert(supabase, table, records, batchSize = 200) {
  for (let i = 0; i < records.length; i += batchSize) {
    const chunk = records.slice(i, i + batchSize);
    const { error } = await supabase.from(table).insert(chunk);
    if (error) throw new Error(`${table} batch insert (${i}): ${error.message}`);
  }
  return records.length;
}

async function applyBulkImport(supabase, parsed) {
  const summary = {
    employeesInserted: 0,
    employeesUpdated: 0,
    sitesInserted: 0,
    sitesUpdated: 0,
    smLinksUpserted: 0,
  };

  const existingEmployees = await fetchAllRows(
    supabase,
    'employees',
    CVS_COMPANY_ID,
    'id, emp_number, epf_no',
  );
  const byEmp = new Map(
    existingEmployees.map((e) => [cellStr(e.emp_number).toUpperCase(), e.id]),
  );
  const byEpf = new Map(
    existingEmployees
      .filter((e) => cellStr(e.epf_no))
      .map((e) => [cellStr(e.epf_no), e.id]),
  );

  const employeeInserts = [];
  const employeeUpdates = [];

  for (const row of parsed.employees) {
    const { employeeId, empNumber, payload } = mapEmployeeImportRow(row);
    const record = encryptEmployeeRecord({
      ...payload,
      company_id: CVS_COMPANY_ID,
      nic: payload.nicPlain || null,
      phone: payload.phonePlain || null,
    });
    delete record.nicPlain;
    delete record.phonePlain;

    if (employeeId) {
      employeeUpdates.push({ id: employeeId, record });
      continue;
    }

    if (!empNumber) throw new Error(`Employee "${payload.full_name}" missing emp_number.`);

    const existingId =
      byEmp.get(empNumber) ?? (payload.epf_no ? byEpf.get(payload.epf_no) : null) ?? null;

    if (existingId) {
      employeeUpdates.push({ id: existingId, record });
    } else {
      employeeInserts.push(record);
      byEmp.set(empNumber, 'pending');
      if (payload.epf_no) byEpf.set(payload.epf_no, 'pending');
    }
  }

  console.log(`  Employee batches: ${employeeInserts.length} insert, ${employeeUpdates.length} update`);
  summary.employeesInserted = await batchInsert(supabase, 'employees', employeeInserts);

  for (let i = 0; i < employeeUpdates.length; i++) {
    const { id, record } = employeeUpdates[i];
    const { error } = await supabase.from('employees').update(record).eq('id', id);
    if (error) throw new Error(`Employee update (${id}): ${error.message}`);
    summary.employeesUpdated += 1;
    if (i > 0 && i % 500 === 0) process.stdout.write(`  employee updates ${i}/${employeeUpdates.length}...\n`);
  }

  const existingSites = await fetchAllRows(
    supabase,
    'site_profiles',
    CVS_COMPANY_ID,
    'id, site_name',
  );
  const bySiteName = new Map(
    existingSites.map((s) => [cellStr(s.site_name).toLowerCase(), s.id]),
  );

  const siteInserts = [];
  const siteUpdates = [];

  for (const row of parsed.sites) {
    const { siteId, siteName, payload } = mapSiteImportRow(row);
    const record = {
      ...payload,
      company_id: CVS_COMPANY_ID,
      geofence_radius: clampGeofenceRadiusM(payload.geofence_radius ?? DEFAULT_GEOFENCE_RADIUS_M),
    };

    if (siteId) {
      siteUpdates.push({ id: siteId, record });
      continue;
    }

    if (!siteName) throw new Error('Site row missing site_name.');

    const existingId = bySiteName.get(siteName.toLowerCase()) ?? null;
    if (existingId) {
      siteUpdates.push({ id: existingId, record });
    } else {
      siteInserts.push(record);
      bySiteName.set(siteName.toLowerCase(), 'pending');
    }
  }

  console.log(`  Site batches: ${siteInserts.length} insert, ${siteUpdates.length} update`);
  summary.sitesInserted = await batchInsert(supabase, 'site_profiles', siteInserts);

  for (const { id, record } of siteUpdates) {
    const { error } = await supabase.from('site_profiles').update(record).eq('id', id);
    if (error) throw new Error(`Site update (${id}): ${error.message}`);
    summary.sitesUpdated += 1;
  }

  const smRows = parsed.smGuardLinks.map((row) => ({
    sm_epf: cellStr(row.sm_epf).toUpperCase(),
    guard_epf: cellStr(row.guard_epf).toUpperCase(),
  }));

  const smEpfSet = new Set(
    (await fetchAllRows(supabase, 'employees', CVS_COMPANY_ID, 'emp_number, group'))
      .filter((e) => cellStr(e.group) === 'SECTOR_MANAGER')
      .map((e) => cellStr(e.emp_number).toUpperCase()),
  );
  const guardEpfSet = new Set(
    (await fetchAllRows(supabase, 'employees', CVS_COMPANY_ID, 'emp_number')).map((e) =>
      cellStr(e.emp_number).toUpperCase(),
    ),
  );

  const validSmRows = [];
  for (const link of smRows) {
    if (!smEpfSet.has(link.sm_epf)) {
      throw new Error(`SM_Guard_Links: "${link.sm_epf}" is not a Sector Manager.`);
    }
    if (!guardEpfSet.has(link.guard_epf)) {
      throw new Error(`SM_Guard_Links: guard "${link.guard_epf}" not found.`);
    }
    validSmRows.push(link);
  }

  console.log(`  SM link batches: ${validSmRows.length} upsert`);
  for (let i = 0; i < validSmRows.length; i += 200) {
    const chunk = validSmRows.slice(i, i + 200);
    const { error } = await supabase
      .from('sm_guard_assignments')
      .upsert(chunk, { onConflict: 'sm_epf,guard_epf' });
    if (error) throw new Error(`SM link batch (${i}): ${error.message}`);
    summary.smLinksUpserted += chunk.length;
  }

  return summary;
}

async function countTenant(supabase) {
  const [emp, sites, sm] = await Promise.all([
    supabase.from('employees').select('*', { count: 'exact', head: true }).eq('company_id', CVS_COMPANY_ID),
    supabase.from('site_profiles').select('*', { count: 'exact', head: true }).eq('company_id', CVS_COMPANY_ID),
    supabase.from('sm_guard_assignments').select('*', { count: 'exact', head: true }),
  ]);
  return {
    employees: emp.count ?? 0,
    sites: sites.count ?? 0,
    smLinks: sm.count ?? 0,
  };
}

async function loadRankMatrixFromMdSettings(supabase) {
  const { data, error } = await supabase
    .from('md_settings')
    .select('rank_pay_matrix')
    .eq('company_id', CVS_COMPANY_ID)
    .maybeSingle();
  if (error) throw new Error(`Rank matrix lookup: ${error.message}`);
  const matrix = data?.rank_pay_matrix;
  return Array.isArray(matrix) ? matrix : [];
}

async function main() {
  loadEnv();
  process.env.NODE_ENV ??= 'development';

  if (!existsSync(stagingPath)) {
    console.error(`Staging workbook not found: ${stagingPath}`);
    console.error('Run: npm run migrate:cvs-legacy');
    process.exit(1);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }

  const supabase = createClient(url, key);
  const buffer = readFileSync(stagingPath);
  const { wb, employees, sites, smGuardLinks, multiSheet } = parseWorkbook(buffer);
  let rankMatrix = wb ? parseRankMatrixSheet(wb) : [];
  if (!rankMatrix.length && multiSheet) {
    rankMatrix = loadLegacyMigrationRankMatrix();
  }
  if (!rankMatrix.length) {
    rankMatrix = normalizeRankMatrixEntries(await loadRankMatrixFromMdSettings(supabase));
  }

  console.log('CVS legacy bulk import (C-2)\n');
  console.log(`  Workbook: ${stagingPath}`);
  console.log(`  Format: ${multiSheet ? 'multi-sheet migration' : 'legacy Employees/Sites tabs'}`);
  console.log(`  Mode: ${dryRun ? 'DRY-RUN (validate only)' : 'IMPORT'}`);
  console.log(`  Rows: ${employees.length} employees, ${sites.length} sites, ${smGuardLinks.length} SM links`);
  console.log(`  Rank matrix: ${rankMatrix.length} entries\n`);

  const before = await countTenant(supabase);
  console.log(`  Before: ${before.employees} employees, ${before.sites} sites, ${before.smLinks} SM links`);

  if (!skipRanks && !dryRun) {
    const n = await seedRankMatrix(supabase, rankMatrix);
    console.log(`  Seeded rank_pay_matrix: ${n} ranks`);
  } else if (skipRanks) {
    console.log('  Skipping rank matrix seed (--skip-ranks)');
  }

  const validationErrors = validateBulkImport({ employees, sites, smGuardLinks }, rankMatrix);
  if (validationErrors.length) {
    console.error(`\nValidation failed (${validationErrors.length} issue(s)):`);
    for (const err of validationErrors.slice(0, 30)) console.error(`  - ${err}`);
    if (validationErrors.length > 30) {
      console.error(`  ... and ${validationErrors.length - 30} more`);
    }
    process.exit(1);
  }
  console.log('  Validation: PASS');

  if (dryRun) {
    console.log('\nDry-run complete — no database writes.');
    return;
  }

  const summary = await applyBulkImport(supabase, { employees, sites, smGuardLinks });
  const after = await countTenant(supabase);

  console.log('\nImport summary:');
  console.log(`  employeesInserted: ${summary.employeesInserted}`);
  console.log(`  employeesUpdated: ${summary.employeesUpdated}`);
  console.log(`  sitesInserted: ${summary.sitesInserted}`);
  console.log(`  sitesUpdated: ${summary.sitesUpdated}`);
  console.log(`  smLinksUpserted: ${summary.smLinksUpserted}`);
  console.log(`\nAfter: ${after.employees} employees, ${after.sites} sites, ${after.smLinks} SM links`);
}

main().catch((err) => {
  console.error('\nImport failed:', err.message || err);
  process.exit(1);
});
