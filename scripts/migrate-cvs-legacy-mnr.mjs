/**
 * Classic Venture legacy nominal roll → Pearzen bulk import staging files.
 *
 * Usage:
 *   node scripts/migrate-cvs-legacy-mnr.mjs --check
 *   node scripts/migrate-cvs-legacy-mnr.mjs --run
 *
 * Source files (override with env):
 *   CVS_MNR_XLSX  — MASTER NOMINAL ROLL.xlsx
 *   CVS_SITES_XLS — SITE CODE AND NAMES.xls
 *
 * Outputs (gitignored — contain PII):
 *   data/migration/classic-venture/staging-roster.csv
 *   data/migration/classic-venture/staging-employees.csv
 *   data/migration/classic-venture/staging-sites.csv
 *   data/migration/classic-venture/staging-sm-guard-links.csv
 *   data/migration/classic-venture/pearzen-migration-import-CLASSIC-VENTURE-STAGING.xlsx
 *   data/migration/classic-venture/pearzen-roster-import-CLASSIC-VENTURE-STAGING.xlsx (legacy unified Roster — QA diff)
 *   data/migration/classic-venture/migration-qa-report.txt
 *
 * Multi-sheet workbook matches apps/back-office/lib/bulk-data-workbook.ts migration template
 * (HEAD_OFFICE … Temp_Guards + Sites). Upload via MD Settings → Bulk Data Import.
 * See MIGRATION_MULTI_SHEET_WORKBOOK_STEPS.txt and CVS_LEGACY_MNR_MIGRATION_STEPS.txt.
 *
 * Sensitive fields (NIC, Contact, Bank_Code, Branch_Code, Bank_Acc) are copied
 * verbatim from legacy cells — never masked, reformat, or substituted.
 */

import { createRequire } from 'module';
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const XLSX = require(join(root, 'node_modules/xlsx'));
const outDir = join(root, 'data/migration/classic-venture');

const DEFAULT_MNR = join(
  outDir,
  'archive/legacy-sources/MASTER-NOMINAL-ROLL.xlsx',
);
const DEFAULT_SITES = join(
  outDir,
  'archive/legacy-sources/SITE-CODE-AND-NAMES.xls',
);
const FALLBACK_MNR = join(process.env.HOME ?? '', 'Downloads/MASTER NOMINAL ROLL.xlsx');
const FALLBACK_SITES = join(process.env.HOME ?? '', 'Downloads/SITE CODE AND NAMES.xls');

/** Fields that must not be normalized — copy legacy cell text exactly. */
const SENSITIVE_FIELDS = new Set(['nic', 'phone', 'bank_code', 'branch_code', 'account_number']);

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

const GROUP_BY_RANK = {
  VO: 'SECTOR_MANAGER',
  LTM: 'SECTOR_MANAGER',
  SM: 'SECTOR_MANAGER',
  OM: 'SECTOR_MANAGER',
  TM: 'SECTOR_MANAGER',
  FM: 'HEAD_OFFICE',
  SEC: 'HEAD_OFFICE',
  HRA: 'HEAD_OFFICE',
  MD: 'HEAD_OFFICE',
  MF: 'HEAD_OFFICE',
  AC: 'HEAD_OFFICE',
  CF: 'HEAD_OFFICE',
  EXF: 'HEAD_OFFICE',
  GAD: 'HEAD_OFFICE',
  MOP: 'CAFE',
};

const GUARD_RANKS = new Set([
  'JSO', 'SSO', 'OIC', 'LSO', 'LMN', 'GRO', 'GAD', 'JS', 'AAB', 'DRV', 'MRT',
  'AEA', 'LSP', 'SO', 'SCT', 'AVO', 'AAE', 'LPP', 'JO', 'SLO', 'NVO', 'CSO',
]);

const PSEUDO_SITES = ['RESERVE', 'CLEARANCE', 'TEMPORY', 'HEAD OFFICE'];

const DEFAULT_RANK_MATRIX = [
  { rank_code: 'CSO', full_title: 'CHIEF SECURITY OFFICER', basic_pay: 35000, salary_type: 'BANK', operational_group: 'GUARD_FIELD', annual_increment: 2000 },
  { rank_code: 'OIC', full_title: 'OFFICER IN CHARGE', basic_pay: 33000, salary_type: 'BANK', operational_group: 'GUARD_FIELD', annual_increment: 1800 },
  { rank_code: 'SSO', full_title: 'SENIOR SECURITY OFFICER', basic_pay: 32000, salary_type: 'BANK', operational_group: 'GUARD_FIELD', annual_increment: 1500 },
  { rank_code: 'JSO', full_title: 'JUNIOR SECURITY OFFICER', basic_pay: 30000, salary_type: 'BANK', operational_group: 'GUARD_FIELD', annual_increment: 1200 },
  { rank_code: 'LSO', full_title: 'LADY SECURITY OFFICER', basic_pay: 30000, salary_type: 'BANK', operational_group: 'GUARD_FIELD', annual_increment: 1200 },
];

const RANK_MATRIX_COLUMNS = [
  'rank_code', 'full_title', 'basic_pay', 'salary_type', 'operational_group', 'annual_increment',
];

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

/** Matches apps/back-office/lib/bulk-data-workbook.ts UNIFIED_ROSTER_COLUMNS */
const UNIFIED_ROSTER_COLUMNS = [
  'employee_id', 'emp_number', 'epf_no', 'previous_epf_no', 'full_name', 'nic', 'passport_no',
  'phone', 'email', 'dob', 'gender', 'nationality', 'religion', 'home_address',
  'group', 'rank', 'rank_title', 'rank_basic_pay', 'rank_salary_type', 'rank_operational_group',
  'role', 'site_name', 'date_joined', 'status', 'base_salary', 'salary_type', 'epf_yn',
  'site_allowance_lkr', 'meal_allowance_lkr', 'transport_allowance_lkr', 'maternity_leave',
  'bank_code', 'bank_name', 'branch_code', 'account_number',
  'mod_expiry', 'police_expiry',
  'site_type', 'site_address', 'required_guards', 'assigned_sm_epf', 'site_latitude',
  'site_longitude', 'geofence_radius_m', 'verification_mode', 'provides_food',
  'food_allowance_lkr', 'provides_accommodation', 'nfc_tag_id',
  'uniform_outstanding_lkr', 'meals_advance_other_outstanding_lkr', 'salary_advance_outstanding_lkr',
  'penalty_outstanding_lkr', 'salary_loan_outstanding_lkr', 'unit_damages_outstanding_lkr',
  'other_deduction_outstanding_lkr', 'debt_notes',
];

const ROSTER_STAGING_XLSX = 'pearzen-roster-import-CLASSIC-VENTURE-STAGING.xlsx';
const MIGRATION_STAGING_XLSX = 'pearzen-migration-import-CLASSIC-VENTURE-STAGING.xlsx';
const LEGACY_STAGING_XLSX = 'pearzen-bulk-import-CLASSIC-VENTURE-STAGING.xlsx';

/** Matches apps/back-office/lib/bulk-data-workbook.ts migration sheet names. */
const MIGRATION_SHEET_HEAD_OFFICE = 'HEAD_OFFICE';
const MIGRATION_SHEET_CAFE = 'CAFE';
const MIGRATION_SHEET_GUARD = 'GUARD';
const MIGRATION_SHEET_SM = 'SM';
const MIGRATION_SHEET_SITES = 'Sites';
const MIGRATION_SHEET_RESIGNED = 'Resigned';
const MIGRATION_SHEET_INACTIVE = 'Inactive';
const MIGRATION_SHEET_TEMP_GUARDS = 'Temp_Guards';

