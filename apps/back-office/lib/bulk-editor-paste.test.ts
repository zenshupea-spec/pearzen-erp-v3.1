import { describe, expect, it } from 'vitest';

import {
  applyBulkEditorPaste,
  formatBulkEditorPasteMessage,
  getPasteTargetColumns,
  isBulkEditorCellPasteable,
  parseClipboardGrid,
  resolvePasteStartColumn,
} from './bulk-editor-paste';
import { WEB_EDITOR_GUARD_COLUMNS } from './bulk-roster-web-editor-spec';
import { createEmptyEditorRow } from './bulk-roster-web-editor-state';

describe('bulk-editor-paste', () => {
  it('parses TSV clipboard rows', () => {
    expect(parseClipboardGrid('A\tB\nC\tD')).toEqual([
      ['A', 'B'],
      ['C', 'D'],
    ]);
  });

  it('parses single-column paste (50 names)', () => {
    const names = Array.from({ length: 50 }, (_, i) => `GUARD ${i + 1}`).join('\n');
    const grid = parseClipboardGrid(names);
    expect(grid).toHaveLength(50);
    expect(grid[0]).toEqual(['GUARD 1']);
    expect(grid[49]).toEqual(['GUARD 50']);
  });

  it('maps pasted columns left-to-right from active column', () => {
    const targets = getPasteTargetColumns(['emp_number', 'full_name', 'nic'], 'full_name');
    expect(targets).toEqual(['full_name', 'nic']);
  });

  it('falls back to first data column when UI column selected', () => {
    expect(resolvePasteStartColumn('__row_num', ['emp_number', 'full_name'])).toBe('emp_number');
  });

  it('pastes into rows and expands when paste exceeds grid', () => {
    const rows = [{ _rowId: '1', emp_number: '', full_name: '', nic: '' }];
    const clipboard = ['G-001', 'PERERA K.', '199412345678'].join('\t') + '\n' +
      ['G-002', 'SILVA M.', '198812345678'].join('\t');

    const result = applyBulkEditorPaste({
      tabId: 'guard',
      columnKeys: ['emp_number', 'full_name', 'nic'],
      rows,
      startRowIdx: 0,
      startColumnKey: 'emp_number',
      clipboardText: clipboard,
      createRow: () => createEmptyEditorRow(WEB_EDITOR_GUARD_COLUMNS),
      headOfficeRows: [],
      siteRows: [],
    });

    expect(result.pastedRows).toBe(2);
    expect(result.pastedColumns).toBe(3);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]?.emp_number).toBe('G-001');
    expect(result.rows[0]?.full_name).toBe('PERERA K.');
    expect(result.rows[1]?.emp_number).toBe('G-002');
    expect(result.rows[1]?.corporate_group).toBe('GUARD');
  });

  it('skips read-only rank_id and locked rank cells', () => {
    const rows = [
      { _rowId: '1', rank_id: 'rp-md', rank_code: 'MD', rank_title: 'Managing Director' },
    ];
    const result = applyBulkEditorPaste({
      tabId: 'ranks',
      columnKeys: ['rank_id', 'rank_code', 'rank_title', 'basic_pay_lkr'],
      rows,
      startRowIdx: 0,
      startColumnKey: 'rank_code',
      clipboardText: 'HACK\tHacked title\t99999',
      createRow: () => ({ _rowId: 'new:1', rank_code: '', rank_title: '' }),
    });

    expect(result.rows[0]?.rank_code).toBe('MD');
    expect(result.rows[0]?.rank_title).toBe('Managing Director');
  });

  it('blocks sector_name paste on non-SM Head Office rows', () => {
    const rows = [{ _rowId: '1', rank: 'GAD', sector_name: '' }];
    const result = applyBulkEditorPaste({
      tabId: 'head_office',
      columnKeys: ['rank', 'sector_name'],
      rows,
      startRowIdx: 0,
      startColumnKey: 'sector_name',
      clipboardText: 'COLOMBO 1',
      createRow: () => ({ _rowId: 'new:1', rank: 'GAD' }),
    });

    expect(result.rows[0]?.sector_name).toBe('');
  });

  it('formats paste toast message', () => {
    expect(formatBulkEditorPasteMessage(50, 1)).toBe('Pasted 50 rows × 1 column');
    expect(formatBulkEditorPasteMessage(1, 3)).toBe('Pasted 1 row × 3 columns');
  });

  it('detects pasteable HO sector cell for SM rows', () => {
    expect(isBulkEditorCellPasteable('head_office', { _rowId: '1', rank: 'SM' }, 'sector_name')).toBe(
      true,
    );
    expect(isBulkEditorCellPasteable('head_office', { _rowId: '1', rank: 'GAD' }, 'sector_name')).toBe(
      false,
    );
  });
});
