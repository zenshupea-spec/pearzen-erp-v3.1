import { describe, expect, it } from 'vitest';

import {
  applyHeadOfficeRowsChange,
  collectLiveSectorNames,
  headOfficeSectorNameCellClass,
} from './bulk-editor-head-office-grid';
import { WEB_EDITOR_SECTOR_NAME_COLUMN } from './bulk-roster-web-editor-spec';
import type { BulkEditorSnapshot } from './bulk-roster-web-editor-spec';

describe('bulk-editor-head-office-grid', () => {
  it('clears sector_name when rank changes away from SM', () => {
    const rows = [
      {
        _rowId: '1',
        rank: 'GAD',
        [WEB_EDITOR_SECTOR_NAME_COLUMN]: 'COLOMBO 1',
      },
    ];
    const next = applyHeadOfficeRowsChange(rows, {
      indexes: [0],
      column: { key: 'rank' } as never,
    });
    expect(next[0]?.[WEB_EDITOR_SECTOR_NAME_COLUMN]).toBe('');
  });

  it('keeps sector_name when rank stays SM', () => {
    const rows = [
      {
        _rowId: '1',
        rank: 'SM',
        [WEB_EDITOR_SECTOR_NAME_COLUMN]: 'KANDY',
      },
    ];
    const next = applyHeadOfficeRowsChange(rows, {
      indexes: [0],
      column: { key: 'rank' } as never,
    });
    expect(next[0]?.[WEB_EDITOR_SECTOR_NAME_COLUMN]).toBe('KANDY');
  });

  it('merges live sector names from SM rows', () => {
    const snapshot: BulkEditorSnapshot = {
      headOffice: [{ _rowId: 'sm1', rank: 'SM', sector_name: 'GALLE' }],
      cafe: [],
      sites: [],
      guards: [],
      ranks: [],
      sectorNames: ['COLOMBO 1'],
      savedAt: new Date().toISOString(),
    };
    expect(collectLiveSectorNames(snapshot)).toContain('COLOMBO 1');
    expect(collectLiveSectorNames(snapshot)).toContain('GALLE');
  });

  it('marks required sector cell after blur touch', () => {
    const row = { _rowId: 'sm1', rank: 'SM', sector_name: '' };
    expect(headOfficeSectorNameCellClass(row, new Set())).toBe('bulk-editor-sector-pending');
    expect(headOfficeSectorNameCellClass(row, new Set(['sm1']))).toBe('bulk-editor-sector-required');
    expect(headOfficeSectorNameCellClass({ _rowId: '2', rank: 'GAD' }, new Set())).toBe(
      'bulk-editor-sector-inactive',
    );
  });
});
