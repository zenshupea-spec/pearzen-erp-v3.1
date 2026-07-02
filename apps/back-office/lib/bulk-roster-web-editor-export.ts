/**
 * Convert in-browser bulk editor snapshot → ParsedBulkWorkbook for validate/apply (steps 13–15).
 */

import type { OperationalGroup, RankPayEntry, RankSalaryType } from '../../../packages/rank-pay-matrix';
import {
  ensureSystemLedgerRanks,
  sanitizeRankPayMatrixEntries,
} from '../../../packages/rank-pay-matrix';

import {
  joinMigrationWorkforceRowsToSites,
  normalizeMigrationWorkforceRow,
  type MigrationSheetMeta,
  type ParsedBulkWorkbook,
} from './bulk-data-import';
import {
  MIGRATION_SHEET_CAFE,
  MIGRATION_SHEET_GUARD,
  MIGRATION_SHEET_HEAD_OFFICE,
  MIGRATION_SHEET_SITES,
  MIGRATION_SHEET_SM,
  MIGRATION_SHEET_META,
  MIGRATION_SITES_COLUMNS,
  columnsForMigrationWorkforceSheet,
} from './bulk-data-workbook';
import { GUARD_SM_AUTO_FLAG } from './bulk-editor-guard-grid';
import {
  WEB_EDITOR_SECTOR_MANAGER_RANK_CODE,
  WEB_EDITOR_SECTOR_NAME_COLUMN,
  type BulkEditorRankRow,
  type BulkEditorRow,
  type BulkEditorSnapshot,
} from './bulk-roster-web-editor-spec';
import { normalizeHrSectorName } from './hr-sectors';

const INTERNAL_ROW_KEYS = new Set([GUARD_SM_AUTO_FLAG, '_smAutoAssigned']);

function cellStr(value: unknown): string {
  if (value == null) return '';
  return String(value).trim();
}

function isBlankWorkforceExportRow(row: Record<string, unknown>): boolean {
  return (
    !cellStr(row.emp_number) &&
    !cellStr(row.employee_id) &&
    !cellStr(row.epf_no) &&
    !cellStr(row.full_name)
  );
}

function isBlankSiteExportRow(row: Record<string, unknown>): boolean {
  return !cellStr(row.site_code) && !cellStr(row.site_name);
}

function bulkEditorRowToRecord(
  row: BulkEditorRow,
  columns: readonly string[],
  extra?: Record<string, unknown>,
): Record<string, unknown> {
  const record: Record<string, unknown> = {};
  for (const column of columns) {
    record[column] = row[column] ?? '';
  }
  if (extra) {
    for (const [key, value] of Object.entries(extra)) {
      record[key] = value;
    }
  }
  return record;
}

function appendWorkforceRows(
  rows: Record<string, unknown>[],
  sheetMeta: MigrationSheetMeta[],
  editorRows: readonly BulkEditorRow[],
  sheetName: typeof MIGRATION_SHEET_HEAD_OFFICE,
  extraByRow?: (row: BulkEditorRow) => Record<string, unknown> | undefined,
): void {
  const columns = columnsForMigrationWorkforceSheet(sheetName);
  const sheetDef = MIGRATION_SHEET_META[sheetName];
  const meta: MigrationSheetMeta = {
    sheetName,
    group: sheetDef.fixedGroup,
    defaultStatus: sheetDef.defaultStatus,
  };

  for (const editorRow of editorRows) {
    const extra = extraByRow?.(editorRow);
    const raw = bulkEditorRowToRecord(editorRow, columns, extra);
    if (isBlankWorkforceExportRow(raw)) continue;
    rows.push(normalizeMigrationWorkforceRow(raw, meta));
    sheetMeta.push(meta);
  }
}

function isSmHeadOfficeRow(row: BulkEditorRow): boolean {
  return cellStr(row.rank).toUpperCase() === WEB_EDITOR_SECTOR_MANAGER_RANK_CODE;
}

function smRowExtras(row: BulkEditorRow): Record<string, unknown> {
  const sector = normalizeHrSectorName(row[WEB_EDITOR_SECTOR_NAME_COLUMN]);
  return {
    corporate_group: 'SECTOR_MANAGER',
    rank: WEB_EDITOR_SECTOR_MANAGER_RANK_CODE,
    ...(sector ? { site_name: sector, site: sector } : {}),
  };
}

