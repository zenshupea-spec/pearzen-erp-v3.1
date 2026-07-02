import type { RankPayEntry } from '../../../packages/rank-pay-matrix';

/** Single-sheet roster import (replaces multi-sheet workbook in steps 2+). */
export const UNIFIED_ROSTER_SHEET_NAME = 'Roster' as const;

/** Legacy sheet name — parsed in step 14 for backward-compatible uploads. */
export const LEGACY_EMPLOYEES_SHEET_NAME = 'Employees' as const;
export const LEGACY_SITES_SHEET_NAME = 'Sites' as const;

export type UnifiedRosterColumn = (typeof UNIFIED_ROSTER_COLUMNS)[number];

/**
 * One row per employee: MNR fields + inline site directory + outstanding debts.
 * See CVS_BULK_ROSTER_SINGLE_SHEET_STEPS.txt for import semantics.
 */
export const UNIFIED_ROSTER_COLUMNS = [
  // A — Employee identity
  'employee_id',
  'emp_number',
  'epf_no',
  'previous_epf_no',
  'full_name',
  'nic',
  'passport_no',
  'phone',
  'email',
  'dob',
  'gender',
  'nationality',
  'religion',
  'home_address',
  // B — Employment
  'group',
  'rank',
  'rank_title',
  'rank_basic_pay',
  'rank_salary_type',
  'rank_operational_group',
  'role',
  'site_name',
  'date_joined',
  'status',
  'base_salary',
  'salary_type',
  'epf_yn',
  'fixed_allowance_lkr',
  'special_allowance_lkr',
  'site_allowance_lkr',
  'meal_allowance_lkr',
  'transport_allowance_lkr',
  'fixed_deduction_lkr',
  'maternity_leave',
  // C — Bank
  'bank_code',
  'bank_name',
  'branch_code',
  'account_number',
  // D — Vetting (Grama Niladari certificate expiry; scan uploaded in HR MNR)
  'grama_niladari_expiry',
  // E — Site directory (inline; unique site_name upserted before employees)
  'site_type',
  'site_address',
  'required_guards',
  'assigned_sm_epf',
  'site_latitude',
  'site_longitude',
  'geofence_radius_m',
  'verification_mode',
  'provides_food',
  'food_allowance_lkr',
  'provides_accommodation',
  'nfc_tag_id',
  // F — Outstanding debts (LKR)
  'uniform_outstanding_lkr',
  'meals_advance_other_outstanding_lkr',
  'salary_advance_outstanding_lkr',
  'penalty_outstanding_lkr',
  'salary_loan_outstanding_lkr',
  'unit_damages_outstanding_lkr',
  'other_deduction_outstanding_lkr',
  'debt_notes',
] as const;

export const UNIFIED_ROSTER_IDENTITY_COLUMNS = [
  'employee_id',
  'emp_number',
  'epf_no',
  'previous_epf_no',
  'full_name',
  'nic',
  'passport_no',
  'phone',
  'email',
  'dob',
  'gender',
  'nationality',
  'religion',
  'home_address',
] as const satisfies readonly UnifiedRosterColumn[];

export const UNIFIED_ROSTER_EMPLOYMENT_COLUMNS = [
  'group',
  'rank',
  'rank_title',
  'rank_basic_pay',
  'rank_salary_type',
  'rank_operational_group',
  'role',
  'site_name',
  'date_joined',
  'status',
  'base_salary',
  'salary_type',
  'epf_yn',
  'fixed_allowance_lkr',
  'special_allowance_lkr',
  'site_allowance_lkr',
  'meal_allowance_lkr',
  'transport_allowance_lkr',
  'fixed_deduction_lkr',
  'maternity_leave',
] as const satisfies readonly UnifiedRosterColumn[];

export const UNIFIED_ROSTER_BANK_COLUMNS = [
  'bank_code',
  'bank_name',
  'branch_code',
  'account_number',
] as const satisfies readonly UnifiedRosterColumn[];

export const UNIFIED_ROSTER_VETTING_COLUMNS = [
  'grama_niladari_expiry',
] as const satisfies readonly UnifiedRosterColumn[];

export const UNIFIED_ROSTER_SITE_COLUMNS = [
  'site_type',
  'site_address',
  'required_guards',
  'assigned_sm_epf',
  'site_latitude',
  'site_longitude',
  'geofence_radius_m',
  'verification_mode',
  'provides_food',
  'food_allowance_lkr',
  'provides_accommodation',
  'nfc_tag_id',
] as const satisfies readonly UnifiedRosterColumn[];

export const UNIFIED_ROSTER_DEBT_COLUMNS = [
  'uniform_outstanding_lkr',
  'meals_advance_other_outstanding_lkr',
  'salary_advance_outstanding_lkr',
  'penalty_outstanding_lkr',
  'salary_loan_outstanding_lkr',
  'unit_damages_outstanding_lkr',
  'other_deduction_outstanding_lkr',
  'debt_notes',
] as const satisfies readonly UnifiedRosterColumn[];

// =============================================================================
// Multi-sheet migration workbook (MIGRATION_MULTI_SHEET_WORKBOOK_STEPS.txt)
// =============================================================================

export const MIGRATION_SHEET_HEAD_OFFICE = 'HEAD_OFFICE' as const;
export const MIGRATION_SHEET_CAFE = 'CAFE' as const;
export const MIGRATION_SHEET_GUARD = 'GUARD' as const;
export const MIGRATION_SHEET_SM = 'SM' as const;
export const MIGRATION_SHEET_SITES = 'Sites' as const;
export const MIGRATION_SHEET_RESIGNED = 'Resigned' as const;
export const MIGRATION_SHEET_INACTIVE = 'Inactive' as const;
export const MIGRATION_SHEET_TEMP_GUARDS = 'Temp_Guards' as const;
export const MIGRATION_SHEET_LOOKUPS = 'Lookups' as const;

/** Workforce tabs in workbook order (Sites is sheet 5 — see MIGRATION_WORKBOOK_SHEET_ORDER). */
export const MIGRATION_WORKFORCE_SHEET_NAMES = [
  MIGRATION_SHEET_HEAD_OFFICE,
  MIGRATION_SHEET_CAFE,
  MIGRATION_SHEET_GUARD,
  MIGRATION_SHEET_SM,
  MIGRATION_SHEET_RESIGNED,
  MIGRATION_SHEET_INACTIVE,
  MIGRATION_SHEET_TEMP_GUARDS,
] as const;

export type MigrationWorkforceSheetName = (typeof MIGRATION_WORKFORCE_SHEET_NAMES)[number];

/** All tabs including Sites and hidden Lookups. */
export const MIGRATION_WORKBOOK_SHEET_ORDER = [
  MIGRATION_SHEET_HEAD_OFFICE,
  MIGRATION_SHEET_CAFE,
  MIGRATION_SHEET_GUARD,
  MIGRATION_SHEET_SM,
  MIGRATION_SHEET_SITES,
  MIGRATION_SHEET_RESIGNED,
  MIGRATION_SHEET_INACTIVE,
  MIGRATION_SHEET_TEMP_GUARDS,
  MIGRATION_SHEET_LOOKUPS,
] as const;

export type MigrationWorkbookSheetName = (typeof MIGRATION_WORKBOOK_SHEET_ORDER)[number];

export type MigrationColumnGroupId =
  | 'identity'
  | 'employment'
  | 'bank'
  | 'vetting'
  | 'placement'
  | 'resignation'
  | 'debts'
  | 'memo'
  | 'sites_identity'
  | 'sites_client'
  | 'sites_location'
  | 'sites_operations'
  | 'sites_welfare'
  | 'sites_rates';

/** Header band colours for ExcelJS styling (step 5). */
export const MIGRATION_COLUMN_GROUP_COLORS: Record<
  MigrationColumnGroupId,
  { fill: string; font: string; label: string }
> = {
  identity: { fill: '4338CA', font: 'FFFFFF', label: 'Identity' },
  employment: { fill: '7C3AED', font: 'FFFFFF', label: 'Employment' },
  bank: { fill: '059669', font: 'FFFFFF', label: 'Bank' },
  vetting: { fill: 'D97706', font: 'FFFFFF', label: 'Vetting' },
  placement: { fill: '0284C7', font: 'FFFFFF', label: 'Site & SM' },
  resignation: { fill: 'E11D48', font: 'FFFFFF', label: 'Resignation' },
  debts: { fill: '475569', font: 'FFFFFF', label: 'Outstanding debts (LKR)' },
  memo: { fill: '6366F1', font: 'FFFFFF', label: 'HR memo' },
  sites_identity: { fill: '4338CA', font: 'FFFFFF', label: 'Site identity' },
  sites_client: { fill: '7C3AED', font: 'FFFFFF', label: 'Client & contract' },
  sites_location: { fill: '059669', font: 'FFFFFF', label: 'Location' },
  sites_operations: { fill: '0284C7', font: 'FFFFFF', label: 'Operations' },
  sites_welfare: { fill: 'D97706', font: 'FFFFFF', label: 'Welfare' },
  sites_rates: { fill: '475569', font: 'FFFFFF', label: 'Rate matrix (per rank)' },
};

