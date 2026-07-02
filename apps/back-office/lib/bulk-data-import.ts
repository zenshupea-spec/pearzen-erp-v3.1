import * as XLSX from 'xlsx';

import {
  isRankInMatrix,
  isRankValidForHrAssignment,
  isSingletonHrAssignablePortalRank,
  type OperationalGroup,
  type RankPayEntry,
  type RankSalaryType,
} from '../../../packages/rank-pay-matrix';

import {
  MIGRATION_EXCEL_DATA_START_ROW,
  MIGRATION_EXCEL_HEADER_ROW_COUNT,
  MIGRATION_SHEET_TITLE_SUFFIX,
} from './migration-workbook-exceljs';

import {
  EMPLOYEE_BULK_COLUMNS,
  LEGACY_EMPLOYEES_SHEET_NAME,
  LEGACY_SITES_SHEET_NAME,
  MIGRATION_SHEET_GUARD,
  MIGRATION_SHEET_HEAD_OFFICE,
  MIGRATION_SHEET_CAFE,
  MIGRATION_SHEET_INACTIVE,
  MIGRATION_SHEET_RESIGNED,
  MIGRATION_SHEET_SITES,
  MIGRATION_SHEET_SM,
  MIGRATION_SHEET_TEMP_GUARDS,
  MIGRATION_SITES_COLUMNS,
  MIGRATION_SHEET_META,
  MIGRATION_SHEET_LOOKUPS,
  MIGRATION_SITE_RATE_RANKS,
  MIGRATION_WORKBOOK_SHEET_ORDER,
  type MigrationSiteRateRank,
  MIGRATION_WORKFORCE_SHEET_NAMES,
  type MigrationWorkforceSheetName,
  type MigrationTemplateSheetInput,
  mapSiteProfileForMigrationExport,
  migrationEmployeeColumnGroupId,
  migrationSitesColumnGroupId,
  templateColumnsForMigrationWorkforceSheet,
  SITE_BULK_COLUMNS,
  UNIFIED_ROSTER_COLUMNS,
  UNIFIED_ROSTER_DEBT_COLUMNS,
  UNIFIED_ROSTER_SITE_COLUMNS,
  UNIFIED_ROSTER_SHEET_NAME,
} from './bulk-data-workbook';

/** MD / OD / FM — singleton portal roles; never bulk-imported or migration-exported. */
export function isBulkMigrationExcludedExecutiveRank(rank: unknown): boolean {
  return isSingletonHrAssignablePortalRank(String(rank ?? ''));
}

export function bulkImportSingletonPortalRankError(
  label: string,
  rank: string,
): string {
  return `${label}: rank "${rank}" cannot be bulk-imported. MD, OD, and FM are singleton portal roles — assign them in MNR or executive desks, not via workbook import.`;
}

export function shouldSkipBulkMigrationImportRow(
  row: Record<string, unknown>,
  protectedKeys?: { ids: Set<string>; empNumbers: Set<string> },
): boolean {
  if (isBulkMigrationExcludedExecutiveRank(row.rank)) return true;
  if (!protectedKeys) return false;

  const employeeId = String(row.employee_id ?? '').trim();
  if (employeeId && protectedKeys.ids.has(employeeId)) return true;

  for (const key of [
    String(row.emp_number ?? '').trim().toUpperCase(),
    String(row.epf_no ?? '').trim().toUpperCase(),
  ]) {
    if (key && protectedKeys.empNumbers.has(key)) return true;
  }

  return false;
}

export {
  MIGRATION_SITES_COLUMNS,
  MIGRATION_SHEET_META,
  MIGRATION_WORKFORCE_SHEET_NAMES,
  columnsForMigrationWorkforceSheet,
  isMigrationWorkforceSheetName,
} from './bulk-data-workbook';

export {
  buildMigrationExportLookupsSource,
  buildMigrationTemplateSheetInputs,
  buildMigrationTemplateSitesSheetInput,
  buildMigrationTemplateWorkforceSheetInputs,
  EXAMPLE_MIGRATION_INACTIVE_ROW,
  EXAMPLE_MIGRATION_RESIGNED_ROW,
  EXAMPLE_MIGRATION_SITE_ROWS,
  EXAMPLE_MIGRATION_TEMP_GUARD_ROW,
  MIGRATION_TEMPLATE_ALL_SHEETS,
  MIGRATION_TEMPLATE_OFFBOARDING_SHEETS,
  MIGRATION_TEMPLATE_SHEETS,
  MIGRATION_TEMPLATE_WORKFORCE_SHEETS,
  migrationEmployeeColumnGroupId,
  migrationSitesColumnGroupId,
  templateColumnsForMigrationWorkforceSheet,
} from './bulk-data-workbook';

export {
  MIGRATION_EXCEL_DATA_START_ROW,
  MIGRATION_EXCEL_HEADER_ROW_COUNT,
  MIGRATION_SHEET_TITLE_SUFFIX,
} from './migration-workbook-exceljs';

const CORPORATE_GROUPS = new Set([
  'GUARD',
  'SECTOR_MANAGER',
  'HEAD_OFFICE',
  'CAFE',
  'GUARD_FIELD',
]);

const OPERATIONAL_GROUPS = new Set<string>([
  'GUARD_FIELD',
  'GUARD',
  'CAFE',
  'SECTOR_MANAGER',
  'HEAD_OFFICE',
]);

const SITE_TYPES = new Set([
  'OFFICE',
  'BANK',
  'PHARMACY',
  'STORAGE',
  'HOTEL',
  'RESIDENTIAL',
  'OTHER',
]);

const VERIFICATION_MODES = new Set(['A', 'B', 'C']);

const NUMERIC_DEBT_COLUMNS = UNIFIED_ROSTER_DEBT_COLUMNS.filter((col) => col !== 'debt_notes');

function unifiedRowsFromParsed(
  parsed: ParsedBulkWorkbook | LegacyParsedBulkWorkbook,
): Record<string, unknown>[] {
  if ('rows' in parsed) return parsed.rows;
  return parsed.employees.map((row) => normalizeLegacyEmployeeRow(row));
}

function rowHasInlineSiteData(row: Record<string, unknown>): boolean {
  if (cellStr(row.site_name)) return true;
  return UNIFIED_ROSTER_SITE_COLUMNS.some((col) => cellStr(row[col]));
}

function isRankKnownInMatrix(
  rankMatrix: RankPayEntry[],
  group: string,
  rank: string,
): boolean {
  if (group) {
    return isRankValidForHrAssignment(rankMatrix, group, rank);
  }
  return isRankInMatrix(rankMatrix, rank);
}

export type MigrationSheetMeta = {
  sheetName: MigrationWorkforceSheetName;
  group: string;
  defaultStatus: string;
};

export type ParsedBulkWorkbook = {
  rows: Record<string, unknown>[];
  /** Per-row metadata aligned with `rows` (multi-sheet migration uploads). */
  sheetMeta?: MigrationSheetMeta[];
  /** Dedicated Sites tab rows (multi-sheet migration uploads). */
  siteRows?: Record<string, unknown>[];
  /** True when rows were merged from legacy Employees (+ Sites) sheets. */
  legacyFormat?: boolean;
  /** True when rows were read from migration workforce tabs (HEAD_OFFICE … Temp_Guards). */
  multiSheetFormat?: boolean;
};

/** Bridge shape for validate/apply until steps 5–12 migrate to unified rows. */
export type LegacyParsedBulkWorkbook = {
  employees: Record<string, unknown>[];
  sites: Record<string, unknown>[];
  smGuardLinks: Record<string, unknown>[];
};

export type BulkImportSummary = {
  employeesInserted: number;
  employeesUpdated: number;
  sitesInserted: number;
  sitesUpdated: number;
  smLinksUpserted: number;
  debtBalancesUpdated: number;
  debtLedgersSeeded: number;
  /** Rows with salary/penalty/loan/damage/other outstanding debt imported this run. */
  employeesWithOutstandingDebt: number;
};

export type UnifiedRosterDebtPatch = {
  uniform_outstanding_lkr: number;
  meals_advance_other_outstanding_lkr: number;
  salary_advance_outstanding_lkr: number;
  penalty_outstanding_lkr: number;
  salary_loan_outstanding_lkr: number;
  unit_damages_outstanding_lkr: number;
  other_deduction_outstanding_lkr: number;
  debt_notes: string | null;
};

export const BULK_IMPORT_DEBT_ADVANCE_REASON = 'Bulk roster import — salary advance';
export const BULK_IMPORT_DEBT_PENALTY_REASON = 'bulk roster import: penalty';
export const BULK_IMPORT_DEBT_PLAN_NOTE = 'Bulk roster import';

/** migration = merge-on-update (blank cells preserve DB); full_replace = overwrite all fields */
export type BulkImportMode = 'migration' | 'full_replace';

export const DEFAULT_BULK_IMPORT_MODE: BulkImportMode = 'migration';

export function employeeBalanceDebtPatch(debts: UnifiedRosterDebtPatch) {
  return {
    uniform_balance: debts.uniform_outstanding_lkr,
    accom_balance: debts.meals_advance_other_outstanding_lkr,
  };
}

export function rosterRowHasDebtLedgerSeeds(debts: UnifiedRosterDebtPatch): boolean {
  return (
    debts.salary_advance_outstanding_lkr > 0 ||
    debts.penalty_outstanding_lkr > 0 ||
    debts.salary_loan_outstanding_lkr > 0 ||
    debts.unit_damages_outstanding_lkr > 0 ||
    debts.other_deduction_outstanding_lkr > 0
  );
}

export function rosterRowHasOutstandingDebt(debts: UnifiedRosterDebtPatch): boolean {
  return (
    debts.uniform_outstanding_lkr > 0 ||
    debts.meals_advance_other_outstanding_lkr > 0 ||
    rosterRowHasDebtLedgerSeeds(debts)
  );
}

export const BULK_IMPORT_INSTALMENT_PLAN_REMINDER =
  'Outstanding debts were imported — open FM Payroll Register (/fm/roster) and set up instalment plans on each affected employee (Deductions modal on /fm). Debt notes appear in the register when provided.';

export type UnifiedRosterEmployeeMapped = {
  employeeId: string | null;
  empNumber: string | null;
  payload: {
    emp_number?: string;
    full_name: string;
    passport_no: string | null;
    epf_no: string | null;
    previous_epf_no: string | null;
    email: string | null;
    dob: string | null;
    gender: string | null;
    nationality: string | null;
    religion: string | null;
    home_address: string | null;
    role: string | null;
    group: string | null;
    rank: string | null;
    site: string | null;
    date_joined: string | null;
    status: string;
    base_salary: number | null;
    salary_type: string | null;
    epf_yn: boolean;
    fixed_allowance_lkr: number;
    special_allowance_lkr: number;
    site_allowance_lkr: number;
    meal_allowance_lkr: number;
    transport_allowance_lkr: number;
    fixed_deduction_lkr: number;
    bank_code: string | null;
    bank_name: string | null;
    branch_code: string | null;
    account_number: string | null;
    grama_niladari_expiry: string | null;
    maternity_leave: boolean;
    date_resigned: string | null;
    resignation_type: string | null;
    resignation_notes: string | null;
    hr_memo: string | null;
    debt_notes: string | null;
    nicPlain: string;
    phonePlain: string;
  };
};

