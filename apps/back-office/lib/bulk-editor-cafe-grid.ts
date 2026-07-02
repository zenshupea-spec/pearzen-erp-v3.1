/**
 * Café sheet — fixed group badge and new-row template (step 8).
 */

import type { RowsChangeData } from 'react-data-grid';

import { applyWorkforceRankFieldsFromMatrix } from './bulk-editor-cross-sheet';
import { MIGRATION_EMPLOYEE_CORPORATE_GROUP_COLUMN } from './bulk-data-workbook';
import { WEB_EDITOR_CAFE_COLUMNS, type BulkEditorRow } from './bulk-roster-web-editor-spec';
import { createEmptyEditorRow } from './bulk-roster-web-editor-state';

export { MIGRATION_EMPLOYEE_CORPORATE_GROUP_COLUMN as WEB_EDITOR_CAFE_GROUP_COLUMN };

export const CAFE_FIXED_GROUP_VALUE = 'CAFE' as const;

/** Sensible defaults for a new café staff row (from migration template example). */
export const CAFE_EMPTY_ROW_TEMPLATE: Readonly<Partial<BulkEditorRow>> = {
  [MIGRATION_EMPLOYEE_CORPORATE_GROUP_COLUMN]: CAFE_FIXED_GROUP_VALUE,
  status: 'ACTIVE',
  salary_type: 'BANK',
  epf_yn: 'TRUE',
  rank: 'BARISTA',
  rank_operational_group: 'CAFE',
  role: 'CAFE STAFF',
  site_code: 'CAFE01',
};

export function applyCafeRowTemplate(row: BulkEditorRow): BulkEditorRow {
  const next = { ...row };
  for (const [key, value] of Object.entries(CAFE_EMPTY_ROW_TEMPLATE)) {
    if (!String(next[key] ?? '').trim()) {
      next[key] = String(value);
    }
  }
  next[MIGRATION_EMPLOYEE_CORPORATE_GROUP_COLUMN] = CAFE_FIXED_GROUP_VALUE;
  return next;
}

export function createCafeEditorRow(): BulkEditorRow {
  return applyCafeRowTemplate(createEmptyEditorRow(WEB_EDITOR_CAFE_COLUMNS));
}

export function normalizeCafeEditorRows(rows: BulkEditorRow[]): BulkEditorRow[] {
  return rows.map((row) => applyCafeRowTemplate(row));
}

export function applyCafeRowsChange(
  rows: BulkEditorRow[],
  data?: RowsChangeData<BulkEditorRow>,
  rankRows: readonly BulkEditorRow[] = [],
): BulkEditorRow[] {
  return rows.map((row, rowIdx) => {
    let next = {
      ...row,
      [MIGRATION_EMPLOYEE_CORPORATE_GROUP_COLUMN]: CAFE_FIXED_GROUP_VALUE,
    };
    if (data?.indexes.includes(rowIdx) && data.column.key === 'rank') {
      next = applyWorkforceRankFieldsFromMatrix(next, rankRows);
    }
    return next;
  });
}
