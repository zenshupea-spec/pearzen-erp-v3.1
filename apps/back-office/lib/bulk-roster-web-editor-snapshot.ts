/**
 * Maps bulk migration export rows → in-browser editor snapshot (step 2).
 */

import type { RankPayEntry } from '../../../packages/rank-pay-matrix';

import {
  MIGRATION_SHEET_CAFE,
  MIGRATION_SHEET_GUARD,
  MIGRATION_SHEET_HEAD_OFFICE,
  MIGRATION_SHEET_INACTIVE,
  MIGRATION_SHEET_SM,
  MIGRATION_SHEET_TEMP_GUARDS,
} from './bulk-data-workbook';
import { splitEmployeesForMigrationExport } from './bulk-data-import';
import {
  WEB_EDITOR_CAFE_COLUMNS,
  WEB_EDITOR_GUARD_COLUMNS,
  WEB_EDITOR_HEAD_OFFICE_COLUMNS,
  WEB_EDITOR_RANK_COLUMNS,
  WEB_EDITOR_SITES_COLUMNS,
  WEB_EDITOR_SECTOR_MANAGER_RANK_CODE,
  WEB_EDITOR_SECTOR_NAME_COLUMN,
  type BulkEditorRankRow,
  type BulkEditorRow,
  type BulkEditorSnapshot,
} from './bulk-roster-web-editor-spec';
import { normalizeCafeEditorRows } from './bulk-editor-cafe-grid';
import { isSectorManagerEmployee, mergeHrSectorNames, normalizeHrSectorName } from './hr-sectors';

export type BuildBulkEditorSnapshotInput = {
  employees: Record<string, unknown>[];
  sites: Record<string, unknown>[];
  rankMatrix: RankPayEntry[];
  sectorNamesFromSettings: readonly string[];
  savedAt?: string;
};

function cellStr(value: unknown): string {
  if (value == null) return '';
  return String(value).trim();
}

function newRowId(prefix: string, key: string): string {
  const normalized = cellStr(key);
  if (normalized) return `${prefix}:${normalized}`;
  return `${prefix}:${crypto.randomUUID()}`;
}

/** Copy export row values into editor columns (all string cells). */
export function migrationExportRowToBulkEditorRow(
  source: Record<string, unknown>,
  columns: readonly string[],
  rowId: string,
  extra?: Record<string, string>,
): BulkEditorRow {
  const row: BulkEditorRow = { _rowId: rowId };
  for (const column of columns) {
    row[column] = cellStr(source[column]);
  }
  if (extra) {
    for (const [key, value] of Object.entries(extra)) {
      row[key] = value;
    }
  }
  return row;
}

function normalizeHeadOfficeExportRow(row: Record<string, unknown>): Record<string, unknown> {
  const next = { ...row };
  if (isSectorManagerEmployee({ group: row.group, rank: row.rank })) {
    next.rank = WEB_EDITOR_SECTOR_MANAGER_RANK_CODE;
    const sector = cellStr(row.site_name) || cellStr(row.site);
    if (sector) {
      next[WEB_EDITOR_SECTOR_NAME_COLUMN] = normalizeHrSectorName(sector);
    }
  }
  return next;
}

function mapHeadOfficeRows(rows: Record<string, unknown>[]): BulkEditorRow[] {
  return rows.map((raw) => {
    const row = normalizeHeadOfficeExportRow(raw);
    const rowId = newRowId('emp', cellStr(row.employee_id) || cellStr(row.emp_number));
    return migrationExportRowToBulkEditorRow(row, WEB_EDITOR_HEAD_OFFICE_COLUMNS, rowId);
  });
}

function mapWorkforceRows(
  rows: Record<string, unknown>[],
  columns: readonly string[],
): BulkEditorRow[] {
  return rows.map((row) => {
    const rowId = newRowId('emp', cellStr(row.employee_id) || cellStr(row.emp_number));
    return migrationExportRowToBulkEditorRow(row, columns, rowId);
  });
}