export type UnifiedRosterSitePatch = {
  siteName: string;
  payload: {
    site_name: string;
    site_type:
      | 'OFFICE'
      | 'BANK'
      | 'PHARMACY'
      | 'STORAGE'
      | 'HOTEL'
      | 'RESIDENTIAL'
      | 'OTHER';
    address: string | null;
    required_guards: number;
    assigned_sm_epf: string | null;
    latitude: number | null;
    longitude: number | null;
    geofence_radius: number | null;
    verification_mode: string;
    provides_food: boolean;
    food_allowance_lkr: number;
    provides_accommodation: boolean;
    nfc_tag_id: string | null;
    needs_om_gps_capture: boolean;
  };
};

export type UnifiedRosterSmLink = {
  sm_epf: string;
  guard_epf: string;
};

export type MappedUnifiedRosterRow = {
  employee: UnifiedRosterEmployeeMapped;
  sitePatch?: UnifiedRosterSitePatch;
  debts: UnifiedRosterDebtPatch;
  smLink?: UnifiedRosterSmLink;
};

/** Site upsert row — same shape as mapSiteImportRow(). */
export type DerivedSiteImportRow = {
  siteId: string | null;
  siteName: string;
  payload: UnifiedRosterSitePatch['payload'];
};

/** Sites-tab row mapped for site_profiles upsert (step 14). */
export type MigrationDerivedSiteImportRow = {
  siteId: string | null;
  siteCode: string;
  siteName: string;
  payload: MigrationSiteImportPayload;
};

/** Rate matrix entry stored in site_profiles.rate_matrix JSON. */
export type MigrationSiteRateEntry = {
  qty: number;
  invoiceRate: number;
  payRate: number;
};

export type MigrationSiteRateMatrix = Partial<
  Record<MigrationSiteRateRank, MigrationSiteRateEntry>
>;

/** Full site_profiles payload from the Sites migration sheet (step 7+). */
export type MigrationSiteImportPayload = {
  site_code: string | null;
  site_name: string;
  site_type:
    | 'OFFICE'
    | 'BANK'
    | 'PHARMACY'
    | 'STORAGE'
    | 'HOTEL'
    | 'RESIDENTIAL'
    | 'OTHER';
  site_status: string;
  client_name: string | null;
  parent_client: string | null;
  client_billing_address: string | null;
  contract_start: string | null;
  contract_end: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  geofence_radius: number | null;
  verification_mode: string;
  needs_om_gps_capture: boolean;
  assigned_sm_epf: string | null;
  required_guards: number;
  per_visit_charge_lkr: number;
  min_dwell_time_minutes: number;
  nfc_tag_id: string | null;
  provides_food: boolean;
  food_allowance_lkr: number;
  provides_accommodation: boolean;
  rate_matrix: MigrationSiteRateMatrix;
};

export type MigrationSiteImportRow = {
  siteCode: string;
  siteName: string;
  payload: MigrationSiteImportPayload;
};

function readSheetRowValues(ws: XLSX.WorkSheet, row1Based: number): string[] {
  const ref = ws['!ref'];
  if (!ref) return [];
  const range = XLSX.utils.decode_range(ref);
  const values: string[] = [];
  for (let col = range.s.c; col <= range.e.c; col += 1) {
    const addr = XLSX.utils.encode_cell({ r: row1Based - 1, c: col });
    const cell = ws[addr];
    values.push(cell == null ? '' : String(cell.v ?? '').trim());
  }
  return values;
}

function rowLooksLikeColumnHeader(values: readonly string[]): boolean {
  return values.some(
    (value) =>
      value === 'emp_number' || value === 'employee_id' || value === 'site_code',
  );
}

/** 0-based row index of machine column keys (row 3 for styled Pearzen exports). */
export function detectMigrationColumnHeaderRow0(ws: XLSX.WorkSheet): number {
  if (rowLooksLikeColumnHeader(readSheetRowValues(ws, 1))) return 0;
  if (rowLooksLikeColumnHeader(readSheetRowValues(ws, MIGRATION_EXCEL_HEADER_ROW_COUNT))) {
    return MIGRATION_EXCEL_HEADER_ROW_COUNT - 1;
  }
  const titleRow = readSheetRowValues(ws, 1).join(' ');
  if (titleRow.includes(MIGRATION_SHEET_TITLE_SUFFIX)) {
    return MIGRATION_EXCEL_HEADER_ROW_COUNT - 1;
  }
  return 0;
}

function sheetToRows(wb: XLSX.WorkBook, sheetName: string): Record<string, unknown>[] {
  const ws = wb.Sheets[sheetName];
  if (!ws) return [];

  const headerRow0 = detectMigrationColumnHeaderRow0(ws);
  if (headerRow0 === 0) {
    return XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' });
  }

  const ref = ws['!ref'];
  if (!ref) return [];

  const range = XLSX.utils.decode_range(ref);
  const headers: string[] = [];
  for (let col = range.s.c; col <= range.e.c; col += 1) {
    const addr = XLSX.utils.encode_cell({ r: headerRow0, c: col });
    headers.push(String(ws[addr]?.v ?? '').trim());
  }

  const rows: Record<string, unknown>[] = [];
  for (let row = headerRow0 + 1; row <= range.e.r; row += 1) {
    const record: Record<string, unknown> = {};
    let hasValue = false;

    for (let col = range.s.c; col <= range.e.c; col += 1) {
      const header = headers[col - range.s.c];
      if (!header) continue;
      const addr = XLSX.utils.encode_cell({ r: row, c: col });
      const raw = ws[addr]?.v;
      const value = raw === null || raw === undefined ? '' : raw;
      record[header] = value;
      if (value !== '') hasValue = true;
    }

    if (hasValue) rows.push(record);
  }

  return rows;
}

function isBlankRow(row: Record<string, unknown>, keys: readonly string[]): boolean {
  return keys.every((key) => {
    const v = row[key];
    return v === '' || v === null || v === undefined;
  });
}

function cellStr(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).trim();
}

/** Prefer grama_niladari_expiry; accept legacy mod/police columns from old workbooks. */
function resolveGramaNiladariExpiryFromRow(row: Record<string, unknown>): string | null {
  const primary = cellStr(row.grama_niladari_expiry);
  if (primary) return primary;
  return cellStr(row.mod_expiry) || cellStr(row.police_expiry) || null;
}

/** Canonical employees.group for DB upsert — sector managers store HEAD_OFFICE + rank SM. */
export function normalizeBulkImportStoredGroup(
  group: string | null | undefined,
  rank?: string | null | undefined,
): string | null {
  const rankCode = cellStr(rank).toUpperCase();
  let raw = cellStr(group).toUpperCase();
  if (raw === 'GUARD_FIELD') raw = 'GUARD';
  if (rankCode === 'SM' || raw === 'SECTOR_MANAGER') return 'HEAD_OFFICE';
  return raw || null;
}

/** Canonical employees.rank for sector manager imports. */
export function normalizeBulkImportStoredRank(
  group: string | null | undefined,
  rank?: string | null | undefined,
  options?: { migrationSheet?: string | null },
): string | null {
  const rawGroup = cellStr(group).toUpperCase();
  const rankCode = cellStr(rank).toUpperCase();
  if (
    options?.migrationSheet === MIGRATION_SHEET_SM ||
    rawGroup === 'SECTOR_MANAGER' ||
    rankCode === 'SM'
  ) {
    return 'SM';
  }
  return rankCode || null;
}

function applyBulkImportStoredWorkforceShape(row: Record<string, unknown>): Record<string, unknown> {
  const normalized = { ...row };
  const migrationSheet = cellStr(normalized._migrationSheet) || null;
  const sourceGroup =
    cellStr(normalized.group).toUpperCase() || cellStr(normalized.corporate_group).toUpperCase();
  const rank = normalizeBulkImportStoredRank(sourceGroup, normalized.rank, { migrationSheet });
  const group = normalizeBulkImportStoredGroup(sourceGroup, rank);
  if (group) normalized.group = group;
  if (rank) normalized.rank = rank;
  return normalized;
}

/** True when the workbook cell was left empty (merge-on-update skips these fields). */
export function isWorkbookCellBlank(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (value instanceof Date) return false;
  return String(value).trim() === '';
}

function parseBool(value: unknown): boolean {
  const s = cellStr(value).toUpperCase();
  return s === 'TRUE' || s === 'YES' || s === '1' || s === 'Y';
}

