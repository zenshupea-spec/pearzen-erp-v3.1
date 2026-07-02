import { describe, expect, it } from 'vitest';

import {
  MIGRATION_SHEET_CAFE,
  MIGRATION_SHEET_GUARD,
  MIGRATION_SHEET_HEAD_OFFICE,
  MIGRATION_SHEET_SM,
} from './bulk-data-workbook';
import { splitEmployeesForMigrationExport } from './bulk-data-import';
import {
  buildBulkEditorSnapshot,
  migrationExportRowToBulkEditorRow,
} from './bulk-roster-web-editor-snapshot';
import {
  WEB_EDITOR_HEAD_OFFICE_COLUMNS,
  WEB_EDITOR_SECTOR_NAME_COLUMN,
} from './bulk-roster-web-editor-spec';
import type { RankPayEntry } from '../../../packages/rank-pay-matrix';

const sampleGuard: Record<string, unknown> = {
  employee_id: 'g-1',
  emp_number: 'G001',
  epf_no: 'EPF-G001',
  full_name: 'Guard One',
  nic: '123456789V',
  phone: '0771111111',
  group: 'GUARD',
  rank: 'JSO',
  status: 'ACTIVE',
  site_code: 'S1',
  assigned_sm_epf: 'EPF-SM1',
};

const sampleHoSm: Record<string, unknown> = {
  employee_id: 'sm-1',
  emp_number: 'SM001',
  epf_no: 'EPF-SM1',
  full_name: 'Sector Manager',
  nic: '987654321V',
  phone: '0772222222',
  group: 'SECTOR_MANAGER',
  rank: 'SM',
  status: 'ACTIVE',
  site_name: 'COLOMBO 1',
};

const sampleHoStaff: Record<string, unknown> = {
  employee_id: 'ho-1',
  emp_number: 'HO001',
  epf_no: 'EPF-HO1',
  full_name: 'HR Admin',
  group: 'HEAD_OFFICE',
  rank: 'GAD',
  status: 'ACTIVE',
};

const sampleSite: Record<string, unknown> = {
  site_code: 'S1',
  site_name: 'Client Site Alpha',
  site_type: 'BANK',
  site_status: 'ACTIVE',
  assigned_sm_epf: 'EPF-SM1',
};

const rankMatrix: RankPayEntry[] = [
  {
    id: 'rp-oic',
    rankCode: 'OIC',
    fullTitle: 'OFFICER IN CHARGE',
    basicPay: 33000,
    annualIncrement: 1800,
    salaryType: 'BANK',
    operationalGroup: 'GUARD_FIELD',
  },
];

describe('bulk-roster-web-editor-snapshot', () => {
  it('maps SM export rows onto Head Office with sector_name', () => {
    const snapshot = buildBulkEditorSnapshot({
      employees: [sampleHoSm, sampleHoStaff, sampleGuard],
      sites: [sampleSite],
      rankMatrix,
      sectorNamesFromSettings: ['KANDY'],
    });

    expect(snapshot.headOffice).toHaveLength(2);
    const smRow = snapshot.headOffice.find((row) => row.epf_no === 'EPF-SM1');
    expect(smRow?.rank).toBe('SM');
    expect(smRow?.[WEB_EDITOR_SECTOR_NAME_COLUMN]).toBe('COLOMBO 1');
    expect(snapshot.guards).toHaveLength(1);
    expect(snapshot.cafe).toHaveLength(0);
  });

  it('derives site sector_name from assigned SM', () => {
    const snapshot = buildBulkEditorSnapshot({
      employees: [sampleHoSm, sampleGuard],
      sites: [sampleSite],
      rankMatrix,
      sectorNamesFromSettings: [],
    });

    expect(snapshot.sites[0]?.[WEB_EDITOR_SECTOR_NAME_COLUMN]).toBe('COLOMBO 1');
  });

  it('merges sector names from settings and SM rows', () => {
    const snapshot = buildBulkEditorSnapshot({
      employees: [sampleHoSm],
      sites: [],
      rankMatrix,
      sectorNamesFromSettings: ['MATARA', 'GALLE'],
    });

    expect(snapshot.sectorNames).toContain('COLOMBO 1');
    expect(snapshot.sectorNames).toContain('MATARA');
    expect(snapshot.sectorNames).toContain('GALLE');
  });

  it('maps rank matrix to ranks tab rows', () => {
    const snapshot = buildBulkEditorSnapshot({
      employees: [],
      sites: [],
      rankMatrix,
      sectorNamesFromSettings: [],
    });

    expect(snapshot.ranks).toHaveLength(1);
    expect(snapshot.ranks[0]?.rank_code).toBe('OIC');
    expect(snapshot.ranks[0]?.basic_pay_lkr).toBe('33000');
  });

  it('migrationExportRowToBulkEditorRow stringifies cell values', () => {
    const row = migrationExportRowToBulkEditorRow(
      { emp_number: 42, full_name: 'Test', empty: null },
      WEB_EDITOR_HEAD_OFFICE_COLUMNS,
      'row-1',
    );
    expect(row._rowId).toBe('row-1');
    expect(row.emp_number).toBe('42');
    expect(row.full_name).toBe('Test');
  });

  it('aligns with migration export bucket split', () => {
    const employees = [sampleHoSm, sampleHoStaff, sampleGuard];
    const buckets = splitEmployeesForMigrationExport(employees, [sampleSite]);
    expect(buckets[MIGRATION_SHEET_SM]).toHaveLength(1);
    expect(buckets[MIGRATION_SHEET_HEAD_OFFICE]).toHaveLength(1);
    expect(buckets[MIGRATION_SHEET_GUARD]).toHaveLength(1);
    expect(buckets[MIGRATION_SHEET_CAFE]).toHaveLength(0);
  });
});