const MIGRATION_WORKBOOK_SHEET_ORDER = [
  MIGRATION_SHEET_HEAD_OFFICE,
  MIGRATION_SHEET_CAFE,
  MIGRATION_SHEET_GUARD,
  MIGRATION_SHEET_SM,
  MIGRATION_SHEET_SITES,
  MIGRATION_SHEET_RESIGNED,
  MIGRATION_SHEET_INACTIVE,
  MIGRATION_SHEET_TEMP_GUARDS,
];

const MIGRATION_WORKFORCE_SHEETS = MIGRATION_WORKBOOK_SHEET_ORDER.filter(
  (name) => name !== MIGRATION_SHEET_SITES,
);

const MIGRATION_SITE_RATE_RANKS = ['CSO', 'OIC', 'SSO', 'JSO', 'LSO'];

const MIGRATION_EMPLOYEE_IDENTITY_COLUMNS = [
  'employee_id', 'emp_number', 'epf_no', 'previous_epf_no', 'full_name', 'nic', 'passport_no',
  'phone', 'email', 'dob', 'gender', 'nationality', 'religion', 'home_address',
  'emergency_contact', 'employee_referral',
];

const MIGRATION_EMPLOYEE_EMPLOYMENT_COLUMNS = [
  'corporate_group', 'rank', 'rank_title', 'rank_basic_pay', 'rank_salary_type',
  'rank_operational_group', 'role', 'date_joined', 'status', 'base_salary', 'salary_type',
  'epf_yn', 'fixed_allowance_lkr', 'special_allowance_lkr', 'site_allowance_lkr',
  'meal_allowance_lkr', 'transport_allowance_lkr', 'fixed_deduction_lkr', 'maternity_leave',
];

const MIGRATION_EMPLOYEE_BANK_COLUMNS = [
  'bank_code', 'bank_name', 'branch_code', 'account_number',
];

const MIGRATION_EMPLOYEE_VETTING_COLUMNS = ['mod_expiry', 'police_expiry'];

const MIGRATION_EMPLOYEE_PLACEMENT_COLUMNS = ['site_code', 'assigned_sm_epf'];

const MIGRATION_EMPLOYEE_TEMP_PARENT_COLUMNS = ['temp_parent_epf'];

const MIGRATION_EMPLOYEE_RESIGNATION_COLUMNS = [
  'date_resigned', 'resignation_type', 'resignation_notes',
];

const MIGRATION_EMPLOYEE_DEBT_COLUMNS = [
  'uniform_outstanding_lkr', 'meals_advance_other_outstanding_lkr',
  'salary_advance_outstanding_lkr', 'penalty_outstanding_lkr',
  'salary_loan_outstanding_lkr', 'unit_damages_outstanding_lkr',
  'other_deduction_outstanding_lkr', 'debt_notes',
];

const MIGRATION_SITES_COLUMNS = [
  'site_code', 'site_name', 'site_type', 'site_status',
  'client_name', 'parent_client', 'client_billing_address', 'contract_start', 'contract_end',
  'address', 'latitude', 'longitude', 'geofence_radius_m', 'verification_mode',
  'needs_om_gps_capture', 'assigned_sm_epf', 'required_guards', 'per_visit_charge_lkr',
  'min_dwell_time_minutes', 'nfc_tag_id', 'provides_food', 'food_allowance_lkr',
  'provides_accommodation',
  ...MIGRATION_SITE_RATE_RANKS.flatMap((rank) => [
    `${rank}_qty`,
    `${rank}_invoice_rate_lkr`,
    `${rank}_pay_rate_lkr`,
  ]),
];

const PSEUDO_SITE_CODES = {
  RESERVE: 'r01',
  CLEARANCE: 'CLEARANCE',
  TEMPORY: 't',
  'HEAD OFFICE': 'HO1',
};

const FIXED_GROUP_BY_SHEET = {
  [MIGRATION_SHEET_HEAD_OFFICE]: 'HEAD_OFFICE',
  [MIGRATION_SHEET_CAFE]: 'CAFE',
  [MIGRATION_SHEET_GUARD]: 'GUARD',
  [MIGRATION_SHEET_SM]: 'SECTOR_MANAGER',
  [MIGRATION_SHEET_RESIGNED]: 'GUARD',
  [MIGRATION_SHEET_INACTIVE]: 'GUARD',
  [MIGRATION_SHEET_TEMP_GUARDS]: 'GUARD',
};

function uniqueColumns(columns) {
  return [...new Set(columns)];
}

function columnsForMigrationWorkforceSheet(sheet) {
  const base = [
    ...MIGRATION_EMPLOYEE_IDENTITY_COLUMNS,
    ...MIGRATION_EMPLOYEE_EMPLOYMENT_COLUMNS,
    ...MIGRATION_EMPLOYEE_BANK_COLUMNS,
    ...MIGRATION_EMPLOYEE_VETTING_COLUMNS,
    ...MIGRATION_EMPLOYEE_DEBT_COLUMNS,
  ];
  switch (sheet) {
    case MIGRATION_SHEET_HEAD_OFFICE:
    case MIGRATION_SHEET_CAFE:
      return uniqueColumns([...base, 'site_code']);
    case MIGRATION_SHEET_GUARD:
      return uniqueColumns([...base, ...MIGRATION_EMPLOYEE_PLACEMENT_COLUMNS]);
    case MIGRATION_SHEET_SM:
      return uniqueColumns([...base]);
    case MIGRATION_SHEET_RESIGNED:
      return uniqueColumns([...base, ...MIGRATION_EMPLOYEE_RESIGNATION_COLUMNS]);
    case MIGRATION_SHEET_INACTIVE:
      return uniqueColumns([...base, 'site_code', ...MIGRATION_EMPLOYEE_PLACEMENT_COLUMNS]);
    case MIGRATION_SHEET_TEMP_GUARDS:
      return uniqueColumns([
        ...base,
        ...MIGRATION_EMPLOYEE_PLACEMENT_COLUMNS,
        ...MIGRATION_EMPLOYEE_TEMP_PARENT_COLUMNS,
      ]);
    default:
      return uniqueColumns(base);
  }
}

function pickColumns(columns, row) {
  const out = {};
  for (const key of columns) {
    const v = row[key];
    if (v === null || v === undefined) out[key] = '';
    else if (typeof v === 'boolean') out[key] = v ? 'TRUE' : 'FALSE';
    else out[key] = v;
  }
  return out;
}

function blankMigrationSiteRateFields() {
  const out = {};
  for (const rank of MIGRATION_SITE_RATE_RANKS) {
    out[`${rank}_qty`] = 0;
    out[`${rank}_invoice_rate_lkr`] = 0;
    out[`${rank}_pay_rate_lkr`] = 0;
  }
  return out;
}

function isTempPoolSiteCode(siteCode) {
  const upper = cellRaw(siteCode).toUpperCase();
  return upper === 'T' || upper === 'TEMPORY';
}

function resolveSiteCode(siteName, siteCodeByName) {
  const name = cellRaw(siteName);
  if (!name) return '';
  if (PSEUDO_SITE_CODES[name]) return PSEUDO_SITE_CODES[name];
  return siteCodeByName.get(name) ?? name;
}

