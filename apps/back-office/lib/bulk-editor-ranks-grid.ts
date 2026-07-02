/**
 * Ranks sheet — locked system ranks, duplicate validation, new-row template (step 11).
 */

import type { RowsChangeData } from 'react-data-grid';

import type { OperationalGroup, RankSalaryType } from '../../../packages/rank-pay-matrix';
import {
  WEB_EDITOR_RANK_COLUMNS,
  isWebEditorLockedRank,
  type BulkEditorRankRow,
  type BulkEditorRow,
} from './bulk-roster-web-editor-spec';
import { createEmptyEditorRow } from './bulk-roster-web-editor-state';

export const WEB_EDITOR_RANK_SALARY_TYPE_OPTIONS: readonly RankSalaryType[] = ['BANK', 'CASH'];

export const WEB_EDITOR_RANK_OPERATIONAL_GROUP_OPTIONS: readonly OperationalGroup[] = [
  'GUARD_FIELD',
  'GUARD',
  'CAFE',
  'SECTOR_MANAGER',
  'HEAD_OFFICE',
];

export const RANK_EMPTY_ROW_TEMPLATE: Readonly<Partial<BulkEditorRow>> = {
  rank_code: '',
  rank_title: '',
  basic_pay_lkr: '0',
  salary_type: 'BANK',
  operational_group: 'GUARD_FIELD',
};

export function isExistingRankRow(row: BulkEditorRow): boolean {
  return Boolean(String(row.rank_id ?? '').trim());
}

export function isRankRowLocked(row: BulkEditorRow): boolean {
  return isWebEditorLockedRank(row.rank_code);
}

export function isRankCodeEditable(row: BulkEditorRow): boolean {
  if (isRankRowLocked(row)) return false;
  if (isExistingRankRow(row)) return false;
  return true;
}

export function isRankFieldEditable(row: BulkEditorRow, columnKey: string): boolean {
  if (isRankRowLocked(row)) return false;
  if (columnKey === 'rank_id') return false;
  if (columnKey === 'rank_code') return isRankCodeEditable(row);
  return true;
}

export function normalizeRankCode(value: unknown): string {
  return String(value ?? '').trim().toUpperCase();
}

export function findDuplicateRankCodeRowIds(ranks: readonly BulkEditorRow[]): Set<string> {
  const byCode = new Map<string, string[]>();
  for (const row of ranks) {
    const code = normalizeRankCode(row.rank_code);
    if (!code) continue;
    const ids = byCode.get(code) ?? [];
    ids.push(row._rowId);
    byCode.set(code, ids);
  }

  const duplicateRowIds = new Set<string>();
  for (const rowIds of byCode.values()) {
    if (rowIds.length > 1) {
      for (const id of rowIds) duplicateRowIds.add(id);
    }
  }
  return duplicateRowIds;
}

export function rankCodeCellClass(
  row: BulkEditorRow,
  duplicateRowIds: ReadonlySet<string>,
): string {
  const code = normalizeRankCode(row.rank_code);
  if (!code) return '';
  if (duplicateRowIds.has(row._rowId)) return 'bulk-editor-rank-code-duplicate';
  if (isRankRowLocked(row)) return 'bulk-editor-readonly-cell';
  return '';
}

export function applyRankRowTemplate(row: BulkEditorRow): BulkEditorRow {
  const next = { ...row };
  for (const [key, value] of Object.entries(RANK_EMPTY_ROW_TEMPLATE)) {
    if (!String(next[key] ?? '').trim()) {
      next[key] = String(value);
    }
  }
  return next;
}

export function createRankEditorRow(): BulkEditorRankRow {
  return applyRankRowTemplate(createEmptyEditorRow(WEB_EDITOR_RANK_COLUMNS)) as BulkEditorRankRow;
}

export function applyRanksRowsChange(
  rows: BulkEditorRow[],
  data: RowsChangeData<BulkEditorRow>,
): BulkEditorRow[] {
  return rows.map((row, rowIdx) => {
    if (!data.indexes.includes(rowIdx)) return row;

    let next: BulkEditorRow = { ...row };

    if (data.column.key === 'rank_code') {
      next = { ...next, rank_code: normalizeRankCode(next.rank_code) };
    }

    if (data.column.key === 'basic_pay_lkr') {
      const raw = String(next.basic_pay_lkr ?? '').replace(/[^\d.]/g, '');
      next = { ...next, basic_pay_lkr: raw || '0' };
    }

    if (data.column.key === 'salary_type') {
      const value = String(next.salary_type ?? '').trim().toUpperCase();
      if (value === 'BANK' || value === 'CASH') {
        next = { ...next, salary_type: value };
      }
    }

    if (data.column.key === 'operational_group') {
      const value = String(next.operational_group ?? '').trim().toUpperCase();
      if ((WEB_EDITOR_RANK_OPERATIONAL_GROUP_OPTIONS as readonly string[]).includes(value)) {
        next = { ...next, operational_group: value };
      }
    }

    return next;
  });
}
