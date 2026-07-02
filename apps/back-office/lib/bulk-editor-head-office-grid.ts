/**
 * Head Office sheet — pure helpers (step 7).
 */

import type { RowsChangeData } from 'react-data-grid';

import { applyWorkforceRankFieldsFromMatrix } from './bulk-editor-cross-sheet';
import {
  WEB_EDITOR_SECTOR_NAME_COLUMN,
  isHeadOfficeSectorNameActive,
  isHeadOfficeSectorNameRequired,
  type BulkEditorRow,
  type BulkEditorSnapshot,
} from './bulk-roster-web-editor-spec';
import { mergeHrSectorNames, normalizeHrSectorName } from './hr-sectors';

function headOfficeRank(row: BulkEditorRow): string {
  return String(row.rank ?? '').trim();
}

function isSmHeadOfficeRow(row: BulkEditorRow): boolean {
  return isHeadOfficeSectorNameActive({ rank: headOfficeRank(row) });
}

function isSmSectorMissing(row: BulkEditorRow): boolean {
  return isHeadOfficeSectorNameRequired({
    rank: headOfficeRank(row),
    sector_name: row[WEB_EDITOR_SECTOR_NAME_COLUMN],
  });
}

/** Merge md_settings sectors with SM rows currently on the Head Office sheet. */
export function collectLiveSectorNames(snapshot: BulkEditorSnapshot): string[] {
  const fromSmRows = snapshot.headOffice
    .filter((row) => isSmHeadOfficeRow(row))
    .map((row) => normalizeHrSectorName(row[WEB_EDITOR_SECTOR_NAME_COLUMN]))
    .filter(Boolean);
  return mergeHrSectorNames(snapshot.sectorNames, fromSmRows);
}

/** Clear sector_name when rank is no longer SM; sync pay fields from Ranks tab. */
export function applyHeadOfficeRowsChange(
  rows: BulkEditorRow[],
  data: RowsChangeData<BulkEditorRow>,
  rankRows: readonly BulkEditorRow[] = [],
): BulkEditorRow[] {
  return rows.map((row, rowIdx) => {
    let next = { ...row };

    if (data.indexes.includes(rowIdx) && data.column.key === 'rank') {
      next = applyWorkforceRankFieldsFromMatrix(next, rankRows);
    }

    if (data.column.key === 'rank' && !isSmHeadOfficeRow(next)) {
      if (String(next[WEB_EDITOR_SECTOR_NAME_COLUMN] ?? '').trim()) {
        next = { ...next, [WEB_EDITOR_SECTOR_NAME_COLUMN]: '' };
      }
    }

    return next;
  });
}

export function headOfficeSectorNameCellClass(
  row: BulkEditorRow,
  touchedSectorRowIds: ReadonlySet<string>,
): string {
  if (!isSmHeadOfficeRow(row)) {
    return 'bulk-editor-sector-inactive';
  }
  if (isSmSectorMissing(row) && touchedSectorRowIds.has(row._rowId)) {
    return 'bulk-editor-sector-required';
  }
  if (isSmSectorMissing(row)) {
    return 'bulk-editor-sector-pending';
  }
  return '';
}

export function isHeadOfficeSectorEditable(row: BulkEditorRow): boolean {
  return isSmHeadOfficeRow(row);
}

export { WEB_EDITOR_SECTOR_NAME_COLUMN };