function buildSiteCodeByName(siteLookup) {
  const byName = new Map();
  for (const row of siteLookup) {
    const name = cellRaw(row.site_name);
    const code = normalizeSiteCode(row.site_code);
    if (name && code) byName.set(name, code);
  }
  for (const [name, code] of Object.entries(PSEUDO_SITE_CODES)) {
    byName.set(name, code);
  }
  return byName;
}

function classifyMigrationWorkforceSheet(emp, siteCode) {
  const status = cellRaw(emp.status).toLowerCase();
  if (status === 'resigned') return MIGRATION_SHEET_RESIGNED;
  if (status === 'inactive') return MIGRATION_SHEET_INACTIVE;

  const group = cellRaw(emp.group).toUpperCase();
  const code = cellRaw(siteCode).toUpperCase();
  const siteName = cellRaw(emp.site).toUpperCase();

  if (
    (group === 'GUARD' || group === 'GUARD_FIELD') &&
    (isTempPoolSiteCode(code) || siteName === 'TEMPORY' || emp._loc_code === 'T')
  ) {
    return MIGRATION_SHEET_TEMP_GUARDS;
  }

  switch (group) {
    case 'SECTOR_MANAGER':
      return MIGRATION_SHEET_SM;
    case 'HEAD_OFFICE':
      return MIGRATION_SHEET_HEAD_OFFICE;
    case 'CAFE':
      return MIGRATION_SHEET_CAFE;
    case 'GUARD':
    case 'GUARD_FIELD':
      return MIGRATION_SHEET_GUARD;
    default:
      return MIGRATION_SHEET_GUARD;
  }
}

function cellRaw(value) {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, '0');
    const d = String(value.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return String(value).trim();
}

/** Normalize legacy date cells to Pearzen ISO YYYY-MM-DD (non-sensitive). */
function toIsoDate(value) {
  if (value === null || value === undefined || value === '') return '';
  if (value instanceof Date) return cellRaw(value);
  const s = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const dmy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dmy) {
    const [, d, mo, y] = dmy;
    return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  return s;
}

/** Exact legacy copy for sensitive columns (no dash stripping, no case change). */
function sensitiveCopy(value) {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return cellRaw(value);
  return String(value).trim();
}

function skipDash(value) {
  const s = cellRaw(value);
  return s === '-' || s === '=' ? '' : s;
}

function inferGroup(rank, epfNo) {
  const epf = cellRaw(epfNo);
  if (VO_EPF_SET.has(epf)) return 'SECTOR_MANAGER';
  const code = cellRaw(rank).toUpperCase();
  return GROUP_BY_RANK[code] ?? 'GUARD';
}

function normalizeSiteCode(code) {
  const s = cellRaw(code);
  if (/^r\d+$/i.test(s)) return s.toUpperCase();
  return s;
}

function inferSiteType(name) {
  const u = cellRaw(name).toUpperCase();
  if (u.includes('HOTEL')) return 'HOTEL';
  if (u.includes('PHARMACY')) return 'PHARMACY';
  if (u.includes('OFFICE')) return 'OFFICE';
  if (u.includes('STORAGE')) return 'STORAGE';
  if (u.includes('RESIDEN')) return 'RESIDENTIAL';
  return 'OTHER';
}

function sheetToObjects(wb, sheetName, headerRow = 0) {
  const ws = wb.Sheets[sheetName];
  if (!ws) throw new Error(`Missing sheet: ${sheetName}`);
  const rows = XLSX.utils.sheet_to_json(ws, { defval: '', raw: false, dateNF: 'yyyy-mm-dd' });
  if (headerRow === 0 && rows.length) return rows;
  return rows;
}

function readWorkbook(path) {
  if (!existsSync(path)) throw new Error(`File not found: ${path}`);
  return XLSX.readFile(path, { cellDates: true });
}

function loadLegacySources(mnrPath, sitesPath) {
  const mnrWb = readWorkbook(mnrPath);
  const sitesWb = readWorkbook(sitesPath);

  const mnr = sheetToObjects(mnrWb, 'Sheet1');
  const siteAssignRaw = XLSX.utils.sheet_to_json(sitesWb.Sheets['Sheet1'], {
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
      rank: cellRaw(row[2]),
      name: cellRaw(row[3]),
      nic: sensitiveCopy(row[4]),
      date_joined: cellRaw(row[5]),
      site_code: cellRaw(row[6]),
      site_name: cellRaw(row[8]),
    }));

  const siteLookupRaw = XLSX.utils.sheet_to_json(sitesWb.Sheets['Sheet2'], {
    header: 1,
    defval: '',
  });
  const siteLookup = siteLookupRaw
    .filter(
      (row) =>
        row[0] !== '' &&
        row[0] !== null &&
        cellRaw(row[1]) !== 'DATE :' &&
        cellRaw(row[1]) !== '',
    )
    .map((row) => ({
      site_code: normalizeSiteCode(row[0]),
      site_name: cellRaw(row[1]),
    }));

  return { mnr, siteAssign, siteLookup };
}

function buildSiteAssignIndex(siteAssign) {
  const byEpf = new Map();
  for (const row of siteAssign) {
    byEpf.set(row.emp_no, row);
  }
  return byEpf;
}

/** Sheet1 keys on emp_no; MNR may match via EPF_no or Emp_no (duplicate-EPF cases). */
function lookupSiteAssignment(row, siteByEpf) {
  const epf = cellRaw(row.EPF_no);
  const empNo = cellRaw(row.Emp_no);
  return siteByEpf.get(epf) ?? siteByEpf.get(empNo) ?? null;
}

function mnrKeysForRow(row) {
  return new Set([cellRaw(row.EPF_no), cellRaw(row.Emp_no)].filter(Boolean));
}