export type MigrationEmployeeColumnGroup = {
  id: MigrationColumnGroupId;
  columns: readonly string[];
};

/** Group A — Identity (indigo). */
export const MIGRATION_EMPLOYEE_IDENTITY_COLUMNS = [
  'employee_id',
  'emp_number',
  'epf_no',
  'previous_epf_no',
  'full_name',
  'nic',
  'passport_no',
  'phone',
  'email',
  'dob',
  'gender',
  'nationality',
  'religion',
  'home_address',
  'emergency_contact',
  'employee_referral',
] as const;

/** Group B — Employment (violet). `group` is fixed per sheet — not a user column. */
export const MIGRATION_EMPLOYEE_EMPLOYMENT_COLUMNS = [
  'rank',
  'rank_title',
  'rank_basic_pay',
  'rank_salary_type',
  'rank_operational_group',
  'role',
  'date_joined',
  'status',
  'base_salary',
  'salary_type',
  'epf_yn',
  'fixed_allowance_lkr',
  'special_allowance_lkr',
  'site_allowance_lkr',
  'meal_allowance_lkr',
  'transport_allowance_lkr',
  'fixed_deduction_lkr',
  'maternity_leave',
] as const;

/** Optional internal branch code for Head Office / Café rows. */
export const MIGRATION_EMPLOYEE_INTERNAL_SITE_COLUMNS = ['site_code'] as const;

/** Group C — Bank (emerald). */
export const MIGRATION_EMPLOYEE_BANK_COLUMNS = [
  'bank_code',
  'bank_name',
  'branch_code',
  'account_number',
] as const;

/** Group D — Vetting dates (amber). Document scans remain in MNR UI. */
export const MIGRATION_EMPLOYEE_VETTING_COLUMNS = ['grama_niladari_expiry'] as const;

/** Group E — Guard / SM placement (sky). */
export const MIGRATION_EMPLOYEE_PLACEMENT_COLUMNS = [
  'site_code',
  'assigned_sm_epf',
] as const;

/** Temp guard pool — parent guard EPF for temp_parent_id on import. */
export const MIGRATION_EMPLOYEE_TEMP_PARENT_COLUMNS = ['temp_parent_epf'] as const;

/** Group F — Resignation (rose). */
export const MIGRATION_EMPLOYEE_RESIGNATION_COLUMNS = [
  'date_resigned',
  'resignation_type',
  'resignation_notes',
] as const;

/** Group G — Outstanding debts LKR (slate). */
export const MIGRATION_EMPLOYEE_DEBT_COLUMNS = [
  'uniform_outstanding_lkr',
  'meals_advance_other_outstanding_lkr',
  'salary_advance_outstanding_lkr',
  'penalty_outstanding_lkr',
  'salary_loan_outstanding_lkr',
  'unit_damages_outstanding_lkr',
  'other_deduction_outstanding_lkr',
  'debt_notes',
] as const;

/** Group H — HR internal memo (indigo). Editable in MNR drawer and bulk editor. */
export const MIGRATION_EMPLOYEE_MEMO_COLUMNS = ['hr_memo'] as const;

/** Shared employee columns across all workforce sheets (union, deduped). */
export const MIGRATION_EMPLOYEE_ALL_COLUMNS = [
  ...MIGRATION_EMPLOYEE_IDENTITY_COLUMNS,
  ...MIGRATION_EMPLOYEE_EMPLOYMENT_COLUMNS,
  ...MIGRATION_EMPLOYEE_INTERNAL_SITE_COLUMNS,
  ...MIGRATION_EMPLOYEE_BANK_COLUMNS,
  ...MIGRATION_EMPLOYEE_VETTING_COLUMNS,
  ...MIGRATION_EMPLOYEE_PLACEMENT_COLUMNS,
  ...MIGRATION_EMPLOYEE_TEMP_PARENT_COLUMNS,
  ...MIGRATION_EMPLOYEE_RESIGNATION_COLUMNS,
  ...MIGRATION_EMPLOYEE_DEBT_COLUMNS,
  ...MIGRATION_EMPLOYEE_MEMO_COLUMNS,
] as const;

export type MigrationEmployeeColumn = (typeof MIGRATION_EMPLOYEE_ALL_COLUMNS)[number];

export const MIGRATION_EMPLOYEE_COLUMN_GROUPS: readonly MigrationEmployeeColumnGroup[] = [
  { id: 'identity', columns: MIGRATION_EMPLOYEE_IDENTITY_COLUMNS },
  { id: 'employment', columns: MIGRATION_EMPLOYEE_EMPLOYMENT_COLUMNS },
  { id: 'bank', columns: MIGRATION_EMPLOYEE_BANK_COLUMNS },
  { id: 'vetting', columns: MIGRATION_EMPLOYEE_VETTING_COLUMNS },
  { id: 'placement', columns: MIGRATION_EMPLOYEE_PLACEMENT_COLUMNS },
  { id: 'resignation', columns: MIGRATION_EMPLOYEE_RESIGNATION_COLUMNS },
  { id: 'debts', columns: MIGRATION_EMPLOYEE_DEBT_COLUMNS },
  { id: 'memo', columns: MIGRATION_EMPLOYEE_MEMO_COLUMNS },
];

/** Site rate matrix ranks — maps to site_profiles.rate_matrix JSON on import. */
export const MIGRATION_SITE_RATE_RANKS = ['CSO', 'OIC', 'SSO', 'JSO', 'LSO'] as const;

export type MigrationSiteRateRank = (typeof MIGRATION_SITE_RATE_RANKS)[number];

export function migrationSiteRateMatrixColumns(): readonly string[] {
  const cols: string[] = [];
  for (const rank of MIGRATION_SITE_RATE_RANKS) {
    cols.push(`${rank}_qty`, `${rank}_invoice_rate_lkr`, `${rank}_pay_rate_lkr`);
  }
  return cols;
}

/** S1 — Site identity (indigo). */
export const MIGRATION_SITES_IDENTITY_COLUMNS = [
  'site_code',
  'site_name',
  'site_type',
  'site_status',
] as const;

/** S2 — Client & contract (violet). */
export const MIGRATION_SITES_CLIENT_COLUMNS = [
  'client_name',
  'parent_client',
  'client_billing_address',
  'contract_start',
  'contract_end',
] as const;

/** S3 — Location (emerald). */
export const MIGRATION_SITES_LOCATION_COLUMNS = [
  'address',
  'latitude',
  'longitude',
  'geofence_radius_m',
  'verification_mode',
  'needs_om_gps_capture',
] as const;

/** S4 — Operations (sky). */
export const MIGRATION_SITES_OPERATIONS_COLUMNS = [
  'assigned_sm_epf',
  'required_guards',
  'per_visit_charge_lkr',
  'min_dwell_time_minutes',
  'nfc_tag_id',
] as const;

/** S5 — Welfare (amber). */
export const MIGRATION_SITES_WELFARE_COLUMNS = [
  'provides_food',
  'food_allowance_lkr',
  'provides_accommodation',
] as const;

/** Full Sites sheet column order (S1–S6). */
export const MIGRATION_SITES_COLUMNS = [
  ...MIGRATION_SITES_IDENTITY_COLUMNS,
  ...MIGRATION_SITES_CLIENT_COLUMNS,
  ...MIGRATION_SITES_LOCATION_COLUMNS,
  ...MIGRATION_SITES_OPERATIONS_COLUMNS,
  ...MIGRATION_SITES_WELFARE_COLUMNS,
  ...migrationSiteRateMatrixColumns(),
] as const;

export type MigrationSitesColumn = (typeof MIGRATION_SITES_COLUMNS)[number];

export type MigrationSitesColumnGroup = {
  id: MigrationColumnGroupId;
  columns: readonly string[];
};

export const MIGRATION_SITES_COLUMN_GROUPS: readonly MigrationSitesColumnGroup[] = [
  { id: 'sites_identity', columns: MIGRATION_SITES_IDENTITY_COLUMNS },
  { id: 'sites_client', columns: MIGRATION_SITES_CLIENT_COLUMNS },
  { id: 'sites_location', columns: MIGRATION_SITES_LOCATION_COLUMNS },
  { id: 'sites_operations', columns: MIGRATION_SITES_OPERATIONS_COLUMNS },
  { id: 'sites_welfare', columns: MIGRATION_SITES_WELFARE_COLUMNS },
  { id: 'sites_rates', columns: migrationSiteRateMatrixColumns() },
];