function parseOptionalNumber(value: unknown): number | null {
  const s = cellStr(value);
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function normalizeLegacyEmployeeRow(row: Record<string, unknown>): Record<string, unknown> {
  const normalized = { ...row };
  if (!cellStr(normalized.site_name) && cellStr(row.site)) {
    normalized.site_name = row.site;
  }
  return normalized;
}

/** Maps unified roster rows to legacy employee rows (site_name → site). */
export function toLegacyImportShape(parsed: ParsedBulkWorkbook): LegacyParsedBulkWorkbook {
  const employees = parsed.rows.map((row) => {
    const copy = { ...row };
    if (!cellStr(copy.site) && cellStr(copy.site_name)) {
      copy.site = copy.site_name;
    }
    return copy;
  });
  return { employees, sites: [], smGuardLinks: [] };
}

function mergeLegacySiteIntoEmployeeRow(
  employee: Record<string, unknown>,
  site: Record<string, unknown> | undefined,
): Record<string, unknown> {
  const merged = normalizeLegacyEmployeeRow(employee);
  if (!site) return merged;

  return {
    ...merged,
    site_type: cellStr(merged.site_type) || cellStr(site.site_type) || '',
    site_address: cellStr(merged.site_address) || cellStr(site.address) || '',
    required_guards: merged.required_guards ?? site.required_guards ?? '',
    assigned_sm_epf: cellStr(merged.assigned_sm_epf) || cellStr(site.assigned_sm_epf) || '',
    site_latitude: merged.site_latitude ?? site.latitude ?? '',
    site_longitude: merged.site_longitude ?? site.longitude ?? '',
    geofence_radius_m: merged.geofence_radius_m ?? site.geofence_radius_m ?? '',
    verification_mode: cellStr(merged.verification_mode) || cellStr(site.verification_mode) || '',
    provides_food: merged.provides_food ?? site.provides_food ?? '',
    food_allowance_lkr: merged.food_allowance_lkr ?? site.food_allowance_lkr ?? '',
    provides_accommodation: merged.provides_accommodation ?? site.provides_accommodation ?? '',
    nfc_tag_id: cellStr(merged.nfc_tag_id) || cellStr(site.nfc_tag_id) || '',
  };
}

function readLegacyMergedRosterRows(wb: XLSX.WorkBook): Record<string, unknown>[] {
  const employees = sheetToRows(wb, LEGACY_EMPLOYEES_SHEET_NAME).filter(
    (row) => !isBlankRow(row, EMPLOYEE_BULK_COLUMNS),
  );
  const sites = sheetToRows(wb, LEGACY_SITES_SHEET_NAME).filter(
    (row) => !isBlankRow(row, SITE_BULK_COLUMNS),
  );

  const siteByName = new Map<string, Record<string, unknown>>();
  for (const site of sites) {
    const key = cellStr(site.site_name).toLowerCase();
    if (key) siteByName.set(key, site);
  }

  return employees
    .map((employee) => {
      const siteName = cellStr(employee.site_name) || cellStr(employee.site);
      const site = siteName ? siteByName.get(siteName.toLowerCase()) : undefined;
      return mergeLegacySiteIntoEmployeeRow(employee, site);
    })
    .filter((row) => !isBlankRow(row, UNIFIED_ROSTER_COLUMNS));
}

function readRosterRows(wb: XLSX.WorkBook): {
  rows: Record<string, unknown>[];
  legacyFormat: boolean;
} {
  const rosterRows = sheetToRows(wb, UNIFIED_ROSTER_SHEET_NAME).filter(
    (row) => !isBlankRow(row, UNIFIED_ROSTER_COLUMNS),
  );
  if (rosterRows.length > 0) {
    return { rows: rosterRows, legacyFormat: false };
  }

  const legacyEmployees = sheetToRows(wb, LEGACY_EMPLOYEES_SHEET_NAME).filter(
    (row) => !isBlankRow(row, EMPLOYEE_BULK_COLUMNS),
  );
  if (!legacyEmployees.length) {
    return { rows: [], legacyFormat: false };
  }

  const legacySites = sheetToRows(wb, LEGACY_SITES_SHEET_NAME).filter(
    (row) => !isBlankRow(row, SITE_BULK_COLUMNS),
  );

  if (legacySites.length > 0) {
    return { rows: readLegacyMergedRosterRows(wb), legacyFormat: true };
  }

  return {
    rows: legacyEmployees
      .map(normalizeLegacyEmployeeRow)
      .filter((row) => !isBlankRow(row, UNIFIED_ROSTER_COLUMNS)),
    legacyFormat: true,
  };
}

const MIGRATION_WORKFORCE_ROW_KEYS = [
  'emp_number',
  'employee_id',
  'full_name',
  'nic',
  'epf_no',
] as const;

function isBlankMigrationWorkforceRow(row: Record<string, unknown>): boolean {
  return isBlankRow(row, MIGRATION_WORKFORCE_ROW_KEYS);
}

function isBlankMigrationSiteRow(row: Record<string, unknown>): boolean {
  return !cellStr(row.site_code) && !cellStr(row.site_name);
}

/** True when the workbook uses migration workforce tabs instead of a single Roster sheet. */
export function isMultiSheetMigrationWorkbook(wb: XLSX.WorkBook): boolean {
  return MIGRATION_WORKFORCE_SHEET_NAMES.some((sheetName) => wb.SheetNames.includes(sheetName));
}

/** Maps corporate_group + sheet defaults onto unified import fields (group, status). */
export function normalizeMigrationWorkforceRow(
  row: Record<string, unknown>,
  meta: MigrationSheetMeta,
): Record<string, unknown> {
  const normalized = { ...row };

  const corporateGroup = cellStr(normalized.corporate_group).toUpperCase();
  const group = cellStr(normalized.group).toUpperCase();
  normalized.group = group || corporateGroup || meta.group;

  if (!cellStr(normalized.status)) {
    normalized.status = meta.defaultStatus;
  }

  normalized._migrationSheet = meta.sheetName;
  return applyBulkImportStoredWorkforceShape(normalized);
}

/** Apply sheet-level group/status defaults immediately before employee upsert (step 15). */
export function applyMigrationEmployeeDefaults(
  row: Record<string, unknown>,
  meta?: MigrationSheetMeta,
): Record<string, unknown> {
  if (!meta) return row;

  const normalized = { ...row };
  const corporateGroup = cellStr(normalized.corporate_group).toUpperCase();
  const group = cellStr(normalized.group).toUpperCase();
  normalized.group = group || corporateGroup || meta.group;
  normalized.status = cellStr(normalized.status) || meta.defaultStatus;
  return applyBulkImportStoredWorkforceShape(normalized);
}

function readMultiSheetMigrationWorkbook(wb: XLSX.WorkBook): ParsedBulkWorkbook {
  const rows: Record<string, unknown>[] = [];
  const sheetMeta: MigrationSheetMeta[] = [];

  for (const sheetName of MIGRATION_WORKFORCE_SHEET_NAMES) {
    if (!wb.SheetNames.includes(sheetName)) continue;

    const meta = MIGRATION_SHEET_META[sheetName];
    const sheetMetaEntry: MigrationSheetMeta = {
      sheetName,
      group: meta.fixedGroup,
      defaultStatus: meta.defaultStatus,
    };

    const sheetRows = sheetToRows(wb, sheetName).filter((row) => !isBlankMigrationWorkforceRow(row));
    for (const row of sheetRows) {
      rows.push(normalizeMigrationWorkforceRow(row, sheetMetaEntry));
      sheetMeta.push(sheetMetaEntry);
    }
  }

  const siteRows = wb.SheetNames.includes(MIGRATION_SHEET_SITES)
    ? sheetToRows(wb, MIGRATION_SHEET_SITES).filter((row) => !isBlankMigrationSiteRow(row))
    : [];

  return joinMigrationWorkforceRowsToSites({
    rows,
    sheetMeta,
    siteRows,
    multiSheetFormat: true,
  });
}

/** Index Sites sheet rows by upper-case site_code. */
export function buildMigrationSiteCodeIndex(
  siteRows: readonly Record<string, unknown>[],
): Map<string, Record<string, unknown>> {
  const index = new Map<string, Record<string, unknown>>();
  for (const site of siteRows) {
    const code = cellStr(site.site_code).toUpperCase();
    if (!code) continue;
    index.set(code, site);
  }
  return index;
}

function mergeSiteField(
  row: Record<string, unknown>,
  key: string,
  value: unknown,
): void {
  if (value === null || value === undefined || value === '') return;
  if (cellStr(row[key])) return;
  row[key] = value;
}

/** Enrich a workforce row from the Sites tab via site_code (step 11). */
export function joinMigrationRowToSiteByCode(
  row: Record<string, unknown>,
  siteByCode: Map<string, Record<string, unknown>>,
): Record<string, unknown> {
  const siteCode = cellStr(row.site_code).toUpperCase();
  if (!siteCode) return row;

  const site = siteByCode.get(siteCode);
  if (!site) return row;

  const joined = { ...row };
  const siteName = cellStr(site.site_name);
  if (siteName) {
    joined.site_name = siteName;
    joined.site = siteName;
  }

  mergeSiteField(joined, 'site_type', cellStr(site.site_type).toUpperCase() || '');
  mergeSiteField(joined, 'site_address', cellStr(site.address));
  mergeSiteField(joined, 'site_latitude', site.latitude ?? '');
  mergeSiteField(joined, 'site_longitude', site.longitude ?? '');
  mergeSiteField(joined, 'geofence_radius_m', site.geofence_radius_m ?? '');
  mergeSiteField(joined, 'verification_mode', cellStr(site.verification_mode).toUpperCase() || '');
  mergeSiteField(joined, 'assigned_sm_epf', cellStr(site.assigned_sm_epf).toUpperCase() || '');
  mergeSiteField(joined, 'required_guards', site.required_guards ?? '');
  mergeSiteField(joined, 'provides_food', site.provides_food ?? '');
  mergeSiteField(joined, 'food_allowance_lkr', site.food_allowance_lkr ?? '');
  mergeSiteField(joined, 'provides_accommodation', site.provides_accommodation ?? '');
  mergeSiteField(joined, 'nfc_tag_id', cellStr(site.nfc_tag_id));

  return joined;
}

/** Apply Sites-tab join across all parsed migration workforce rows. */
export function joinMigrationWorkforceRowsToSites(parsed: ParsedBulkWorkbook): ParsedBulkWorkbook {
  if (!parsed.multiSheetFormat) return parsed;

  const siteByCode = buildMigrationSiteCodeIndex(parsed.siteRows ?? []);
  const rows = parsed.rows.map((row) => joinMigrationRowToSiteByCode(row, siteByCode));

  return { ...parsed, rows };
}

function migrationImportRowLabel(parsed: ParsedBulkWorkbook, index: number): string {
  const sheetName = parsed.sheetMeta?.[index]?.sheetName;
  if (!sheetName) return `Roster row ${index + 2}`;

  let sheetRowNumber = 0;
  for (let i = 0; i <= index; i += 1) {
    if (parsed.sheetMeta?.[i]?.sheetName === sheetName) sheetRowNumber += 1;
  }

  return `${sheetName} row ${sheetRowNumber + MIGRATION_EXCEL_DATA_START_ROW - 1}`;
}

function migrationSiteRowLabel(index: number): string {
  return `${MIGRATION_SHEET_SITES} row ${index + MIGRATION_EXCEL_DATA_START_ROW}`;
}

function bulkImportRowLabel(
  parsed: ParsedBulkWorkbook | LegacyParsedBulkWorkbook,
  index: number,
): string {
  if ('multiSheetFormat' in parsed && parsed.multiSheetFormat && parsed.sheetMeta?.length) {
    return migrationImportRowLabel(parsed, index);
  }
  return `Roster row ${index + 2}`;
}

function validateWorkforceIdentityFields(
  row: Record<string, unknown>,
  label: string,
  errors: string[],
  options?: { requireNicAndPhoneOnInsert?: boolean },
): void {
  const empNumber = cellStr(row.emp_number).toUpperCase();
  const employeeId = cellStr(row.employee_id);
  const fullName = cellStr(row.full_name);

  if (!empNumber && !employeeId) {
    errors.push(`${label}: emp_number or employee_id is required.`);
  }
  if (!fullName) {
    errors.push(`${label}: full_name is required.`);
  }

  if (options?.requireNicAndPhoneOnInsert && !employeeId) {
    if (!cellStr(row.nic)) {
      errors.push(`${label}: nic is required for new employees.`);
    }
    if (!cellStr(row.phone)) {
      errors.push(`${label}: phone is required for new employees.`);
    }
  }
}

function validateWorkforceRankAndPay(
  row: Record<string, unknown>,
  label: string,
  rankMatrix: RankPayEntry[],
  errors: string[],
): void {
  const group = cellStr(row.group).toUpperCase();
  if (group && !CORPORATE_GROUPS.has(group)) {
    errors.push(
      `${label}: group "${group}" is invalid. Use GUARD, SECTOR_MANAGER, HEAD_OFFICE, CAFE, or GUARD_FIELD.`,
    );
  }

  const rank = cellStr(row.rank).toUpperCase();
  if (rank && isBulkMigrationExcludedExecutiveRank(rank)) {
    errors.push(bulkImportSingletonPortalRankError(label, rank));
    return;
  }
  if (rank) {
    const known = isRankKnownInMatrix(rankMatrix, group, rank);
    if (!known) {
      const rankTitle = cellStr(row.rank_title);
      const rankBasicPay = parseOptionalNumber(row.rank_basic_pay);
      if (!rankTitle) {
        errors.push(
          `${label}: rank "${rank}" is not in the Rank Pay Matrix — rank_title is required to create it.`,
        );
      }
      if (rankBasicPay == null || rankBasicPay < 0) {
        errors.push(
          `${label}: rank "${rank}" is not in the Rank Pay Matrix — rank_basic_pay (≥ 0) is required to create it.`,
        );
      }
      const rankSalaryType = cellStr(row.rank_salary_type).toUpperCase();
      if (rankSalaryType && rankSalaryType !== 'BANK' && rankSalaryType !== 'CASH') {
        errors.push(`${label}: rank_salary_type must be BANK or CASH.`);
      }
      const rankOpGroup = cellStr(row.rank_operational_group).toUpperCase();
      if (rankOpGroup && !CORPORATE_GROUPS.has(rankOpGroup)) {
        errors.push(`${label}: rank_operational_group "${rankOpGroup}" is invalid.`);
      }
    }
  }

  const salaryType = cellStr(row.salary_type).toUpperCase();
  if (salaryType && salaryType !== 'BANK' && salaryType !== 'CASH') {
    errors.push(`${label}: salary_type must be BANK or CASH.`);
  }
}

function validateWorkforceInlineSiteFields(
  row: Record<string, unknown>,
  label: string,
  errors: string[],
): void {
  if (!rowHasInlineSiteData(row)) return;

  const siteType = cellStr(row.site_type).toUpperCase();
  if (siteType && !SITE_TYPES.has(siteType)) {
    errors.push(
      `${label}: site_type "${siteType}" is invalid (OFFICE, BANK, PHARMACY, STORAGE, HOTEL, RESIDENTIAL, OTHER).`,
    );
  }

  const mode = cellStr(row.verification_mode).toUpperCase();
  if (mode && !VERIFICATION_MODES.has(mode)) {
    errors.push(`${label}: verification_mode must be A, B, or C.`);
  }

  const lat = parseOptionalNumber(row.site_latitude);
  const lng = parseOptionalNumber(row.site_longitude);
  if (cellStr(row.site_latitude) && lat == null) {
    errors.push(`${label}: site_latitude must be a number.`);
  }
  if (cellStr(row.site_longitude) && lng == null) {
    errors.push(`${label}: site_longitude must be a number.`);
  }
  if (lat != null && (lat < -90 || lat > 90)) {
    errors.push(`${label}: site_latitude must be between -90 and 90.`);
  }
  if (lng != null && (lng < -180 || lng > 180)) {
    errors.push(`${label}: site_longitude must be between -180 and 180.`);
  }
}

function validateWorkforceDebtColumns(
  row: Record<string, unknown>,
  label: string,
  errors: string[],
): void {
  for (const col of NUMERIC_DEBT_COLUMNS) {
    const raw = row[col];
    if (!cellStr(raw)) continue;
    const amount = parseOptionalNumber(raw);
    if (amount == null) {
      errors.push(`${label}: ${col} must be a number.`);
    } else if (amount < 0) {
      errors.push(`${label}: ${col} must be ≥ 0.`);
    }
  }
}

function validateMigrationWorkforceSheetRules(
  parsed: ParsedBulkWorkbook,
  row: Record<string, unknown>,
  index: number,
  label: string,
  errors: string[],
): void {
  const sheetName = parsed.sheetMeta?.[index]?.sheetName;
  if (!sheetName) return;

  if (sheetName === MIGRATION_SHEET_RESIGNED && !cellStr(row.date_resigned)) {
    errors.push(`${label}: date_resigned is required on the Resigned sheet.`);
  }

  if (sheetName === MIGRATION_SHEET_GUARD) {
    const siteCode = cellStr(row.site_code).toUpperCase();
    if (!siteCode) {
      errors.push(`${label}: site_code is required for deployed guards on the GUARD sheet.`);
    }
  }
}

function validateMigrationSiteRows(parsed: ParsedBulkWorkbook, errors: string[]): void {
  if (!parsed.multiSheetFormat || parsed.siteRows === undefined) return;

  const siteCodes = new Set<string>();
  const siteNames = new Set<string>();
  const numericSiteColumns = [
    'required_guards',
    'per_visit_charge_lkr',
    'food_allowance_lkr',
    'min_dwell_time_minutes',
    'geofence_radius_m',
    ...migrationSiteRateMatrixColumnNames(),
  ];

  parsed.siteRows.forEach((row, index) => {
    const label = migrationSiteRowLabel(index);
    const siteCode = cellStr(row.site_code).toUpperCase();
    const siteName = cellStr(row.site_name);

    if (!siteCode) {
      errors.push(`${label}: site_code is required.`);
    } else if (siteCodes.has(siteCode)) {
      errors.push(`${label}: duplicate site_code "${siteCode}".`);
    } else {
      siteCodes.add(siteCode);
    }

    if (!siteName) {
      errors.push(`${label}: site_name is required.`);
    } else {
      const nameKey = siteName.toLowerCase();
      if (siteNames.has(nameKey)) {
        errors.push(`${label}: duplicate site_name "${siteName}".`);
      } else {
        siteNames.add(nameKey);
      }
    }

    const siteType = cellStr(row.site_type).toUpperCase();
    if (siteType && !SITE_TYPES.has(siteType)) {
      errors.push(
        `${label}: site_type "${siteType}" is invalid (OFFICE, BANK, PHARMACY, STORAGE, HOTEL, RESIDENTIAL, OTHER).`,
      );
    }

    for (const col of numericSiteColumns) {
      const raw = row[col];
      if (!cellStr(raw)) continue;
      const amount = parseOptionalNumber(raw);
      if (amount == null) {
        errors.push(`${label}: ${col} must be a number.`);
      } else if (amount < 0) {
        errors.push(`${label}: ${col} must be ≥ 0.`);
      }
    }
  });
}

function migrationSiteRateMatrixColumnNames(): string[] {
  const cols: string[] = [];
  for (const rank of MIGRATION_SITE_RATE_RANKS) {
    cols.push(`${rank}_qty`, `${rank}_invoice_rate_lkr`, `${rank}_pay_rate_lkr`);
  }
  return cols;
}

function validateMigrationSiteCodes(parsed: ParsedBulkWorkbook, errors: string[]): void {
  if (!parsed.multiSheetFormat || parsed.siteRows === undefined) return;

  const siteByCode = buildMigrationSiteCodeIndex(parsed.siteRows);
  const siteCodeSheets = new Set<string>([
    MIGRATION_SHEET_GUARD,
    MIGRATION_SHEET_INACTIVE,
    MIGRATION_SHEET_TEMP_GUARDS,
  ]);

  parsed.rows.forEach((row, index) => {
    const sheetName = parsed.sheetMeta?.[index]?.sheetName;
    if (sheetName && !siteCodeSheets.has(sheetName)) return;

    const siteCode = cellStr(row.site_code).toUpperCase();
    if (!siteCode) return;
    if (siteByCode.has(siteCode)) return;
    errors.push(
      `${migrationImportRowLabel(parsed, index)}: site_code "${siteCode}" is not on the Sites sheet.`,
    );
  });
}

export function bulkImportValidationWarnings(parsed: ParsedBulkWorkbook): string[] {
  if (parsed.multiSheetFormat || !parsed.legacyFormat) return [];
  return [
    'Legacy multi-sheet workbook detected (Employees + Sites). New downloads use a single Roster sheet — consider re-exporting after import.',
  ];
}

export function parseBulkDataWorkbook(buffer: Buffer): ParsedBulkWorkbook {
  // Read path: SheetJS (xlsx). Write path uses ExcelJS — see migration-workbook-exceljs.ts.
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true });

  if (isMultiSheetMigrationWorkbook(wb)) {
    return readMultiSheetMigrationWorkbook(wb);
  }

  const { rows, legacyFormat } = readRosterRows(wb);
  return legacyFormat ? { rows, legacyFormat: true } : { rows };
}

