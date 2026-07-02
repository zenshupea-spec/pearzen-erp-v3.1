import { describe, expect, it } from 'vitest';

import { FM_HOLIDAY_CALENDAR_DEFAULTS } from './fm-holiday-calendar';
import {
  aggregateGuardDayTypeQty,
  buildGuardDayTypeBreakdown,
  classifyGuardShiftDate,
  guardFormulaGrossFromShiftDates,
  guardPayslipSiteAllowanceLkr,
} from './guard-shift-day-types';

describe('classifyGuardShiftDate', () => {
  it('classifies poya, weekend, and weekday shifts', () => {
    expect(classifyGuardShiftDate('2026-07-10', FM_HOLIDAY_CALENDAR_DEFAULTS)).toBe('POYA');
    expect(classifyGuardShiftDate('2026-07-05', FM_HOLIDAY_CALENDAR_DEFAULTS)).toBe('WEEKLY_HOLIDAY');
    expect(classifyGuardShiftDate('2026-07-04', FM_HOLIDAY_CALENDAR_DEFAULTS)).toBe('SATURDAY');
    expect(classifyGuardShiftDate('2026-07-01', FM_HOLIDAY_CALENDAR_DEFAULTS)).toBe('STANDARD');
  });
});

describe('guardFormulaGrossFromShiftDates', () => {
  it('builds formula gross from day-type counts', () => {
    const result = guardFormulaGrossFromShiftDates({
      shiftDates: ['2026-07-01', '2026-07-01', '2026-07-04', '2026-07-05', '2026-07-10'],
      holidays: FM_HOLIDAY_CALENDAR_DEFAULTS,
      monthlyBasicLkr: 35_000,
    });

    expect(result.qty).toEqual({ std: 2, sun: 1, poya: 1, pubHol: 0, sat: 1 });
    expect(result.grossLkr).toBe(
      buildGuardDayTypeBreakdown(result.qty, 35_000).reduce((sum, row) => sum + row.lkrEarned, 0),
    );
    expect(result.grossLkr).toBeGreaterThan(0);
  });
});

describe('guardPayslipSiteAllowanceLkr', () => {
  it('returns excess site-rate gross over formula gross', () => {
    expect(guardPayslipSiteAllowanceLkr(50_000, 42_000)).toBe(8_000);
    expect(guardPayslipSiteAllowanceLkr(40_000, 42_000)).toBe(0);
  });
});

describe('aggregateGuardDayTypeQty', () => {
  it('counts each shift record separately', () => {
    expect(
      aggregateGuardDayTypeQty(
        ['2026-07-01', '2026-07-01', '2026-07-04'],
        FM_HOLIDAY_CALENDAR_DEFAULTS,
      ),
    ).toEqual({ std: 2, sun: 0, poya: 0, pubHol: 0, sat: 1 });
  });
});
