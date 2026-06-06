/** Shared with FM Settings / Executive Settings — MD retention matrix. */

export type SalaryReleaseAction = 'FULL_SALARY' | 'HALF_SALARY' | 'STOP_PAYMENT';

export const DEFAULT_PREV_MONTH_SHIFT_THRESHOLD = 30;
export const DEFAULT_SALARY_MONTH_SHIFT_THRESHOLD = 10;

export type RetentionThresholds = {
  prevMonthMinShifts: number;
  salaryMonthMinShifts: number;
};

/**
 * Determines salary release from previous vs current month shift counts.
 * Hard stop when previous month is below threshold; otherwise half vs full on current month.
 */
export function calculateSalaryRelease(
  prevMonthShifts: number,
  currMonthShifts: number,
  minPrevReq: number = DEFAULT_PREV_MONTH_SHIFT_THRESHOLD,
  minCurrReq: number = DEFAULT_SALARY_MONTH_SHIFT_THRESHOLD,
): SalaryReleaseAction {
  if (prevMonthShifts < minPrevReq) return 'STOP_PAYMENT';
  return currMonthShifts >= minCurrReq ? 'FULL_SALARY' : 'HALF_SALARY';
}

export function salaryReleaseLabel(action: SalaryReleaseAction): string {
  switch (action) {
    case 'STOP_PAYMENT':
      return 'Salary held (no pay)';
    case 'HALF_SALARY':
      return 'Half salary';
    case 'FULL_SALARY':
      return 'Paid / full release';
    default:
      return action;
  }
}

export function salaryReleaseReason(
  action: SalaryReleaseAction,
  prevMonthShifts: number,
  currMonthShifts: number,
  thresholds: RetentionThresholds,
): string {
  if (action === 'STOP_PAYMENT') {
    return `Previous month shifts (${prevMonthShifts}) below MD threshold (${thresholds.prevMonthMinShifts})`;
  }
  if (action === 'HALF_SALARY') {
    return `Current month shifts (${currMonthShifts}) below salary-month threshold (${thresholds.salaryMonthMinShifts})`;
  }
  return `Meets retention thresholds (prev ≥ ${thresholds.prevMonthMinShifts}, curr ≥ ${thresholds.salaryMonthMinShifts})`;
}
