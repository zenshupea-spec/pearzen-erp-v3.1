import {
  BULK_EDITOR_ENUM_COLUMN_OPTIONS,
  isBulkEditorEnumColumn,
  normalizeBulkEditorEnumCellValue,
  resolveBulkEditorEnumOptions,
} from './bulk-editor-enum-columns';
import { normalizeRankCode } from './bulk-editor-ranks-grid';
import {
  WEB_EDITOR_RANK_OPERATIONAL_GROUP_OPTIONS,
  WEB_EDITOR_RANK_SALARY_TYPE_OPTIONS,
} from './bulk-editor-ranks-grid';
import { collectRankCodeOptions, collectSiteCodeOptions, collectSmEpfOptions } from './bulk-editor-cross-sheet';
import { WEB_EDITOR_SECTOR_NAME_COLUMN, type BulkEditorRow, type BulkEditorTabId } from './bulk-roster-web-editor-spec';

export type BulkEditorDropdownContext = {
  tabId: BulkEditorTabId;
  rows: readonly BulkEditorRow[];
  rankRows: readonly BulkEditorRow[];
  siteRows: readonly BulkEditorRow[];
  headOfficeRows: readonly BulkEditorRow[];
  smEpfOptions: readonly string[];
  siteCodeOptions: readonly string[];
  sectorNames: readonly string[];
};

const WORKFORCE_TABS = new Set<BulkEditorTabId>(['head_office', 'cafe', 'guard']);

/** Columns that open a select on single click (and combobox on double click when allowed). */
export function isBulkEditorDropdownColumn(columnKey: string, tabId: BulkEditorTabId): boolean {
  if (isBulkEditorEnumColumn(columnKey)) return true;
  if (WORKFORCE_TABS.has(tabId) && columnKey === 'rank') return true;
  if (tabId === 'ranks' && columnKey === 'rank_code') return true;
  if (tabId === 'ranks' && (columnKey === 'salary_type' || columnKey === 'operational_group')) {
    return true;
  }
  if (columnKey === 'site_code' || columnKey === 'assigned_sm_epf') return true;
  if (columnKey === WEB_EDITOR_SECTOR_NAME_COLUMN && (tabId === 'head_office' || tabId === 'sites')) {
    return true;
  }
  return false;
}

/** Whether double-click opens a typeable combobox (vs select-only). */
export function allowsBulkEditorDropdownCombobox(
  columnKey: string,
  tabId: BulkEditorTabId,
): boolean {
  if (columnKey === WEB_EDITOR_SECTOR_NAME_COLUMN) return true;
  if (WORKFORCE_TABS.has(tabId) && columnKey === 'rank') return true;
  if (tabId === 'ranks' && columnKey === 'rank_code') return true;
  if (isBulkEditorEnumColumn(columnKey)) return true;
  if (columnKey === 'site_code' || columnKey === 'assigned_sm_epf') return true;
  return false;
}

export function normalizeBulkEditorDropdownValue(columnKey: string, raw: string): string {
  if (columnKey === 'rank' || columnKey === 'rank_code') {
    return normalizeRankCode(raw);
  }
  if (columnKey === WEB_EDITOR_SECTOR_NAME_COLUMN) {
    return raw.trim().toUpperCase();
  }
  if (columnKey === 'site_code') {
    return String(raw ?? '').trim().toUpperCase();
  }
  if (columnKey === 'assigned_sm_epf') {
    return String(raw ?? '').trim().toUpperCase();
  }
  if (isBulkEditorEnumColumn(columnKey)) {
    return normalizeBulkEditorEnumCellValue(columnKey, raw);
  }
  return raw.trim().toUpperCase();
}

export function resolveBulkEditorDropdownOptions(
  columnKey: string,
  ctx: BulkEditorDropdownContext,
): string[] {
  if (isBulkEditorEnumColumn(columnKey)) {
    return resolveBulkEditorEnumOptions(columnKey, ctx.rows);
  }

  if (columnKey === 'rank') {
    return collectRankCodeOptions(ctx.rankRows, ctx.rows);
  }

  if (columnKey === 'rank_code' && ctx.tabId === 'ranks') {
    return collectRankCodeOptions(ctx.rows, ctx.rankRows);
  }

  if (columnKey === 'salary_type') {
    return [...WEB_EDITOR_RANK_SALARY_TYPE_OPTIONS];
  }

  if (columnKey === 'operational_group') {
    return [...WEB_EDITOR_RANK_OPERATIONAL_GROUP_OPTIONS];
  }

  if (columnKey === 'site_code') {
    const live = ctx.siteCodeOptions.length ? ctx.siteCodeOptions : collectSiteCodeOptions(ctx.siteRows);
    const seen = new Set(live);
    for (const row of ctx.rows) {
      const code = normalizeBulkEditorDropdownValue('site_code', String(row.site_code ?? ''));
      if (code) seen.add(code);
    }
    return [...seen].sort((a, b) => a.localeCompare(b));
  }

  if (columnKey === 'assigned_sm_epf') {
    const live = ctx.smEpfOptions.length ? ctx.smEpfOptions : collectSmEpfOptions(ctx.headOfficeRows);
    const seen = new Set(live);
    for (const row of ctx.rows) {
      const epf = normalizeBulkEditorDropdownValue('assigned_sm_epf', String(row.assigned_sm_epf ?? ''));
      if (epf) seen.add(epf);
    }
    return [...seen].sort((a, b) => a.localeCompare(b));
  }

  if (columnKey === WEB_EDITOR_SECTOR_NAME_COLUMN) {
    const seen = new Set<string>();
    for (const name of ctx.sectorNames) {
      const normalized = normalizeBulkEditorDropdownValue(columnKey, name);
      if (normalized) seen.add(normalized);
    }
    for (const row of ctx.rows) {
      const value = normalizeBulkEditorDropdownValue(
        columnKey,
        String(row[WEB_EDITOR_SECTOR_NAME_COLUMN] ?? ''),
      );
      if (value) seen.add(value);
    }
    return [...seen].sort((a, b) => a.localeCompare(b));
  }

  return BULK_EDITOR_ENUM_COLUMN_OPTIONS[columnKey] ?? [];
}