function logSheet1Orphans(mnr, siteAssign, qa) {
  const keys = new Set();
  for (const row of mnr) {
    for (const k of mnrKeysForRow(row)) keys.add(k);
  }
  let orphans = 0;
  for (const row of siteAssign) {
    if (!keys.has(row.emp_no)) {
      orphans += 1;
      qa.push(
        `SHEET1_ORPHAN emp_no ${row.emp_no} (${row.name}) site=${row.site_name} — excluded from import`,
      );
    }
  }
  qa.push(`SHEET1 orphans logged: ${orphans}`);
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

function dedupeMnrRows(mnr, siteByEpf, qa) {
  const byEpf = new Map();
  for (const row of mnr) {
    const epf = cellRaw(row.EPF_no);
    if (!epf) continue;
    if (!byEpf.has(epf)) byEpf.set(epf, []);
    byEpf.get(epf).push(row);
  }

  const chosen = [];
  for (const [epf, rows] of byEpf) {
    if (rows.length > 1) {
      const picked = pickMnrRowForEpf(epf, rows, siteByEpf);
      qa.push(
        `DUPLICATE_EPF ${epf}: ${rows.length} MNR rows — kept Emp_no ${picked.Emp_no} (${picked.Name})`,
      );
      chosen.push(picked);
    } else {
      chosen.push(rows[0]);
    }
  }
  return chosen;
}

function filterActiveScope(mnrRows, qa) {
  const active = mnrRows.filter(
    (r) => r.ACT_YN === true || r.ACT_YN === 'TRUE' || r.ACT_YN === 1,
  );
  qa.push(`SCOPE filter ACT_YN=True: ${active.length} employees`);
  return active;
}

function mapEmployeeRow(row, siteByEpf, qa) {
  const epf = cellRaw(row.EPF_no);
  const assign = lookupSiteAssignment(row, siteByEpf);
  let site = assign?.site_name ?? '';
  if (!site) {
    site = 'TEMPORY';
    qa.push(`MISSING_SITE ${epf} ${row.Name}: fallback TEMPORY (no Sheet1 match on EPF_no or Emp_no)`);
  }

  const rank = cellRaw(row.Rank_Code).toUpperCase();
  const genderRaw = cellRaw(row.Sex).toUpperCase();
  const group = inferGroup(rank, epf);
  // V.O. sector managers: OIC in legacy → VO for Pearzen rank matrix (group SECTOR_MANAGER)
  const pearzenRank = VO_EPF_SET.has(epf) && rank === 'OIC' ? 'VO' : rank;

  return {
    employee_id: '',
    emp_number: epf,
    full_name: cellRaw(row.Name).toUpperCase(),
    nic: sensitiveCopy(row.NIC),
    passport_no: '',
    epf_no: epf,
    phone: sensitiveCopy(row.Contact),
    dob: toIsoDate(row.Birth),
    gender: genderRaw === 'F' ? 'FEMALE' : genderRaw === 'M' ? 'MALE' : '',
    nationality: skipDash(row.National).toUpperCase(),
    religion: skipDash(row.Religion).toUpperCase(),
    home_address: skipDash(row.Address).toUpperCase(),
    role: '',
    group,
    rank: pearzenRank,
    site,
    date_joined: toIsoDate(row.Date_Jo),
    status: row.Resign === true || row.Resign === 'TRUE' || row.Resign === 1 ? 'Resigned' : 'ACTIVE',
    base_salary: Number(row.Basic_EPF) || 0,
    salary_type: cellRaw(row.SalType).toUpperCase() === 'C' ? 'CASH' : 'BANK',
    epf_yn: row.EPF_YN === true || row.EPF_YN === 'TRUE' || row.EPF_YN === 1 ? 'TRUE' : 'FALSE',
    bank_code: sensitiveCopy(row.Bank_Code).replace(/\.0+$/, ''),
    bank_name: '',
    branch_code: sensitiveCopy(row.Branch_Code).replace(/\.0+$/, ''),
    account_number: sensitiveCopy(row.Bank_Acc),
    mod_expiry: '',
    police_expiry: '',
    maternity_leave: 'FALSE',
    date_resigned:
      row.Resign === true || row.Resign === 'TRUE' || row.Resign === 1
        ? toIsoDate(row.Date_Jo) || ''
        : '',
    resignation_type: '',
    resignation_notes: '',
    _loc_code: cellRaw(row.Loc_code).toUpperCase(),
  };
}

function buildEmployees(activeRows, siteByEpf, qa) {
  const employees = [];
  const seen = new Set();
  for (const row of activeRows) {
    const epf = cellRaw(row.EPF_no);
    if (seen.has(epf)) continue;
    seen.add(epf);
    employees.push(mapEmployeeRow(row, siteByEpf, qa));
  }
  qa.push(`EMPLOYEES built: ${employees.length} rows`);
  return employees;
}

function buildSites(employees, siteLookup, qa) {
  const siteNames = new Map();
  for (const s of siteLookup) {
    siteNames.set(s.site_name, s.site_code);
  }
  for (const p of PSEUDO_SITES) {
    siteNames.set(p, p);
  }

  for (const emp of employees) {
    if (emp.site && !siteNames.has(emp.site)) {
      siteNames.set(emp.site, emp.site);
      qa.push(`SITE auto-added from employee assignment: ${emp.site}`);
    }
  }

  const guardsBySite = new Map();
  const locBySite = new Map();
  for (const emp of employees) {
    const site = emp.site;
    guardsBySite.set(site, (guardsBySite.get(site) ?? 0) + 1);
    if (!locBySite.has(site)) locBySite.set(site, new Map());
    const loc = emp._loc_code ?? '';
    if (loc) {
      const m = locBySite.get(site);
      m.set(loc, (m.get(loc) ?? 0) + 1);
    }
  }

  const sites = [];
  for (const siteName of [...siteNames.keys()].sort()) {
    if (!cellRaw(siteName)) continue;
    const locCounts = locBySite.get(siteName) ?? new Map();
    let dominantLoc = '';
    let max = 0;
    for (const [loc, cnt] of locCounts) {
      if (cnt > max && VO_EPF_BY_LOC[loc]) {
        max = cnt;
        dominantLoc = loc;
      }
    }
    const smEpf = dominantLoc ? VO_EPF_BY_LOC[dominantLoc] ?? '' : '';

    sites.push({
      site_id: '',
      site_name: siteName,
      site_type: inferSiteType(siteName),
      address: '',
      required_guards: guardsBySite.get(siteName) ?? 0,
      assigned_sm_epf: smEpf,
      latitude: '',
      longitude: '',
      geofence_radius_m: '',
      verification_mode: 'B',
      provides_food: 'FALSE',
      food_allowance_lkr: 0,
      provides_accommodation: 'FALSE',
      nfc_tag_id: '',
    });

    const guardCount = guardsBySite.get(siteName) ?? 0;
    if (
      guardCount > 0 &&
      !smEpf &&
      !PSEUDO_SITES.includes(siteName)
    ) {
      qa.push(`SITE_NO_SM ${siteName}: ${guardCount} guards — no dominant V.O. sector (A–J)`);
    }
  }

  qa.push(`SITES built: ${sites.length} rows (${PSEUDO_SITES.length} pseudo pools in lookup)`);
  return sites;
}

function buildMigrationSiteRows(legacySites, siteCodeByName) {
  return legacySites.map((site) => {
    const siteName = cellRaw(site.site_name);
    const siteCode = resolveSiteCode(siteName, siteCodeByName);
    return {
      site_code: siteCode,
      site_name: siteName,
      site_type: cellRaw(site.site_type).toUpperCase() || 'OTHER',
      site_status: 'ACTIVE',
      client_name: '',
      parent_client: '',
      client_billing_address: '',
      contract_start: '',
      contract_end: '',
      address: cellRaw(site.address),
      latitude: site.latitude ?? '',
      longitude: site.longitude ?? '',
      geofence_radius_m: site.geofence_radius_m || 100,
      verification_mode: cellRaw(site.verification_mode).toUpperCase() || 'B',
      needs_om_gps_capture: 'TRUE',
      assigned_sm_epf: cellRaw(site.assigned_sm_epf).toUpperCase(),
      required_guards: site.required_guards ?? 0,
      per_visit_charge_lkr: 0,
      min_dwell_time_minutes: 0,
      nfc_tag_id: cellRaw(site.nfc_tag_id),
      provides_food: cellRaw(site.provides_food) || 'FALSE',
      food_allowance_lkr: site.food_allowance_lkr ?? 0,
      provides_accommodation: cellRaw(site.provides_accommodation) || 'FALSE',
      ...blankMigrationSiteRateFields(),
    };
  });
}

function mapEmployeeToMigrationRow(emp, siteByName, siteCodeByName) {
  const siteName = cellRaw(emp.site);
  const site = siteByName.get(siteName);
  const siteCode = resolveSiteCode(siteName, siteCodeByName);
  const group = cellRaw(emp.group).toUpperCase();
  const fixedGroup = group === 'GUARD_FIELD' ? 'GUARD' : group;

  return {
    employee_id: cellRaw(emp.employee_id),
    emp_number: cellRaw(emp.emp_number),
    epf_no: cellRaw(emp.epf_no || emp.emp_number),
    previous_epf_no: '',
    full_name: cellRaw(emp.full_name),
    nic: emp.nic ?? '',
    passport_no: cellRaw(emp.passport_no),
    phone: emp.phone ?? '',
    email: '',
    dob: cellRaw(emp.dob),
    gender: cellRaw(emp.gender),
    nationality: cellRaw(emp.nationality),
    religion: cellRaw(emp.religion),
    home_address: cellRaw(emp.home_address),
    emergency_contact: '',
    employee_referral: '',
    corporate_group: fixedGroup,
    rank: cellRaw(emp.rank),
    rank_title: '',
    rank_basic_pay: '',
    rank_salary_type: '',
    rank_operational_group: fixedGroup === 'GUARD' ? 'GUARD' : fixedGroup,
    role: cellRaw(emp.role),
    date_joined: cellRaw(emp.date_joined),
    status: cellRaw(emp.status),
    base_salary: emp.base_salary ?? '',
    salary_type: cellRaw(emp.salary_type),
    epf_yn: cellRaw(emp.epf_yn),
    fixed_allowance_lkr: 0,
    special_allowance_lkr: 0,
    site_allowance_lkr: 0,
    meal_allowance_lkr: 0,
    transport_allowance_lkr: 0,
    fixed_deduction_lkr: 0,
    maternity_leave: cellRaw(emp.maternity_leave),
    bank_code: emp.bank_code ?? '',
    bank_name: cellRaw(emp.bank_name),
    branch_code: emp.branch_code ?? '',
    account_number: emp.account_number ?? '',
    mod_expiry: cellRaw(emp.mod_expiry),
    police_expiry: cellRaw(emp.police_expiry),
    site_code: siteCode,
    assigned_sm_epf: cellRaw(site?.assigned_sm_epf ?? '').toUpperCase(),
    temp_parent_epf: '',
    date_resigned: cellRaw(emp.date_resigned),
    resignation_type: cellRaw(emp.resignation_type),
    resignation_notes: cellRaw(emp.resignation_notes),
    uniform_outstanding_lkr: 0,
    meals_advance_other_outstanding_lkr: 0,
    salary_advance_outstanding_lkr: 0,
    penalty_outstanding_lkr: 0,
    salary_loan_outstanding_lkr: 0,
    unit_damages_outstanding_lkr: 0,
    other_deduction_outstanding_lkr: 0,
    debt_notes: '',
    _loc_code: emp._loc_code,
    site: siteName,
  };
}

function splitEmployeesToMigrationSheets(employees, siteByName, siteCodeByName) {
  const buckets = Object.fromEntries(
    MIGRATION_WORKFORCE_SHEETS.map((sheetName) => [sheetName, []]),
  );

  for (const emp of stripInternal(employees)) {
    const siteCode = resolveSiteCode(emp.site, siteCodeByName);
    const sheet = classifyMigrationWorkforceSheet(emp, siteCode);
    const row = mapEmployeeToMigrationRow(emp, siteByName, siteCodeByName);
    if (sheet === MIGRATION_SHEET_RESIGNED && !cellRaw(row.date_resigned)) {
      row.date_resigned = cellRaw(row.date_joined) || '1900-01-01';
    }
    if (sheet === MIGRATION_SHEET_INACTIVE && cellRaw(row.status).toUpperCase() === 'ACTIVE') {
      row.status = 'Inactive';
    }
    if (sheet === MIGRATION_SHEET_TEMP_GUARDS && isTempPoolSiteCode(siteCode)) {
      row.site_code = cellRaw(siteCode).toUpperCase() === 'TEMPORY' ? 't' : siteCode;
    }
    buckets[sheet].push(row);
  }

  return buckets;
}

function buildMigrationStagingWorkbook(sheetBuckets, migrationSiteRows) {
  const wb = XLSX.utils.book_new();
  for (const sheetName of MIGRATION_WORKBOOK_SHEET_ORDER) {
    if (sheetName === MIGRATION_SHEET_SITES) {
      const rows = migrationSiteRows.map((row) => pickColumns(MIGRATION_SITES_COLUMNS, row));
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.json_to_sheet(rows, { header: [...MIGRATION_SITES_COLUMNS] }),
        sheetName,
      );
      continue;
    }

    const columns = columnsForMigrationWorkforceSheet(sheetName);
    const fixedGroup = FIXED_GROUP_BY_SHEET[sheetName];
    const rows = (sheetBuckets[sheetName] ?? []).map((row) =>
      pickColumns(columns, {
        ...row,
        corporate_group: row.corporate_group || fixedGroup,
      }),
    );
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(rows, { header: columns }),
      sheetName,
    );
  }
  return wb;
}