export function bulkEditorRanksToRankMatrix(ranks: readonly BulkEditorRankRow[]): RankPayEntry[] {
  return ranks
    .filter((row) => cellStr(row.rank_code))
    .map((row) => {
      const rankCode = cellStr(row.rank_code).toUpperCase();
      const salaryType = cellStr(row.salary_type).toUpperCase();
      const operationalGroup = cellStr(row.operational_group).toUpperCase();

      return {
        id: cellStr(row.rank_id) || `editor-${rankCode.toLowerCase()}`,
        rankCode,
        fullTitle: cellStr(row.rank_title) || rankCode,
        basicPay: Math.max(0, Number.parseInt(cellStr(row.basic_pay_lkr), 10) || 0),
        annualIncrement: 0,
        salaryType: (salaryType === 'CASH' ? 'CASH' : 'BANK') as RankSalaryType,
        operationalGroup: (operationalGroup || 'GUARD_FIELD') as OperationalGroup,
      };
    });
}

/** Strip editor-only keys before building import payloads. */
export function stripBulkEditorInternalRowFields(row: BulkEditorRow): BulkEditorRow {
  const next: BulkEditorRow = { _rowId: row._rowId };
  for (const [key, value] of Object.entries(row)) {
    if (key === '_rowId' || INTERNAL_ROW_KEYS.has(key)) continue;
    next[key] = value;
  }
  return next;
}

export function convertBulkEditorSnapshotToParsedWorkbook(
  snapshot: BulkEditorSnapshot,
): ParsedBulkWorkbook {
  const rows: Record<string, unknown>[] = [];
  const sheetMeta: MigrationSheetMeta[] = [];

  const headOfficeNonSm = snapshot.headOffice.filter((row) => !isSmHeadOfficeRow(row));
  const headOfficeSm = snapshot.headOffice.filter((row) => isSmHeadOfficeRow(row));

  appendWorkforceRows(rows, sheetMeta, headOfficeNonSm.map(stripBulkEditorInternalRowFields), MIGRATION_SHEET_HEAD_OFFICE);
  appendWorkforceRows(
    rows,
    sheetMeta,
    headOfficeSm.map(stripBulkEditorInternalRowFields),
    MIGRATION_SHEET_SM,
    smRowExtras,
  );
  appendWorkforceRows(rows, sheetMeta, snapshot.cafe.map(stripBulkEditorInternalRowFields), MIGRATION_SHEET_CAFE);
  appendWorkforceRows(rows, sheetMeta, snapshot.guards.map(stripBulkEditorInternalRowFields), MIGRATION_SHEET_GUARD);

  const siteRows = snapshot.sites
    .map(stripBulkEditorInternalRowFields)
    .map((row) => bulkEditorRowToRecord(row, MIGRATION_SITES_COLUMNS))
    .filter((row) => !isBlankSiteExportRow(row));

  return joinMigrationWorkforceRowsToSites({
    rows,
    sheetMeta,
    siteRows,
    multiSheetFormat: true,
  });
}

export type BulkEditorExportPayload = {
  parsed: ParsedBulkWorkbook;
  rankMatrix: RankPayEntry[];
};

export function buildBulkEditorExportPayload(snapshot: BulkEditorSnapshot): BulkEditorExportPayload {
  return {
    parsed: convertBulkEditorSnapshotToParsedWorkbook(snapshot),
    rankMatrix: bulkEditorRanksToRankMatrix(snapshot.ranks),
  };
}

/** Preserve DB ids/increments when saving edited rank tab rows. */
export function mergeEditorRankMatrixWithCurrent(
  editorMatrix: readonly RankPayEntry[],
  currentMatrix: readonly RankPayEntry[],
): RankPayEntry[] {
  const currentByCode = new Map(
    currentMatrix.map((entry) => [entry.rankCode.trim().toUpperCase(), entry]),
  );

  const merged = editorMatrix.map((entry) => {
    const existing = currentByCode.get(entry.rankCode.trim().toUpperCase());
    if (!existing) return entry;
    return {
      ...entry,
      id: existing.id || entry.id,
      annualIncrement: existing.annualIncrement,
    };
  });

  return ensureSystemLedgerRanks(sanitizeRankPayMatrixEntries(merged));
}
