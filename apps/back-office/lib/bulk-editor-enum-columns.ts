import type { BulkEditorRow } from './bulk-roster-web-editor-spec';

/** Known dropdown values for bulk editor workforce / sites enum columns. */
export const BULK_EDITOR_ENUM_COLUMN_OPTIONS: Readonly<Record<string, readonly string[]>> = {
  gender: ['MALE', 'FEMALE'],
  nationality: ['SRI LANKAN'],
  religion: [
    'BUDDHIST',
    'CHRISTIAN',
    'ROMAN CATHOLIC',
    'MUSLIM',
    'HINDU',
    'ATHEIST',
    'OTHER',
  ],
  status: ['ACTIVE', 'INACTIVE', 'RESIGNED'],
  salary_type: ['BANK', 'CASH'],
  rank_salary_type: ['BANK', 'CASH'],
  epf_yn: ['TRUE', 'FALSE'],
  maternity_leave: ['TRUE', 'FALSE'],
  site_status: ['ACTIVE', 'INACTIVE'],
  site_type: ['OFFICE', 'BANK', 'PHARMACY', 'STORAGE', 'HOTEL', 'RESIDENTIAL', 'OTHER'],
  verification_mode: ['A', 'B', 'C'],
  provides_food: ['TRUE', 'FALSE'],
  provides_accommodation: ['TRUE', 'FALSE'],
};

const ENUM_COLUMN_KEYS = new Set(Object.keys(BULK_EDITOR_ENUM_COLUMN_OPTIONS));

export function isBulkEditorEnumColumn(columnKey: string): boolean {
  return ENUM_COLUMN_KEYS.has(columnKey);
}

export function normalizeBulkEditorEnumCellValue(columnKey: string, raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';

  if (columnKey === 'epf_yn' || columnKey === 'maternity_leave' || columnKey === 'provides_food' || columnKey === 'provides_accommodation') {
    const upper = trimmed.toUpperCase();
    if (upper === 'TRUE' || upper === 'YES' || upper === 'Y' || upper === '1') return 'TRUE';
    if (upper === 'FALSE' || upper === 'NO' || upper === 'N' || upper === '0') return 'FALSE';
    return upper;
  }

  if (columnKey === 'verification_mode') {
    return trimmed.toUpperCase().slice(0, 1);
  }

  return trimmed.toUpperCase();
}

/** Merge preset options with values already present in the grid (for datalist / combobox). */
export function resolveBulkEditorEnumOptions(
  columnKey: string,
  rows: readonly BulkEditorRow[],
): string[] {
  const preset = BULK_EDITOR_ENUM_COLUMN_OPTIONS[columnKey] ?? [];
  const seen = new Set<string>(preset);

  for (const row of rows) {
    const value = normalizeBulkEditorEnumCellValue(columnKey, String(row[columnKey] ?? ''));
    if (value) seen.add(value);
  }

  return [...seen];
}

/** Columns that use a native select on single click (includes live dropdown columns). */
/** @deprecated Use isBulkEditorDropdownColumn from bulk-editor-dropdown-columns.ts */
export function isBulkEditorSingleClickSelectColumn(
  columnKey: string,
  tabId: string,
): boolean {
  if (isBulkEditorEnumColumn(columnKey)) return true;
  if (tabId === 'ranks' && (columnKey === 'salary_type' || columnKey === 'operational_group')) {
    return true;
  }
  if (columnKey === 'rank' || columnKey === 'rank_code') return true;
  if (columnKey === 'site_code' || columnKey === 'assigned_sm_epf') return true;
  if (columnKey === 'sector_name') return true;
  return false;
}
