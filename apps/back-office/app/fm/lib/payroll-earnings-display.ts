/** Labels aligned with MD Settings → Dynamic Statutory Formula Builder sections. */
export const FM_FORMULA_GUARD_SOURCE =
  'Dynamic Statutory Formula Builder Guards (MD Settings)';
export const FM_FORMULA_CAFE_SOURCE =
  'Dynamic Statutory Formula Builder Cafe Staff (MD Settings)';
export const FM_FORMULA_SM_SOURCE =
  'Global SM Compensation Settings (MD Settings — Fixed Base vs. Per-Visit)';

/** HO / CVS monthly pay — `employees.base_salary` on the Master Nominal Roll. */
export const FM_MNR_SALARY_SOURCE = 'Master Nominal Roll (MNR) — Base Salary';

export type CorporatePayrollGroup =
  | 'GUARD_FIELD'
  | 'CAFE'
  | 'SECTOR_MANAGER'
  | 'HEAD_OFFICE';

export type HoFixedEarnings = { mnrBaseSalaryLkr: number };

export type GuardFieldEarnings = {
  monthlyBasicLkr: number;
  standardDayGrossLkr: number;
};

export type FixedMonthlyAllowances = {
  siteAllowanceLkr: number;
  mealAllowanceLkr: number;
  transportAllowanceLkr: number;
};

export type VariablePayrollEarnings = {
  arrearsLkr: number;
  performanceIncentiveLkr: number;
};

export const EMPTY_FIXED_ALLOWANCES: FixedMonthlyAllowances = {
  siteAllowanceLkr: 0,
  mealAllowanceLkr: 0,
  transportAllowanceLkr: 0,
};

export const EMPTY_VARIABLE_EARNINGS: VariablePayrollEarnings = {
  arrearsLkr: 0,
  performanceIncentiveLkr: 0,
};

function roundLkr(value: unknown): number {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.round(n);
}

export function fixedAllowancesFromEmployeeRow(row: {
  site_allowance_lkr?: unknown;
  meal_allowance_lkr?: unknown;
  transport_allowance_lkr?: unknown;
}): FixedMonthlyAllowances {
  return {
    siteAllowanceLkr: roundLkr(row.site_allowance_lkr),
    mealAllowanceLkr: roundLkr(row.meal_allowance_lkr),
    transportAllowanceLkr: roundLkr(row.transport_allowance_lkr),
  };
}

export function sumFixedAllowances(allowances: FixedMonthlyAllowances): number {
  return (
    allowances.siteAllowanceLkr +
    allowances.mealAllowanceLkr +
    allowances.transportAllowanceLkr
  );
}

export function sumVariableEarnings(earnings: VariablePayrollEarnings): number {
  return earnings.arrearsLkr + earnings.performanceIncentiveLkr;
}

export function variableEarningsFromRow(row: {
  arrears_lkr?: unknown;
  performance_incentive_lkr?: unknown;
}): VariablePayrollEarnings {
  return {
    arrearsLkr: roundLkr(row.arrears_lkr),
    performanceIncentiveLkr: roundLkr(row.performance_incentive_lkr),
  };
}

export function totalGrossFromPayParts(
  basePayLkr: number,
  fixedAllowances: FixedMonthlyAllowances = EMPTY_FIXED_ALLOWANCES,
  variableEarnings: VariablePayrollEarnings = EMPTY_VARIABLE_EARNINGS,
): number {
  return (
    Math.max(0, Math.round(basePayLkr)) +
    sumFixedAllowances(fixedAllowances) +
    sumVariableEarnings(variableEarnings)
  );
}

export function inferBasePayLkr(
  totalGross: number,
  fixedAllowances: FixedMonthlyAllowances = EMPTY_FIXED_ALLOWANCES,
  variableEarnings: VariablePayrollEarnings = EMPTY_VARIABLE_EARNINGS,
): number {
  return Math.max(
    0,
    Math.round(totalGross) - sumFixedAllowances(fixedAllowances) - sumVariableEarnings(variableEarnings),
  );
}

/** Map MNR `base_salary` into FM earnings breakdown (CVS / HO fixed pay). */
export function hoFixedFromMnrBaseSalary(
  baseSalary: number | string | null | undefined,
): HoFixedEarnings | undefined {
  if (baseSalary == null || baseSalary === '') return undefined;
  const n = Number(baseSalary);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return { mnrBaseSalaryLkr: Math.round(n) };
}

