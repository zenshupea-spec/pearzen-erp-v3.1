/**
 * Tab row helpers and dirty-state signatures for the bulk roster web editor.
 */

import {
  WEB_EDITOR_TAB_META,
  WEB_EDITOR_TAB_ORDER,
  type BulkEditorRow,
  type BulkEditorSnapshot,
  type BulkEditorTabId,
} from './bulk-roster-web-editor-spec';
import { createCafeEditorRow } from './bulk-editor-cafe-grid';
import { createGuardEditorRow } from './bulk-editor-guard-grid';
import { createRankEditorRow } from './bulk-editor-ranks-grid';
import { createSitesEditorRow } from './bulk-editor-sites-grid';

export function rowsForTab(snapshot: BulkEditorSnapshot, tabId: BulkEditorTabId): BulkEditorRow[] {
  switch (tabId) {
    case 'head_office':
      return snapshot.headOffice;
    case 'cafe':
      return snapshot.cafe;
    case 'sites':
      return snapshot.sites;
    case 'guard':
      return snapshot.guards;
    case 'ranks':
      return snapshot.ranks;
    default:
      return [];
  }
}

export function rowCountForTab(snapshot: BulkEditorSnapshot, tabId: BulkEditorTabId): number {
  return rowsForTab(snapshot, tabId).length;
}

export function updateTabRows(
  snapshot: BulkEditorSnapshot,
  tabId: BulkEditorTabId,
  rows: BulkEditorRow[],
): BulkEditorSnapshot {
  switch (tabId) {
    case 'head_office':
      return { ...snapshot, headOffice: rows };
    case 'cafe':
      return { ...snapshot, cafe: rows };
    case 'sites':
      return { ...snapshot, sites: rows };
    case 'guard':
      return { ...snapshot, guards: rows };
    case 'ranks':
      return { ...snapshot, ranks: rows as BulkEditorSnapshot['ranks'] };
    default:
      return snapshot;
  }
}

/** Stable JSON signature for dirty-tab detection. */
export function tabRowsSignature(
  rows: readonly BulkEditorRow[],
  columnKeys: readonly string[],
): string {
  const normalized = rows.map((row) => {
    const cells: Record<string, string> = { _rowId: row._rowId };
    for (const key of columnKeys) {
      cells[key] = String(row[key] ?? '').trim();
    }
    return cells;
  });
  return JSON.stringify(normalized);
}

export function isTabDirtyComparedToBaseline(
  snapshot: BulkEditorSnapshot,
  baseline: BulkEditorSnapshot,
  tabId: BulkEditorTabId,
): boolean {
  const columnKeys = WEB_EDITOR_TAB_META[tabId].columns;
  const current = tabRowsSignature(rowsForTab(snapshot, tabId), columnKeys);
  const original = tabRowsSignature(rowsForTab(baseline, tabId), columnKeys);
  return current !== original;
}

/** Full-workbook signature — used to detect edits after a successful validate. */
export function snapshotDataSignature(snapshot: BulkEditorSnapshot): string {
  return WEB_EDITOR_TAB_ORDER.map((tabId) => {
    const columnKeys = WEB_EDITOR_TAB_META[tabId].columns;
    return `${tabId}:${tabRowsSignature(rowsForTab(snapshot, tabId), columnKeys)}`;
  }).join('\n');
}

export function createEmptyEditorRow(columnKeys: readonly string[]): BulkEditorRow {
  const row: BulkEditorRow = { _rowId: `new:${crypto.randomUUID()}` };
  for (const key of columnKeys) {
    row[key] = '';
  }
  return row;
}

export function createEditorRowForTab(tabId: BulkEditorTabId): BulkEditorRow {
  if (tabId === 'cafe') {
    return createCafeEditorRow();
  }
  if (tabId === 'sites') {
    return createSitesEditorRow();
  }
  if (tabId === 'guard') {
    return createGuardEditorRow();
  }
  if (tabId === 'ranks') {
    return createRankEditorRow();
  }
  return createEmptyEditorRow(WEB_EDITOR_TAB_META[tabId].columns);
}

export function cloneBulkEditorSnapshot(snapshot: BulkEditorSnapshot): BulkEditorSnapshot {
  if (typeof structuredClone === 'function') {
    return structuredClone(snapshot);
  }
  return JSON.parse(JSON.stringify(snapshot)) as BulkEditorSnapshot;
}
