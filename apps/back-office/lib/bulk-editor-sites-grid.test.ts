import { describe, expect, it } from 'vitest';

import {
  applySitesRowsChange,
  createSitesEditorRow,
  findDuplicateSiteCodeRowIds,
  siteCodeCellClass,
} from './bulk-editor-sites-grid';
import { WEB_EDITOR_SECTOR_NAME_COLUMN } from './bulk-roster-web-editor-spec';

describe('bulk-editor-sites-grid', () => {
  it('creates a sites row with template defaults', () => {
    const row = createSitesEditorRow();
    expect(row.site_type).toBe('OTHER');
    expect(row.site_status).toBe('ACTIVE');
    expect(row.verification_mode).toBe('B');
    expect(row.required_guards).toBe('1');
  });

  it('flags duplicate site_code rows', () => {
    const duplicates = findDuplicateSiteCodeRowIds([
      { _rowId: 'a', site_code: 'SITE-01' },
      { _rowId: 'b', site_code: 'site-01' },
      { _rowId: 'c', site_code: 'SITE-02' },
    ]);
    expect(duplicates.has('a')).toBe(true);
    expect(duplicates.has('b')).toBe(true);
    expect(duplicates.has('c')).toBe(false);
  });

  it('marks duplicate site_code cells red', () => {
    const duplicates = new Set(['a']);
    expect(siteCodeCellClass({ _rowId: 'a', site_code: 'X' }, duplicates)).toBe(
      'bulk-editor-site-code-duplicate',
    );
    expect(siteCodeCellClass({ _rowId: 'b', site_code: 'X' }, duplicates)).toBe('');
  });

  it('auto-fills sector_name when assigned_sm_epf is set', () => {
    const headOffice = [
      {
        _rowId: 'sm1',
        rank: 'SM',
        epf_no: 'SM-100',
        [WEB_EDITOR_SECTOR_NAME_COLUMN]: 'KANDY',
      },
    ];
    const rows = [{ _rowId: 's1', site_code: 'KDY-01', assigned_sm_epf: 'SM-100' }];
    const next = applySitesRowsChange(rows, {
      indexes: [0],
      column: { key: 'assigned_sm_epf' } as never,
    }, headOffice);
    expect(next[0]?.[WEB_EDITOR_SECTOR_NAME_COLUMN]).toBe('KANDY');
  });

  it('uppercases site_code on change', () => {
    const next = applySitesRowsChange(
      [{ _rowId: 's1', site_code: 'abc-01' }],
      { indexes: [0], column: { key: 'site_code' } as never },
      [],
    );
    expect(next[0]?.site_code).toBe('ABC-01');
  });
});
