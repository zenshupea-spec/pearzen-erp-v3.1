/**
 * Step 19 — staging verification checklist (automated pre-checks).
 * Manual pass: audit-evidence/cvs/bulk-roster-web-editor-staging-verification.md
 */

import { describe, expect, it } from 'vitest';

import { collectSiteCodeOptions } from './bulk-editor-cross-sheet';
import { applyGuardRowsChange, createGuardEditorRow } from './bulk-editor-guard-grid';
import { createSitesEditorRow } from './bulk-editor-sites-grid';
import { applyBulkEditorPaste } from './bulk-editor-paste';
import { validateBulkImport } from './bulk-data-import';
import { buildBulkEditorExportPayload } from './bulk-roster-web-editor-export';
import { buildBulkEditorSnapshot } from './bulk-roster-web-editor-snapshot';
import {
  WEB_EDITOR_GUARD_COLUMNS,
  WEB_EDITOR_SECTOR_NAME_COLUMN,
  type BulkEditorSnapshot,
} from './bulk-roster-web-editor-spec';
import { createEmptyEditorRow } from './bulk-roster-web-editor-state';
import { validateBulkEditorSnapshot } from './bulk-editor-validation';
import { DEFAULT_RANK_PAY_MATRIX } from '../../../packages/rank-pay-matrix';

function stagingBaseEmployees(): Record<string, unknown>[] {
  return [
    {
      employee_id: 'md-1',
      emp_number: 'MD001',
      epf_no: 'EPF-MD',
      full_name: 'MANAGING DIRECTOR',
      group: 'HEAD_OFFICE',
      rank: 'MD',
      status: 'ACTIVE',
    },
    {
      employee_id: 'od-1',
      emp_number: 'OD001',
      epf_no: 'EPF-OD',
      full_name: 'OPERATIONS DIRECTOR',
      group: 'HEAD_OFFICE',
      rank: 'OD',
      status: 'ACTIVE',
    },
    {
      employee_id: 'fm-1',
      emp_number: 'FM001',
      epf_no: 'EPF-FM',
      full_name: 'FINANCE MANAGER',
      group: 'HEAD_OFFICE',
      rank: 'FM',
      status: 'ACTIVE',
    },
    {
      employee_id: 'gad-1',
      emp_number: 'HO001',
      epf_no: 'EPF-HO1',
      full_name: 'HR ADMIN',
      nic: '198011111111',
      phone: '+94771111111',
      group: 'HEAD_OFFICE',
      rank: 'GAD',
      rank_title: 'GROUP ADMIN',
      rank_basic_pay: 45000,
      rank_salary_type: 'BANK',
      rank_operational_group: 'HEAD_OFFICE',
      status: 'ACTIVE',
    },
    {
      employee_id: 'sm-1',
      emp_number: 'SM001',
      epf_no: 'SM-100',
      full_name: 'SECTOR MANAGER KANDY',
      nic: '198012345678',
      phone: '+94772222222',
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
      site_code: 'KDY-01',
      assigned_sm_epf: 'SM-100',
    },
  ];
}

function stagingBaseSites(): Record<string, unknown>[] {
  return [
    {
      site_code: 'KDY-01',
      site_name: 'Kandy Client Site',
      site_type: 'OTHER',
      site_status: 'ACTIVE',
      assigned_sm_epf: '',
      sector_name: 'KANDY',
    },
    {
      site_code: 'CMB-02',
      site_name: 'Colombo Client Site',
      site_type: 'OTHER',
      site_status: 'ACTIVE',
      assigned_sm_epf: '',
      sector_name: 'COLOMBO 1',
    },
  ];
}

function loadStagingSnapshot(): BulkEditorSnapshot {
  return buildBulkEditorSnapshot({
    employees: stagingBaseEmployees(),
    sites: stagingBaseSites(),
    rankMatrix: DEFAULT_RANK_PAY_MATRIX,
    sectorNamesFromSettings: ['KANDY', 'COLOMBO 1'],
  });
}

function allWorkforceRanks(snapshot: BulkEditorSnapshot): string[] {
  return [...snapshot.headOffice, ...snapshot.cafe, ...snapshot.guards].map((row) =>
    String(row.rank ?? '').toUpperCase(),
  );
}