export type MigrationSheetMeta = {
  sheetName: MigrationWorkforceSheetName;
  fixedGroup: string;
  defaultStatus: string;
  /** Column keys for this workforce tab (ordered, no duplicates). */
  columns: readonly string[];
};

const MIGRATION_BASE_WORKFORCE_COLUMNS = [
  ...MIGRATION_EMPLOYEE_IDENTITY_COLUMNS,
  ...MIGRATION_EMPLOYEE_EMPLOYMENT_COLUMNS,
  ...MIGRATION_EMPLOYEE_BANK_COLUMNS,
  ...MIGRATION_EMPLOYEE_VETTING_COLUMNS,
  ...MIGRATION_EMPLOYEE_DEBT_COLUMNS,
  ...MIGRATION_EMPLOYEE_MEMO_COLUMNS,
] as const;

function uniqueColumns(columns: readonly string[]): readonly string[] {
  return [...new Set(columns)];
}

/** Column list for one workforce sheet tab. */
export function columnsForMigrationWorkforceSheet(
  sheet: MigrationWorkforceSheetName,
): readonly string[] {
  switch (sheet) {
    case MIGRATION_SHEET_HEAD_OFFICE:
    case MIGRATION_SHEET_CAFE:
      return uniqueColumns([
        ...MIGRATION_BASE_WORKFORCE_COLUMNS,
        ...MIGRATION_EMPLOYEE_INTERNAL_SITE_COLUMNS,
      ]);
    case MIGRATION_SHEET_GUARD:
      return uniqueColumns([
        ...MIGRATION_BASE_WORKFORCE_COLUMNS,
        ...MIGRATION_EMPLOYEE_PLACEMENT_COLUMNS,
      ]);
    case MIGRATION_SHEET_SM:
      return uniqueColumns([...MIGRATION_BASE_WORKFORCE_COLUMNS]);
    case MIGRATION_SHEET_RESIGNED:
      return uniqueColumns([
        ...MIGRATION_BASE_WORKFORCE_COLUMNS,
        ...MIGRATION_EMPLOYEE_RESIGNATION_COLUMNS,
      ]);
    case MIGRATION_SHEET_INACTIVE:
      return uniqueColumns([
        ...MIGRATION_BASE_WORKFORCE_COLUMNS,
        ...MIGRATION_EMPLOYEE_INTERNAL_SITE_COLUMNS,
        ...MIGRATION_EMPLOYEE_PLACEMENT_COLUMNS,
      ]);
    case MIGRATION_SHEET_TEMP_GUARDS:
      return uniqueColumns([
        ...MIGRATION_BASE_WORKFORCE_COLUMNS,
        ...MIGRATION_EMPLOYEE_PLACEMENT_COLUMNS,
        ...MIGRATION_EMPLOYEE_TEMP_PARENT_COLUMNS,
      ]);
    default: {
      const _exhaustive: never = sheet;
      return _exhaustive;
    }
  }
}

export const MIGRATION_SHEET_META: Record<MigrationWorkforceSheetName, MigrationSheetMeta> = {
  [MIGRATION_SHEET_HEAD_OFFICE]: {
    sheetName: MIGRATION_SHEET_HEAD_OFFICE,
    fixedGroup: 'HEAD_OFFICE',
    defaultStatus: 'ACTIVE',
    columns: columnsForMigrationWorkforceSheet(MIGRATION_SHEET_HEAD_OFFICE),
  },
  [MIGRATION_SHEET_CAFE]: {
    sheetName: MIGRATION_SHEET_CAFE,
    fixedGroup: 'CAFE',
    defaultStatus: 'ACTIVE',
    columns: columnsForMigrationWorkforceSheet(MIGRATION_SHEET_CAFE),
  },
  [MIGRATION_SHEET_GUARD]: {
    sheetName: MIGRATION_SHEET_GUARD,
    fixedGroup: 'GUARD',
    defaultStatus: 'ACTIVE',
    columns: columnsForMigrationWorkforceSheet(MIGRATION_SHEET_GUARD),
  },
  [MIGRATION_SHEET_SM]: {
    sheetName: MIGRATION_SHEET_SM,
    fixedGroup: 'SECTOR_MANAGER',
    defaultStatus: 'ACTIVE',
    columns: columnsForMigrationWorkforceSheet(MIGRATION_SHEET_SM),
  },
  [MIGRATION_SHEET_RESIGNED]: {
    sheetName: MIGRATION_SHEET_RESIGNED,
    fixedGroup: 'GUARD',
    defaultStatus: 'Resigned',
    columns: columnsForMigrationWorkforceSheet(MIGRATION_SHEET_RESIGNED),
  },
  [MIGRATION_SHEET_INACTIVE]: {
    sheetName: MIGRATION_SHEET_INACTIVE,
    fixedGroup: 'GUARD',
    defaultStatus: 'Inactive',
    columns: columnsForMigrationWorkforceSheet(MIGRATION_SHEET_INACTIVE),
  },
  [MIGRATION_SHEET_TEMP_GUARDS]: {
    sheetName: MIGRATION_SHEET_TEMP_GUARDS,
    fixedGroup: 'GUARD',
    defaultStatus: 'ACTIVE',
    columns: columnsForMigrationWorkforceSheet(MIGRATION_SHEET_TEMP_GUARDS),
  },
};

export function isMigrationWorkforceSheetName(name: string): name is MigrationWorkforceSheetName {
  return (MIGRATION_WORKFORCE_SHEET_NAMES as readonly string[]).includes(name);
}

/** Pre-filled on template sheets; maps to employees.group on import (step 15). */
export const MIGRATION_EMPLOYEE_CORPORATE_GROUP_COLUMN = 'corporate_group' as const;

/** Phase 1 template tabs (steps 6–8 add Resigned, Inactive, Temp_Guards, Sites). */
export const MIGRATION_TEMPLATE_WORKFORCE_SHEETS = [
  MIGRATION_SHEET_HEAD_OFFICE,
  MIGRATION_SHEET_CAFE,
  MIGRATION_SHEET_GUARD,
  MIGRATION_SHEET_SM,
] as const;

export type MigrationTemplateWorkforceSheetName =
  (typeof MIGRATION_TEMPLATE_WORKFORCE_SHEETS)[number];

/** Offboarding / pool tabs added in step 8 (sheets 6–8 after Sites). */
export const MIGRATION_TEMPLATE_OFFBOARDING_SHEETS = [
  MIGRATION_SHEET_RESIGNED,
  MIGRATION_SHEET_INACTIVE,
  MIGRATION_SHEET_TEMP_GUARDS,
] as const;

export type MigrationTemplateOffboardingSheetName =
  (typeof MIGRATION_TEMPLATE_OFFBOARDING_SHEETS)[number];

/** Template tabs emitted today (workforce + Sites + offboarding pool sheets). */
export const MIGRATION_TEMPLATE_SHEETS = [
  ...MIGRATION_TEMPLATE_WORKFORCE_SHEETS,
  MIGRATION_SHEET_SITES,
  ...MIGRATION_TEMPLATE_OFFBOARDING_SHEETS,
] as const;

export type MigrationTemplateSheetName = (typeof MIGRATION_TEMPLATE_SHEETS)[number];

/** Visible template tabs plus hidden Lookups (appended by ExcelJS writer — step 9). */
export const MIGRATION_TEMPLATE_ALL_SHEETS = [
  ...MIGRATION_TEMPLATE_SHEETS,
  MIGRATION_SHEET_LOOKUPS,
] as const;

export type MigrationTemplateAllSheetName = (typeof MIGRATION_TEMPLATE_ALL_SHEETS)[number];

export function isMigrationWorkbookSheetName(name: string): name is MigrationWorkbookSheetName {
  return (MIGRATION_WORKBOOK_SHEET_ORDER as readonly string[]).includes(name);
}

/** Template columns = workforce columns + corporate_group after identity block. */
export function templateColumnsForMigrationWorkforceSheet(
  sheet: MigrationWorkforceSheetName,
): readonly string[] {
  const base = [...columnsForMigrationWorkforceSheet(sheet)];
  const identityCount = MIGRATION_EMPLOYEE_IDENTITY_COLUMNS.length;
  if (base.includes(MIGRATION_EMPLOYEE_CORPORATE_GROUP_COLUMN)) return base;
  return [
    ...base.slice(0, identityCount),
    MIGRATION_EMPLOYEE_CORPORATE_GROUP_COLUMN,
    ...base.slice(identityCount),
  ];
}

