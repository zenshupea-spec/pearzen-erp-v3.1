import { describe, expect, it } from 'vitest';
import { guardGrossAfterPenaltyShiftOffset, getPenaltyShiftReduction } from './shift-adjustments';

describe('guardGrossAfterPenaltyShiftOffset', () => {
  it('reduces gross by ceil penalty shifts × per-shift rate', () => {
    const result = guardGrossAfterPenaltyShiftOffset(52_000, 26, 5_000);
    expect(result.shiftsReduced).toBe(3);
    expect(result.grossPay).toBe(52_000 - 3 * (52_000 / 26));
  });

  it('returns unchanged gross when no penalty', () => {
    expect(guardGrossAfterPenaltyShiftOffset(52_000, 26, 0)).toEqual({
      grossPay: 52_000,
      shiftsReduced: 0,
      grossReductionLkr: 0,
    });
  });
});

describe('getPenaltyShiftReduction', () => {
  it('excludes penalty from cash but computes shift reduction', () => {
    const result = getPenaltyShiftReduction({
      recordedShiftsAtSite: 20,
      fmShiftDelta: 0,
      shiftAuditLog: [],
      shiftsAtSite: 20,
      totalGross: 40_000,
      deductions: [{ type: 'Penalty', thisMonthAmount: 4_000 }],
      earnings: { crossSiteDistribution: [{ site: 'Site A', shifts: 20 }] },
    });
    expect(result.penaltyAmountLkr).toBe(4_000);
    expect(result.shiftsReduced).toBe(2);
  });
});
