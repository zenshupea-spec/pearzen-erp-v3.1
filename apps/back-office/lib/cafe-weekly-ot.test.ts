import { describe, expect, it } from 'vitest';

import {
  cafeIsoWeekRange,
  cafeMarginalOtHours,
  DEFAULT_CAFE_WEEKLY_OT_THRESHOLD_HOURS,
} from './cafe-weekly-ot';
import { calculateCafeShift } from './compensation-engine';
import { computeCafeOtEdgeGrossLkr, computeCafeStandardShiftGrossLkr } from './guard-day-type-pay';

describe('cafe-weekly-ot', () => {
  it('returns Mon–Sun bounds for a mid-week date', () => {
    expect(cafeIsoWeekRange('2026-06-23')).toEqual({
      weekStart: '2026-06-22',
      weekEnd: '2026-06-28',
    });
  });

  it('allocates marginal OT only above the weekly threshold', () => {
    expect(
      cafeMarginalOtHours({
        shiftHours: 9,
        weeklyHoursBefore: 0,
        weeklyThresholdHours: 48,
      }),
    ).toBe(0);

    expect(
      cafeMarginalOtHours({
        shiftHours: 2,
        weeklyHoursBefore: 48,
        weeklyThresholdHours: 48,
      }),
    ).toBe(2);

    expect(
      cafeMarginalOtHours({
        shiftHours: 9,
        weeklyHoursBefore: 46,
        weeklyThresholdHours: 48,
      }),
    ).toBe(7);
  });

  it('preserves CVS regression café OT edge gross via weekly context', () => {
    const hourlyRate = Number((((30_000 / 26 / 9) * 1.5)).toFixed(2));

    const edge =
      calculateCafeShift(48, hourlyRate, {
        weeklyHoursBefore: 0,
        weeklyOtThresholdHours: DEFAULT_CAFE_WEEKLY_OT_THRESHOLD_HOURS,
      }).grossPay +
      calculateCafeShift(2, hourlyRate, {
        weeklyHoursBefore: 48,
        weeklyOtThresholdHours: DEFAULT_CAFE_WEEKLY_OT_THRESHOLD_HOURS,
      }).grossPay;

    expect(Number(edge.toFixed(2))).toBe(9807.81);
    expect(computeCafeOtEdgeGrossLkr(30_000)).toBe(9807.81);
    expect(computeCafeStandardShiftGrossLkr(30_000)).toBe(1730.79);
  });
});