/** Colour group for migration workforce sheet column headers. */
export function migrationEmployeeColumnGroupId(
  columnKey: string,
): MigrationColumnGroupId | undefined {
  if ((MIGRATION_EMPLOYEE_IDENTITY_COLUMNS as readonly string[]).includes(columnKey)) {
    return 'identity';
  }
  if (
    columnKey === MIGRATION_EMPLOYEE_CORPORATE_GROUP_COLUMN ||
    (MIGRATION_EMPLOYEE_EMPLOYMENT_COLUMNS as readonly string[]).includes(columnKey)
  ) {
    return 'employment';
  }
  if ((MIGRATION_EMPLOYEE_BANK_COLUMNS as readonly string[]).includes(columnKey)) return 'bank';
  if ((MIGRATION_EMPLOYEE_VETTING_COLUMNS as readonly string[]).includes(columnKey)) return 'vetting';
  if (
    (MIGRATION_EMPLOYEE_PLACEMENT_COLUMNS as readonly string[]).includes(columnKey) ||
    (MIGRATION_EMPLOYEE_INTERNAL_SITE_COLUMNS as readonly string[]).includes(columnKey) ||
    (MIGRATION_EMPLOYEE_TEMP_PARENT_COLUMNS as readonly string[]).includes(columnKey)
  ) {
    return 'placement';
  }
  if ((MIGRATION_EMPLOYEE_RESIGNATION_COLUMNS as readonly string[]).includes(columnKey)) {
    return 'resignation';
  }
  if ((MIGRATION_EMPLOYEE_DEBT_COLUMNS as readonly string[]).includes(columnKey)) {
    return 'debts';
  }
  if ((MIGRATION_EMPLOYEE_MEMO_COLUMNS as readonly string[]).includes(columnKey)) {
    return 'memo';
  }
  return undefined;
}

/** Colour group for Sites sheet column headers (S1–S6). */
export function migrationSitesColumnGroupId(
  columnKey: string,
): MigrationColumnGroupId | undefined {
  for (const group of MIGRATION_SITES_COLUMN_GROUPS) {
    if ((group.columns as readonly string[]).includes(columnKey)) {
      return group.id;
    }
  }
  return undefined;
}

function migrationSiteRateFields(
  rates: Partial<
    Record<MigrationSiteRateRank, { qty: number; invoice: number; pay: number }>
  >,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const rank of MIGRATION_SITE_RATE_RANKS) {
    const entry = rates[rank];
    out[`${rank}_qty`] = entry?.qty ?? 0;
    out[`${rank}_invoice_rate_lkr`] = entry?.invoice ?? 0;
    out[`${rank}_pay_rate_lkr`] = entry?.pay ?? 0;
  }
  return out;
}

/** Flatten site_profiles.rate_matrix JSON to Sites sheet S6 columns (step 16). */
export function flattenRateMatrixToSiteExportColumns(
  rateMatrix: unknown,
): Record<string, number> {
  const matrix =
    rateMatrix && typeof rateMatrix === 'object'
      ? (rateMatrix as Record<
          string,
          { qty?: number; invoiceRate?: number; payRate?: number; invoice_rate_lkr?: number; pay_rate_lkr?: number }
        >)
      : {};
  const out: Record<string, number> = {};

  for (const rank of MIGRATION_SITE_RATE_RANKS) {
    const entry = matrix[rank];
    out[`${rank}_qty`] = Math.max(0, Math.round(Number(entry?.qty ?? 0)));
    out[`${rank}_invoice_rate_lkr`] = Math.max(
      0,
      Math.round(Number(entry?.invoiceRate ?? entry?.invoice_rate_lkr ?? 0)),
    );
    out[`${rank}_pay_rate_lkr`] = Math.max(
      0,
      Math.round(Number(entry?.payRate ?? entry?.pay_rate_lkr ?? 0)),
    );
  }

  return out;
}

/** Maps live site_profiles row to Sites tab export columns (step 16). */
export function mapSiteProfileForMigrationExport(
  row: Record<string, unknown>,
): Record<string, unknown> {
  return {
    site_code: String(row.site_code ?? '').trim().toUpperCase(),
    site_name: row.site_name ?? '',
    site_type: row.site_type ?? 'OTHER',
    site_status: row.site_status ?? 'ACTIVE',
    client_name: row.client_name ?? '',
    parent_client: row.parent_client ?? row.client_name ?? '',
    client_billing_address: row.client_billing_address ?? '',
    contract_start: row.contract_start ?? '',
    contract_end: row.contract_end ?? '',
    address: row.address ?? '',
    latitude: row.latitude ?? '',
    longitude: row.longitude ?? '',
    geofence_radius_m: row.geofence_radius_m ?? row.geofence_radius ?? 100,
    verification_mode: row.verification_mode ?? 'B',
    needs_om_gps_capture: row.needs_om_gps_capture ?? true,
    assigned_sm_epf: row.assigned_sm_epf ?? '',
    required_guards: row.required_guards ?? 1,
    per_visit_charge_lkr: row.per_visit_charge_lkr ?? 0,
    min_dwell_time_minutes: row.min_dwell_time_minutes ?? 0,
    nfc_tag_id: row.nfc_tag_id ?? '',
    provides_food: row.provides_food ?? false,
    food_allowance_lkr: row.food_allowance_lkr ?? 0,
    provides_accommodation: row.provides_accommodation ?? false,
    ...flattenRateMatrixToSiteExportColumns(row.rate_matrix),
  };
}

function exampleMigrationBenchSiteRow(
  siteCode: string,
  siteName: string,
): Record<string, string | number | boolean> {
  return {
    site_code: siteCode,
    site_name: siteName,
    site_type: 'OTHER',
    site_status: 'ACTIVE',
    client_name: 'INTERNAL',
    parent_client: 'INTERNAL',
    client_billing_address: '',
    contract_start: '',
    contract_end: '',
    address: 'INTERNAL POOL',
    latitude: '',
    longitude: '',
    geofence_radius_m: 50,
    verification_mode: 'B',
    needs_om_gps_capture: true,
    assigned_sm_epf: '',
    required_guards: 0,
    per_visit_charge_lkr: 0,
    min_dwell_time_minutes: 0,
    nfc_tag_id: '',
    provides_food: false,
    food_allowance_lkr: 0,
    provides_accommodation: false,
    ...migrationSiteRateFields({}),
  };
}

/** Colour group for unified Roster export sheet column headers. */
export function unifiedRosterColumnGroupId(
  columnKey: string,
): MigrationColumnGroupId | undefined {
  const key = columnKey;
  if ((UNIFIED_ROSTER_IDENTITY_COLUMNS as readonly string[]).includes(key)) return 'identity';
  if ((UNIFIED_ROSTER_EMPLOYMENT_COLUMNS as readonly string[]).includes(key)) return 'employment';
  if ((UNIFIED_ROSTER_BANK_COLUMNS as readonly string[]).includes(key)) return 'bank';
  if ((UNIFIED_ROSTER_VETTING_COLUMNS as readonly string[]).includes(key)) return 'vetting';
  if ((UNIFIED_ROSTER_SITE_COLUMNS as readonly string[]).includes(key)) return 'placement';
  if ((UNIFIED_ROSTER_DEBT_COLUMNS as readonly string[]).includes(key)) return 'debts';
  return undefined;
}

/** Template example — field guard at a client site with uniform debt. */
export const EXAMPLE_UNIFIED_GUARD_ROW: Record<string, string | number | boolean> = {
  employee_id: '',
  emp_number: 'G-001',
  epf_no: '12345',
  previous_epf_no: '',
  full_name: 'PERERA K.A.N.',
  nic: '199412345678',
  passport_no: '',
  phone: '+94771234567',
  email: '',
  dob: '1990-05-15',
  gender: 'MALE',
  nationality: 'SRI LANKAN',
  religion: 'BUDDHIST',
  home_address: 'NO 12, TEMPLE ROAD, NUGEGODA',
  group: 'GUARD',
  rank: 'JSO',
  rank_title: '',
  rank_basic_pay: '',
  rank_salary_type: '',
  rank_operational_group: '',
  role: 'SECURITY OFFICER',
  site_name: 'Lanka Hospitals — Main Gate',
  date_joined: '2024-01-15',
  status: 'ACTIVE',
  base_salary: 42000,
  salary_type: 'BANK',
  epf_yn: true,
  site_allowance_lkr: 5000,
  fixed_allowance_lkr: 0,
  special_allowance_lkr: 0,
  meal_allowance_lkr: 0,
  transport_allowance_lkr: 0,
  fixed_deduction_lkr: 0,
  maternity_leave: false,
  bank_code: '7056',
  bank_name: 'COMMERCIAL BANK',
  branch_code: '052',
  account_number: '8001234567',
  grama_niladari_expiry: '2027-06-30',
  site_type: 'HOTEL',
  site_address: 'NO 578, ELVITIGALA MAWATHA, COLOMBO 05',
  required_guards: 2,
  assigned_sm_epf: '13650',
  site_latitude: 6.9105,
  site_longitude: 79.8648,
  geofence_radius_m: 10,
  verification_mode: 'B',
  provides_food: false,
  food_allowance_lkr: 0,
  provides_accommodation: false,
  nfc_tag_id: '',
  uniform_outstanding_lkr: 3500,
  meals_advance_other_outstanding_lkr: 0,
  salary_advance_outstanding_lkr: 0,
  penalty_outstanding_lkr: 0,
  salary_loan_outstanding_lkr: 0,
  unit_damages_outstanding_lkr: 0,
  other_deduction_outstanding_lkr: 0,
  debt_notes: '',
  hr_memo: '',
};