export function validateBulkImport(
  parsed: ParsedBulkWorkbook | LegacyParsedBulkWorkbook,
  rankMatrix: RankPayEntry[],
): string[] {
  const rows = unifiedRowsFromParsed(parsed);
  const errors: string[] = [];
  const isMultiSheet =
    'multiSheetFormat' in parsed && Boolean(parsed.multiSheetFormat && parsed.sheetMeta?.length);

  if (!rows.length) {
    const hasMigrationSites =
      'multiSheetFormat' in parsed &&
      Boolean(parsed.multiSheetFormat && parsed.siteRows?.length);
    if (!hasMigrationSites) {
      errors.push(
        'Workbook has no data rows on migration workforce tabs (HEAD_OFFICE, GUARD, …), Roster, or legacy Employees. Add at least one row to import.',
      );
      return errors;
    }
  } else {
    const empNumbers = new Set<string>();

    rows.forEach((row, index) => {
      const label = bulkImportRowLabel(parsed, index);
      const rank = cellStr(row.rank).toUpperCase();
      if (rank && isBulkMigrationExcludedExecutiveRank(rank)) {
        errors.push(bulkImportSingletonPortalRankError(label, rank));
        return;
      }

      validateWorkforceIdentityFields(row, label, errors, {
        requireNicAndPhoneOnInsert: isMultiSheet,
      });

      const empNumber = cellStr(row.emp_number).toUpperCase();
      if (empNumber) {
        if (empNumbers.has(empNumber)) {
          errors.push(`${label}: duplicate emp_number "${empNumber}".`);
        }
        empNumbers.add(empNumber);
      }

      validateWorkforceRankAndPay(row, label, rankMatrix, errors);
      validateWorkforceInlineSiteFields(row, label, errors);
      validateWorkforceDebtColumns(row, label, errors);

      if (isMultiSheet) {
        validateMigrationWorkforceSheetRules(parsed as ParsedBulkWorkbook, row, index, label, errors);
      }
    });
  }

  if ('multiSheetFormat' in parsed && parsed.multiSheetFormat) {
    validateMigrationSiteRows(parsed, errors);
    validateMigrationSiteCodes(parsed, errors);
    validateMigrationSmAssignments(parsed, errors);
  }

  return errors;
}

function parseAllowanceLkr(value: unknown): number {
  const n = parseOptionalNumber(value);
  return n != null ? Math.max(0, Math.round(n)) : 0;
}

function resolveSiteName(row: Record<string, unknown>): string {
  return cellStr(row.site_name) || cellStr(row.site);
}

