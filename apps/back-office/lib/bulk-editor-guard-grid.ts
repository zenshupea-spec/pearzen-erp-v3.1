/**
 * Guard sheet — fixed group badge, site/SM linkage, new-row template (step 10).
 */

import type { RowsChangeData } from 'react-data-grid';

import { applyWorkforceRankFieldsFromMatrix, deriveGuardAssignedSm, normalizeSiteCode } from './bulk-editor-cross-sheet';
import { MIGRATION_EMPLOYEE_CORPORATE_GROUP_COLUMN } from './bulk-data-workbook';
import { WEB_EDITOR_GUARD_COLUMNS, type BulkEditorRow } from './bulk-roster-web-editor-spec';
import { createEmptyEditorRow } from './bulk-roster-web-editor-state';

export { MIGRATION_EMPLOYEE_CORPORATE_GROUP_COLUMN as WEB_EDITOR_GUARD_GROUP_COLUMN };

export const GUARD_FIXED_GROUP_VALUE = 'GUARD' as const;

/** Client-only flag — assigned_sm_epf was auto-filled from site selection. */
export const GUARD_SM_AUTO_FLAG = '_smAutoAssigned' as const;

/** Read-only UI column key (not persisted on save). */
export const WEB_EDITOR_GUARD_SITE_NAME_HINT_KEY = '__site_name_hint' as const;

export const GUARD_EMPTY_ROW_TEMPLATE: Readonly<Partial<BulkEditorRow>> = {
  [MIGRATION_EMPLOYEE_CORPORATE_GROUP_COLUMN]: GUARD_FIXED_GROUP_VALUE,
  status: 'ACTIVE',
  salary_type: 'BANK',
  epf_yn: 'TRUE',
  rank: 'JSO',
  rank_operational_group: 'GUARD',
  role: 'SECURITY OFFICER',
};

export function applyGuardRowTemplate(row: BulkEditorRow): BulkEditorRow {
  const next = { ...row };
  for (const [key, value] of Object.entries(GUARD_EMPTY_ROW_TEMPLATE)) {
    if (!String(next[key] ?? '').trim()) {
      next[key] = String(value);
    }
  }
  next[MIGRATION_EMPLOYEE_CORPORATE_GROUP_COLUMN] = GUARD_FIXED_GROUP_VALUE;
  return next;
}

export function createGuardEditorRow(): BulkEditorRow {
  return applyGuardRowTemplate(createEmptyEditorRow(WEB_EDITOR_GUARD_COLUMNS));
}

export function isGuardSmAutoAssigned(row: BulkEditorRow): boolean {
  return String(row[GUARD_SM_AUTO_FLAG] ?? '') === 'true';
}

export function applyGuardRowsChange(
  rows: BulkEditorRow[],
  data: RowsChangeData<BulkEditorRow>,
  siteRows: readonly BulkEditorRow[],
  headOfficeRows: readonly BulkEditorRow[],
  rankRows: readonly BulkEditorRow[] = [],
): BulkEditorRow[] {
  return rows.map((row, rowIdx) => {
    let next: BulkEditorRow = {
      ...row,
      [MIGRATION_EMPLOYEE_CORPORATE_GROUP_COLUMN]: GUARD_FIXED_GROUP_VALUE,
      site_code: normalizeSiteCode(row.site_code),
    };

    if (!data.indexes.includes(rowIdx)) return next;

    if (data.column.key === 'rank') {
      next = applyWorkforceRankFieldsFromMatrix(next, rankRows);
    }

    if (data.column.key === 'site_code') {
      const siteCode = String(next.site_code ?? '').trim();
      if (!siteCode) {
        return { ...next, assigned_sm_epf: '', [GUARD_SM_AUTO_FLAG]: '' };
      }
      const derived = deriveGuardAssignedSm(siteCode, siteRows, headOfficeRows);
      return {
        ...next,
        assigned_sm_epf: derived,
        [GUARD_SM_AUTO_FLAG]: derived ? 'true' : '',
      };
    }

    if (data.column.key === 'assigned_sm_epf') {
      const epf = String(next.assigned_sm_epf ?? '').trim().toUpperCase();
      return {
        ...next,
        assigned_sm_epf: epf,
        [GUARD_SM_AUTO_FLAG]: '',
      };
    }

    return next;
  });
}