/** HO fixed-pay shell when group is HEAD_OFFICE but MNR base salary is not set yet. */
export function hoFixedShellFromMnrBaseSalary(
  baseSalary: number | string | null | undefined,
): HoFixedEarnings {
  return hoFixedFromMnrBaseSalary(baseSalary) ?? { mnrBaseSalaryLkr: 0 };
}

/** Default café OT hourly rate from MD formula: (B/26/9) × 1.5 */
export function cafeOtHourlyRateLkr(monthlyBasicLkr: number): number {
  const daily = monthlyBasicLkr / 26;
  return Number(((daily / 9) * 1.5).toFixed(2));
}

export function cafeOtPayLkr(monthlyBasicLkr: number, otHours: number): number {
  return Math.round(cafeOtHourlyRateLkr(monthlyBasicLkr) * otHours);
}

export type PayrollEarningsKind = 'guard' | 'ho_fixed' | 'cafe' | 'sm';

export function normalizeCorporatePayrollGroup(
  raw: unknown,
): CorporatePayrollGroup | null {
  const g = String(raw ?? '').trim().toUpperCase();
  if (g === 'GUARD' || g === 'GUARD_FIELD') return 'GUARD_FIELD';
  if (g === 'CAFE') return 'CAFE';
  if (g === 'SECTOR_MANAGER' || g === 'SM') return 'SECTOR_MANAGER';
  if (g === 'HEAD_OFFICE' || g === 'HO') return 'HEAD_OFFICE';
  return null;
}

export function corporatePayrollGroupLabel(group: CorporatePayrollGroup): string {
  switch (group) {
    case 'GUARD_FIELD':
      return 'Guard (Field Operations)';
    case 'CAFE':
      return 'Café Operations';
    case 'SECTOR_MANAGER':
      return 'Sector Manager';
    case 'HEAD_OFFICE':
      return 'Head Office (HO)';
  }
}

export function inferCorporatePayrollGroup(input: {
  group?: unknown;
  rank?: unknown;
  earnings?: {
    smPayData?: unknown;
    cafeData?: unknown;
    hoFixedData?: unknown;
  };
}): CorporatePayrollGroup {
  const explicit = normalizeCorporatePayrollGroup(input.group);
  if (explicit) return explicit;

  const rank = String(input.rank ?? '').trim().toUpperCase();
  if (rank === 'MD' || rank === 'OD') return 'HEAD_OFFICE';
  if (rank.includes('SECTOR MANAGER')) return 'SECTOR_MANAGER';
  if (
    rank.includes('BARISTA') ||
    rank.includes('CAFÉ') ||
    rank.includes('CAFE') ||
    rank.includes('KITCHEN') ||
    rank.includes('COUNTER STAFF')
  ) {
    return 'CAFE';
  }

  if (input.earnings?.smPayData) return 'SECTOR_MANAGER';
  if (input.earnings?.cafeData) return 'CAFE';
  if (input.earnings?.hoFixedData !== undefined) return 'HEAD_OFFICE';

  return 'GUARD_FIELD';
}

export function payrollEarningsKindFromGroup(
  group: CorporatePayrollGroup,
): PayrollEarningsKind {
  switch (group) {
    case 'SECTOR_MANAGER':
      return 'sm';
    case 'CAFE':
      return 'cafe';
    case 'HEAD_OFFICE':
      return 'ho_fixed';
    default:
      return 'guard';
  }
}

export function resolvePayrollEarningsKind(input: {
  corporateGroup?: unknown;
  rank?: unknown;
  earnings: {
    smPayData?: unknown;
    cafeData?: unknown;
    hoFixedData?: unknown;
  };
}): PayrollEarningsKind {
  return payrollEarningsKindFromGroup(
    inferCorporatePayrollGroup({
      group: input.corporateGroup,
      rank: input.rank,
      earnings: input.earnings,
    }),
  );
}

export function payrollEarningsKind(earnings: {
  smPayData?: unknown;
  cafeData?: unknown;
  hoFixedData?: unknown;
}): PayrollEarningsKind {
  if (earnings.smPayData) return 'sm';
  if (earnings.cafeData) return 'cafe';
  if (earnings.hoFixedData) return 'ho_fixed';
  return 'guard';
}

export function isGuardFieldEarnings(
  earnings: {
    smPayData?: unknown;
    cafeData?: unknown;
    hoFixedData?: unknown;
  },
  context?: { corporateGroup?: unknown; rank?: unknown },
): boolean {
  if (context?.corporateGroup != null || context?.rank != null) {
    return resolvePayrollEarningsKind({ ...context, earnings }) === 'guard';
  }
  return payrollEarningsKind(earnings) === 'guard';
}
