import { colomboTodayIso } from '../../../lib/guard-verification-dates';

export type PayrollPeriod = { year: number; month: number };

/** Current open payroll month (calendar month in Asia/Colombo). */
export function getFmLivePayrollPeriod(now = new Date()): PayrollPeriod {
  const [year, month] = colomboTodayIso(now).split('-').map(Number);
  return { year, month };
}

/** Default period for FM desk initial state (resolved at import). */
export const FM_LIVE_PAYROLL_PERIOD: PayrollPeriod = getFmLivePayrollPeriod();

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

export function isLivePayrollPeriod(period: PayrollPeriod, now = new Date()) {
  return isSamePayrollPeriod(period, getFmLivePayrollPeriod(now));
}

/** Month offset from live period; 0 = live, negative = earlier, positive = later. */
export function monthsFromLivePeriod(period: PayrollPeriod, now = new Date()) {
  const live = getFmLivePayrollPeriod(now);
  return (period.year - live.year) * 12 + (period.month - live.month);
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
