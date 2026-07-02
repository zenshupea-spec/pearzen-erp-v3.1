import { describe, expect, it } from 'vitest';

import {
  applyRanksRowsChange,
  createRankEditorRow,
  findDuplicateRankCodeRowIds,
  isRankCodeEditable,
  isRankFieldEditable,
  isRankRowLocked,
} from './bulk-editor-ranks-grid';

describe('bulk-editor-ranks-grid', () => {
  it('creates a new rank row with template defaults', () => {
    const row = createRankEditorRow();
    expect(row.salary_type).toBe('BANK');
    expect(row.operational_group).toBe('GUARD_FIELD');
    expect(row.basic_pay_lkr).toBe('0');
    expect(isRankCodeEditable(row)).toBe(true);
  });

  it('locks MD, OD, FM, and SM system ranks', () => {
    for (const code of ['MD', 'OD', 'FM', 'SM']) {
      const row = { _rowId: code, rank_id: `rp-${code}`, rank_code: code };
      expect(isRankRowLocked(row)).toBe(true);
      expect(isRankFieldEditable(row, 'rank_title')).toBe(false);
      expect(isRankCodeEditable(row)).toBe(false);
    }
  });

  it('allows editing title on existing non-locked ranks but not rank_code', () => {
    const row = { _rowId: '1', rank_id: 'rp-1', rank_code: 'JSO', rank_title: 'Junior SO' };
    expect(isRankCodeEditable(row)).toBe(false);
    expect(isRankFieldEditable(row, 'rank_title')).toBe(true);
    expect(isRankFieldEditable(row, 'basic_pay_lkr')).toBe(true);
  });

  it('flags duplicate rank_code rows', () => {
    const duplicates = findDuplicateRankCodeRowIds([
      { _rowId: 'a', rank_code: 'OIC' },
      { _rowId: 'b', rank_code: 'oic' },
      { _rowId: 'c', rank_code: 'JSO' },
    ]);
    expect(duplicates.has('a')).toBe(true);
    expect(duplicates.has('b')).toBe(true);
    expect(duplicates.has('c')).toBe(false);
  });

  it('uppercases rank_code on change', () => {
    const next = applyRanksRowsChange(
      [{ _rowId: 'new:1', rank_code: 'sup' }],
      { indexes: [0], column: { key: 'rank_code' } as never },
    );
    expect(next[0]?.rank_code).toBe('SUP');
  });

  it('normalizes basic_pay_lkr to numeric string', () => {
    const next = applyRanksRowsChange(
      [{ _rowId: 'new:1', basic_pay_lkr: '42,000.50' }],
      { indexes: [0], column: { key: 'basic_pay_lkr' } as never },
    );
    expect(next[0]?.basic_pay_lkr).toBe('42000.50');
  });
});
