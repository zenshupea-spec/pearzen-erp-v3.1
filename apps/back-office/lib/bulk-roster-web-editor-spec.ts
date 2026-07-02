/**
 * In-browser bulk roster editor — tab order, columns, colours, and shared types.
 * See BULK_ROSTER_WEB_EDITOR_STEPS.txt.
 */

import {
  isLockedExecutiveLedgerRank,
  isLockedSectorManagerLedgerRank,
  isSingletonHrAssignablePortalRank,
  type OperationalGroup,
  type RankSalaryType,
} from '../../../packages/rank-pay-matrix';

import {
  MIGRATION_COLUMN_GROUP_COLORS,
  MIGRATION_EMPLOYEE_BANK_COLUMNS,
  MIGRATION_EMPLOYEE_DEBT_COLUMNS,
  MIGRATION_EMPLOYEE_EMPLOYMENT_COLUMNS,
  MIGRATION_EMPLOYEE_IDENTITY_COLUMNS,
  MIGRATION_EMPLOYEE_INTERNAL_SITE_COLUMNS,
  MIGRATION_EMPLOYEE_MEMO_COLUMNS,
  MIGRATION_EMPLOYEE_PLACEMENT_COLUMNS,
  MIGRATION_EMPLOYEE_VETTING_COLUMNS,
  MIGRATION_SITES_COLUMNS,
  MIGRATION_SHEET_CAFE,
  MIGRATION_SHEET_GUARD,
  MIGRATION_SHEET_HEAD_OFFICE,
  MIGRATION_SHEET_SITES,
  type MigrationColumnGroupId,
} from './bulk-data-workbook';
import { isSectorManagerEmployee } from './hr-sectors';

/** Visible editor tabs in left-to-right order. */
export const WEB_EDITOR_TAB_ORDER = [
  'head_office',
  'cafe',
  'sites',
  'guard',
  'ranks',
] as const;

export type BulkEditorTabId = (typeof WEB_EDITOR_TAB_ORDER)[number];

/** Cross-sheet sector label — maps to employees.site for SM rows on save. */
export const WEB_EDITOR_SECTOR_NAME_COLUMN = 'sector_name' as const;

/** Head Office rank code that requires sector_name. */
export const WEB_EDITOR_SECTOR_MANAGER_RANK_CODE = 'SM' as const;

const WEB_EDITOR_WORKFORCE_BASE_COLUMNS = [
  ...MIGRATION_EMPLOYEE_IDENTITY_COLUMNS,
  ...MIGRATION_EMPLOYEE_EMPLOYMENT_COLUMNS,
  ...MIGRATION_EMPLOYEE_BANK_COLUMNS,
  ...MIGRATION_EMPLOYEE_VETTING_COLUMNS,
  ...MIGRATION_EMPLOYEE_DEBT_COLUMNS,
  ...MIGRATION_EMPLOYEE_MEMO_COLUMNS,
] as const;

/** Head Office workforce columns (includes conditional sector_name). */
export const WEB_EDITOR_HEAD_OFFICE_COLUMNS = [
  ...WEB_EDITOR_WORKFORCE_BASE_COLUMNS,
  ...MIGRATION_EMPLOYEE_INTERNAL_SITE_COLUMNS,
  WEB_EDITOR_SECTOR_NAME_COLUMN,
] as const;

/** Café workforce columns — same as HO minus sector_name. */
export const WEB_EDITOR_CAFE_COLUMNS = [
  ...WEB_EDITOR_WORKFORCE_BASE_COLUMNS,
  ...MIGRATION_EMPLOYEE_INTERNAL_SITE_COLUMNS,
] as const;

/** Sites directory columns plus sector_name for SM auto-linking. */
export const WEB_EDITOR_SITES_COLUMNS = [
  ...MIGRATION_SITES_COLUMNS,
  WEB_EDITOR_SECTOR_NAME_COLUMN,
] as const;

/** Guard workforce columns with site + SM placement. */
export const WEB_EDITOR_GUARD_COLUMNS = [
  ...WEB_EDITOR_WORKFORCE_BASE_COLUMNS,
  ...MIGRATION_EMPLOYEE_PLACEMENT_COLUMNS,
] as const;

/** Ranks tab — maps to RankPayEntry on save. */
export const WEB_EDITOR_RANK_COLUMNS = [
  'rank_id',
  'rank_code',
  'rank_title',
  'basic_pay_lkr',
  'salary_type',
  'operational_group',
] as const;

export type WebEditorWorkforceColumn =
  | (typeof WEB_EDITOR_HEAD_OFFICE_COLUMNS)[number]
  | (typeof WEB_EDITOR_CAFE_COLUMNS)[number]
  | (typeof WEB_EDITOR_SITES_COLUMNS)[number]
  | (typeof WEB_EDITOR_GUARD_COLUMNS)[number];

