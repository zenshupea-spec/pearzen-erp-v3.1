import type { BulkEditorRow } from './bulk-roster-web-editor-spec';
import { applyBulkEditorPaste, type BulkEditorPasteResult } from './bulk-editor-paste';

function escapeTsvCell(value: string): string {
  return value.replace(/\t/g, ' ').replace(/\r?\n/g, ' ');
}

/** Serialize grid rows to TSV for Excel / clipboard. */
export function serializeBulkEditorRowsToTsv(
  rows: readonly BulkEditorRow[],
  columnKeys: readonly string[],
): string {
  return rows
    .map((row) => columnKeys.map((key) => escapeTsvCell(String(row[key] ?? ''))).join('\t'))
    .join('\n');
}

/** Where to start a paste when the active cell is unknown. */
export function resolveBulkEditorPasteStartRowIdx(
  rows: readonly BulkEditorRow[],
  selectedRowIds: ReadonlySet<string>,
  selectedRowIdx: number | null | undefined,
): number {
  if (typeof selectedRowIdx === 'number' && selectedRowIdx >= 0) {
    return selectedRowIdx;
  }

  if (selectedRowIds.size > 0) {
    let minIdx = rows.length;
    for (let idx = 0; idx < rows.length; idx += 1) {
      if (selectedRowIds.has(rows[idx]!._rowId)) {
        minIdx = Math.min(minIdx, idx);
      }
    }
    if (minIdx < rows.length) return minIdx;
  }

  return rows.length;
}

export function appendBulkEditorRowsFromClipboard(
  input: Omit<BulkEditorPasteInput, 'startRowIdx' | 'startColumnKey'> & {
    selectedRowIds?: ReadonlySet<string>;
    selectedRowIdx?: number | null;
  },
): BulkEditorPasteResult {
  const startRowIdx = resolveBulkEditorPasteStartRowIdx(
    input.rows,
    input.selectedRowIds ?? new Set(),
    input.selectedRowIdx,
  );
  const startColumnKey = input.columnKeys[0] ?? '';

  return applyBulkEditorPaste({
    tabId: input.tabId,
    columnKeys: input.columnKeys,
    rows: input.rows,
    startRowIdx,
    startColumnKey,
    clipboardText: input.clipboardText,
    createRow: input.createRow,
    headOfficeRows: input.headOfficeRows,
    siteRows: input.siteRows,
  });
}

export function formatBulkEditorCopyMessage(copiedRows: number): string {
  return `Copied ${copiedRows.toLocaleString()} row${copiedRows === 1 ? '' : 's'}`;
}

export function formatBulkEditorAppendPasteMessage(
  pastedRows: number,
  pastedColumns: number,
  appended: boolean,
): string {
  if (appended) {
    return `Pasted ${pastedRows.toLocaleString()} row${pastedRows === 1 ? '' : 's'} at bottom`;
  }
  return `Pasted ${pastedRows.toLocaleString()} row${pastedRows === 1 ? '' : 's'} × ${pastedColumns.toLocaleString()} column${pastedColumns === 1 ? '' : 's'}`;
}
