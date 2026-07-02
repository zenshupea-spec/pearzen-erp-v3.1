import { describe, expect, it } from 'vitest';

import {
  getFmLivePayrollPeriod,
  isLivePayrollPeriod,
  monthsFromLivePeriod,
} from './payroll-period';

describe('payroll-period', () => {
  it('resolves live period from Asia/Colombo calendar month', () => {
    // 2026-07-01 02:00 Asia/Colombo = 2026-06-30T20:30:00.000Z
    const july = new Date('2026-06-30T20:30:00.000Z');
    expect(getFmLivePayrollPeriod(july)).toEqual({ year: 2026, month: 7 });

    // 2026-06-30 23:00 Asia/Colombo = 2026-06-30T17:30:00.000Z
    const june = new Date('2026-06-30T17:30:00.000Z');
    expect(getFmLivePayrollPeriod(june)).toEqual({ year: 2026, month: 6 });
  });

  it('flags only the Colombo current month as live', () => {
    const now = new Date('2026-06-30T20:30:00.000Z');
    expect(isLivePayrollPeriod({ year: 2026, month: 7 }, now)).toBe(true);
    expect(isLivePayrollPeriod({ year: 2026, month: 6 }, now)).toBe(false);
    expect(monthsFromLivePeriod({ year: 2026, month: 6 }, now)).toBe(-1);
  });
});
