import { describe, expect, it } from 'vitest';

import {
  GUARD_SM_AUTO_FLAG,
  applyGuardRowsChange,
  createGuardEditorRow,
  isGuardSmAutoAssigned,
} from './bulk-editor-guard-grid';
import { WEB_EDITOR_SECTOR_NAME_COLUMN } from './bulk-roster-web-editor-spec';

describe('bulk-editor-guard-grid', () => {
  const headOffice = [
    {
      _rowId: 'sm1',
      rank: 'SM',
      epf_no: 'SM-100',
      [WEB_EDITOR_SECTOR_NAME_COLUMN]: 'KANDY',
    },
  ];

  const sites = [
    {
      _rowId: 's1',
      site_code: 'KDY-01',
      site_name: 'Kandy Site',
      assigned_sm_epf: '',
      [WEB_EDITOR_SECTOR_NAME_COLUMN]: 'KANDY',
    },
  ];

  it('creates a guard row with template defaults', () => {
    const row = createGuardEditorRow();
    expect(row.corporate_group).toBe('GUARD');
    expect(row.status).toBe('ACTIVE');
    expect(row.rank).toBe('JSO');
    expect(row.rank_operational_group).toBe('GUARD');
  });

  it('auto-fills assigned_sm_epf when site_code changes', () => {
    const rows = [{ _rowId: 'g1', site_code: '', assigned_sm_epf: '' }];
    const next = applyGuardRowsChange(
      [{ ...rows[0]!, site_code: 'KDY-01' }],
      { indexes: [0], column: { key: 'site_code' } as never },
      sites,
      headOffice,
    );
    expect(next[0]?.assigned_sm_epf).toBe('SM-100');
    expect(next[0]?.[GUARD_SM_AUTO_FLAG]).toBe('true');
    expect(isGuardSmAutoAssigned(next[0]!)).toBe(true);
  });

  it('prefers site assigned_sm_epf over sector SM match', () => {
    const sitesWithDirectSm = [
      {
        _rowId: 's1',
        site_code: 'LKH001',
        site_name: 'Lake Hotel',
        assigned_sm_epf: '13650',
        [WEB_EDITOR_SECTOR_NAME_COLUMN]: 'KANDY',
      },
    ];
    const rows = [{ _rowId: 'g1', site_code: '', assigned_sm_epf: '' }];
    const next = applyGuardRowsChange(
      [{ ...rows[0]!, site_code: 'LKH001' }],
      { indexes: [0], column: { key: 'site_code' } as never },
      sitesWithDirectSm,
      headOffice,
    );
    expect(next[0]?.assigned_sm_epf).toBe('13650');
    expect(next[0]?.[GUARD_SM_AUTO_FLAG]).toBe('true');
  });

  it('clears auto badge on manual SM override', () => {
    const rows = [
      {
        _rowId: 'g1',
        site_code: 'KDY-01',
        assigned_sm_epf: 'SM-100',
        [GUARD_SM_AUTO_FLAG]: 'true',
      },
    ];
    const next = applyGuardRowsChange(
      [{ ...rows[0]!, assigned_sm_epf: 'SM-999' }],
      { indexes: [0], column: { key: 'assigned_sm_epf' } as never },
      sites,
      headOffice,
    );
    expect(next[0]?.assigned_sm_epf).toBe('SM-999');
    expect(next[0]?.[GUARD_SM_AUTO_FLAG]).toBe('');
    expect(isGuardSmAutoAssigned(next[0]!)).toBe(false);
  });

  it('clears SM when site_code is cleared', () => {
    const rows = [
      {
        _rowId: 'g1',
        site_code: 'KDY-01',
        assigned_sm_epf: 'SM-100',
        [GUARD_SM_AUTO_FLAG]: 'true',
      },
    ];
    const next = applyGuardRowsChange(
      [{ ...rows[0]!, site_code: '' }],
      { indexes: [0], column: { key: 'site_code' } as never },
      sites,
      headOffice,
    );
    expect(next[0]?.assigned_sm_epf).toBe('');
    expect(next[0]?.[GUARD_SM_AUTO_FLAG]).toBe('');
  });
});
