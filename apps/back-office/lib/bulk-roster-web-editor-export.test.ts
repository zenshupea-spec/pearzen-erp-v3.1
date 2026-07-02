import { describe, expect, it } from 'vitest';

import { DEFAULT_RANK_PAY_MATRIX } from '../../../packages/rank-pay-matrix';
import { buildBulkDataWorkbook } from './bulk-data-workbook';
import { validateBulkImport } from './bulk-data-import';
import { buildBulkEditorSnapshot } from './bulk-roster-web-editor-snapshot';
import {
  buildBulkEditorExportPayload,
  convertBulkEditorSnapshotToParsedWorkbook,
  mergeEditorRankMatrixWithCurrent,
} from './bulk-roster-web-editor-export';
import {
  parseBulkImportValidationError,
  validateBulkEditorSnapshot,
} from './bulk-editor-validation';
import type { BulkEditorSnapshot } from './bulk-roster-web-editor-spec';

const minimalSnapshot = (): BulkEditorSnapshot =>
  buildBulkEditorSnapshot({
    employees: [
      {
        employee_id: 'e1',
        emp_number: 'G-001',
        epf_no: '12345',
        full_name: 'PERERA K.',
        nic: '199412345678',
        phone: '+94771234567',
        group: 'GUARD',
        rank: 'JSO',
        status: 'ACTIVE',
        site_code: 'LKH001',
      },
    ],
    sites: [
      {
        site_code: 'LKH001',
        site_name: 'Lake View Hotel',
        site_type: 'OTHER',
        site_status: 'ACTIVE',
      },
    ],
    rankMatrix: DEFAULT_RANK_PAY_MATRIX,
    sectorNamesFromSettings: ['COLOMBO 1'],
  });

describe('bulk-roster-web-editor-export', () => {
  it('converts snapshot to multi-sheet parsed workbook', () => {
    const snapshot = minimalSnapshot();
    const parsed = convertBulkEditorSnapshotToParsedWorkbook(snapshot);

    expect(parsed.multiSheetFormat).toBe(true);
    expect(parsed.siteRows?.length).toBeGreaterThan(0);
    expect(parsed.rows.length).toBeGreaterThan(0);
    expect(parsed.sheetMeta?.length).toBe(parsed.rows.length);
  });

  it('passes validateBulkImport for loaded minimal snapshot', () => {
    const snapshot = minimalSnapshot();
    const payload = buildBulkEditorExportPayload(snapshot);
    expect(validateBulkImport(payload.parsed, payload.rankMatrix)).toEqual([]);
    expect(validateBulkEditorSnapshot(snapshot)).toEqual([]);
  });

  it('builds downloadable xlsx from editor snapshot with export filename pattern', async () => {
    const snapshot = minimalSnapshot();
    const { parsed } = buildBulkEditorExportPayload(snapshot);
    const { base64, filename } = await buildBulkDataWorkbook({
      mode: 'export',
      employees: parsed.rows,
      sites: parsed.siteRows ?? [],
    });
    expect(filename).toMatch(/^pearzen-migration-export-\d{4}-\d{2}-\d{2}\.xlsx$/);
    expect(base64.length).toBeGreaterThan(100);
  });
});

describe('bulk-editor-validation', () => {
  it('parses sheet row labels into tab + row index', () => {
    const issue = parseBulkImportValidationError('GUARD row 5: full_name is required.');
    expect(issue.tabId).toBe('guard');
    expect(issue.rowIndex).toBe(1);
    expect(issue.columnKey).toBe('full_name');
  });

  it('preserves annual increment when merging editor ranks with current matrix', () => {
    const current = [
      {
        id: 'rp-1',
        rankCode: 'JSO',
        fullTitle: 'JUNIOR SECURITY OFFICER',
        basicPay: 30000,
        annualIncrement: 1200,
        salaryType: 'BANK' as const,
        operationalGroup: 'GUARD_FIELD' as const,
      },
    ];
    const editor = [
      {
        id: 'rp-1',
        rankCode: 'JSO',
        fullTitle: 'JUNIOR SECURITY OFFICER',
        basicPay: 32000,
        annualIncrement: 0,
        salaryType: 'BANK' as const,
        operationalGroup: 'GUARD_FIELD' as const,
      },
    ];
    const merged = mergeEditorRankMatrixWithCurrent(editor, current);
    expect(merged.find((e) => e.rankCode === 'JSO')?.basicPay).toBe(32000);
    expect(merged.find((e) => e.rankCode === 'JSO')?.annualIncrement).toBe(1200);
  });
});
