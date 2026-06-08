import type { PayrollPeriod } from '../../fm/lib/payroll-period';
import type { TempGuard } from './types';

/** Per-shift gross for unreconciled temp liability (matches FM portfolio default). */
export const TEMP_SHIFT_RATE_LKR = 1850;

export function payrollMonthKey({ year, month }: PayrollPeriod): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}

export function accruedPayForMonth(
  guard: TempGuard,
  period: PayrollPeriod,
  shiftRateLkr = TEMP_SHIFT_RATE_LKR,
): number {
  const key = payrollMonthKey(period);
  const shifts = guard.monthlyShiftCounts?.[key] ?? 0;
  return Math.round(shifts * shiftRateLkr);
}