/** Template example — head-office staff (no client site or debts). */
export const EXAMPLE_UNIFIED_HO_ROW: Record<string, string | number | boolean> = {
  employee_id: '',
  emp_number: 'HO-001',
  epf_no: '99001',
  previous_epf_no: '',
  full_name: 'SILVA M.P.',
  nic: '198512345678',
  passport_no: '',
  phone: '+94771112233',
  email: 'hr.staff@company.example',
  dob: '1985-03-20',
  gender: 'FEMALE',
  nationality: 'SRI LANKAN',
  religion: 'BUDDHIST',
  home_address: 'NO 45, GALLE ROAD, COLOMBO 03',
  group: 'HEAD_OFFICE',
  rank: 'HR',
  rank_title: '',
  rank_basic_pay: '',
  rank_salary_type: '',
  rank_operational_group: '',
  role: 'HR OFFICER',
  site_name: 'HEAD OFFICE',
  date_joined: '2022-06-01',
  status: 'ACTIVE',
  base_salary: 85000,
  salary_type: 'BANK',
  epf_yn: true,
  fixed_allowance_lkr: 0,
  special_allowance_lkr: 5000,
  site_allowance_lkr: 0,
  meal_allowance_lkr: 0,
  transport_allowance_lkr: 15000,
  fixed_deduction_lkr: 0,
  maternity_leave: false,
  bank_code: '7010',
  bank_name: 'HATTON NATIONAL BANK',
  branch_code: '001',
  account_number: '1234567890',
  grama_niladari_expiry: '',
  site_type: '',
  site_address: '',
  required_guards: '',
  assigned_sm_epf: '',
  site_latitude: '',
  site_longitude: '',
  geofence_radius_m: '',
  verification_mode: '',
  provides_food: '',
  food_allowance_lkr: '',
  provides_accommodation: '',
  nfc_tag_id: '',
  uniform_outstanding_lkr: 0,
  meals_advance_other_outstanding_lkr: 0,
  salary_advance_outstanding_lkr: 0,
  penalty_outstanding_lkr: 0,
  salary_loan_outstanding_lkr: 0,
  unit_damages_outstanding_lkr: 0,
  other_deduction_outstanding_lkr: 0,
  debt_notes: '',
  hr_memo: '',
};

export const EXAMPLE_UNIFIED_ROSTER_ROWS = [
  EXAMPLE_UNIFIED_GUARD_ROW,
  EXAMPLE_UNIFIED_HO_ROW,
] as const;

/** Migration template examples — fictional sample data only (step 6). */
export const EXAMPLE_MIGRATION_HEAD_OFFICE_ROW: Record<string, string | number | boolean> = {
  employee_id: '',
  emp_number: 'HO-001',
  epf_no: '99001',
  previous_epf_no: '',
  full_name: 'SILVA M.P.',
  nic: '198512345678',
  passport_no: '',
  phone: '+94771112233',
  email: 'hr.staff@company.example',
  dob: '1985-03-20',
  gender: 'FEMALE',
  nationality: 'SRI LANKAN',
  religion: 'BUDDHIST',
  home_address: 'NO 45, GALLE ROAD, COLOMBO 03',
  emergency_contact: '+94770001122',
  employee_referral: '',
  corporate_group: 'HEAD_OFFICE',
  rank: 'HR',
  rank_title: '',
  rank_basic_pay: '',
  rank_salary_type: '',
  rank_operational_group: 'HEAD_OFFICE',
  role: 'HR OFFICER',
  date_joined: '2022-06-01',
  status: 'ACTIVE',
  base_salary: 85000,
  salary_type: 'BANK',
  epf_yn: true,
  fixed_allowance_lkr: 0,
  special_allowance_lkr: 5000,
  site_allowance_lkr: 0,
  meal_allowance_lkr: 0,
  transport_allowance_lkr: 15000,
  fixed_deduction_lkr: 0,
  maternity_leave: false,
  site_code: 'HO1',
  bank_code: '7010',
  bank_name: 'HATTON NATIONAL BANK',
  branch_code: '001',
  account_number: '1234567890',
  grama_niladari_expiry: '',
  uniform_outstanding_lkr: 0,
  meals_advance_other_outstanding_lkr: 0,
  salary_advance_outstanding_lkr: 0,
  penalty_outstanding_lkr: 0,
  salary_loan_outstanding_lkr: 0,
  unit_damages_outstanding_lkr: 0,
  other_deduction_outstanding_lkr: 0,
  debt_notes: '',
  hr_memo: '',
};

export const EXAMPLE_MIGRATION_CAFE_ROW: Record<string, string | number | boolean> = {
  employee_id: '',
  emp_number: 'CF-001',
  epf_no: '99002',
  previous_epf_no: '',
  full_name: 'JAYAWARDENA K.',
  nic: '199512345678',
  passport_no: '',
  phone: '+94772223344',
  email: '',
  dob: '1995-08-10',
  gender: 'MALE',
  nationality: 'SRI LANKAN',
  religion: 'BUDDHIST',
  home_address: 'NO 8, KANDY ROAD, KADUWELA',
  emergency_contact: '+94773334455',
  employee_referral: '',
  corporate_group: 'CAFE',
  rank: 'BARISTA',
  rank_title: '',
  rank_basic_pay: '',
  rank_salary_type: '',
  rank_operational_group: 'CAFE',
  role: 'CAFE STAFF',
  date_joined: '2023-03-01',
  status: 'ACTIVE',
  base_salary: 38000,
  salary_type: 'BANK',
  epf_yn: true,
  fixed_allowance_lkr: 0,
  special_allowance_lkr: 2000,
  site_allowance_lkr: 0,
  meal_allowance_lkr: 1500,
  transport_allowance_lkr: 0,
  fixed_deduction_lkr: 0,
  maternity_leave: false,
  site_code: 'CAFE01',
  bank_code: '7056',
  bank_name: 'COMMERCIAL BANK',
  branch_code: '052',
  account_number: '8009876543',
  grama_niladari_expiry: '',
  uniform_outstanding_lkr: 0,
  meals_advance_other_outstanding_lkr: 0,
  salary_advance_outstanding_lkr: 0,
  penalty_outstanding_lkr: 0,
  salary_loan_outstanding_lkr: 0,
  unit_damages_outstanding_lkr: 0,
  other_deduction_outstanding_lkr: 0,
  debt_notes: '',
  hr_memo: '',
};

export const EXAMPLE_MIGRATION_GUARD_ROW: Record<string, string | number | boolean> = {
  employee_id: '',
  emp_number: 'G-001',
  epf_no: '12345',
  previous_epf_no: '',
  full_name: 'PERERA K.A.N.',
  nic: '199412345678',
  passport_no: '',
  phone: '+94771234567',
  email: '',
  dob: '1990-05-15',
  gender: 'MALE',
  nationality: 'SRI LANKAN',
  religion: 'BUDDHIST',
  home_address: 'NO 12, TEMPLE ROAD, NUGEGODA',
  emergency_contact: '+94775556677',
  employee_referral: '',
  corporate_group: 'GUARD',
  rank: 'JSO',
  rank_title: '',
  rank_basic_pay: '',
  rank_salary_type: '',
  rank_operational_group: 'GUARD',
  role: 'SECURITY OFFICER',
  date_joined: '2024-01-15',
  status: 'ACTIVE',
  base_salary: 42000,
  salary_type: 'BANK',
  epf_yn: true,
  fixed_allowance_lkr: 0,
  special_allowance_lkr: 0,
  site_allowance_lkr: 5000,
  meal_allowance_lkr: 0,
  transport_allowance_lkr: 0,
  fixed_deduction_lkr: 0,
  maternity_leave: false,
  site_code: 'LKH001',
  assigned_sm_epf: '13650',
  bank_code: '7056',
  bank_name: 'COMMERCIAL BANK',
  branch_code: '052',
  account_number: '8001234567',
  grama_niladari_expiry: '2027-06-30',
  uniform_outstanding_lkr: 3500,
  meals_advance_other_outstanding_lkr: 0,
  salary_advance_outstanding_lkr: 0,
  penalty_outstanding_lkr: 0,
  salary_loan_outstanding_lkr: 0,
  unit_damages_outstanding_lkr: 0,
  other_deduction_outstanding_lkr: 0,
  debt_notes: '',
  hr_memo: '',
};