function buildSmEpfToSectorMap(headOffice: BulkEditorRow[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const row of headOffice) {
    if (cellStr(row.rank).toUpperCase() !== WEB_EDITOR_SECTOR_MANAGER_RANK_CODE) continue;
    const epf = cellStr(row.epf_no).toUpperCase();
    const sector = normalizeHrSectorName(row[WEB_EDITOR_SECTOR_NAME_COLUMN]);
    if (epf && sector) map.set(epf, sector);
  }
  return map;
}

function mapSiteRows(
  sites: Record<string, unknown>[],
  smEpfToSector: Map<string, string>,
): BulkEditorRow[] {
  return sites.map((site) => {
    const siteCode = cellStr(site.site_code).toUpperCase();
    const rowId = newRowId('site', siteCode || cellStr(site.site_name));
    const extra: Record<string, string> = {};
    const assignedSmEpf = cellStr(site.assigned_sm_epf).toUpperCase();
    if (assignedSmEpf && smEpfToSector.has(assignedSmEpf)) {
      extra[WEB_EDITOR_SECTOR_NAME_COLUMN] = smEpfToSector.get(assignedSmEpf) ?? '';
    }
    return migrationExportRowToBulkEditorRow(site, WEB_EDITOR_SITES_COLUMNS, rowId, extra);
  });
}

function mapRankRows(rankMatrix: RankPayEntry[]): BulkEditorRankRow[] {
  return rankMatrix.map((entry) => ({
    _rowId: entry.id || newRowId('rank', entry.rankCode),
    rank_id: entry.id,
    rank_code: entry.rankCode,
    rank_title: entry.fullTitle,
    basic_pay_lkr: String(entry.basicPay ?? 0),
    salary_type: entry.salaryType,
    operational_group: entry.operationalGroup,
  }));
}

function collectSectorNames(
  headOffice: BulkEditorRow[],
  sectorNamesFromSettings: readonly string[],
): string[] {
  const fromSmRows = headOffice
    .filter((row) => cellStr(row.rank).toUpperCase() === WEB_EDITOR_SECTOR_MANAGER_RANK_CODE)
    .map((row) => normalizeHrSectorName(row[WEB_EDITOR_SECTOR_NAME_COLUMN]))
    .filter(Boolean);
  return mergeHrSectorNames(sectorNamesFromSettings, fromSmRows);
}

/** Split export rows into editor tabs and normalize SM sector_name on Head Office. */
export function buildBulkEditorSnapshot(input: BuildBulkEditorSnapshotInput): BulkEditorSnapshot {
  const buckets = splitEmployeesForMigrationExport(input.employees, input.sites);

  const headOffice = mapHeadOfficeRows([
    ...buckets[MIGRATION_SHEET_HEAD_OFFICE],
    ...buckets[MIGRATION_SHEET_SM],
  ]);
  const cafe = normalizeCafeEditorRows(
    mapWorkforceRows(buckets[MIGRATION_SHEET_CAFE], WEB_EDITOR_CAFE_COLUMNS),
  );
  const guards = mapWorkforceRows(
    [
      ...buckets[MIGRATION_SHEET_GUARD],
      ...buckets[MIGRATION_SHEET_INACTIVE],
      ...buckets[MIGRATION_SHEET_TEMP_GUARDS],
    ],
    WEB_EDITOR_GUARD_COLUMNS,
  );

  const smEpfToSector = buildSmEpfToSectorMap(headOffice);
  const sites = mapSiteRows(input.sites, smEpfToSector);
  const ranks = mapRankRows(input.rankMatrix);
  const sectorNames = collectSectorNames(headOffice, input.sectorNamesFromSettings);

  return {
    headOffice,
    cafe,
    sites,
    guards,
    ranks,
    sectorNames,
    savedAt: input.savedAt ?? new Date().toISOString(),
  };
}

/** Guard tab columns for tests / paste handlers. */
export const BULK_EDITOR_RANK_COLUMN_KEYS = WEB_EDITOR_RANK_COLUMNS;