function buildSmGuardLinks(employees, qa) {
  const links = [];
  let skippedReserve = 0;
  let skippedNoSector = 0;
  let skippedNotGuardRank = 0;
  let skippedSmGroup = 0;

  for (const emp of employees) {
    const loc = emp._loc_code ?? '';
    const rank = emp.rank ?? '';
    if (loc === 'R' || loc === 'T') {
      skippedReserve += 1;
      continue;
    }
    if (!VO_EPF_BY_LOC[loc]) {
      skippedNoSector += 1;
      continue;
    }
    if (!GUARD_RANKS.has(rank)) {
      skippedNotGuardRank += 1;
      continue;
    }
    if (emp.group === 'SECTOR_MANAGER') {
      skippedSmGroup += 1;
      continue;
    }
    links.push({
      sm_epf: VO_EPF_BY_LOC[loc],
      guard_epf: emp.emp_number,
    });
  }

  qa.push(`SM_Guard_Links built: ${links.length} rows (Loc A–J guards only)`);
  qa.push(
    `SM_Guard_Links skipped: reserve/T=${skippedReserve} noSector=${skippedNoSector} notGuardRank=${skippedNotGuardRank} smGroup=${skippedSmGroup}`,
  );
  return links;
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
  return lines.join('\n') + '\n';
}

function loadRankMatrix() {
  const byCode = new Map(DEFAULT_RANK_MATRIX.map((r) => [r.rank_code, { ...r }]));
  const tsvPath = join(outDir, 'ranks-to-add.tsv');
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
  return [...byCode.values()].sort((a, b) => a.rank_code.localeCompare(b.rank_code));
}

function stripInternal(employees) {
  return employees.map(({ _loc_code, ...rest }) => rest);
}

function blankUnifiedRow() {
  const row = {};
  for (const col of UNIFIED_ROSTER_COLUMNS) row[col] = '';
  return row;
}

