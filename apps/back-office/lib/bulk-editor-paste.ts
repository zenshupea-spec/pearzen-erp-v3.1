/**
 * Clipboard TSV/CSV paste into bulk editor grids (step 12).
 */

import { SELECT_COLUMN_KEY } from 'react-data-grid';

import { applyCafeRowTemplate, WEB_EDITOR_CAFE_GROUP_COLUMN } from './bulk-editor-cafe-grid';
import {
  deriveGuardAssignedSm,
  normalizeSiteCode,
} from './bulk-editor-cross-sheet';
import {
  GUARD_SM_AUTO_FLAG,
  WEB_EDITOR_GUARD_GROUP_COLUMN,
  WEB_EDITOR_GUARD_SITE_NAME_HINT_KEY,
  applyGuardRowTemplate,
} from './bulk-editor-guard-grid';
import { isRankFieldEditable, normalizeRankCode } from './bulk-editor-ranks-grid';
import {
  WEB_EDITOR_SECTOR_NAME_COLUMN,
  isHeadOfficeSectorNameActive,
  type BulkEditorRow,
  type BulkEditorTabId,
} from './bulk-roster-web-editor-spec';

export const BULK_EDITOR_ROW_NUM_KEY = '__row_num';

export const BULK_EDITOR_UI_COLUMN_KEYS = new Set<string>([
  SELECT_COLUMN_KEY,
  BULK_EDITOR_ROW_NUM_KEY,
  WEB_EDITOR_CAFE_GROUP_COLUMN,
  WEB_EDITOR_GUARD_GROUP_COLUMN,
  WEB_EDITOR_GUARD_SITE_NAME_HINT_KEY,
]);

export type BulkEditorPasteInput = {
  tabId: BulkEditorTabId;
  columnKeys: readonly string[];
  rows: BulkEditorRow[];
  startRowIdx: number;
  startColumnKey: string;
  clipboardText: string;
  createRow: () => BulkEditorRow;
  headOfficeRows?: readonly BulkEditorRow[];
  siteRows?: readonly BulkEditorRow[];
};

export type BulkEditorPasteResult = {
  rows: BulkEditorRow[];
  pastedRows: number;
  pastedColumns: number;
};

export function isBulkEditorNonPasteableColumnKey(columnKey: string): boolean {
  return BULK_EDITOR_UI_COLUMN_KEYS.has(columnKey);
}

export function isBulkEditorCellPasteable(
  tabId: BulkEditorTabId,
  row: BulkEditorRow,
  columnKey: string,
): boolean {
  if (isBulkEditorNonPasteableColumnKey(columnKey)) return false;
  if (columnKey === 'rank_id') return false;
  if (tabId === 'head_office' && columnKey === WEB_EDITOR_SECTOR_NAME_COLUMN) {
    return isHeadOfficeSectorNameActive({ rank: String(row.rank ?? '') });
  }
  if (tabId === 'ranks') return isRankFieldEditable(row, columnKey);
  return true;
}

export function resolvePasteStartColumn(
  selectedColumnKey: string,
  columnKeys: readonly string[],
): string {
  if (
    columnKeys.includes(selectedColumnKey) &&
    !isBulkEditorNonPasteableColumnKey(selectedColumnKey) &&
    selectedColumnKey !== 'rank_id'
  ) {
    return selectedColumnKey;
  }
  return (
    columnKeys.find(
      (key) => !isBulkEditorNonPasteableColumnKey(key) && key !== 'rank_id',
    ) ?? columnKeys[0] ?? ''
  );
}

export function parseClipboardGrid(text: string): string[][] {
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const trimmed = normalized.endsWith('\n') ? normalized.slice(0, -1) : normalized;
  if (!trimmed.trim()) return [];

  return trimmed.split('\n').map(parseClipboardLine);
}

function parseClipboardLine(line: string): string[] {
  if (line.includes('\t')) {
    return line.split('\t').map((cell) => cell.replace(/\r$/, ''));
  }
  return parseCsvLine(line);
}

function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      cells.push(current);
      current = '';
    } else {
      current += ch;
    }
  }

  cells.push(current);
  return cells;
}