export type WebEditorRankColumn = (typeof WEB_EDITOR_RANK_COLUMNS)[number];

export type WebEditorColumnGroupStyle = {
  fill: string;
  font: string;
  label: string;
};

/** Re-export migration palette for grid header bands. */
export const WEB_EDITOR_COLUMN_GROUP_STYLES: Record<
  MigrationColumnGroupId,
  WebEditorColumnGroupStyle
> = MIGRATION_COLUMN_GROUP_COLORS;

/** Editor tab accent colours (tab bar). */
export const WEB_EDITOR_TAB_ACCENT: Record<BulkEditorTabId, string> = {
  head_office: '#4338CA',
  cafe: '#7C3AED',
  sites: '#059669',
  guard: '#0284C7',
  ranks: '#475569',
};

export type WebEditorSectorNameColumnDef = {
  key: typeof WEB_EDITOR_SECTOR_NAME_COLUMN;
  /** Required only on Head Office rows where rank = SM. */
  requiredWhen: 'head_office_sm';
  /** Optional on Sites — used when assigned_sm_epf is blank. */
  optionalOnSites: true;
  groupId: 'placement';
  label: 'Sector name';
};

export const WEB_EDITOR_HEAD_OFFICE_SECTOR_COLUMN: WebEditorSectorNameColumnDef = {
  key: WEB_EDITOR_SECTOR_NAME_COLUMN,
  requiredWhen: 'head_office_sm',
  optionalOnSites: true,
  groupId: 'placement',
  label: 'Sector name',
};

export const WEB_EDITOR_SITES_SECTOR_COLUMN: WebEditorSectorNameColumnDef = {
  key: WEB_EDITOR_SECTOR_NAME_COLUMN,
  requiredWhen: 'head_office_sm',
  optionalOnSites: true,
  groupId: 'placement',
  label: 'Sector name',
};

export type WebEditorTabMeta = {
  id: BulkEditorTabId;
  label: string;
  /** Migration workbook sheet name when saving workforce/site tabs. */
  migrationSheetName?: string;
  fixedGroup?: string;
  defaultStatus?: string;
  columns: readonly string[];
  /** Show fixed corporate group badge on each row. */
  showFixedGroupBadge: boolean;
};

export const WEB_EDITOR_TAB_META: Record<BulkEditorTabId, WebEditorTabMeta> = {
  head_office: {
    id: 'head_office',
    label: 'Head Office',
    migrationSheetName: MIGRATION_SHEET_HEAD_OFFICE,
    fixedGroup: 'HEAD_OFFICE',
    defaultStatus: 'ACTIVE',
    columns: WEB_EDITOR_HEAD_OFFICE_COLUMNS,
    showFixedGroupBadge: true,
  },
  cafe: {
    id: 'cafe',
    label: 'Café',
    migrationSheetName: MIGRATION_SHEET_CAFE,
    fixedGroup: 'CAFE',
    defaultStatus: 'ACTIVE',
    columns: WEB_EDITOR_CAFE_COLUMNS,
    showFixedGroupBadge: true,
  },
  sites: {
    id: 'sites',
    label: 'Sites',
    migrationSheetName: MIGRATION_SHEET_SITES,
    columns: WEB_EDITOR_SITES_COLUMNS,
    showFixedGroupBadge: false,
  },
  guard: {
    id: 'guard',
    label: 'Guards',
    migrationSheetName: MIGRATION_SHEET_GUARD,
    fixedGroup: 'GUARD',
    defaultStatus: 'ACTIVE',
    columns: WEB_EDITOR_GUARD_COLUMNS,
    showFixedGroupBadge: true,
  },
  ranks: {
    id: 'ranks',
    label: 'Ranks',
    columns: WEB_EDITOR_RANK_COLUMNS,
    showFixedGroupBadge: false,
  },
};

/** System ranks that cannot be edited or removed in the Ranks tab. */
export const WEB_EDITOR_LOCKED_RANK_CODES = ['MD', 'OD', 'FM', 'SM'] as const;

export type WebEditorLockedRankCode = (typeof WEB_EDITOR_LOCKED_RANK_CODES)[number];

/** Stable row id for grid state (client-generated uuid or server employee id). */
export type BulkEditorRowId = string;

/** One editable grid row — string cell values keyed by column name. */
export type BulkEditorRow = {
  _rowId: BulkEditorRowId;
} & Record<string, string>;

/** Rank tab row shape (same as BulkEditorRow but typed columns). */
export type BulkEditorRankRow = BulkEditorRow & {
  rank_id?: string;
  rank_code: string;
  rank_title: string;
  basic_pay_lkr: string;
  salary_type: RankSalaryType | '';
  operational_group: OperationalGroup | '';
};