/** Merge legacy employee + site rows into one unified Roster row per employee. */
function mergeEmployeesSitesToUnifiedRoster(employees, sites) {
  const siteByName = new Map();
  for (const site of sites) {
    siteByName.set(cellRaw(site.site_name), site);
  }

  return stripInternal(employees).map((emp) => {
    const row = blankUnifiedRow();
    const siteLabel = cellRaw(emp.site);
    const site = siteByName.get(siteLabel);

    row.employee_id = cellRaw(emp.employee_id);
    row.emp_number = cellRaw(emp.emp_number);
    row.epf_no = cellRaw(emp.epf_no || emp.emp_number);
    row.full_name = cellRaw(emp.full_name);
    row.nic = emp.nic ?? '';
    row.passport_no = cellRaw(emp.passport_no);
    row.phone = emp.phone ?? '';
    row.dob = cellRaw(emp.dob);
    row.gender = cellRaw(emp.gender);
    row.nationality = cellRaw(emp.nationality);
    row.religion = cellRaw(emp.religion);
    row.home_address = cellRaw(emp.home_address);
    row.group = cellRaw(emp.group);
    row.rank = cellRaw(emp.rank);
    row.role = cellRaw(emp.role);
    row.site_name = siteLabel;
    row.date_joined = cellRaw(emp.date_joined);
    row.status = cellRaw(emp.status);
    row.base_salary = emp.base_salary ?? '';
    row.salary_type = cellRaw(emp.salary_type);
    row.epf_yn = cellRaw(emp.epf_yn);
    row.maternity_leave = cellRaw(emp.maternity_leave);
    row.bank_code = emp.bank_code ?? '';
    row.bank_name = cellRaw(emp.bank_name);
    row.branch_code = emp.branch_code ?? '';
    row.account_number = emp.account_number ?? '';
    row.mod_expiry = cellRaw(emp.mod_expiry);
    row.police_expiry = cellRaw(emp.police_expiry);

    if (site) {
      row.site_type = cellRaw(site.site_type);
      row.site_address = cellRaw(site.address);
      row.required_guards = site.required_guards ?? '';
      row.assigned_sm_epf = cellRaw(site.assigned_sm_epf);
      row.site_latitude = cellRaw(site.latitude);
      row.site_longitude = cellRaw(site.longitude);
      row.geofence_radius_m = cellRaw(site.geofence_radius_m);
      row.verification_mode = cellRaw(site.verification_mode);
      row.provides_food = cellRaw(site.provides_food);
      row.food_allowance_lkr = site.food_allowance_lkr ?? '';
      row.provides_accommodation = cellRaw(site.provides_accommodation);
      row.nfc_tag_id = cellRaw(site.nfc_tag_id);
    }

    return row;
  });
}

function buildUnifiedRosterWorkbook(rosterRows) {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(rosterRows, { header: UNIFIED_ROSTER_COLUMNS }),
    'Roster',
  );
  return wb;
}

function runCheck(mnrPath, sitesPath) {
  console.log('CVS legacy migration — preflight check\n');
  console.log(`  MNR:   ${mnrPath} ${existsSync(mnrPath) ? 'OK' : 'MISSING'}`);
  console.log(`  Sites: ${sitesPath} ${existsSync(sitesPath) ? 'OK' : 'MISSING'}`);
  console.log(`  Out:   ${outDir}`);

  if (!existsSync(mnrPath) || !existsSync(sitesPath)) {
    process.exit(1);
  }

  const { mnr, siteAssign, siteLookup } = loadLegacySources(mnrPath, sitesPath);
  const active = mnr.filter((r) => r.ACT_YN === true || r.ACT_YN === 'TRUE' || r.ACT_YN === 1);
  console.log(`\n  MNR rows: ${mnr.length}`);
  console.log(`  ACT_YN=True: ${active.length}`);
  console.log(`  Site assignments: ${siteAssign.length}`);
  console.log(`  Site lookup: ${siteLookup.length}`);
  console.log('\nPreflight OK — run with --run to build staging files.');
}

function runMigration(mnrPath, sitesPath) {
  mkdirSync(outDir, { recursive: true });
  const qa = [`Migration run ${new Date().toISOString()}`, `MNR: ${mnrPath}`, `Sites: ${sitesPath}`, ''];

  const { mnr, siteAssign, siteLookup } = loadLegacySources(mnrPath, sitesPath);
  const siteByEpf = buildSiteAssignIndex(siteAssign);
  logSheet1Orphans(mnr, siteAssign, qa);

  const mnrDeduped = dedupeMnrRows(mnr, siteByEpf, qa);
  const activeRows = filterActiveScope(mnrDeduped, qa);

  const withSite = activeRows.filter((r) => lookupSiteAssignment(r, siteByEpf));
  qa.push(
    `SITE join: ${withSite.length}/${activeRows.length} active employees matched Sheet1 (EPF_no or Emp_no)`,
  );

  const employees = buildEmployees(activeRows, siteByEpf, qa);
  const sites = buildSites(employees, siteLookup, qa);
  const links = buildSmGuardLinks(employees, qa);

  const rankMatrix = loadRankMatrix();
  qa.push(`Rank_Matrix rows: ${rankMatrix.length} (defaults + ranks-to-add.tsv)`);

  const rosterRows = mergeEmployeesSitesToUnifiedRoster(employees, sites);
  const empOut = stripInternal(employees);
  const siteCodeByName = buildSiteCodeByName(siteLookup);
  const siteByName = new Map(sites.map((site) => [cellRaw(site.site_name), site]));
  const migrationSiteRows = buildMigrationSiteRows(sites, siteCodeByName);
  const migrationSheetBuckets = splitEmployeesToMigrationSheets(
    employees,
    siteByName,
    siteCodeByName,
  );

  writeFileSync(join(outDir, 'staging-roster.csv'), toCsv(UNIFIED_ROSTER_COLUMNS, rosterRows));
  writeFileSync(join(outDir, 'staging-employees.csv'), toCsv(EMPLOYEE_COLUMNS, empOut));
  writeFileSync(join(outDir, 'staging-sites.csv'), toCsv(MIGRATION_SITES_COLUMNS, migrationSiteRows));
  writeFileSync(join(outDir, 'staging-sm-guard-links.csv'), toCsv(['sm_epf', 'guard_epf'], links));

  const legacyWb = buildUnifiedRosterWorkbook(rosterRows);
  XLSX.writeFile(legacyWb, join(outDir, ROSTER_STAGING_XLSX));

  const migrationWb = buildMigrationStagingWorkbook(migrationSheetBuckets, migrationSiteRows);
  XLSX.writeFile(migrationWb, join(outDir, MIGRATION_STAGING_XLSX));

  const migrationCounts = MIGRATION_WORKFORCE_SHEETS.map(
    (sheet) => `${sheet}=${migrationSheetBuckets[sheet]?.length ?? 0}`,
  ).join(', ');

  qa.push('');
  qa.push(`ROSTER unified rows: ${rosterRows.length} (legacy single-sheet QA diff)`);
  qa.push(`MIGRATION multi-sheet rows: ${migrationCounts}`);
  qa.push(`MIGRATION Sites tab: ${migrationSiteRows.length} rows`);
  qa.push(`SM_Guard_Links derived at import via assigned_sm_epf: ${links.length} legacy link rows computed`);
  qa.push(`Wrote staging-roster.csv (${rosterRows.length} rows)`);
  qa.push(`Wrote staging-employees.csv (${empOut.length} rows)`);
  qa.push(`Wrote staging-sites.csv (${migrationSiteRows.length} rows — QA diff)`);
  qa.push(`Wrote staging-sm-guard-links.csv (${links.length} rows — QA diff)`);
  qa.push(`Wrote ${ROSTER_STAGING_XLSX} (legacy unified Roster — QA diff only)`);
  qa.push(`Wrote ${MIGRATION_STAGING_XLSX} (multi-sheet migration import)`);

  writeFileSync(join(outDir, 'migration-qa-report.txt'), qa.join('\n') + '\n');
  console.log(qa.join('\n'));
  console.log(`\nDone. Outputs in ${outDir}`);
}