export const EXAMPLE_MIGRATION_SM_ROWS: Record<string, string | number | boolean>[] = [
  {
    employee_id: '',
    emp_number: 'SM-A',
    epf_no: '13650',
    previous_epf_no: '',
    full_name: 'DE SILVA D.N.S.L.K.',
    nic: '197812345678',
    passport_no: '',
    phone: '+94771234567',
    email: '',
    dob: '1978-02-14',
    gender: 'MALE',
    nationality: 'SRI LANKAN',
    religion: 'BUDDHIST',
    home_address: 'NO 22, GALLE ROAD, MORATUWA',
    emergency_contact: '+94776667788',
    employee_referral: '',
    corporate_group: 'SECTOR_MANAGER',
    rank: 'VO',
    rank_title: '',
    rank_basic_pay: '',
    rank_salary_type: '',
    rank_operational_group: 'SECTOR_MANAGER',
    role: 'SECTOR MANAGER',
    date_joined: '2018-04-01',
    status: 'ACTIVE',
    base_salary: 95000,
    salary_type: 'BANK',
    epf_yn: true,
    fixed_allowance_lkr: 0,
    special_allowance_lkr: 8000,
    site_allowance_lkr: 0,
    meal_allowance_lkr: 0,
    transport_allowance_lkr: 20000,
    fixed_deduction_lkr: 0,
    maternity_leave: false,
    bank_code: '7056',
    bank_name: 'COMMERCIAL BANK',
    branch_code: '052',
    account_number: '8005551234',
    grama_niladari_expiry: '',
    uniform_outstanding_lkr: 0,
    meals_advance_other_outstanding_lkr: 0,
    salary_advance_outstanding_lkr: 0,
    penalty_outstanding_lkr: 0,
    salary_loan_outstanding_lkr: 0,
    unit_damages_outstanding_lkr: 0,
    other_deduction_outstanding_lkr: 0,
    debt_notes: '',
  hr_memo: '',
  },
  {
    employee_id: '',
    emp_number: 'SM-B',
    epf_no: '13496',
    previous_epf_no: '',
    full_name: 'PATHMAKUMARA P.M.E.',
    nic: '198012345678',
    passport_no: '',
    phone: '+94772345678',
    email: '',
    dob: '1980-11-20',
    gender: 'MALE',
    nationality: 'SRI LANKAN',
    religion: 'BUDDHIST',
    home_address: 'NO 5, HILL STREET, DEHIWALA',
    emergency_contact: '+94778889900',
    employee_referral: '',
    corporate_group: 'SECTOR_MANAGER',
    rank: 'VO',
    rank_title: '',
    rank_basic_pay: '',
    rank_salary_type: '',
    rank_operational_group: 'SECTOR_MANAGER',
    role: 'SECTOR MANAGER',
    date_joined: '2019-07-15',
    status: 'ACTIVE',
    base_salary: 92000,
    salary_type: 'BANK',
    epf_yn: true,
    fixed_allowance_lkr: 0,
    special_allowance_lkr: 7500,
    site_allowance_lkr: 0,
    meal_allowance_lkr: 0,
    transport_allowance_lkr: 18000,
    fixed_deduction_lkr: 0,
    maternity_leave: false,
    bank_code: '7010',
    bank_name: 'HATTON NATIONAL BANK',
    branch_code: '001',
    account_number: '1239876540',
    grama_niladari_expiry: '',
    uniform_outstanding_lkr: 0,
    meals_advance_other_outstanding_lkr: 0,
    salary_advance_outstanding_lkr: 0,
    penalty_outstanding_lkr: 0,
    salary_loan_outstanding_lkr: 0,
    unit_damages_outstanding_lkr: 0,
    other_deduction_outstanding_lkr: 0,
    debt_notes: '',
  hr_memo: '',
  },
];

export const EXAMPLE_MIGRATION_RESIGNED_ROW: Record<string, string | number | boolean> = {
  employee_id: '',
  emp_number: 'G-099',
  epf_no: '12888',
  previous_epf_no: '',
  full_name: 'FERNANDO S.M.',
  nic: '198512345678',
  passport_no: '',
  phone: '+94776661234',
  email: '',
  dob: '1985-08-20',
  gender: 'MALE',
  nationality: 'SRI LANKAN',
  religion: 'CATHOLIC',
  home_address: 'NO 8, ST ANTHONY ROAD, KATUNAYAKE',
  emergency_contact: '+94771112233',
  employee_referral: '',
  corporate_group: 'GUARD',
  rank: 'JSO',
  rank_title: '',
  rank_basic_pay: '',
  rank_salary_type: '',
  rank_operational_group: 'GUARD',
  role: 'SECURITY OFFICER',
  date_joined: '2019-03-01',
  status: 'Resigned',
  base_salary: 40000,
  salary_type: 'BANK',
  epf_yn: true,
  fixed_allowance_lkr: 0,
  special_allowance_lkr: 0,
  site_allowance_lkr: 0,
  meal_allowance_lkr: 0,
  transport_allowance_lkr: 0,
  fixed_deduction_lkr: 0,
  maternity_leave: false,
  bank_code: '7056',
  bank_name: 'COMMERCIAL BANK',
  branch_code: '052',
  account_number: '8009988776',
  grama_niladari_expiry: '2026-03-31',
  date_resigned: '2025-11-30',
  resignation_type: 'VOLUNTARY',
  resignation_notes: 'End of contract — final clearance pending FM',
  uniform_outstanding_lkr: 4500,
  meals_advance_other_outstanding_lkr: 2000,
  salary_advance_outstanding_lkr: 15000,
  penalty_outstanding_lkr: 0,
  salary_loan_outstanding_lkr: 25000,
  unit_damages_outstanding_lkr: 0,
  other_deduction_outstanding_lkr: 500,
  debt_notes: 'Legacy loan balance from 2024 advance',
  hr_memo: '',
};

export const EXAMPLE_MIGRATION_INACTIVE_ROW: Record<string, string | number | boolean> = {
  employee_id: '',
  emp_number: 'G-050',
  epf_no: '11223',
  previous_epf_no: '',
  full_name: 'JAYAWARDENA R.P.',
  nic: '199312345678',
  passport_no: '',
  phone: '+94774445566',
  email: '',
  dob: '1993-11-02',
  gender: 'MALE',
  nationality: 'SRI LANKAN',
  religion: 'BUDDHIST',
  home_address: 'NO 3, LAKE DRIVE, RAJAGIRIYA',
  emergency_contact: '+94773334455',
  employee_referral: '',
  corporate_group: 'GUARD',
  rank: 'JSO',
  rank_title: '',
  rank_basic_pay: '',
  rank_salary_type: '',
  rank_operational_group: 'GUARD',
  role: 'SECURITY OFFICER',
  date_joined: '2022-07-01',
  status: 'Inactive',
  base_salary: 42000,
  salary_type: 'BANK',
  epf_yn: true,
  fixed_allowance_lkr: 0,
  special_allowance_lkr: 0,
  site_allowance_lkr: 0,
  meal_allowance_lkr: 0,
  transport_allowance_lkr: 0,
  fixed_deduction_lkr: 0,
  maternity_leave: false,
  site_code: 'r01',
  assigned_sm_epf: '',
  bank_code: '7010',
  bank_name: 'HATTON NATIONAL BANK',
  branch_code: '001',
  account_number: '1234567890',
  grama_niladari_expiry: '2027-01-31',
  uniform_outstanding_lkr: 0,
  meals_advance_other_outstanding_lkr: 0,
  salary_advance_outstanding_lkr: 0,
  penalty_outstanding_lkr: 0,
  salary_loan_outstanding_lkr: 0,
  unit_damages_outstanding_lkr: 0,
  other_deduction_outstanding_lkr: 0,
  debt_notes: '',
  hr_memo: '',
};