function buildSitePatch(row: Record<string, unknown>): UnifiedRosterSitePatch | undefined {
  const siteName = resolveSiteName(row);
  if (!siteName) return undefined;

  const lat =
    parseOptionalNumber(row.site_latitude) ?? parseOptionalNumber(row.latitude);
  const lng =
    parseOptionalNumber(row.site_longitude) ?? parseOptionalNumber(row.longitude);
  const radius = parseOptionalNumber(row.geofence_radius_m);
  const address = cellStr(row.site_address) || cellStr(row.address);

  return {
    siteName,
    payload: {
      site_name: siteName,
      site_type: (cellStr(row.site_type).toUpperCase() || 'OTHER') as UnifiedRosterSitePatch['payload']['site_type'],
      address: address.toUpperCase() || null,
      required_guards: parseOptionalNumber(row.required_guards) ?? 1,
      assigned_sm_epf: cellStr(row.assigned_sm_epf).toUpperCase() || null,
      latitude: lat,
      longitude: lng,
      geofence_radius: radius,
      verification_mode: cellStr(row.verification_mode).toUpperCase() || 'B',
      provides_food: parseBool(row.provides_food),
      food_allowance_lkr: parseAllowanceLkr(row.food_allowance_lkr),
      provides_accommodation: parseBool(row.provides_accommodation),
      nfc_tag_id: cellStr(row.nfc_tag_id) || null,
      needs_om_gps_capture: lat == null || lng == null,
    },
  };
}

function mapDebts(row: Record<string, unknown>): UnifiedRosterDebtPatch {
  return {
    uniform_outstanding_lkr: parseAllowanceLkr(row.uniform_outstanding_lkr),
    meals_advance_other_outstanding_lkr: parseAllowanceLkr(
      row.meals_advance_other_outstanding_lkr,
    ),
    salary_advance_outstanding_lkr: parseAllowanceLkr(row.salary_advance_outstanding_lkr),
    penalty_outstanding_lkr: parseAllowanceLkr(row.penalty_outstanding_lkr),
    salary_loan_outstanding_lkr: parseAllowanceLkr(row.salary_loan_outstanding_lkr),
    unit_damages_outstanding_lkr: parseAllowanceLkr(row.unit_damages_outstanding_lkr),
    other_deduction_outstanding_lkr: parseAllowanceLkr(row.other_deduction_outstanding_lkr),
    debt_notes: cellStr(row.debt_notes) || null,
  };
}

function buildSmLink(
  row: Record<string, unknown>,
  group: string | null,
  siteSmByName?: Map<string, string>,
): UnifiedRosterSmLink | undefined {
  const normalized = normalizeLegacyEmployeeRow(row);
  let smEpf = cellStr(normalized.assigned_sm_epf).toUpperCase();
  if (!smEpf && siteSmByName) {
    const siteName = resolveSiteName(normalized);
    if (siteName) {
      smEpf = siteSmByName.get(siteName.toLowerCase()) ?? '';
    }
  }
  const guardEpf = (cellStr(normalized.epf_no) || cellStr(normalized.emp_number)).toUpperCase();
  if (!smEpf || !guardEpf) return undefined;
  if (group !== 'GUARD' && group !== 'GUARD_FIELD') return undefined;
  return { sm_epf: smEpf, guard_epf: guardEpf };
}

function siteSmEpfByName(rows: Record<string, unknown>[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const site of deriveSitesFromRosterRows(rows)) {
    const smEpf = site.payload.assigned_sm_epf;
    if (smEpf) map.set(site.siteName.toLowerCase(), smEpf);
  }
  return map;
}

/** Unique SM ↔ guard links from roster rows (row or merged site assigned_sm_epf). */
export function collectSmLinksFromRosterRows(
  rows: Record<string, unknown>[],
): UnifiedRosterSmLink[] {
  const siteSmByName = siteSmEpfByName(rows);
  const seen = new Set<string>();
  const links: UnifiedRosterSmLink[] = [];

  for (const row of rows) {
    const normalized = normalizeLegacyEmployeeRow(row);
    const group = cellStr(normalized.group).toUpperCase() || null;
    const link = buildSmLink(normalized, group, siteSmByName);
    if (!link) continue;
    const key = `${link.sm_epf}|${link.guard_epf}`;
    if (seen.has(key)) continue;
    seen.add(key);
    links.push(link);
  }

  return links;
}

/** Workforce tabs that contribute SM ↔ guard assignment links (step 12). */
export const MIGRATION_SM_LINK_SHEET_NAMES = [
  MIGRATION_SHEET_GUARD,
  MIGRATION_SHEET_TEMP_GUARDS,
] as const;

export type MigrationSmLinkSheetName = (typeof MIGRATION_SM_LINK_SHEET_NAMES)[number];

/** EPF numbers listed on the SM workforce tab (for cross-sheet validation). */
export function collectSmEpfsFromMigrationSmSheet(
  rows: Record<string, unknown>[],
  sheetMeta?: MigrationSheetMeta[],
): Set<string> {
  const epfs = new Set<string>();

  rows.forEach((row, index) => {
    if (sheetMeta?.length) {
      if (sheetMeta[index]?.sheetName !== MIGRATION_SHEET_SM) return;
    } else {
      const group = cellStr(row.group).toUpperCase();
      const rank = cellStr(row.rank).toUpperCase();
      if (group !== 'SECTOR_MANAGER' && !(group === 'HEAD_OFFICE' && rank === 'SM')) {
        return;
      }
    }

    const epf = (cellStr(row.epf_no) || cellStr(row.emp_number)).toUpperCase();
    if (epf) epfs.add(epf);
  });

  return epfs;
}

function collectSmLinksFromMigrationSheets(
  rows: Record<string, unknown>[],
  sheetMeta: MigrationSheetMeta[],
): UnifiedRosterSmLink[] {
  const smLinkSheets = new Set<string>(MIGRATION_SM_LINK_SHEET_NAMES);
  const seen = new Set<string>();
  const links: UnifiedRosterSmLink[] = [];

  rows.forEach((row, index) => {
    const sheetName = sheetMeta[index]?.sheetName;
    if (!sheetName || !smLinkSheets.has(sheetName)) return;

    const normalized = normalizeLegacyEmployeeRow(row);
    const group = cellStr(normalized.group).toUpperCase() || null;
    const link = buildSmLink(normalized, group);
    if (!link) return;

    const key = `${link.sm_epf}|${link.guard_epf}`;
    if (seen.has(key)) return;
    seen.add(key);
    links.push(link);
  });

  return links;
}

/** Collect SM ↔ guard links from unified Roster rows or migration Guard / Temp_Guards tabs. */
export function collectSmLinksFromParsedWorkbook(
  parsed: Pick<ParsedBulkWorkbook, 'rows' | 'sheetMeta' | 'multiSheetFormat'>,
): UnifiedRosterSmLink[] {
  if (parsed.multiSheetFormat && parsed.sheetMeta?.length) {
    return collectSmLinksFromMigrationSheets(parsed.rows, parsed.sheetMeta);
  }

  return collectSmLinksFromRosterRows(parsed.rows);
}

function validateMigrationSmAssignments(parsed: ParsedBulkWorkbook, errors: string[]): void {
  if (!parsed.multiSheetFormat || !parsed.sheetMeta?.length) return;

  const smEpfs = collectSmEpfsFromMigrationSmSheet(parsed.rows, parsed.sheetMeta);
  const smLinkSheets = new Set<string>(MIGRATION_SM_LINK_SHEET_NAMES);

  parsed.rows.forEach((row, index) => {
    const sheetName = parsed.sheetMeta?.[index]?.sheetName;
    if (!sheetName || !smLinkSheets.has(sheetName)) return;

    const smEpf = cellStr(row.assigned_sm_epf).toUpperCase();
    if (!smEpf) return;

    if (!smEpfs.has(smEpf)) {
      errors.push(
        `${migrationImportRowLabel(parsed, index)}: assigned_sm_epf "${smEpf}" is not on the SM sheet.`,
      );
    }
  });
}

function isBlankCell(value: unknown): boolean {
  return value === '' || value === null || value === undefined;
}

function pickFirstSiteField(
  rows: Record<string, unknown>[],
  keys: readonly string[],
): unknown {
  for (const row of rows) {
    for (const key of keys) {
      const value = row[key];
      if (!isBlankCell(value)) return value;
    }
  }
  return '';
}

function mergeInlineSiteFields(rows: Record<string, unknown>[]): Record<string, unknown> {
  const merged: Record<string, unknown> = {
    site_name: resolveSiteName(normalizeLegacyEmployeeRow(rows[0] ?? {})),
  };

  merged.site_type = pickFirstSiteField(rows, ['site_type']);
  merged.site_address = pickFirstSiteField(rows, ['site_address', 'address']);
  merged.required_guards = pickFirstSiteField(rows, ['required_guards']);
  merged.assigned_sm_epf = pickFirstSiteField(rows, ['assigned_sm_epf']);
  merged.site_latitude = pickFirstSiteField(rows, ['site_latitude', 'latitude']);
  merged.site_longitude = pickFirstSiteField(rows, ['site_longitude', 'longitude']);
  merged.geofence_radius_m = pickFirstSiteField(rows, ['geofence_radius_m']);
  merged.verification_mode = pickFirstSiteField(rows, ['verification_mode']);
  merged.provides_food = pickFirstSiteField(rows, ['provides_food']);
  merged.food_allowance_lkr = pickFirstSiteField(rows, ['food_allowance_lkr']);
  merged.provides_accommodation = pickFirstSiteField(rows, ['provides_accommodation']);
  merged.nfc_tag_id = pickFirstSiteField(rows, ['nfc_tag_id']);

  return merged;
}

/**
 * Collects unique site_name values from roster rows and merges inline site columns
 * (first non-blank wins per field) for site_profiles upsert.
 */
export function deriveSitesFromRosterRows(
  rows: Record<string, unknown>[],
): DerivedSiteImportRow[] {
  const buckets = new Map<string, { siteName: string; rows: Record<string, unknown>[] }>();

  for (const row of rows) {
    const siteName = resolveSiteName(normalizeLegacyEmployeeRow(row));
    if (!siteName) continue;

    const key = siteName.toLowerCase();
    const existing = buckets.get(key);
    if (existing) {
      existing.rows.push(row);
    } else {
      buckets.set(key, { siteName, rows: [row] });
    }
  }

  const sites: DerivedSiteImportRow[] = [];
  for (const { siteName, rows: siteRows } of buckets.values()) {
    const merged = mergeInlineSiteFields(siteRows);
    merged.site_name = siteName;
    const mapped = mapSiteImportRow(merged);
    if (mapped.siteName) sites.push(mapped);
  }

  return sites;
}

/** True when site_profiles should be loaded from the dedicated Sites tab. */
export function usesMigrationSitesSheet(parsed: ParsedBulkWorkbook): boolean {
  return Boolean(parsed.multiSheetFormat && parsed.siteRows !== undefined);
}

