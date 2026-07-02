/**
 * Sites sheet — validation, SM linkage, and new-row template (step 9).
 */

import type { RowsChangeData } from 'react-data-grid';

import { buildSmEpfToSectorMap, normalizeSiteCode } from './bulk-editor-cross-sheet';
import { WEB_EDITOR_SITES_COLUMNS, WEB_EDITOR_SECTOR_NAME_COLUMN, type BulkEditorRow } from './bulk-roster-web-editor-spec';
import { createEmptyEditorRow } from './bulk-roster-web-editor-state';

export const SITES_EMPTY_ROW_TEMPLATE: Readonly<Partial<BulkEditorRow>> = {
  site_type: 'OTHER',
  site_status: 'ACTIVE',
  verification_mode: 'B',
  needs_om_gps_capture: 'TRUE',
  required_guards: '1',
  geofence_radius_m: '100',
};

export function applySitesRowTemplate(row: BulkEditorRow): BulkEditorRow {
  const next = { ...row };
  for (const [key, value] of Object.entries(SITES_EMPTY_ROW_TEMPLATE)) {
    if (!String(next[key] ?? '').trim()) {
      next[key] = String(value);
    }
  }
  if (next.site_code) {
    next.site_code = normalizeSiteCode(next.site_code);
  }
  return next;
}

export function createSitesEditorRow(): BulkEditorRow {
  return applySitesRowTemplate(createEmptyEditorRow(WEB_EDITOR_SITES_COLUMNS));
}

export function findDuplicateSiteCodeRowIds(sites: readonly BulkEditorRow[]): Set<string> {
  const byCode = new Map<string, string[]>();
  for (const row of sites) {
    const code = normalizeSiteCode(row.site_code);
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

export function siteCodeCellClass(
  row: BulkEditorRow,
  duplicateRowIds: ReadonlySet<string>,
): string {
  const code = normalizeSiteCode(row.site_code);
  if (!code) return '';
  if (duplicateRowIds.has(row._rowId)) return 'bulk-editor-site-code-duplicate';
  return '';
}

export function applySitesRowsChange(
  rows: BulkEditorRow[],
  data: RowsChangeData<BulkEditorRow>,
  headOfficeRows: readonly BulkEditorRow[],
): BulkEditorRow[] {
  const smSectorByEpf = buildSmEpfToSectorMap(headOfficeRows);

  return rows.map((row) => {
    let next: BulkEditorRow = {
      ...row,
      site_code: normalizeSiteCode(row.site_code),
    };

    if (data.column.key === 'assigned_sm_epf') {
      const epf = String(next.assigned_sm_epf ?? '').trim().toUpperCase();
      next = { ...next, assigned_sm_epf: epf };
      const sector = epf ? smSectorByEpf.get(epf) : undefined;
      if (sector && !String(next[WEB_EDITOR_SECTOR_NAME_COLUMN] ?? '').trim()) {
        next = { ...next, [WEB_EDITOR_SECTOR_NAME_COLUMN]: sector };
      }
    }

    return next;
  });
}

export { WEB_EDITOR_SECTOR_NAME_COLUMN };