describe('bulk roster web editor staging verification (step 19)', () => {
  it('19.1 — editor load excludes MD, OD, and FM executive ranks', () => {
    const snapshot = loadStagingSnapshot();
    const ranks = allWorkforceRanks(snapshot);

    expect(ranks).not.toContain('MD');
    expect(ranks).not.toContain('OD');
    expect(ranks).not.toContain('FM');
    expect(snapshot.headOffice.some((row) => row.emp_number === 'HO001')).toBe(true);
    expect(snapshot.headOffice.some((row) => row.rank === 'SM')).toBe(true);
    expect(snapshot.guards.some((row) => row.emp_number === 'G-001')).toBe(true);
  });

  it('19.2 — two newly added sites appear in Guard site_code dropdown', () => {
    const snapshot = loadStagingSnapshot();
    const siteA = createSitesEditorRow();
    siteA.site_code = 'STG-A';
    siteA.site_name = 'Staging Site Alpha';
    const siteB = createSitesEditorRow();
    siteB.site_code = 'STG-B';
    siteB.site_name = 'Staging Site Beta';

    const codes = collectSiteCodeOptions([...snapshot.sites, siteA, siteB]);
    expect(codes).toContain('STG-A');
    expect(codes).toContain('STG-B');
    expect(codes).toContain('KDY-01');
    expect(codes).toContain('CMB-02');
  });

  it('19.3 — HO SM with sector auto-links guard at matching site sector', () => {
    const snapshot = loadStagingSnapshot();
    const guard = createGuardEditorRow();
    guard.emp_number = 'G-NEW';
    guard.epf_no = '99999';
    guard.full_name = 'NEW GUARD';
    guard.nic = '199512345678';
    guard.phone = '+94773333333';

    const linked = applyGuardRowsChange(
      [{ ...guard, site_code: 'KDY-01' }],
      { indexes: [0], column: { key: 'site_code' } as never },
      snapshot.sites,
      snapshot.headOffice,
    );

    expect(linked[0]?.assigned_sm_epf).toBe('SM-100');
    expect(
      snapshot.headOffice.find((row) => row.rank === 'SM')?.[WEB_EDITOR_SECTOR_NAME_COLUMN],
    ).toBe('KANDY');
  });

  it('19.4 — paste legacy single column (10 guards) expands grid', () => {
    const snapshot = loadStagingSnapshot();
    const clipboard = Array.from({ length: 10 }, (_, i) => `LEGACY GUARD ${i + 1}`).join('\n');

    const pasteResult = applyBulkEditorPaste({
      tabId: 'guard',
      columnKeys: ['full_name'],
      rows: [...snapshot.guards],
      startRowIdx: 0,
      startColumnKey: 'full_name',
      clipboardText: clipboard,
      createRow: () => createEmptyEditorRow(WEB_EDITOR_GUARD_COLUMNS),
      headOfficeRows: snapshot.headOffice,
      siteRows: snapshot.sites,
    });

    expect(pasteResult.pastedRows).toBe(10);
    expect(pasteResult.rows).toHaveLength(10);
    expect(pasteResult.rows[9]?.full_name).toBe('LEGACY GUARD 10');
  });

  it('19.5 — re-open round-trip preserves edited guard fields', () => {
    const snapshot = loadStagingSnapshot();
    const editedGuards = snapshot.guards.map((row) =>
      row.emp_number === 'G-001'
        ? { ...row, full_name: 'PERERA K. (EDITED)', site_code: 'KDY-01', assigned_sm_epf: 'SM-100' }
        : row,
    );

    const edited: BulkEditorSnapshot = { ...snapshot, guards: editedGuards };
    const payload = buildBulkEditorExportPayload(edited);

    const reloaded = buildBulkEditorSnapshot({
      employees: payload.parsed.rows,
      sites: payload.parsed.siteRows ?? [],
      rankMatrix: payload.rankMatrix,
      sectorNamesFromSettings: edited.sectorNames,
    });

    const guard = reloaded.guards.find((row) => row.emp_number === 'G-001');
    expect(guard?.full_name).toBe('PERERA K. (EDITED)');
    expect(guard?.site_code).toBe('KDY-01');
    expect(guard?.assigned_sm_epf).toBe('SM-100');
  });

  it('19.6 — staging bundle passes validate before apply (MNR-ready fields)', () => {
    const snapshot = loadStagingSnapshot();
    const guards = Array.from({ length: 10 }, (_, i) => {
      const row = createGuardEditorRow();
      const n = i + 1;
      row.emp_number = `STG-G-${String(n).padStart(2, '0')}`;
      row.epf_no = `991${String(n).padStart(2, '0')}`;
      row.full_name = `STAGING GUARD ${n}`;
      row.nic = `1990${String(n).padStart(6, '0')}678`;
      row.phone = `+9477${String(n).padStart(7, '0')}`;
      row.site_code = n <= 5 ? 'KDY-01' : 'CMB-02';
      row.assigned_sm_epf = 'SM-100';
      return row;
    });

    const edited: BulkEditorSnapshot = {
      ...snapshot,
      guards: [...snapshot.guards, ...guards],
    };

    const payload = buildBulkEditorExportPayload(edited);
    expect(validateBulkImport(payload.parsed, payload.rankMatrix)).toEqual([]);
    expect(validateBulkEditorSnapshot(edited)).toEqual([]);
  });
});