export const EXAMPLE_MIGRATION_TEMP_GUARD_ROW: Record<string, string | number | boolean> = {
  employee_id: '',
  emp_number: 'G-T01',
  epf_no: '99001',
  previous_epf_no: '',
  full_name: 'DIAS K.L.',
  nic: '200012345678',
  passport_no: '',
  phone: '+94778889900',
  email: '',
  dob: '2000-04-18',
  gender: 'MALE',
  nationality: 'SRI LANKAN',
  religion: 'BUDDHIST',
  home_address: 'NO 15, STATION ROAD, PANADURA',
  emergency_contact: '+94779998877',
  employee_referral: '',
  corporate_group: 'GUARD',
  rank: 'JSO',
  rank_title: '',
  rank_basic_pay: '',
  rank_salary_type: '',
  rank_operational_group: 'GUARD',
  role: 'TEMPORARY GUARD',
  date_joined: '2025-12-01',
  status: 'ACTIVE',
  base_salary: 38000,
  salary_type: 'CASH',
  epf_yn: false,
  fixed_allowance_lkr: 0,
  special_allowance_lkr: 0,
  site_allowance_lkr: 0,
  meal_allowance_lkr: 0,
  transport_allowance_lkr: 0,
  fixed_deduction_lkr: 0,
  maternity_leave: false,
  site_code: 't',
  assigned_sm_epf: '',
  temp_parent_epf: '12345',
  bank_code: '',
  bank_name: '',
  branch_code: '',
  account_number: '',
  grama_niladari_expiry: '2026-12-31',
  uniform_outstanding_lkr: 0,
  meals_advance_other_outstanding_lkr: 0,
  salary_advance_outstanding_lkr: 0,
  penalty_outstanding_lkr: 0,
  salary_loan_outstanding_lkr: 0,
  unit_damages_outstanding_lkr: 0,
  other_deduction_outstanding_lkr: 0,
  debt_notes: '',
  hr_memo: '',
};

export const EXAMPLE_MIGRATION_SITE_ROWS: Record<string, string | number | boolean>[] = [
  {
    site_code: 'LKH001',
    site_name: 'LAKE VIEW HOTEL — MAIN ENTRANCE',
    site_type: 'HOTEL',
    site_status: 'ACTIVE',
    client_name: 'LAKE VIEW HOTELS PLC',
    parent_client: 'LAKE VIEW HOTELS PLC',
    client_billing_address: 'NO 45, GALLE ROAD, MOUNT LAVINIA',
    contract_start: '2024-01-01',
    contract_end: '2025-12-31',
    address: 'NO 45, GALLE ROAD, MOUNT LAVINIA',
    latitude: 6.8406,
    longitude: 79.8719,
    geofence_radius_m: 100,
    verification_mode: 'B',
    needs_om_gps_capture: false,
    assigned_sm_epf: '13650',
    required_guards: 4,
    per_visit_charge_lkr: 0,
    min_dwell_time_minutes: 15,
    nfc_tag_id: '',
    provides_food: true,
    food_allowance_lkr: 5000,
    provides_accommodation: false,
    ...migrationSiteRateFields({
      CSO: { qty: 2, invoice: 85000, pay: 65000 },
      JSO: { qty: 2, invoice: 72000, pay: 42000 },
    }),
  },
  {
    site_code: 'BRK002',
    site_name: 'COMMERCIAL BANK — NUGEGODA BRANCH',
    site_type: 'BANK',
    site_status: 'ACTIVE',
    client_name: 'COMMERCIAL BANK OF CEYLON PLC',
    parent_client: 'COMMERCIAL BANK OF CEYLON PLC',
    client_billing_address: 'NO 88, HIGH LEVEL ROAD, NUGEGODA',
    contract_start: '2023-06-01',
    contract_end: '2026-05-31',
    address: 'NO 88, HIGH LEVEL ROAD, NUGEGODA',
    latitude: 6.8649,
    longitude: 79.8997,
    geofence_radius_m: 75,
    verification_mode: 'A',
    needs_om_gps_capture: false,
    assigned_sm_epf: '13496',
    required_guards: 2,
    per_visit_charge_lkr: 2500,
    min_dwell_time_minutes: 10,
    nfc_tag_id: 'NFC-BRK002-01',
    provides_food: false,
    food_allowance_lkr: 0,
    provides_accommodation: false,
    ...migrationSiteRateFields({
      CSO: { qty: 1, invoice: 78000, pay: 58000 },
      JSO: { qty: 1, invoice: 68000, pay: 40000 },
    }),
  },
  exampleMigrationBenchSiteRow('r01', 'RESERVE GUARD BENCH'),
  exampleMigrationBenchSiteRow('t', 'TEMPORARY GUARD POOL'),
  exampleMigrationBenchSiteRow('TEMPORY', 'TEMPORARY GUARD POOL (LEGACY CODE)'),
];

export function exampleRowsForMigrationWorkforceSheet(
  sheet: MigrationWorkforceSheetName,
): Record<string, unknown>[] {
  switch (sheet) {
    case MIGRATION_SHEET_HEAD_OFFICE:
      return [EXAMPLE_MIGRATION_HEAD_OFFICE_ROW];
    case MIGRATION_SHEET_CAFE:
      return [EXAMPLE_MIGRATION_CAFE_ROW];
    case MIGRATION_SHEET_GUARD:
      return [EXAMPLE_MIGRATION_GUARD_ROW];
    case MIGRATION_SHEET_SM:
      return EXAMPLE_MIGRATION_SM_ROWS;
    case MIGRATION_SHEET_RESIGNED:
      return [EXAMPLE_MIGRATION_RESIGNED_ROW];
    case MIGRATION_SHEET_INACTIVE:
      return [EXAMPLE_MIGRATION_INACTIVE_ROW];
    case MIGRATION_SHEET_TEMP_GUARDS:
      return [EXAMPLE_MIGRATION_TEMP_GUARD_ROW];
    default:
      return [];
  }
}

export type MigrationTemplateSheetInput = {
  sheetName: string;
  sheetTitle?: string;
  columns: readonly string[];
  rows: Record<string, unknown>[];
  columnGroupForKey: (columnKey: string) => MigrationColumnGroupId | undefined;
};

export function buildMigrationTemplateWorkforceSheetInputs(
  sheets: readonly MigrationWorkforceSheetName[] = MIGRATION_TEMPLATE_WORKFORCE_SHEETS,
): MigrationTemplateSheetInput[] {
  return sheets.map((sheetName) => {
    const columns = templateColumnsForMigrationWorkforceSheet(sheetName);
    const meta = MIGRATION_SHEET_META[sheetName];
    const rows = exampleRowsForMigrationWorkforceSheet(sheetName).map((row) =>
      pickColumns(columns, {
        ...row,
        corporate_group: row.corporate_group ?? meta.fixedGroup,
        status: row.status ?? meta.defaultStatus,
      }),
    );

    return {
      sheetName,
      sheetTitle: `${sheetName} — Pearzen migration`,
      columns,
      rows,
      columnGroupForKey: migrationEmployeeColumnGroupId,
    };
  });
}

export function buildMigrationTemplateSitesSheetInput(): MigrationTemplateSheetInput {
  const columns = [...MIGRATION_SITES_COLUMNS];
  const rows = EXAMPLE_MIGRATION_SITE_ROWS.map((row) => pickColumns(columns, row));

  return {
    sheetName: MIGRATION_SHEET_SITES,
    sheetTitle: `${MIGRATION_SHEET_SITES} — Pearzen migration`,
    columns,
    rows,
    columnGroupForKey: migrationSitesColumnGroupId,
  };
}

/** Workforce tabs + Sites + offboarding pool tabs for blank migration template download. */
export function buildMigrationTemplateSheetInputs(): MigrationTemplateSheetInput[] {
  return [
    ...buildMigrationTemplateWorkforceSheetInputs(),
    buildMigrationTemplateSitesSheetInput(),
    ...buildMigrationTemplateWorkforceSheetInputs(MIGRATION_TEMPLATE_OFFBOARDING_SHEETS),
  ];
}

export const EMPLOYEE_BULK_COLUMNS = [
  'employee_id',
  'emp_number',
  'full_name',
  'nic',
  'passport_no',
  'epf_no',
  'phone',
  'dob',
  'gender',
  'nationality',
  'religion',
  'home_address',
  'role',
  'group',
  'rank',
  'site',
  'date_joined',
  'status',
  'base_salary',
  'salary_type',
  'epf_yn',
  'bank_code',
  'bank_name',
  'branch_code',
  'account_number',
  'grama_niladari_expiry',
  'maternity_leave',
] as const;