/** Maps Sites sheet rows to site_profiles upsert payloads (key: site_code, fallback site_name). */
export function collectMigrationSiteImportRows(
  parsed: ParsedBulkWorkbook,
): MigrationDerivedSiteImportRow[] {
  if (!usesMigrationSitesSheet(parsed)) return [];

  return (parsed.siteRows ?? []).map((row) => {
    const mapped = mapSiteSheetRow(row);
    return {
      siteId: cellStr(row.site_id) || null,
      siteCode: mapped.siteCode,
      siteName: mapped.siteName,
      payload: mapped.payload,
    };
  });
}

function defaultOperationalGroupForCorporateGroup(group: string): OperationalGroup {
  switch (group) {
    case 'SECTOR_MANAGER':
      return 'SECTOR_MANAGER';
    case 'HEAD_OFFICE':
      return 'HEAD_OFFICE';
    case 'CAFE':
      return 'CAFE';
    case 'GUARD':
    case 'GUARD_FIELD':
    default:
      return 'GUARD_FIELD';
  }
}

function buildRankEntryFromRosterRow(row: Record<string, unknown>): RankPayEntry | null {
  const rankCode = cellStr(row.rank).toUpperCase();
  if (!rankCode) return null;

  const rankTitle = cellStr(row.rank_title).toUpperCase();
  const basicPay = parseOptionalNumber(row.rank_basic_pay);
  if (!rankTitle || basicPay == null) return null;

  const group = cellStr(row.group).toUpperCase();
  const salaryTypeRaw = cellStr(row.rank_salary_type).toUpperCase();
  const salaryType: RankSalaryType = salaryTypeRaw === 'CASH' ? 'CASH' : 'BANK';
  const opGroupRaw = cellStr(row.rank_operational_group).toUpperCase();
  const operationalGroup: OperationalGroup = OPERATIONAL_GROUPS.has(opGroupRaw)
    ? (opGroupRaw as OperationalGroup)
    : defaultOperationalGroupForCorporateGroup(group);

  return {
    id: `rp-bulk-${rankCode.toLowerCase()}`,
    rankCode,
    fullTitle: rankTitle,
    basicPay: Math.max(0, Math.round(basicPay)),
    annualIncrement: 0,
    salaryType,
    operationalGroup,
  };
}

export type EnsureRanksFromRosterResult = {
  matrix: RankPayEntry[];
  createdRankCodes: string[];
};

/**
 * Appends RankPayEntry rows for unknown rank codes found in the roster.
 * Skips ranks already present in the matrix (validation must require title/pay for new ranks).
 */
export function ensureRanksFromRosterRows(
  rows: Record<string, unknown>[],
  rankMatrix: RankPayEntry[],
): EnsureRanksFromRosterResult {
  const matrix = [...rankMatrix];
  const createdRankCodes: string[] = [];
  const pending = new Set<string>();

  for (const row of rows) {
    const normalized = normalizeLegacyEmployeeRow(row);
    const rank = cellStr(normalized.rank).toUpperCase();
    const group = cellStr(normalized.group).toUpperCase();
    if (!rank || pending.has(rank)) continue;

    if (isRankInMatrix(matrix, rank) || isRankKnownInMatrix(matrix, group, rank)) {
      pending.add(rank);
      continue;
    }

    const entry = buildRankEntryFromRosterRow(normalized);
    if (!entry) continue;

    matrix.push(entry);
    pending.add(rank);
    createdRankCodes.push(rank);
  }

  return { matrix, createdRankCodes };
}

/** Maps one unified Roster row to employee, optional site patch, debts, and SM link. */
export function mapUnifiedRosterRow(row: Record<string, unknown>): MappedUnifiedRosterRow {
  const normalized = applyBulkImportStoredWorkforceShape(normalizeLegacyEmployeeRow(row));
  const empNumber = cellStr(normalized.emp_number).toUpperCase();
  const rank = normalizeBulkImportStoredRank(normalized.group, normalized.rank, {
    migrationSheet: cellStr(normalized._migrationSheet) || null,
  });
  const group = normalizeBulkImportStoredGroup(normalized.group, rank);
  const siteName = resolveSiteName(normalized);

  return {
    employee: {
      employeeId: cellStr(normalized.employee_id) || null,
      empNumber: empNumber || null,
      payload: {
        emp_number: empNumber || undefined,
        full_name: cellStr(normalized.full_name).toUpperCase(),
        passport_no: cellStr(normalized.passport_no).toUpperCase() || null,
        epf_no: cellStr(normalized.epf_no) || null,
        previous_epf_no: cellStr(normalized.previous_epf_no) || null,
        email: cellStr(normalized.email).toLowerCase() || null,
        dob: cellStr(normalized.dob) || null,
        gender: cellStr(normalized.gender).toUpperCase() || null,
        nationality: cellStr(normalized.nationality).toUpperCase() || null,
        religion: cellStr(normalized.religion).toUpperCase() || null,
        home_address: cellStr(normalized.home_address).toUpperCase() || null,
        role: cellStr(normalized.role).toUpperCase() || null,
        group,
        rank,
        site: siteName || null,
        date_joined: cellStr(normalized.date_joined) || null,
        status: cellStr(normalized.status) || 'ACTIVE',
        base_salary: parseOptionalNumber(normalized.base_salary),
        salary_type: cellStr(normalized.salary_type).toUpperCase() || null,
        epf_yn: parseBool(normalized.epf_yn),
        fixed_allowance_lkr: parseAllowanceLkr(normalized.fixed_allowance_lkr),
        special_allowance_lkr: parseAllowanceLkr(normalized.special_allowance_lkr),
        site_allowance_lkr: parseAllowanceLkr(normalized.site_allowance_lkr),
        meal_allowance_lkr: parseAllowanceLkr(normalized.meal_allowance_lkr),
        transport_allowance_lkr: parseAllowanceLkr(normalized.transport_allowance_lkr),
        fixed_deduction_lkr: parseAllowanceLkr(normalized.fixed_deduction_lkr),
        bank_code: cellStr(normalized.bank_code) || null,
        bank_name: cellStr(normalized.bank_name).toUpperCase() || null,
        branch_code: cellStr(normalized.branch_code) || null,
        account_number: cellStr(normalized.account_number) || null,
        grama_niladari_expiry: resolveGramaNiladariExpiryFromRow(normalized),
        maternity_leave: parseBool(normalized.maternity_leave),
        date_resigned: cellStr(normalized.date_resigned) || null,
        resignation_type: cellStr(normalized.resignation_type) || null,
        resignation_notes: cellStr(normalized.resignation_notes) || null,
        hr_memo: cellStr(normalized.hr_memo) || null,
        debt_notes: mapDebts(normalized).debt_notes,
        nicPlain: cellStr(normalized.nic).toUpperCase(),
        phonePlain: cellStr(normalized.phone),
      },
    },
    sitePatch: buildSitePatch(normalized),
    debts: mapDebts(normalized),
    smLink: buildSmLink(normalized, group),
  };
}

export function mapEmployeeImportRow(row: Record<string, unknown>) {
  return mapUnifiedRosterRow(row).employee;
}

const EMPLOYEE_UPSERT_MERGE_FIELDS = [
  { payloadKey: 'emp_number', rowKeys: ['emp_number'] },
  { payloadKey: 'full_name', rowKeys: ['full_name'] },
  { payloadKey: 'passport_no', rowKeys: ['passport_no'] },
  { payloadKey: 'epf_no', rowKeys: ['epf_no'] },
  { payloadKey: 'previous_epf_no', rowKeys: ['previous_epf_no'] },
  { payloadKey: 'email', rowKeys: ['email'] },
  { payloadKey: 'dob', rowKeys: ['dob'] },
  { payloadKey: 'gender', rowKeys: ['gender'] },
  { payloadKey: 'nationality', rowKeys: ['nationality'] },
  { payloadKey: 'religion', rowKeys: ['religion'] },
  { payloadKey: 'home_address', rowKeys: ['home_address'] },
  { payloadKey: 'emergency_contact', rowKeys: ['emergency_contact'] },
  { payloadKey: 'employee_referral', rowKeys: ['employee_referral'] },
  { payloadKey: 'role', rowKeys: ['role'] },
  { payloadKey: 'group', rowKeys: ['group'] },
  { payloadKey: 'rank', rowKeys: ['rank'] },
  { payloadKey: 'site', rowKeys: ['site_name', 'site'] },
  { payloadKey: 'date_joined', rowKeys: ['date_joined'] },
  { payloadKey: 'status', rowKeys: ['status'] },
  { payloadKey: 'date_resigned', rowKeys: ['date_resigned'] },
  { payloadKey: 'resignation_type', rowKeys: ['resignation_type'] },
  { payloadKey: 'resignation_notes', rowKeys: ['resignation_notes'] },
  { payloadKey: 'base_salary', rowKeys: ['base_salary'] },
  { payloadKey: 'salary_type', rowKeys: ['salary_type'] },
  { payloadKey: 'epf_yn', rowKeys: ['epf_yn'] },
  { payloadKey: 'fixed_allowance_lkr', rowKeys: ['fixed_allowance_lkr'] },
  { payloadKey: 'special_allowance_lkr', rowKeys: ['special_allowance_lkr'] },
  { payloadKey: 'site_allowance_lkr', rowKeys: ['site_allowance_lkr'] },
  { payloadKey: 'meal_allowance_lkr', rowKeys: ['meal_allowance_lkr'] },
  { payloadKey: 'transport_allowance_lkr', rowKeys: ['transport_allowance_lkr'] },
  { payloadKey: 'fixed_deduction_lkr', rowKeys: ['fixed_deduction_lkr'] },
  { payloadKey: 'bank_code', rowKeys: ['bank_code'] },
  { payloadKey: 'bank_name', rowKeys: ['bank_name'] },
  { payloadKey: 'branch_code', rowKeys: ['branch_code'] },
  { payloadKey: 'account_number', rowKeys: ['account_number'] },
  { payloadKey: 'grama_niladari_expiry', rowKeys: ['grama_niladari_expiry'] },
  { payloadKey: 'maternity_leave', rowKeys: ['maternity_leave'] },
  { payloadKey: 'hr_memo', rowKeys: ['hr_memo'] },
  { payloadKey: 'debt_notes', rowKeys: ['debt_notes'] },
  { payloadKey: 'temp_parent_id', rowKeys: ['temp_parent_epf'] },
  { payloadKey: 'nic', rowKeys: ['nic'] },
  { payloadKey: 'phone', rowKeys: ['phone'] },
] as const;

export type EmployeeUpsertOptions = {
  mode: BulkImportMode;
  rawRow: Record<string, unknown>;
  isUpdate: boolean;
  /** Resolved employees.id for Temp_Guards temp_parent_epf (step 15). */
  tempParentId?: string | null;
};

