import { describe, expect, it } from 'vitest';

import {
  DEFAULT_RANK_PAY_MATRIX,
  mergeRankOptionsForCorporateGroup,
  ranksForHeadOfficeHrAssignmentSelect,
  ranksForHrAssignmentSelect,
  ranksForHrRankPickerOptions,
  isHrRankSelectableInPicker,
  isRankValidForHrAssignment,
  isSingletonHrAssignablePortalRank,
  SINGLETON_HR_ASSIGNABLE_PORTAL_RANKS,
  type RankPayEntry,
} from './index';

const hoMatrix: RankPayEntry[] = [
  {
    id: 'ho-gad',
    rankCode: 'GAD',
    fullTitle: 'GENERAL ADMIN',
    basicPay: 0,
    annualIncrement: 0,
    salaryType: 'BANK',
    operationalGroup: 'HEAD_OFFICE',
  },
  {
    id: 'ho-hra',
    rankCode: 'HRA',
    fullTitle: 'HRA',
    basicPay: 0,
    annualIncrement: 0,
    salaryType: 'BANK',
    operationalGroup: 'HEAD_OFFICE',
  },
  {
    id: 'ho-sm',
    rankCode: 'SM',
    fullTitle: 'SECTOR MANAGER',
    basicPay: 0,
    annualIncrement: 0,
    salaryType: 'BANK',
    operationalGroup: 'SECTOR_MANAGER',
  },
  {
    id: 'ho-fm',
    rankCode: 'FM',
    fullTitle: 'FINANCE MANAGER',
    basicPay: 0,
    annualIncrement: 0,
    salaryType: 'BANK',
    operationalGroup: 'HEAD_OFFICE',
  },
  ...DEFAULT_RANK_PAY_MATRIX.filter((entry) => entry.rankCode === 'CSO'),
];

describe('SINGLETON_HR_ASSIGNABLE_PORTAL_RANKS', () => {
  it('includes MD, OD, and FM', () => {
    expect(SINGLETON_HR_ASSIGNABLE_PORTAL_RANKS).toEqual(['MD', 'OD', 'FM']);
    expect(isSingletonHrAssignablePortalRank('fm')).toBe(true);
    expect(isSingletonHrAssignablePortalRank('GAD')).toBe(false);
  });
});

describe('ranksForHrAssignmentSelect', () => {
  it('returns only saved matrix ranks for the corporate group', () => {
    const selected = ranksForHrAssignmentSelect(hoMatrix, 'HEAD_OFFICE');
    expect(selected.map((entry) => entry.rankCode)).toEqual(['GAD', 'HRA', 'SM']);
  });

  it('includes SM via ranksForHeadOfficeHrAssignmentSelect even when SM missing from saved matrix', () => {
    const withoutSm = hoMatrix.filter((entry) => entry.rankCode !== 'SM');
    const selected = ranksForHeadOfficeHrAssignmentSelect(withoutSm).map(
      (entry) => entry.rankCode,
    );
    expect(selected).toContain('SM');
    expect(selected).toContain('GAD');
    expect(selected).not.toContain('FM');
  });

  it('ranksForHrRankPickerOptions mirrors MD Settings Head Office ledger', () => {
    const picker = ranksForHrRankPickerOptions(hoMatrix, 'HEAD_OFFICE').map(
      (entry) => entry.rankCode,
    );
    expect(picker).toEqual(expect.arrayContaining(['GAD', 'HRA', 'SM', 'FM', 'MD', 'OD']));
    expect(isHrRankSelectableInPicker(hoMatrix, 'HEAD_OFFICE', 'SM')).toBe(true);
    expect(isHrRankSelectableInPicker(hoMatrix, 'HEAD_OFFICE', 'FM')).toBe(false);
    expect(isHrRankSelectableInPicker(hoMatrix, 'HEAD_OFFICE', 'MD')).toBe(false);
  });

  it('does not inject default guard ranks or locked MD/OD', () => {
    const merged = mergeRankOptionsForCorporateGroup(hoMatrix, 'HEAD_OFFICE').map(
      (entry) => entry.rankCode,
    );
    const selected = ranksForHrAssignmentSelect(hoMatrix, 'HEAD_OFFICE').map(
      (entry) => entry.rankCode,
    );
    expect(merged).toContain('MD');
    expect(merged).toContain('OD');
    expect(selected).not.toContain('MD');
    expect(selected).not.toContain('OD');
    expect(selected).not.toContain('FM');
    expect(selected).not.toContain('CSO');
  });

  it('returns guard ranks only when present in the saved matrix', () => {
    const guardOnly = hoMatrix.filter((entry) => entry.operationalGroup === 'GUARD_FIELD');
    const selected = ranksForHrAssignmentSelect(guardOnly, 'GUARD').map(
      (entry) => entry.rankCode,
    );
    expect(selected).toEqual(['CSO']);
    expect(
      mergeRankOptionsForCorporateGroup(guardOnly, 'GUARD').map((entry) => entry.rankCode),
    ).toEqual(expect.arrayContaining(['CSO', 'OIC', 'SSO', 'JSO', 'LSO']));
  });

  it('honours excludeRankCodes', () => {
    const selected = ranksForHrAssignmentSelect(hoMatrix, 'HEAD_OFFICE', {
      excludeRankCodes: ['HRA'],
    }).map((entry) => entry.rankCode);
    expect(selected).toEqual(['GAD', 'SM']);
  });

  it('returns empty list for unknown corporate group', () => {
    expect(ranksForHrAssignmentSelect(hoMatrix, 'UNKNOWN')).toEqual([]);
  });
});

describe('isRankValidForHrAssignment', () => {
  it('accepts configured HO ranks and rejects singleton portal ranks', () => {
    expect(isRankValidForHrAssignment(hoMatrix, 'HEAD_OFFICE', 'GAD')).toBe(true);
    expect(isRankValidForHrAssignment(hoMatrix, 'HEAD_OFFICE', 'SM')).toBe(true);
    expect(isRankValidForHrAssignment(hoMatrix, 'HEAD_OFFICE', 'FM')).toBe(false);
    expect(isRankValidForHrAssignment(hoMatrix, 'HEAD_OFFICE', 'MD')).toBe(false);
    expect(isRankValidForHrAssignment(hoMatrix, 'HEAD_OFFICE', 'OD')).toBe(false);
  });

  it('rejects ranks excluded via opts', () => {
    expect(
      isRankValidForHrAssignment(hoMatrix, 'HEAD_OFFICE', 'HRA', {
        excludeRankCodes: ['HRA'],
      }),
    ).toBe(false);
  });
});
