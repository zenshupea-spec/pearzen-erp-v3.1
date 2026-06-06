/** Live payroll month seeded in FM mock data (May 2026). */
export const FM_LIVE_PAYROLL_PERIOD = { year: 2026, month: 5 } as const;

export type PayrollPeriod = { year: number; month: number };

const MONTH_NAMES = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

const MONTH_NAMES_FULL = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

export function formatPayrollPeriodLabel({ year, month }: PayrollPeriod, style: 'short' | 'long' = 'short') {
  const names = style === 'long' ? MONTH_NAMES_FULL : MONTH_NAMES;
  return `${names[month - 1]} ${year}`;
}

export function isSamePayrollPeriod(a: PayrollPeriod, b: PayrollPeriod) {
  return a.year === b.year && a.month === b.month;
}

export function isLivePayrollPeriod(period: PayrollPeriod) {
  return isSamePayrollPeriod(period, FM_LIVE_PAYROLL_PERIOD);
}

/** Month offset from live period; 0 = live, negative = earlier, positive = later. */
export function monthsFromLivePeriod(period: PayrollPeriod) {
  return (period.year - FM_LIVE_PAYROLL_PERIOD.year) * 12 + (period.month - FM_LIVE_PAYROLL_PERIOD.month);
}

export function addPayrollMonths(period: PayrollPeriod, delta: number): PayrollPeriod {
  const d = new Date(period.year, period.month - 1 + delta, 1);
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

export function prevPayrollMonth(period: PayrollPeriod) {
  return addPayrollMonths(period, -1);
}

export function nextPayrollMonth(period: PayrollPeriod) {
  return addPayrollMonths(period, 1);
}

/** Demo scale for portfolio figures when viewing a non-live month. */
export function historicalPortfolioScale(period: PayrollPeriod) {
  const offset = monthsFromLivePeriod(period);
  if (offset === 0) return 1;
  return Math.max(0.35, 1 - Math.abs(offset) * 0.12);
}
