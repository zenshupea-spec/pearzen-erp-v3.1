import { describe, expect, it } from 'vitest';

import { accrueCafeOtFromCheckin, accrueCafeOtMinutes } from './cafe-ot-accrual';

describe('cafe-ot-accrual', () => {
  it('excludes post-cutoff minutes from shift span (17:00–21:00, cutoff 19:00 → 2h)', () => {
    const underThreshold = accrueCafeOtMinutes({
      checkinMinutes: 17 * 60,
      checkoutMinutes: 21 * 60,
      cutoffMinutes: 19 * 60,
      otRatePerHour: 500,
      weeklyHoursBefore: 0,
      cafeWeeklyOtThresholdHours: 48,
    });
    expect(underThreshold.otHours).toBe(0);
    expect(underThreshold.otLkr).toBe(0);

    const overThreshold = accrueCafeOtMinutes({
      checkinMinutes: 17 * 60,
      checkoutMinutes: 21 * 60,
      cutoffMinutes: 19 * 60,
      otRatePerHour: 500,
      weeklyHoursBefore: 48,
      cafeWeeklyOtThresholdHours: 48,
    });
    expect(overThreshold.otHours).toBe(2);
    expect(overThreshold.otLkr).toBe(1000);
    expect(overThreshold.otMinutes).toBe(120);
  });

  it('uses full span when checkout is before cutoff but weekly total is under threshold', () => {
    const result = accrueCafeOtMinutes({
      checkinMinutes: 8 * 60,
      checkoutMinutes: 18 * 60,
      cutoffMinutes: 19 * 60,
      otRatePerHour: 400,
      weeklyHoursBefore: 0,
      cafeWeeklyOtThresholdHours: 48,
    });
    expect(result.otHours).toBe(0);
    expect(result.otLkr).toBe(0);
  });

  it('returns zero OT when check-in is after cutoff', () => {
    const result = accrueCafeOtMinutes({
      checkinMinutes: 20 * 60,
      checkoutMinutes: 21 * 60,
      cutoffMinutes: 19 * 60,
      otRatePerHour: 500,
      weeklyHoursBefore: 48,
      cafeWeeklyOtThresholdHours: 48,
    });
    expect(result.otHours).toBe(0);
    expect(result.otLkr).toBe(0);
  });

  it('derives marginal OT from ISO check-in/out when week is over threshold', () => {
    const day = '2026-06-23';
    const checkin = new Date(`${day}T00:00:00`);
    checkin.setHours(17, 0, 0, 0);
    const checkout = new Date(`${day}T00:00:00`);
    checkout.setHours(21, 0, 0, 0);

    const result = accrueCafeOtFromCheckin({
      checkedInAt: checkin.toISOString(),
      checkedOutAt: checkout.toISOString(),
      cafeOtCutoffTime: '19:00',
      otRatePerHour: 500,
      weeklyHoursBefore: 48,
      cafeWeeklyOtThresholdHours: 48,
    });

    expect(result.otHours).toBe(2);
    expect(result.otLkr).toBe(1000);
  });
});