export const SITE_BULK_COLUMNS = [
  'site_id',
  'site_name',
  'site_type',
  'address',
  'required_guards',
  'assigned_sm_epf',
  'latitude',
  'longitude',
  'geofence_radius_m',
  'verification_mode',
  'provides_food',
  'food_allowance_lkr',
  'provides_accommodation',
  'nfc_tag_id',
] as const;

export const SM_GUARD_LINK_COLUMNS = ['sm_epf', 'guard_epf'] as const;

export const RANK_MATRIX_COLUMNS = [
  'rank_code',
  'full_title',
  'basic_pay',
  'salary_type',
  'operational_group',
  'annual_increment',
] as const;

function pickColumns<T extends readonly string[]>(
  columns: T,
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

function emptyUnifiedRosterRow(): Record<string, unknown> {
  return pickColumns(
    UNIFIED_ROSTER_COLUMNS,
    Object.fromEntries(UNIFIED_ROSTER_COLUMNS.map((col) => [col, ''])),
  );
}

/**
 * Merge legacy employee export rows + site_profiles into unified Roster columns.
 * Debt and allowance fields are filled when present on the employee row (step 13 expands this).
 */
export function mergeExportRowsToUnifiedRoster(
  employees: Record<string, unknown>[],
  sites: Record<string, unknown>[],
): Record<string, unknown>[] {
  const siteByName = new Map<string, Record<string, unknown>>();
  for (const site of sites) {
    const key = String(site.site_name ?? '').trim().toLowerCase();
    if (key) siteByName.set(key, site);
  }

  return employees.map((emp) => {
    const base = emptyUnifiedRosterRow();
    const siteLabel = String(emp.site_name ?? emp.site ?? '').trim();
    const site = siteLabel ? siteByName.get(siteLabel.toLowerCase()) : undefined;

    const merged: Record<string, unknown> = {
      ...base,
      employee_id: emp.employee_id ?? '',
      emp_number: emp.emp_number ?? '',
      epf_no: emp.epf_no ?? '',
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
      base_salary: emp.base_salary ?? '',
      salary_type: emp.salary_type ?? '',
      epf_yn: emp.epf_yn ?? '',
      fixed_allowance_lkr: emp.fixed_allowance_lkr ?? '',
      special_allowance_lkr: emp.special_allowance_lkr ?? '',
      site_allowance_lkr: emp.site_allowance_lkr ?? '',
      meal_allowance_lkr: emp.meal_allowance_lkr ?? '',
      transport_allowance_lkr: emp.transport_allowance_lkr ?? '',
      fixed_deduction_lkr: emp.fixed_deduction_lkr ?? '',
      maternity_leave: emp.maternity_leave ?? '',
      bank_code: emp.bank_code ?? '',
      bank_name: emp.bank_name ?? '',
      branch_code: emp.branch_code ?? '',
      account_number: emp.account_number ?? '',
      grama_niladari_expiry: emp.grama_niladari_expiry ?? '',
      uniform_outstanding_lkr: emp.uniform_outstanding_lkr ?? emp.uniform_balance ?? '',
      meals_advance_other_outstanding_lkr:
        emp.meals_advance_other_outstanding_lkr ?? emp.accom_balance ?? '',
      salary_advance_outstanding_lkr: emp.salary_advance_outstanding_lkr ?? '',
      penalty_outstanding_lkr: emp.penalty_outstanding_lkr ?? '',
      salary_loan_outstanding_lkr: emp.salary_loan_outstanding_lkr ?? '',
      unit_damages_outstanding_lkr: emp.unit_damages_outstanding_lkr ?? '',
      other_deduction_outstanding_lkr: emp.other_deduction_outstanding_lkr ?? '',
      debt_notes: emp.debt_notes ?? '',
      hr_memo: emp.hr_memo ?? '',
    };

    if (site) {
      merged.site_type = emp.site_type ?? site.site_type ?? '';
      merged.site_address = emp.site_address ?? site.site_address ?? site.address ?? '';
      merged.required_guards = emp.required_guards ?? site.required_guards ?? '';
      merged.assigned_sm_epf = emp.assigned_sm_epf ?? site.assigned_sm_epf ?? '';
      merged.site_latitude = emp.site_latitude ?? site.site_latitude ?? site.latitude ?? '';
      merged.site_longitude = emp.site_longitude ?? site.site_longitude ?? site.longitude ?? '';
      merged.geofence_radius_m =
        emp.geofence_radius_m ?? site.geofence_radius_m ?? site.geofence_radius ?? '';
      merged.verification_mode = emp.verification_mode ?? site.verification_mode ?? '';
      merged.provides_food = emp.provides_food ?? site.provides_food ?? '';
      merged.food_allowance_lkr = emp.food_allowance_lkr ?? site.food_allowance_lkr ?? '';
      merged.provides_accommodation =
        emp.provides_accommodation ?? site.provides_accommodation ?? '';
      merged.nfc_tag_id = emp.nfc_tag_id ?? site.nfc_tag_id ?? '';
    } else {
      merged.site_type = emp.site_type ?? '';
      merged.site_address = emp.site_address ?? emp.address ?? '';
      merged.required_guards = emp.required_guards ?? '';
      merged.assigned_sm_epf = emp.assigned_sm_epf ?? '';
      merged.site_latitude = emp.site_latitude ?? emp.latitude ?? '';
      merged.site_longitude = emp.site_longitude ?? emp.longitude ?? '';
      merged.geofence_radius_m = emp.geofence_radius_m ?? emp.geofence_radius ?? '';
      merged.verification_mode = emp.verification_mode ?? '';
      merged.provides_food = emp.provides_food ?? '';
      merged.food_allowance_lkr = emp.food_allowance_lkr ?? '';
      merged.provides_accommodation = emp.provides_accommodation ?? '';
      merged.nfc_tag_id = emp.nfc_tag_id ?? '';
    }

    return pickColumns(UNIFIED_ROSTER_COLUMNS, merged);
  });
}

export type BulkWorkbookInput = {
  mode: 'template' | 'export';
  employees: Record<string, unknown>[];
  sites: Record<string, unknown>[];
  /** @deprecated Unused — SM links derived from assigned_sm_epf on import (step 12). */
  smGuardLinks?: Record<string, unknown>[];
  /** @deprecated Unused — ranks auto-created on import when missing (step 8). */
  rankMatrix?: RankPayEntry[];
};

/** Static lookup lists for export-mode dropdowns (step 9). */
export type MigrationExportLookupsSource = {
  siteCodes: readonly string[];
  smEpfs: readonly string[];
};

/** Derive site codes + SM EPFs from live export rows for Lookups / validations. */
export function buildMigrationExportLookupsSource(
  employees: Record<string, unknown>[],
  sites: Record<string, unknown>[],
): MigrationExportLookupsSource {
  const siteCodes = new Set<string>(['r01', 't', 'TEMPORY']);
  for (const site of sites) {
    const code = String(site.site_code ?? site.siteCode ?? '').trim().toUpperCase();
    if (code) siteCodes.add(code);
  }

  const smEpfs = new Set<string>();
  for (const emp of employees) {
    const group = String(emp.group ?? emp.corporate_group ?? '').toUpperCase();
    if (group !== 'SECTOR_MANAGER') continue;
    const epf = String(emp.epf_no ?? emp.epf_num ?? emp.emp_number ?? '')
      .trim()
      .toUpperCase();
    if (epf) smEpfs.add(epf);
  }

  return {
    siteCodes: [...siteCodes].filter(Boolean).sort(),
    smEpfs: [...smEpfs].filter(Boolean).sort(),
  };
}

export async function buildBulkDataWorkbook(input: BulkWorkbookInput): Promise<{
  base64: string;
  filename: string;
}> {
  const { mode, employees, sites } = input;

  const stamp = new Date().toISOString().slice(0, 10);
  const filename =
    mode === 'template'
      ? `pearzen-migration-template-${stamp}.xlsx`
      : `pearzen-migration-export-${stamp}.xlsx`;

  const { writeExcelJsWorkbookToBase64 } = await import('./migration-workbook-exceljs');

  if (mode === 'template') {
    const base64 = await writeExcelJsWorkbookToBase64(buildMigrationTemplateSheetInputs(), {
      mode: 'template',
    });
    return { base64, filename };
  }

  const { buildMigrationExportSheetInputs } = await import('./bulk-data-import');
  const exportLookups = buildMigrationExportLookupsSource(employees, sites);
  const base64 = await writeExcelJsWorkbookToBase64(
    buildMigrationExportSheetInputs(employees, sites),
    {
      mode: 'export',
      exportLookups,
    },
  );

  return { base64, filename };
}
