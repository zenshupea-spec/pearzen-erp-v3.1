import { describe, expect, it } from 'vitest';

import { sumCafeOtFromDayLogs } from './cafe-checkin-payroll-sync';

describe('cafe-checkin-payroll-sync OT rollup', () => {
  it('sums OT hours and LKR from day logs', () => {
    expect(
      sumCafeOtFromDayLogs([
        { ot_hours: 2, ot_lkr: 1000 },
        { ot_hours: 1.5, ot_lkr: 750 },
      ]),
    ).toEqual({ otTotalHours: 3.5, otTotalLkr: 1750 });
  });
});
