import { describe, expect, it } from 'vitest';

import type { RankPayEntry } from '../../../packages/rank-pay-matrix';
import {
  computeMnrPersonnelCounts,
  isOperationalActive,
  isOperationalInactive,
  matchesMnrPersonnelFilter,
  type MnrRosterSummaryRow,
} from './mnr-operational-buckets';

const EMPTY_MATRIX: RankPayEntry[] = [];

function row(partial: Partial<MnrRosterSummaryRow> & { id: string }): MnrRosterSummaryRow {
  return {
    status: 'ACTIVE',
    ...partial,
  };
}

describe('mnr-operational-buckets — sector managers', () => {
  it('counts legacy SECTOR_MANAGER + SM rank as operational active', () => {
    const emp = row({
      id: 'sm-legacy',
      full_name: 'ROY',
      emp_number: '446',
      group: 'SECTOR_MANAGER',
      rank: 'SM',
    });
    expect(isOperationalActive(emp, EMPTY_MATRIX)).toBe(true);
    expect(matchesMnrPersonnelFilter(emp, 'ACTIVE', EMPTY_MATRIX)).toBe(true);
  });

  it('counts HEAD_OFFICE + SM rank as operational active', () => {
    const emp = row({
      id: 'sm-modern',
      full_name: 'PATHIRAJ',
      emp_number: '125',
      group: 'HEAD_OFFICE',
      rank: 'SM',
    });
    expect(isOperationalActive(emp, EMPTY_MATRIX)).toBe(true);
    expect(matchesMnrPersonnelFilter(emp, 'ACTIVE', EMPTY_MATRIX)).toBe(true);
  });

  it('keeps active guard on RESERVE as operational inactive (regression)', () => {
    const emp = row({
      id: 'guard-reserve',
      full_name: 'BENCH GUARD',
      group: 'GUARD',
      rank: 'CSO',
      site: 'RESERVE',
    });
    expect(isOperationalActive(emp, EMPTY_MATRIX)).toBe(false);
    expect(isOperationalInactive(emp, EMPTY_MATRIX)).toBe(true);
  });

  it('includes both SM shapes in active personnel counts', () => {
    const rows = [
      row({ id: 'sm-legacy', group: 'SECTOR_MANAGER', rank: 'SM' }),
      row({ id: 'sm-modern', group: 'HEAD_OFFICE', rank: 'SM' }),
      row({ id: 'guard-reserve', group: 'GUARD', rank: 'CSO', site: 'RESERVE' }),
    ];
    const counts = computeMnrPersonnelCounts(rows, EMPTY_MATRIX, false);
    expect(counts.active).toBe(2);
    expect(counts.inactive).toBe(1);
  });
});