/** Plain employees row payload before PII encryption (bulk import upsert). */
export function employeeDbPayloadFromUnified(
  mapped: UnifiedRosterEmployeeMapped,
  companyId: string,
  extras?: { tempParentId?: string | null },
): Record<string, unknown> {
  const { payload } = mapped;
  const group = normalizeBulkImportStoredGroup(payload.group, payload.rank) ?? payload.group;
  const rank = normalizeBulkImportStoredRank(payload.group, payload.rank) ?? payload.rank;
  const storedGroup = group === 'GUARD_FIELD' ? 'GUARD' : group;

  const record: Record<string, unknown> = {
    emp_number: payload.emp_number,
    full_name: payload.full_name,
    passport_no: payload.passport_no,
    epf_no: payload.epf_no,
    previous_epf_no: payload.previous_epf_no,
    email: payload.email,
    dob: payload.dob,
    gender: payload.gender,
    nationality: payload.nationality,
    religion: payload.religion,
    home_address: payload.home_address,
    role: payload.role,
    group: storedGroup,
    rank,
    site: payload.site,
    date_joined: payload.date_joined,
    status: payload.status,
    date_resigned: payload.date_resigned,
    resignation_type: payload.resignation_type,
    resignation_notes: payload.resignation_notes,
    base_salary: payload.base_salary,
    salary_type: payload.salary_type,
    epf_yn: payload.epf_yn,
    fixed_allowance_lkr: payload.fixed_allowance_lkr,
    special_allowance_lkr: payload.special_allowance_lkr,
    site_allowance_lkr: payload.site_allowance_lkr,
    meal_allowance_lkr: payload.meal_allowance_lkr,
    transport_allowance_lkr: payload.transport_allowance_lkr,
    fixed_deduction_lkr: payload.fixed_deduction_lkr,
    bank_code: payload.bank_code,
    bank_name: payload.bank_name,
    branch_code: payload.branch_code,
    account_number: payload.account_number,
    grama_niladari_expiry: payload.grama_niladari_expiry,
    maternity_leave: payload.maternity_leave,
    hr_memo: payload.hr_memo,
    debt_notes: payload.debt_notes,
    company_id: companyId,
    nic: payload.nicPlain || null,
    phone: payload.phonePlain || null,
  };

  if (extras?.tempParentId !== undefined) {
    record.temp_parent_id = extras.tempParentId;
  }

  return record;
}

/**
 * Builds the employees upsert payload. On migration updates, only non-blank workbook
 * cells are included so partial rows do not wipe existing MNR data.
 */
export function employeeDbPayloadForUpsert(
  mapped: UnifiedRosterEmployeeMapped,
  companyId: string,
  options: EmployeeUpsertOptions,
): Record<string, unknown> {
  const full = employeeDbPayloadFromUnified(mapped, companyId, {
    tempParentId: options.tempParentId,
  });
  if (!options.isUpdate || options.mode === 'full_replace') {
    return full;
  }

  const normalized = normalizeLegacyEmployeeRow(options.rawRow);
  const patch: Record<string, unknown> = {};

  for (const { payloadKey, rowKeys } of EMPLOYEE_UPSERT_MERGE_FIELDS) {
    const provided = rowKeys.some((key) => !isWorkbookCellBlank(normalized[key]));
    if (provided) {
      patch[payloadKey] = full[payloadKey];
    }
  }

  if (
    options.tempParentId !== undefined &&
    !isWorkbookCellBlank(normalized.temp_parent_epf)
  ) {
    patch.temp_parent_id = options.tempParentId;
  }

  return patch;
}

/** Debt balance patch; null when migration update has no debt columns filled. */
export function employeeBalanceDebtPatchForUpsert(
  rawRow: Record<string, unknown>,
  debts: UnifiedRosterDebtPatch,
  options: Pick<EmployeeUpsertOptions, 'mode' | 'isUpdate'>,
): Record<string, unknown> | null {
  const full = employeeBalanceDebtPatch(debts);
  if (!options.isUpdate || options.mode === 'full_replace') {
    return full;
  }

  const patch: Record<string, unknown> = {};
  if (!isWorkbookCellBlank(rawRow.uniform_outstanding_lkr)) {
    patch.uniform_balance = full.uniform_balance;
  }
  if (!isWorkbookCellBlank(rawRow.meals_advance_other_outstanding_lkr)) {
    patch.accom_balance = full.accom_balance;
  }

  return Object.keys(patch).length > 0 ? patch : null;
}

export function rosterDebtColumnProvided(
  rawRow: Record<string, unknown>,
  column: keyof UnifiedRosterDebtPatch,
): boolean {
  return !isWorkbookCellBlank(rawRow[column]);
}

export function mapSiteImportRow(row: Record<string, unknown>) {
  const patch = buildSitePatch(row);
  const siteName = patch?.siteName ?? cellStr(row.site_name);
  return {
    siteId: cellStr(row.site_id) || null,
    siteName,
    payload: patch?.payload ?? {
      site_name: siteName,
      site_type: 'OTHER' as const,
      address: null,
      required_guards: 1,
      assigned_sm_epf: null,
      latitude: null,
      longitude: null,
      geofence_radius: null,
      verification_mode: 'B',
      provides_food: false,
      food_allowance_lkr: 0,
      provides_accommodation: false,
      nfc_tag_id: null,
      needs_om_gps_capture: true,
    },
  };
}

/** Builds site_profiles.rate_matrix JSON from Sites sheet S6 columns. */
export function buildRateMatrixFromMigrationSiteRow(
  row: Record<string, unknown>,
): MigrationSiteRateMatrix {
  const matrix: MigrationSiteRateMatrix = {};

  for (const rank of MIGRATION_SITE_RATE_RANKS) {
    const qty = parseOptionalNumber(row[`${rank}_qty`]) ?? 0;
    const invoiceRate = parseOptionalNumber(row[`${rank}_invoice_rate_lkr`]) ?? 0;
    const payRate = parseOptionalNumber(row[`${rank}_pay_rate_lkr`]) ?? 0;
    if (qty > 0 || invoiceRate > 0 || payRate > 0) {
      matrix[rank] = { qty, invoiceRate, payRate };
    }
  }

  return matrix;
}

/** Maps one Sites sheet row to site_profiles upsert fields (step 14 applies this). */
export function mapSiteSheetRow(row: Record<string, unknown>): MigrationSiteImportRow {
  const siteCode = cellStr(row.site_code).toUpperCase();
  const siteName = cellStr(row.site_name);
  const lat = parseOptionalNumber(row.latitude);
  const lng = parseOptionalNumber(row.longitude);
  const address = cellStr(row.address);
  const clientName = cellStr(row.client_name);
  const siteTypeRaw = cellStr(row.site_type).toUpperCase();

  return {
    siteCode,
    siteName,
    payload: {
      site_code: siteCode || null,
      site_name: siteName,
      site_type: (SITE_TYPES.has(siteTypeRaw) ? siteTypeRaw : 'OTHER') as MigrationSiteImportPayload['site_type'],
      site_status: cellStr(row.site_status).toUpperCase() || 'ACTIVE',
      client_name: clientName || null,
      parent_client: cellStr(row.parent_client) || clientName || null,
      client_billing_address: cellStr(row.client_billing_address) || null,
      contract_start: cellStr(row.contract_start) || null,
      contract_end: cellStr(row.contract_end) || null,
      address: address ? address.toUpperCase() : null,
      latitude: lat,
      longitude: lng,
      geofence_radius: parseOptionalNumber(row.geofence_radius_m),
      verification_mode: cellStr(row.verification_mode).toUpperCase() || 'B',
      needs_om_gps_capture: cellStr(row.needs_om_gps_capture)
        ? parseBool(row.needs_om_gps_capture)
        : lat == null || lng == null,
      assigned_sm_epf: cellStr(row.assigned_sm_epf).toUpperCase() || null,
      required_guards: parseOptionalNumber(row.required_guards) ?? 1,
      per_visit_charge_lkr: parseAllowanceLkr(row.per_visit_charge_lkr),
      min_dwell_time_minutes: parseOptionalNumber(row.min_dwell_time_minutes) ?? 0,
      nfc_tag_id: cellStr(row.nfc_tag_id) || null,
      provides_food: parseBool(row.provides_food),
      food_allowance_lkr: parseAllowanceLkr(row.food_allowance_lkr),
      provides_accommodation: parseBool(row.provides_accommodation),
      rate_matrix: buildRateMatrixFromMigrationSiteRow(row),
    },
  };
}

export function mapSmLinkImportRow(row: Record<string, unknown>) {
  return {
    sm_epf: cellStr(row.sm_epf).toUpperCase(),
    guard_epf: cellStr(row.guard_epf).toUpperCase(),
  };
}

export type UnifiedEmployeeExportLedgerDebts = {
  salary_advance_outstanding_lkr: number;
  penalty_outstanding_lkr: number;
  salary_loan_outstanding_lkr: number;
  unit_damages_outstanding_lkr: number;
  other_deduction_outstanding_lkr: number;
};

export function emptyUnifiedEmployeeExportLedgerDebts(): UnifiedEmployeeExportLedgerDebts {
  return {
    salary_advance_outstanding_lkr: 0,
    penalty_outstanding_lkr: 0,
    salary_loan_outstanding_lkr: 0,
    unit_damages_outstanding_lkr: 0,
    other_deduction_outstanding_lkr: 0,
  };
}

