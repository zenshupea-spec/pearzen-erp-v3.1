import { describe, expect, it } from 'vitest';
import { computeRecoverySchedule } from './recovery-plan';

describe('computeRecoverySchedule', () => {
  it('uses full months only when loss divides evenly', () => {
    const schedule = computeRecoverySchedule(90_000, 30_000);
    expect(schedule.durationMonths).toBe(3);
    expect(schedule.totalPlan).toBe(90_000);
    expect(schedule.shortfall).toBe(0);
    expect(schedule.finalMonthDeductionLkr).toBeNull();
  });

  it('prorates the final month instead of over-recovering', () => {
    const schedule = computeRecoverySchedule(200_000, 30_165);
    expect(schedule.durationMonths).toBe(7);
    expect(schedule.fullMonths).toBe(6);
    expect(schedule.finalMonthDeductionLkr).toBe(19_010);
    expect(schedule.totalPlan).toBe(200_000);
    expect(schedule.shortfall).toBe(0);
  });

  it('treats tiny remainders as fully covered at floor months', () => {
    const schedule = computeRecoverySchedule(100_050, 50_000);
    expect(schedule.durationMonths).toBe(2);
    expect(schedule.shortfall).toBe(50);
    expect(schedule.finalMonthDeductionLkr).toBeNull();
  });
});