/** Loaded editor payload from server (step 2). */
export type BulkEditorSnapshot = {
  headOffice: BulkEditorRow[];
  cafe: BulkEditorRow[];
  sites: BulkEditorRow[];
  guards: BulkEditorRow[];
  ranks: BulkEditorRankRow[];
  sectorNames: string[];
  savedAt: string;
};

export function isWebEditorTabId(value: string): value is BulkEditorTabId {
  return (WEB_EDITOR_TAB_ORDER as readonly string[]).includes(value);
}

export function columnsForWebEditorTab(tabId: BulkEditorTabId): readonly string[] {
  return WEB_EDITOR_TAB_META[tabId].columns;
}

export function isWebEditorLockedRank(rankCode: string | null | undefined): boolean {
  const code = String(rankCode ?? '')
    .trim()
    .toUpperCase();
  if (!code) return false;
  return (
    isLockedExecutiveLedgerRank(code) ||
    isLockedSectorManagerLedgerRank(code) ||
    isSingletonHrAssignablePortalRank(code)
  );
}

/** sector_name column is editable on HO rows only when rank is SM. */
export function isHeadOfficeSectorNameActive(row: Pick<BulkEditorRow, 'rank'>): boolean {
  return isSectorManagerEmployee({ group: 'HEAD_OFFICE', rank: row.rank });
}

/** sector_name is required before save on Head Office SM rows. */
export function isHeadOfficeSectorNameRequired(row: Pick<BulkEditorRow, 'rank' | 'sector_name'>): boolean {
  if (!isHeadOfficeSectorNameActive(row)) return false;
  return !String(row.sector_name ?? '').trim();
}

export function columnGroupForWebEditorColumn(
  tabId: BulkEditorTabId,
  columnKey: string,
): MigrationColumnGroupId | undefined {
  if (columnKey === WEB_EDITOR_SECTOR_NAME_COLUMN) return 'placement';

  if (tabId === 'ranks') {
    if (columnKey === 'rank_code' || columnKey === 'rank_title') return 'identity';
    if (
      columnKey === 'basic_pay_lkr' ||
      columnKey === 'salary_type' ||
      columnKey === 'operational_group'
    ) {
      return 'employment';
    }
    if (columnKey === 'rank_id') return 'debts';
    return undefined;
  }

  if (tabId === 'sites') {
    if ((MIGRATION_SITES_COLUMNS as readonly string[]).includes(columnKey)) {
      if ((['site_code', 'site_name', 'site_type', 'site_status'] as readonly string[]).includes(columnKey)) {
        return 'sites_identity';
      }
      if (
        (['client_name', 'parent_client', 'client_billing_address', 'contract_start', 'contract_end'] as readonly string[]).includes(columnKey)
      ) {
        return 'sites_client';
      }
      if (
        (['address', 'latitude', 'longitude', 'geofence_radius_m', 'verification_mode', 'needs_om_gps_capture'] as readonly string[]).includes(columnKey)
      ) {
        return 'sites_location';
      }
      if (
        (['assigned_sm_epf', 'required_guards', 'per_visit_charge_lkr', 'min_dwell_time_minutes', 'nfc_tag_id'] as readonly string[]).includes(columnKey)
      ) {
        return 'sites_operations';
      }
      if (
        (['provides_food', 'food_allowance_lkr', 'provides_accommodation'] as readonly string[]).includes(columnKey)
      ) {
        return 'sites_welfare';
      }
      return 'sites_rates';
    }
    return undefined;
  }

  if ((MIGRATION_EMPLOYEE_IDENTITY_COLUMNS as readonly string[]).includes(columnKey)) {
    return 'identity';
  }
  if ((MIGRATION_EMPLOYEE_EMPLOYMENT_COLUMNS as readonly string[]).includes(columnKey)) {
    return 'employment';
  }
  if ((MIGRATION_EMPLOYEE_BANK_COLUMNS as readonly string[]).includes(columnKey)) return 'bank';
  if ((MIGRATION_EMPLOYEE_VETTING_COLUMNS as readonly string[]).includes(columnKey)) return 'vetting';
  if (
    (MIGRATION_EMPLOYEE_PLACEMENT_COLUMNS as readonly string[]).includes(columnKey) ||
    (MIGRATION_EMPLOYEE_INTERNAL_SITE_COLUMNS as readonly string[]).includes(columnKey)
  ) {
    return 'placement';
  }
  if ((MIGRATION_EMPLOYEE_DEBT_COLUMNS as readonly string[]).includes(columnKey)) return 'debts';
  if ((MIGRATION_EMPLOYEE_MEMO_COLUMNS as readonly string[]).includes(columnKey)) return 'memo';
  return undefined;
}