/** Maps decrypted employee + joined site + ledger debts to unified Roster export columns. */
export function mapUnifiedEmployeeExportRow(
  emp: Record<string, unknown>,
  site?: Record<string, unknown> | null,
  ledgerDebts: UnifiedEmployeeExportLedgerDebts = emptyUnifiedEmployeeExportLedgerDebts(),
): Record<string, unknown> {
  const siteLabel = cellStr(emp.site_name) || cellStr(emp.site);
  const uniformBalance = parseOptionalNumber(emp.uniform_balance) ?? 0;
  const accomBalance = parseOptionalNumber(emp.accom_balance) ?? 0;

  const row: Record<string, unknown> = {
    employee_id: emp.id ?? emp.employee_id ?? '',
    emp_number: emp.emp_number ?? '',
    epf_no: emp.epf_no ?? emp.epf_num ?? '',
    previous_epf_no: emp.previous_epf_no ?? '',
    full_name: emp.full_name ?? '',
    nic: emp.nic ?? '',
    passport_no: emp.passport_no ?? '',
    phone: emp.phone ?? '',
    email: emp.email ?? '',
    dob: emp.dob ?? '',
    gender: emp.gender ?? '',
    nationality: emp.nationality ?? '',
    religion: emp.religion ?? '',
    home_address: emp.home_address ?? '',
    group: emp.group ?? '',
    rank: emp.rank ?? '',
    rank_title: emp.rank_title ?? '',
    rank_basic_pay: emp.rank_basic_pay ?? '',
    rank_salary_type: emp.rank_salary_type ?? '',
    rank_operational_group: emp.rank_operational_group ?? '',
    role: emp.role ?? '',
    site_name: siteLabel,
    date_joined: emp.date_joined ?? '',
    status: emp.status ?? '',
    base_salary: emp.base_salary ?? emp.basic_salary ?? '',
    salary_type: emp.salary_type ?? '',
    epf_yn: emp.epf_yn ?? false,
    fixed_allowance_lkr: emp.fixed_allowance_lkr ?? 0,
    special_allowance_lkr: emp.special_allowance_lkr ?? 0,
    site_allowance_lkr: emp.site_allowance_lkr ?? 0,
    meal_allowance_lkr: emp.meal_allowance_lkr ?? 0,
    transport_allowance_lkr: emp.transport_allowance_lkr ?? 0,
    fixed_deduction_lkr: emp.fixed_deduction_lkr ?? 0,
    maternity_leave: emp.maternity_leave ?? false,
    bank_code: emp.bank_code ?? '',
    bank_name: emp.bank_name ?? '',
    branch_code: emp.branch_code ?? '',
    account_number: emp.account_number ?? '',
    grama_niladari_expiry: emp.grama_niladari_expiry ?? '',
    uniform_outstanding_lkr: uniformBalance,
    meals_advance_other_outstanding_lkr: accomBalance,
    salary_advance_outstanding_lkr: ledgerDebts.salary_advance_outstanding_lkr,
    penalty_outstanding_lkr: ledgerDebts.penalty_outstanding_lkr,
    salary_loan_outstanding_lkr: ledgerDebts.salary_loan_outstanding_lkr,
    unit_damages_outstanding_lkr: ledgerDebts.unit_damages_outstanding_lkr,
    other_deduction_outstanding_lkr: ledgerDebts.other_deduction_outstanding_lkr,
    debt_notes: emp.debt_notes ?? '',
    hr_memo: emp.hr_memo ?? '',
  };

  if (site) {
    row.site_type = site.site_type ?? '';
    row.site_address = site.site_address ?? site.address ?? '';
    row.required_guards = site.required_guards ?? '';
    row.assigned_sm_epf = site.assigned_sm_epf ?? '';
    row.site_latitude = site.site_latitude ?? site.latitude ?? '';
    row.site_longitude = site.site_longitude ?? site.longitude ?? '';
    row.geofence_radius_m = site.geofence_radius_m ?? site.geofence_radius ?? '';
    row.verification_mode = site.verification_mode ?? '';
    row.provides_food = site.provides_food ?? '';
    row.food_allowance_lkr = site.food_allowance_lkr ?? '';
    row.provides_accommodation = site.provides_accommodation ?? '';
    row.nfc_tag_id = site.nfc_tag_id ?? '';
  }

  return row;
}

export type MigrationSiteExportContext = {
  siteCodeByName: Map<string, string>;
  tempPoolSiteCodes: Set<string>;
};

/** Bench / temp pool site codes routed to Temp_Guards on export (step 16). */
export function isTempPoolSiteCode(siteCode: string): boolean {
  const upper = siteCode.trim().toUpperCase();
  return upper === 'T' || upper === 'TEMPORY';
}

export function buildMigrationSiteExportContext(
  sites: Record<string, unknown>[],
): MigrationSiteExportContext {
  const siteCodeByName = new Map<string, string>();
  const tempPoolSiteCodes = new Set<string>(['T', 'TEMPORY']);

  for (const site of sites) {
    const name = cellStr(site.site_name).toLowerCase();
    const code = cellStr(site.site_code ?? site.siteCode).toUpperCase();
    if (name && code) siteCodeByName.set(name, code);
    if (isTempPoolSiteCode(code)) tempPoolSiteCodes.add(code);
  }

  return { siteCodeByName, tempPoolSiteCodes };
}

/** Route one live employee row to the correct migration workforce tab. */
export function classifyMigrationExportWorkforceSheet(
  row: Record<string, unknown>,
  ctx: MigrationSiteExportContext,
): MigrationWorkforceSheetName {
  const status = cellStr(row.status).toLowerCase();
  if (status === 'resigned') return MIGRATION_SHEET_RESIGNED;
  if (status === 'inactive') return MIGRATION_SHEET_INACTIVE;

  const siteName = cellStr(row.site_name).toLowerCase();
  const siteCode =
    cellStr(row.site_code).toUpperCase() ||
    (siteName ? ctx.siteCodeByName.get(siteName) ?? '' : '');

  const group = cellStr(row.group).toUpperCase();
  const isGuardGroup = group === 'GUARD' || group === 'GUARD_FIELD';

  if (
    isGuardGroup &&
    (isTempPoolSiteCode(siteCode) || ctx.tempPoolSiteCodes.has(siteCode) || cellStr(row.temp_parent_epf))
  ) {
    return MIGRATION_SHEET_TEMP_GUARDS;
  }

  switch (group) {
    case 'SECTOR_MANAGER':
      return MIGRATION_SHEET_SM;
    case 'HEAD_OFFICE':
      if (cellStr(row.rank).toUpperCase() === 'SM') return MIGRATION_SHEET_SM;
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

/** Split live export rows into migration workforce sheet buckets (step 16). */
export function splitEmployeesForMigrationExport(
  employees: Record<string, unknown>[],
  sites: Record<string, unknown>[],
): Record<MigrationWorkforceSheetName, Record<string, unknown>[]> {
  const ctx = buildMigrationSiteExportContext(sites);
  const buckets = Object.fromEntries(
    MIGRATION_WORKFORCE_SHEET_NAMES.map((sheetName) => [sheetName, [] as Record<string, unknown>[]]),
  ) as Record<MigrationWorkforceSheetName, Record<string, unknown>[]>;

  for (const row of employees) {
    if (isBulkMigrationExcludedExecutiveRank(row.rank)) continue;
    const sheet = classifyMigrationExportWorkforceSheet(row, ctx);
    buckets[sheet].push(row);
  }

  return buckets;
}

/** Maps live employee + site join to migration workforce export columns (step 16). */
export function mapMigrationWorkforceExportRow(
  emp: Record<string, unknown>,
  site?: Record<string, unknown> | null,
  options?: {
    ledgerDebts?: UnifiedEmployeeExportLedgerDebts;
    tempParentEpf?: string | null;
  },
): Record<string, unknown> {
  const unified = mapUnifiedEmployeeExportRow(
    emp,
    site,
    options?.ledgerDebts ?? emptyUnifiedEmployeeExportLedgerDebts(),
  );
  const siteCode = cellStr(site?.site_code ?? site?.siteCode).toUpperCase();

  return {
    employee_id: unified.employee_id,
    emp_number: unified.emp_number,
    epf_no: unified.epf_no,
    previous_epf_no: unified.previous_epf_no,
    full_name: unified.full_name,
    nic: unified.nic,
    passport_no: unified.passport_no,
    phone: unified.phone,
    email: unified.email,
    dob: unified.dob,
    gender: unified.gender,
    nationality: unified.nationality,
    religion: unified.religion,
    home_address: unified.home_address,
    emergency_contact: emp.emergency_contact ?? '',
    employee_referral: emp.employee_referral ?? '',
    group: unified.group,
    rank: unified.rank,
    rank_title: unified.rank_title,
    rank_basic_pay: unified.rank_basic_pay,
    rank_salary_type: unified.rank_salary_type,
    rank_operational_group: unified.rank_operational_group,
    role: unified.role,
    date_joined: unified.date_joined,
    status: unified.status,
    base_salary: unified.base_salary,
    salary_type: unified.salary_type,
    epf_yn: unified.epf_yn,
    fixed_allowance_lkr: unified.fixed_allowance_lkr,
    special_allowance_lkr: unified.special_allowance_lkr,
    site_allowance_lkr: unified.site_allowance_lkr,
    meal_allowance_lkr: unified.meal_allowance_lkr,
    transport_allowance_lkr: unified.transport_allowance_lkr,
    fixed_deduction_lkr: unified.fixed_deduction_lkr,
    maternity_leave: unified.maternity_leave,
    bank_code: unified.bank_code,
    bank_name: unified.bank_name,
    branch_code: unified.branch_code,
    account_number: unified.account_number,
    grama_niladari_expiry: unified.grama_niladari_expiry,
    site_name: unified.site_name,
    site_code: siteCode,
    assigned_sm_epf: cellStr(site?.assigned_sm_epf) || cellStr(unified.assigned_sm_epf),
    temp_parent_epf: options?.tempParentEpf ?? '',
    date_resigned: emp.date_resigned ?? '',
    resignation_type: emp.resignation_type ?? '',
    resignation_notes: emp.resignation_notes ?? '',
    uniform_outstanding_lkr: unified.uniform_outstanding_lkr,
    meals_advance_other_outstanding_lkr: unified.meals_advance_other_outstanding_lkr,
    salary_advance_outstanding_lkr: unified.salary_advance_outstanding_lkr,
    penalty_outstanding_lkr: unified.penalty_outstanding_lkr,
    salary_loan_outstanding_lkr: unified.salary_loan_outstanding_lkr,
    unit_damages_outstanding_lkr: unified.unit_damages_outstanding_lkr,
    other_deduction_outstanding_lkr: unified.other_deduction_outstanding_lkr,
    debt_notes: unified.debt_notes,
    hr_memo: unified.hr_memo,
  };
}

function pickMigrationWorkbookColumns(
  columns: readonly string[],
  row: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of columns) {
    const v = row[key];
    if (v === null || v === undefined) out[key] = '';
    else if (typeof v === 'boolean') out[key] = v ? 'TRUE' : 'FALSE';
    else out[key] = v;
  }
  return out;
}

/** Build styled multi-sheet inputs for live migration export download (step 16). */
export function buildMigrationExportSheetInputs(
  employees: Record<string, unknown>[],
  sites: Record<string, unknown>[],
): MigrationTemplateSheetInput[] {
  const split = splitEmployeesForMigrationExport(employees, sites);
  const siteRows = sites.map((site) =>
    pickMigrationWorkbookColumns(MIGRATION_SITES_COLUMNS, mapSiteProfileForMigrationExport(site)),
  );

  const sheets: MigrationTemplateSheetInput[] = [];

  for (const sheetName of MIGRATION_WORKBOOK_SHEET_ORDER) {
    if (sheetName === MIGRATION_SHEET_LOOKUPS) continue;

    if (sheetName === MIGRATION_SHEET_SITES) {
      sheets.push({
        sheetName,
        sheetTitle: `${sheetName} — Pearzen migration export`,
        columns: [...MIGRATION_SITES_COLUMNS],
        rows: siteRows,
        columnGroupForKey: migrationSitesColumnGroupId,
      });
      continue;
    }

    const columns = templateColumnsForMigrationWorkforceSheet(sheetName);
    const meta = MIGRATION_SHEET_META[sheetName];
    const rows = (split[sheetName] ?? []).map((row) =>
      pickMigrationWorkbookColumns(columns, {
        ...row,
        status: row.status ?? meta.defaultStatus,
      }),
    );

    sheets.push({
      sheetName,
      sheetTitle: `${sheetName} — Pearzen migration export`,
      columns,
      rows,
      columnGroupForKey: migrationEmployeeColumnGroupId,
    });
  }

  return sheets;
}
