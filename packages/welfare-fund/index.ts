export type WelfareFundSettings = {
  /** Amount deducted from each employee every payroll month. */
  monthlyDeductionLkr: number;
};

export const DEFAULT_WELFARE_FUND_SETTINGS: WelfareFundSettings = {
  monthlyDeductionLkr: 500,
};

export function parseWelfareFundSettings(raw: unknown): WelfareFundSettings {
  if (!raw || typeof raw !== 'object') return DEFAULT_WELFARE_FUND_SETTINGS;
  const row = raw as Record<string, unknown>;
  const monthlyDeductionLkr = Math.max(
    0,
    Math.round(Number(row.monthlyDeductionLkr ?? row.monthly_deduction_lkr ?? 500)),
  );
  return { monthlyDeductionLkr };
}

export type PayrollPeriod = { year: number; month: number };

export type WelfareFundMonthlyRow = {
  year: number;
  month: number;
  periodLabel: string;
  deductionPerEmployeeLkr: number;
  headcount: number;
  totalContributionLkr: number;
};

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

export function formatPeriodLabel({ year, month }: PayrollPeriod) {
  return `${MONTH_NAMES_FULL[month - 1]} ${year}`;
}

export function addPayrollMonths(period: PayrollPeriod, delta: number): PayrollPeriod {
  const d = new Date(period.year, period.month - 1 + delta, 1);
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

/** Demo scale for historical months (matches FM portfolio scaling). */
export function historicalMonthScale(monthsFromLive: number) {
  if (monthsFromLive === 0) return 1;
  return Math.max(0.35, 1 - Math.abs(monthsFromLive) * 0.12);
}

export function buildWelfareFundMonthlyHistory(input: {
  settings: WelfareFundSettings;
  livePeriod: PayrollPeriod;
  liveHeadcount: number;
  monthsBack?: number;
}): WelfareFundMonthlyRow[] {
  const { settings, livePeriod, liveHeadcount } = input;
  const monthsBack = input.monthsBack ?? 18;
  const perEmployee = settings.monthlyDeductionLkr;
  const rows: WelfareFundMonthlyRow[] = [];

  for (let offset = 0; offset >= -monthsBack; offset--) {
    const period = addPayrollMonths(livePeriod, offset);
    const monthsFromLive =
      (period.year - livePeriod.year) * 12 + (period.month - livePeriod.month);
    const scale = historicalMonthScale(monthsFromLive);
    const headcount = Math.max(1, Math.round(liveHeadcount * scale));
    const totalContributionLkr = perEmployee * headcount;

    rows.push({
      year: period.year,
      month: period.month,
      periodLabel: formatPeriodLabel(period),
      deductionPerEmployeeLkr: perEmployee,
      headcount,
      totalContributionLkr,
    });
  }

  return rows;
}

export function welfareFundTotalForPeriod(
  settings: WelfareFundSettings,
  headcount: number,
  scale = 1,
): number {
  const hc = Math.max(0, Math.round(headcount * scale));
  return settings.monthlyDeductionLkr * hc;
}
