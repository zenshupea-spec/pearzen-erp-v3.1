/**
 * Step 18 — integration tests tying load → edit → paste → convert → validate.
 */

import { describe, expect, it } from 'vitest';

import { applyGuardRowsChange } from './bulk-editor-guard-grid';
import { applyHeadOfficeRowsChange } from './bulk-editor-head-office-grid';
import { applyBulkEditorPaste } from './bulk-editor-paste';
import { validateBulkImport } from './bulk-data-import';
import {
  buildBulkEditorExportPayload,
  convertBulkEditorSnapshotToParsedWorkbook,
} from './bulk-roster-web-editor-export';
import { buildBulkEditorSnapshot } from './bulk-roster-web-editor-snapshot';
import {
  WEB_EDITOR_GUARD_COLUMNS,
  WEB_EDITOR_SECTOR_NAME_COLUMN,
  isHeadOfficeSectorNameActive,
  type BulkEditorSnapshot,
} from './bulk-roster-web-editor-spec';
import { createEmptyEditorRow } from './bulk-roster-web-editor-state';
import { validateBulkEditorSnapshot } from './bulk-editor-validation';
import { DEFAULT_RANK_PAY_MATRIX } from '../../../packages/rank-pay-matrix';

function integrationSnapshot(): BulkEditorSnapshot {
  return buildBulkEditorSnapshot({
    employees: [
      {
        employee_id: 'sm-1',
        emp_number: 'SM001',
        epf_no: 'SM-100',
        full_name: 'SECTOR MANAGER KANDY',
        nic: '198012345678',
        phone: '+94771111111',
        group: 'SECTOR_MANAGER',
        rank: 'SM',
        status: 'ACTIVE',
        site_name: 'KANDY',
      },
      {
        employee_id: 'g-1',
        emp_number: 'G-001',
        epf_no: '12345',
        full_name: 'PERERA K.',
        nic: '199412345678',
        phone: '+94771234567',
        group: 'GUARD',
        rank: 'JSO',
        status: 'ACTIVE',
        site_code: '',
        assigned_sm_epf: '',
      },
    ],
    sites: [
      {
        site_code: 'KDY-01',
        site_name: 'Kandy Client Site',
        site_type: 'OTHER',
        site_status: 'ACTIVE',
        assigned_sm_epf: '',
        sector_name: 'KANDY',
      },
      {
        site_code: 'LKH001',
        site_name: 'Lake View Hotel',
        site_type: 'OTHER',
        site_status: 'ACTIVE',
        assigned_sm_epf: '13650',
        sector_name: 'KANDY',
      },
    ],
    rankMatrix: DEFAULT_RANK_PAY_MATRIX,
    sectorNamesFromSettings: ['KANDY', 'COLOMBO 1'],
  });
}

describe('bulk roster web editor integration (step 18)', () => {
  it('SM sector_name is active only on Head Office SM rows', () => {
    const snapshot = integrationSnapshot();
    const smRow = snapshot.headOffice.find((row) => row.rank === 'SM');
    expect(smRow).toBeTruthy();
    expect(isHeadOfficeSectorNameActive({ rank: 'SM' })).toBe(true);
    expect(isHeadOfficeSectorNameActive({ rank: 'GAD' })).toBe(false);
    expect(smRow?.[WEB_EDITOR_SECTOR_NAME_COLUMN]).toBe('KANDY');
  });

  it('guard auto-fills assigned_sm from site.assigned_sm_epf (direct)', () => {
    const snapshot = integrationSnapshot();
    const guards = [...snapshot.guards];
    const next = applyGuardRowsChange(
      [{ ...guards[0]!, site_code: 'LKH001' }],
      { indexes: [0], column: { key: 'site_code' } as never },
      snapshot.sites,
      snapshot.headOffice,
    );
    expect(next[0]?.assigned_sm_epf).toBe('13650');
  });

  it('guard auto-fills assigned_sm from site sector_name → SM match', () => {
    const snapshot = integrationSnapshot();
    const guards = [...snapshot.guards];
    const next = applyGuardRowsChange(
      [{ ...guards[0]!, site_code: 'KDY-01' }],
      { indexes: [0], column: { key: 'site_code' } as never },
      snapshot.sites,
      snapshot.headOffice,
    );
    expect(next[0]?.assigned_sm_epf).toBe('SM-100');
  });

  it('paste expands guard rows when clipboard exceeds grid', () => {
    const snapshot = integrationSnapshot();
    const pastedNames = Array.from({ length: 10 }, (_, i) => `GUARD ${i + 1}`).join('\n');
    const pasteResult = applyBulkEditorPaste({
      tabId: 'guard',
      columnKeys: ['full_name'],
      rows: [...snapshot.guards],
      startRowIdx: 0,
      startColumnKey: 'full_name',
      clipboardText: pastedNames,
      createRow: () => createEmptyEditorRow(WEB_EDITOR_GUARD_COLUMNS),
      headOfficeRows: snapshot.headOffice,
      siteRows: snapshot.sites,
    });

    expect(pasteResult.pastedRows).toBe(10);
    expect(pasteResult.rows).toHaveLength(10);
    expect(pasteResult.rows[0]?.full_name).toBe('GUARD 1');
    expect(pasteResult.rows[9]?.full_name).toBe('GUARD 10');
    expect(pasteResult.rows[9]?.corporate_group).toBe('GUARD');
  });

  it('convert snapshot → parsed workbook → validateBulkImport happy path', () => {
    const snapshot = integrationSnapshot();
    const guards = applyGuardRowsChange(
      [{ ...snapshot.guards[0]!, site_code: 'KDY-01' }],
      { indexes: [0], column: { key: 'site_code' } as never },
      snapshot.sites,
      snapshot.headOffice,
    );

    const edited: BulkEditorSnapshot = {
      ...snapshot,
      guards,
      headOffice: applyHeadOfficeRowsChange(snapshot.headOffice, {
        indexes: [0],
        column: { key: 'rank' } as never,
      }),
    };

    const parsed = convertBulkEditorSnapshotToParsedWorkbook(edited);
    const payload = buildBulkEditorExportPayload(edited);

    expect(parsed.multiSheetFormat).toBe(true);
    expect(parsed.rows.some((row) => String(row.assigned_sm_epf) === 'SM-100')).toBe(true);
    expect(validateBulkImport(parsed, payload.rankMatrix)).toEqual([]);
    expect(validateBulkEditorSnapshot(edited)).toEqual([]);
  });
});
