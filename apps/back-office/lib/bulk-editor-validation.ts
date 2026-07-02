/**
 * Parse validateBulkImport messages → editor tab/row/column refs (step 13).
 */

import { validateBulkImport } from './bulk-data-import';
import { MIGRATION_EXCEL_DATA_START_ROW } from './migration-workbook-exceljs';
import {
  MIGRATION_SHEET_CAFE,
  MIGRATION_SHEET_GUARD,
  MIGRATION_SHEET_HEAD_OFFICE,
  MIGRATION_SHEET_SITES,
  MIGRATION_SHEET_SM,
} from './bulk-data-workbook';
import {
  buildBulkEditorExportPayload,
  type BulkEditorExportPayload,
} from './bulk-roster-web-editor-export';
import type { BulkEditorSnapshot, BulkEditorTabId } from './bulk-roster-web-editor-spec';

export type BulkEditorValidationIssue = {
  raw: string;
  message: string;
  sheetName?: string;
  excelRow?: number;
  tabId?: BulkEditorTabId;
  /** 0-based row index within the editor tab. */
  rowIndex?: number;
  columnKey?: string;
};

const SHEET_TO_TAB: Record<string, BulkEditorTabId> = {
  [MIGRATION_SHEET_HEAD_OFFICE]: 'head_office',
  [MIGRATION_SHEET_SM]: 'head_office',
  [MIGRATION_SHEET_CAFE]: 'cafe',
  [MIGRATION_SHEET_SITES]: 'sites',
  [MIGRATION_SHEET_GUARD]: 'guard',
};

const COLUMN_HINTS: Array<{ pattern: RegExp; columnKey: string }> = [
  { pattern: /\bemp_number\b/i, columnKey: 'emp_number' },
  { pattern: /\bemployee_id\b/i, columnKey: 'employee_id' },
  { pattern: /\bfull_name\b/i, columnKey: 'full_name' },
  { pattern: /\bnic\b/i, columnKey: 'nic' },
  { pattern: /\bphone\b/i, columnKey: 'phone' },
  { pattern: /\bepf_no\b/i, columnKey: 'epf_no' },
  { pattern: /\bsite_code\b/i, columnKey: 'site_code' },
  { pattern: /\bsite_name\b/i, columnKey: 'site_name' },
  { pattern: /\bassigned_sm_epf\b/i, columnKey: 'assigned_sm_epf' },
  { pattern: /\brank_code\b/i, columnKey: 'rank_code' },
  { pattern: /\brank_title\b/i, columnKey: 'rank_title' },
  { pattern: /\bbasic_pay\b/i, columnKey: 'basic_pay_lkr' },
  { pattern: /\brank pay matrix\b/i, columnKey: 'rank' },
  { pattern: /\brank\b/i, columnKey: 'rank' },
  { pattern: /\bgroup\b/i, columnKey: 'corporate_group' },
  { pattern: /\bsector_name\b/i, columnKey: 'sector_name' },
  { pattern: /\bsalary_type\b/i, columnKey: 'salary_type' },
  { pattern: /\boperational_group\b/i, columnKey: 'operational_group' },
];

const SHEET_ROW_PATTERN = /^(.+?) row (\d+):\s*(.+)$/;
const ROSTER_ROW_PATTERN = /^Roster row (\d+):\s*(.+)$/;

function inferColumnKey(message: string): string | undefined {
  for (const hint of COLUMN_HINTS) {
    if (hint.pattern.test(message)) return hint.columnKey;
  }
  return undefined;
}

export function parseBulkImportValidationError(raw: string): BulkEditorValidationIssue {
  const sheetMatch = raw.match(SHEET_ROW_PATTERN);
  if (sheetMatch) {
    const sheetName = sheetMatch[1]!.trim();
    const excelRow = Number.parseInt(sheetMatch[2]!, 10);
    const message = sheetMatch[3]!.trim();
    const tabId = SHEET_TO_TAB[sheetName];
    const rowIndex =
      Number.isFinite(excelRow) && excelRow >= MIGRATION_EXCEL_DATA_START_ROW
        ? excelRow - MIGRATION_EXCEL_DATA_START_ROW
        : undefined;

    return {
      raw,
      message,
      sheetName,
      excelRow: Number.isFinite(excelRow) ? excelRow : undefined,
      tabId,
      rowIndex,
      columnKey: inferColumnKey(message),
    };
  }

  const rosterMatch = raw.match(ROSTER_ROW_PATTERN);
  if (rosterMatch) {
    const excelRow = Number.parseInt(rosterMatch[1]!, 10);
    const message = rosterMatch[2]!.trim();
    return {
      raw,
      message,
      excelRow: Number.isFinite(excelRow) ? excelRow : undefined,
      rowIndex: Number.isFinite(excelRow) ? excelRow - 2 : undefined,
      tabId: 'guard',
      columnKey: inferColumnKey(message),
    };
  }

  return {
    raw,
    message: raw,
    columnKey: inferColumnKey(raw),
  };
}

export function validateBulkEditorExportPayload(
  payload: BulkEditorExportPayload,
): BulkEditorValidationIssue[] {
  const rawErrors = validateBulkImport(payload.parsed, payload.rankMatrix);
  return rawErrors.map(parseBulkImportValidationError);
}

export function validateBulkEditorSnapshot(snapshot: BulkEditorSnapshot): BulkEditorValidationIssue[] {
  return validateBulkEditorExportPayload(buildBulkEditorExportPayload(snapshot));
}

export function formatBulkEditorValidationSummary(issues: BulkEditorValidationIssue[]): string {
  if (issues.length === 0) return 'No validation issues — ready to apply.';
  return `${issues.length.toLocaleString()} validation issue${issues.length === 1 ? '' : 's'} found.`;
}