const SITE_TYPES = new Set(['OFFICE', 'BANK', 'PHARMACY', 'STORAGE', 'HOTEL', 'RESIDENTIAL', 'OTHER']);
const VERIFICATION_MODES = new Set(['A', 'B', 'C']);
const CORPORATE_GROUP_OPS = {
  GUARD: ['GUARD_FIELD', 'GUARD'],
  SECTOR_MANAGER: ['SECTOR_MANAGER'],
  HEAD_OFFICE: ['HEAD_OFFICE'],
  CAFE: ['CAFE'],
};

function matrixForValidation(rankRows) {
  return rankRows.map((r) => ({
    rankCode: cellRaw(r.rank_code).toUpperCase(),
    operationalGroup: cellRaw(r.operational_group),
  }));
}

function isRankValidForCorporateGroup(matrix, group, rank) {
  const ops = CORPORATE_GROUP_OPS[cellRaw(group).toUpperCase()];
  if (!ops) return false;
  const code = cellRaw(rank).toUpperCase();
  return matrix.some((r) => r.rankCode === code && ops.includes(r.operationalGroup));
}

function resolveStagingWorkbookPath() {
  const migration = join(outDir, MIGRATION_STAGING_XLSX);
  if (existsSync(migration)) return migration;
  const unified = join(outDir, ROSTER_STAGING_XLSX);
  if (existsSync(unified)) return unified;
  const legacy = join(outDir, LEGACY_STAGING_XLSX);
  if (existsSync(legacy)) return legacy;
  return migration;
}

function isMultiSheetMigrationWorkbook(wb) {
  return MIGRATION_WORKFORCE_SHEETS.some((sheetName) => wb.Sheets[sheetName]);
}

function parseMigrationWorkbookEmployees(wb) {
  const employees = [];
  for (const sheetName of MIGRATION_WORKFORCE_SHEETS) {
    const ws = wb.Sheets[sheetName];
    if (!ws) continue;
    const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
    for (const row of rows) {
      employees.push({
        ...row,
        group: cellRaw(row.corporate_group || row.group),
        site_name: cellRaw(row.site_name || row.site),
        _migrationSheet: sheetName,
      });
    }
  }
  return employees;
}

function parseMigrationWorkbookSites(wb) {
  const ws = wb.Sheets[MIGRATION_SHEET_SITES];
  if (!ws) return [];
  return XLSX.utils.sheet_to_json(ws, { defval: '' });
}