export function getPasteTargetColumns(
  columnKeys: readonly string[],
  startColumnKey: string,
): string[] {
  const startIdx = columnKeys.indexOf(startColumnKey);
  if (startIdx < 0) return [];

  const targets: string[] = [];
  for (let i = startIdx; i < columnKeys.length; i += 1) {
    const key = columnKeys[i]!;
    if (isBulkEditorNonPasteableColumnKey(key) || key === 'rank_id') continue;
    targets.push(key);
  }
  return targets;
}

export function applyBulkEditorPaste(input: BulkEditorPasteInput): BulkEditorPasteResult {
  const grid = parseClipboardGrid(input.clipboardText);
  if (grid.length === 0) {
    return { rows: input.rows, pastedRows: 0, pastedColumns: 0 };
  }

  const startColumnKey = resolvePasteStartColumn(input.startColumnKey, input.columnKeys);
  const targetColumns = getPasteTargetColumns(input.columnKeys, startColumnKey);
  if (targetColumns.length === 0) {
    return { rows: input.rows, pastedRows: 0, pastedColumns: 0 };
  }

  const pastedColumns = Math.min(
    targetColumns.length,
    Math.max(...grid.map((row) => row.length), 0),
  );
  if (pastedColumns === 0) {
    return { rows: input.rows, pastedRows: 0, pastedColumns: 0 };
  }

  const pastedRows = grid.length;
  const nextRows = input.rows.map((row) => ({ ...row }));
  const requiredLength = input.startRowIdx + grid.length;

  while (nextRows.length < requiredLength) {
    nextRows.push(input.createRow());
  }

  const affectedRowIndexes: number[] = [];

  for (let r = 0; r < grid.length; r += 1) {
    const rowIdx = input.startRowIdx + r;
    affectedRowIndexes.push(rowIdx);
    const pastedRow = grid[r]!;
    const row = { ...nextRows[rowIdx]! };

    for (let c = 0; c < pastedColumns; c += 1) {
      const columnKey = targetColumns[c]!;
      if (!isBulkEditorCellPasteable(input.tabId, row, columnKey)) continue;
      row[columnKey] = String(pastedRow[c] ?? '').trim();
    }

    nextRows[rowIdx] = row;
  }

  const normalized = normalizePastedRows(
    input.tabId,
    nextRows,
    affectedRowIndexes,
    {
      headOfficeRows: input.headOfficeRows ?? [],
      siteRows: input.siteRows ?? [],
    },
  );

  return { rows: normalized, pastedRows, pastedColumns };
}

export function normalizePastedRows(
  tabId: BulkEditorTabId,
  rows: BulkEditorRow[],
  affectedRowIndexes: readonly number[],
  ctx: {
    headOfficeRows: readonly BulkEditorRow[];
    siteRows: readonly BulkEditorRow[];
  },
): BulkEditorRow[] {
  const next = [...rows];

  for (const rowIdx of affectedRowIndexes) {
    let row = { ...next[rowIdx]! };

    if (tabId === 'head_office') {
      if (!isHeadOfficeSectorNameActive({ rank: String(row.rank ?? '') })) {
        row = { ...row, [WEB_EDITOR_SECTOR_NAME_COLUMN]: '' };
      }
    }

    if (tabId === 'cafe') {
      row = applyCafeRowTemplate(row);
    }

    if (tabId === 'sites') {
      row = { ...row, site_code: normalizeSiteCode(row.site_code) };
    }

    if (tabId === 'guard') {
      row = applyGuardRowTemplate(row);
      row = { ...row, site_code: normalizeSiteCode(row.site_code) };
      const siteCode = String(row.site_code ?? '').trim();
      if (siteCode) {
        const derived = deriveGuardAssignedSm(siteCode, ctx.siteRows, ctx.headOfficeRows);
        row = {
          ...row,
          assigned_sm_epf: derived,
          [GUARD_SM_AUTO_FLAG]: derived ? 'true' : '',
        };
      }
    }

    if (tabId === 'ranks') {
      if (row.rank_code) {
        row = { ...row, rank_code: normalizeRankCode(row.rank_code) };
      }
    }

    next[rowIdx] = row;
  }

  return next;
}

export function formatBulkEditorPasteMessage(pastedRows: number, pastedColumns: number): string {
  return `Pasted ${pastedRows.toLocaleString()} row${pastedRows === 1 ? '' : 's'} × ${pastedColumns.toLocaleString()} column${pastedColumns === 1 ? '' : 's'}`;
}
