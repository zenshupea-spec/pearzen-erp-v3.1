/** Labels aligned with FM Settings → Dynamic Statutory Formula Builder sections. */
export const FM_FORMULA_GUARD_SOURCE =
  'Dynamic Statutory Formula Builder Guards (FM Settings)';
export const FM_FORMULA_CAFE_SOURCE =
  'Dynamic Statutory Formula Builder Cafe Staff (FM Settings)';

/** HO / CVS monthly pay — `employees.base_salary` on the Master Nominal Roll. */
export const FM_MNR_SALARY_SOURCE = 'Master Nominal Roll (MNR) — Base Salary';

export type HoFixedEarnings = { mnrBaseSalaryLkr: number };

/** Map MNR `base_salary` into FM earnings breakdown (CVS / HO fixed pay). */
export function hoFixedFromMnrBaseSalary(
  baseSalary: number | string | null | undefined,
): HoFixedEarnings | undefined {
  if (baseSalary == null || baseSalary === '') return undefined;
  const n = Number(baseSalary);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return { mnrBaseSalaryLkr: Math.round(n) };
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

export function isGuardFieldEarnings(earnings: {
  smPayData?: unknown;
  cafeData?: unknown;
  hoFixedData?: unknown;
}): boolean {
  return payrollEarningsKind(earnings) === 'guard';
}