function validateStagingWorkbook(mnrPath) {
  const xlsxPath = resolveStagingWorkbookPath();
  if (!existsSync(xlsxPath)) {
    console.error('Missing staging workbook — run with --run first.');
    process.exit(1);
  }

  const wb = XLSX.readFile(xlsxPath);
  const isMultiSheet = isMultiSheetMigrationWorkbook(wb);
  const isUnified = !isMultiSheet && Boolean(wb.Sheets.Roster);
  const employees = isMultiSheet
    ? parseMigrationWorkbookEmployees(wb)
    : isUnified
      ? XLSX.utils.sheet_to_json(wb.Sheets.Roster, { defval: '' })
      : XLSX.utils.sheet_to_json(wb.Sheets.Employees, { defval: '' });
  const sites = isMultiSheet
    ? parseMigrationWorkbookSites(wb)
    : isUnified
      ? []
      : XLSX.utils.sheet_to_json(wb.Sheets.Sites, { defval: '' });
  const links = isMultiSheet || isUnified
    ? []
    : XLSX.utils.sheet_to_json(wb.Sheets.SM_Guard_Links, { defval: '' });
  const rankRows = isUnified || isMultiSheet
    ? loadRankMatrix()
    : XLSX.utils.sheet_to_json(wb.Sheets.Rank_Matrix, { defval: '' });
  const matrix = matrixForValidation(rankRows);

  const errors = [];
  const report = [
    '',
    '=== B-8 PRE-UPLOAD VALIDATION ===',
    `Validated: ${new Date().toISOString()}`,
    `Workbook: ${xlsxPath}`,
    `Format: ${isMultiSheet ? 'multi-sheet migration' : isUnified ? 'unified Roster' : 'legacy multi-tab'}`,
    '',
  ];

  const sheetLabel = isMultiSheet ? 'Workforce' : isUnified ? 'Roster' : 'Employees';
  const empNumbers = new Set();
  const siteCodes = isMultiSheet
    ? new Set(sites.map((s) => cellRaw(s.site_code).toUpperCase()).filter(Boolean))
    : new Set();
  const siteNames = isMultiSheet
    ? new Set(sites.map((s) => cellRaw(s.site_name)).filter(Boolean))
    : isUnified
      ? new Set(employees.map((r) => cellRaw(r.site_name)).filter(Boolean))
      : new Set(sites.map((s) => cellRaw(s.site_name)));
  const empByNumber = new Map();
  const empByEpf = new Map();

  employees.forEach((row, index) => {
    const line = index + 2;
    const empNumber = cellRaw(row.emp_number).toUpperCase();
    const epfNo = cellRaw(row.epf_no || row.emp_number).toUpperCase();
    if (!empNumber) errors.push(`${sheetLabel} row ${line}: emp_number required.`);
    if (!cellRaw(row.full_name)) errors.push(`${sheetLabel} row ${line}: full_name required.`);
    if (empNumber) {
      if (empNumbers.has(empNumber)) {
        errors.push(`${sheetLabel} row ${line}: duplicate emp_number "${empNumber}".`);
      }
      empNumbers.add(empNumber);
      empByNumber.set(empNumber, row);
    }
    if (epfNo) empByEpf.set(epfNo, row);
    const group = cellRaw(row.group || row.corporate_group);
    const rank = cellRaw(row.rank).toUpperCase();
    if (rank && group && !isRankValidForCorporateGroup(matrix, group, rank)) {
      errors.push(`${sheetLabel} row ${line}: rank "${rank}" not valid for group "${group}".`);
    }
    const salaryType = cellRaw(row.salary_type).toUpperCase();
    if (salaryType && salaryType !== 'BANK' && salaryType !== 'CASH') {
      errors.push(`${sheetLabel} row ${line}: salary_type must be BANK or CASH.`);
    }
    const site = cellRaw(isUnified || isMultiSheet ? row.site_name : row.site);
    if (site && !isUnified && !isMultiSheet && !siteNames.has(site)) {
      errors.push(`${sheetLabel} row ${line}: site "${site}" not found on Sites sheet.`);
    }
    if (isMultiSheet) {
      const sheetName = cellRaw(row._migrationSheet);
      const siteCode = cellRaw(row.site_code).toUpperCase();
      if (
        (sheetName === MIGRATION_SHEET_GUARD ||
          sheetName === MIGRATION_SHEET_INACTIVE ||
          sheetName === MIGRATION_SHEET_TEMP_GUARDS) &&
        siteCode &&
        !siteCodes.has(siteCode) &&
        !['R01', 'T', 'TEMPORY', 'CLEARANCE', 'HO1'].includes(siteCode)
      ) {
        errors.push(`${sheetLabel} row ${line}: site_code "${siteCode}" not on Sites sheet.`);
      }
      if (sheetName === MIGRATION_SHEET_RESIGNED && !cellRaw(row.date_resigned)) {
        errors.push(`${sheetLabel} row ${line}: date_resigned required on Resigned sheet.`);
      }
    }
    if (isUnified && site) {
      const siteType = cellRaw(row.site_type).toUpperCase();
      if (siteType && !SITE_TYPES.has(siteType)) {
        errors.push(`${sheetLabel} row ${line}: invalid site_type "${siteType}".`);
      }
      const mode = cellRaw(row.verification_mode).toUpperCase();
      if (mode && !VERIFICATION_MODES.has(mode)) {
        errors.push(`${sheetLabel} row ${line}: verification_mode must be A, B, or C.`);
      }
    }
  });

  if (isUnified || isMultiSheet) {
    employees.forEach((row, index) => {
      const line = index + 2;
      const smEpf = cellRaw(row.assigned_sm_epf).toUpperCase();
      if (!smEpf) return;
      const sm = empByEpf.get(smEpf) ?? empByNumber.get(smEpf);
      if (!sm || cellRaw(sm.group || sm.corporate_group).toUpperCase() !== 'SECTOR_MANAGER') {
        errors.push(`${sheetLabel} row ${line}: assigned_sm_epf "${smEpf}" is not a Sector Manager.`);
      }
    });
  }

  if (!isUnified && !isMultiSheet) {
    sites.forEach((row, index) => {
      const line = index + 2;
      const siteType = cellRaw(row.site_type).toUpperCase();
      if (siteType && !SITE_TYPES.has(siteType)) {
        errors.push(`Sites row ${line}: invalid site_type "${siteType}".`);
      }
      const mode = cellRaw(row.verification_mode).toUpperCase();
      if (mode && !VERIFICATION_MODES.has(mode)) {
        errors.push(`Sites row ${line}: verification_mode must be A, B, or C.`);
      }
    });

    links.forEach((row, index) => {
      const line = index + 2;
      const smEpf = cellRaw(row.sm_epf).toUpperCase();
      const guardEpf = cellRaw(row.guard_epf).toUpperCase();
      if (!smEpf || !guardEpf) {
        errors.push(`SM_Guard_Links row ${line}: sm_epf and guard_epf required.`);
        return;
      }
      const sm = empByNumber.get(smEpf);
      if (!sm || cellRaw(sm.group).toUpperCase() !== 'SECTOR_MANAGER') {
        errors.push(`SM_Guard_Links row ${line}: "${smEpf}" is not a Sector Manager.`);
      }
      if (!empByNumber.has(guardEpf)) {
        errors.push(`SM_Guard_Links row ${line}: guard "${guardEpf}" not found.`);
      }
    });
  }

  // Sensitive integrity vs legacy xlsx
  const mnrWb = readWorkbook(mnrPath);
  const mnr = sheetToObjects(mnrWb, 'Sheet1');
  const byEpf = new Map();
  for (const row of mnr) {
    const epf = cellRaw(row.EPF_no);
    if (!byEpf.has(epf)) byEpf.set(epf, row);
    else if (row.ACT_YN && !byEpf.get(epf).ACT_YN) byEpf.set(epf, row);
  }

  let nicMismatch = 0;
  let bankMismatch = 0;
  const spot = [];
  const empList = [...employees];
  for (let i = 0; i < 20 && i < empList.length; i++) {
    const idx = Math.floor((i / 20) * empList.length);
    spot.push(empList[idx]);
  }
  for (const row of spot) {
    const epf = cellRaw(row.emp_number);
    const leg = byEpf.get(epf);
    if (!leg) continue;
    const lNic = sensitiveCopy(leg.NIC);
    const lBank = sensitiveCopy(leg.Bank_Acc);
    if (lNic !== cellRaw(row.nic)) nicMismatch++;
    if (lBank !== cellRaw(row.account_number)) bankMismatch++;
  }

  let stagingNicReal = 0;
  let legacyNicReal = 0;
  let stagingBankReal = 0;
  let legacyBankReal = 0;
  for (const row of employees) {
    if (cellRaw(row.nic) && !['-', '='].includes(cellRaw(row.nic))) stagingNicReal++;
  }
  for (const row of mnr) {
    if (!(row.ACT_YN === true || row.ACT_YN === 'TRUE' || row.ACT_YN === 1)) continue;
    if (cellRaw(row.NIC) && !['-', '='].includes(cellRaw(row.NIC))) legacyNicReal++;
    const ba = cellRaw(row.Bank_Acc);
    if (ba && ba !== '0' && ba !== '-') legacyBankReal++;
  }
  for (const row of employees) {
    const ba = cellRaw(row.account_number);
    if (ba && ba !== '0' && ba !== '-') stagingBankReal++;
  }

  report.push(
    isMultiSheet
      ? `Workforce rows: ${employees.length} | Sites: ${sites.length} | format: multi-sheet migration`
      : isUnified
        ? `Roster rows: ${employees.length} | unique site_name: ${siteNames.size} | format: unified`
        : `Employees: ${employees.length} | Sites: ${sites.length} | SM links: ${links.length} | format: legacy`,
  );
  report.push(`Rank matrix entries: ${rankRows.length}`);
  report.push(`Duplicate emp_number: ${errors.filter((e) => e.includes('duplicate emp_number')).length}`);
  report.push(`Site name mismatches: ${errors.filter((e) => e.includes('not found on Sites')).length}`);
  report.push(`Rank/group errors: ${errors.filter((e) => e.includes('not valid for group')).length}`);
  report.push(`SM link errors: ${errors.filter((e) => e.includes('SM_Guard_Links')).length}`);
  report.push('');
  report.push('Sensitive counts (active scope):');
  report.push(`  NIC real: staging=${stagingNicReal} legacy=${legacyNicReal}`);
  report.push(`  Bank_Acc real: staging=${stagingBankReal} legacy=${legacyBankReal}`);
  report.push(`  Spot-check 20 rows — NIC mismatches: ${nicMismatch}, Bank_Acc mismatches: ${bankMismatch}`);
  report.push('');
  if (errors.length === 0) {
    report.push('RESULT: PASS — 0 validation errors');
  } else {
    report.push(`RESULT: FAIL — ${errors.length} validation error(s):`);
    report.push(...errors.slice(0, 50).map((e) => `  ! ${e}`));
    if (errors.length > 50) report.push(`  ... and ${errors.length - 50} more`);
  }

  const qaPath = join(outDir, 'migration-qa-report.txt');
  const prior = existsSync(qaPath) ? readFileSync(qaPath, 'utf8') : '';
  writeFileSync(qaPath, prior + report.join('\n') + '\n');

  console.log(report.join('\n'));
  if (errors.length > 0) process.exit(1);
}

function resolveLegacyPath(envKey, primary, fallback) {
  if (process.env[envKey]) return process.env[envKey];
  if (existsSync(primary)) return primary;
  if (existsSync(fallback)) return fallback;
  return primary;
}

const args = process.argv.slice(2);
const mnrPath = resolveLegacyPath('CVS_MNR_XLSX', DEFAULT_MNR, FALLBACK_MNR);
const sitesPath = resolveLegacyPath('CVS_SITES_XLS', DEFAULT_SITES, FALLBACK_SITES);

if (args.includes('--help') || args.includes('-h')) {
  console.log(`Usage:
  node scripts/migrate-cvs-legacy-mnr.mjs --check
  node scripts/migrate-cvs-legacy-mnr.mjs --run
  node scripts/migrate-cvs-legacy-mnr.mjs --validate

Env:
  CVS_MNR_XLSX   path to MASTER NOMINAL ROLL.xlsx
  CVS_SITES_XLS  path to SITE CODE AND NAMES.xls`);
} else if (args.includes('--validate')) {
  validateStagingWorkbook(mnrPath);
} else if (args.includes('--run')) {
  runMigration(mnrPath, sitesPath);
} else {
  runCheck(mnrPath, sitesPath);
}
