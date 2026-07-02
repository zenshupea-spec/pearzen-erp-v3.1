import { describe, expect, it } from 'vitest';

import {
  buildSmEpfToSectorMap,
  collectSiteCodeOptions,
  collectSmEpfOptions,
  deriveGuardAssignedSm,
  findSmEpfForSector,
  normalizeSiteCode,
  resolveSiteName,
} from './bulk-editor-cross-sheet';
import { WEB_EDITOR_SECTOR_NAME_COLUMN } from './bulk-roster-web-editor-spec';

describe('bulk-editor-cross-sheet', () => {
  it('collects SM EPF options from Head Office rows', () => {
    const epfs = collectSmEpfOptions([
      { _rowId: '1', rank: 'SM', epf_no: 'sm-002' },
      { _rowId: '2', rank: 'GAD', epf_no: 'gad-001' },
      { _rowId: '3', rank: 'SM', epf_no: 'SM-001' },
    ]);
    expect(epfs).toEqual(['SM-001', 'SM-002']);
  });

  it('builds SM EPF → sector map', () => {
    const map = buildSmEpfToSectorMap([
      {
        _rowId: '1',
        rank: 'SM',
        epf_no: 'SM-001',
        [WEB_EDITOR_SECTOR_NAME_COLUMN]: 'Colombo 1',
      },
    ]);
    expect(map.get('SM-001')).toBe('COLOMBO 1');
  });

  it('collects live site codes for Guard dropdowns', () => {
    const codes = collectSiteCodeOptions([
      { _rowId: '1', site_code: 'site-b' },
      { _rowId: '2', site_code: 'SITE-A' },
      { _rowId: '3', site_code: '' },
    ]);
    expect(codes).toEqual(['SITE-A', 'SITE-B']);
  });

  it('normalizes site codes to uppercase trimmed', () => {
    expect(normalizeSiteCode('  abc-01  ')).toBe('ABC-01');
  });
});

describe('bulk-editor-cross-sheet guard derivation', () => {
  const headOffice = [
    {
      _rowId: 'sm1',
      rank: 'SM',
      epf_no: 'SM-100',
      [WEB_EDITOR_SECTOR_NAME_COLUMN]: 'KANDY',
    },
    {
      _rowId: 'sm2',
      rank: 'SM',
      epf_no: 'SM-200',
      [WEB_EDITOR_SECTOR_NAME_COLUMN]: 'COLOMBO 1',
    },
  ];

  it('uses site assigned_sm_epf when set', () => {
    const sites = [
      {
        _rowId: 's1',
        site_code: 'LKH001',
        assigned_sm_epf: '13650',
        [WEB_EDITOR_SECTOR_NAME_COLUMN]: 'KANDY',
      },
    ];
    expect(deriveGuardAssignedSm('LKH001', sites, headOffice)).toBe('13650');
  });

  it('falls back to SM matching site sector_name', () => {
    const sites = [
      {
        _rowId: 's1',
        site_code: 'KDY-01',
        assigned_sm_epf: '',
        [WEB_EDITOR_SECTOR_NAME_COLUMN]: 'Kandy',
      },
    ];
    expect(deriveGuardAssignedSm('kdy-01', sites, headOffice)).toBe('SM-100');
  });

  it('finds SM EPF by sector', () => {
    expect(findSmEpfForSector(headOffice, 'colombo 1')).toBe('SM-200');
  });

  it('resolves site_name from Sites tab', () => {
    const sites = [{ _rowId: 's1', site_code: 'LKH001', site_name: 'Lake View Hotel' }];
    expect(resolveSiteName('lkh001', sites)).toBe('Lake View Hotel');
  });
});
