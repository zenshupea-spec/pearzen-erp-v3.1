import { describe, expect, it } from 'vitest';

import {
  ensureLockedExecutiveLedgerRanks,
  isLockedExecutiveLedgerRank,
  sanitizeRankPayMatrixEntries,
  type RankPayEntry,
} from '../../../packages/rank-pay-matrix';

const guardOnly: RankPayEntry[] = [
  {
    id: 'rp-1',
    rankCode: 'OIC',
    fullTitle: 'OFFICER IN CHARGE',
    basicPay: 33000,
    annualIncrement: 1800,
    salaryType: 'BANK',
    operationalGroup: 'GUARD_FIELD',
  },
];

describe('locked executive ledger ranks', () => {
  it('identifies MD and OD as locked', () => {
    expect(isLockedExecutiveLedgerRank('md')).toBe(true);
    expect(isLockedExecutiveLedgerRank('OD')).toBe(true);
    expect(isLockedExecutiveLedgerRank('FM')).toBe(false);
  });

  it('restates MD and OD when missing from a matrix', () => {
    const next = ensureLockedExecutiveLedgerRanks(guardOnly);
    expect(next.some((entry) => entry.rankCode === 'MD')).toBe(true);
    expect(next.some((entry) => entry.rankCode === 'OD')).toBe(true);
    expect(next).toHaveLength(guardOnly.length + 2);
  });

  it('keeps existing MD / OD rows when already present', () => {
    const withMd: RankPayEntry[] = [
      ...guardOnly,
      {
        id: 'custom-md',
        rankCode: 'MD',
        fullTitle: 'CUSTOM MD TITLE',
        basicPay: 0,
        annualIncrement: 0,
        salaryType: 'BANK',
        operationalGroup: 'HEAD_OFFICE',
      },
    ];
    const next = ensureLockedExecutiveLedgerRanks(withMd);
    expect(next.filter((entry) => entry.rankCode === 'MD')).toHaveLength(1);
    expect(next.find((entry) => entry.rankCode === 'MD')?.fullTitle).toBe('CUSTOM MD TITLE');
    expect(next.some((entry) => entry.rankCode === 'OD')).toBe(true);
  });

  it('re-adds MD / OD during sanitize even after delete', () => {
    const withoutExecutives = guardOnly.filter(
      (entry) => !isLockedExecutiveLedgerRank(entry.rankCode),
    );
    const sanitized = sanitizeRankPayMatrixEntries(withoutExecutives);
    expect(sanitized.some((entry) => entry.rankCode === 'MD')).toBe(true);
    expect(sanitized.some((entry) => entry.rankCode === 'OD')).toBe(true);
  });
});
