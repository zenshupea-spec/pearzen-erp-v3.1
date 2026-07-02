/** Parse non-negative LKR amounts from MNR / HR forms and roster imports. */
export function parsePayrollLkr(value: unknown): number {
  if (value == null || value === '') return 0;
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.round(n));
}

export type EmployeeFixedAllowances = {
  fixedAllowanceLkr: number;
  siteAllowanceLkr: number;
  mealAllowanceLkr: number;
  transportAllowanceLkr: number;
  specialAllowanceLkr: number;
};

export const EMPTY_EMPLOYEE_FIXED_ALLOWANCES: EmployeeFixedAllowances = {
  fixedAllowanceLkr: 0,
  siteAllowanceLkr: 0,
  mealAllowanceLkr: 0,
  transportAllowanceLkr: 0,
  specialAllowanceLkr: 0,
};

export function fixedAllowancesFromEmployeeRow(row: {
  fixed_allowance_lkr?: unknown;
  site_allowance_lkr?: unknown;
  meal_allowance_lkr?: unknown;
  transport_allowance_lkr?: unknown;
  special_allowance_lkr?: unknown;
}): EmployeeFixedAllowances {
  return {
    fixedAllowanceLkr: parsePayrollLkr(row.fixed_allowance_lkr),
    siteAllowanceLkr: parsePayrollLkr(row.site_allowance_lkr),
    mealAllowanceLkr: parsePayrollLkr(row.meal_allowance_lkr),
    transportAllowanceLkr: parsePayrollLkr(row.transport_allowance_lkr),
    specialAllowanceLkr: parsePayrollLkr(row.special_allowance_lkr),
  };
}

export function sumEmployeeFixedAllowances(allowances: EmployeeFixedAllowances): number {
  return (
    allowances.fixedAllowanceLkr +
    allowances.siteAllowanceLkr +
    allowances.mealAllowanceLkr +
    allowances.transportAllowanceLkr +
    allowances.specialAllowanceLkr
  );
}

export function fixedDeductionLkrFromEmployeeRow(row: {
  fixed_deduction_lkr?: unknown;
}): number {
  return parsePayrollLkr(row.fixed_deduction_lkr);
}

export function employmentPayComponentsFromPayload(payload: Record<string, unknown>) {
  return {
    fixed_allowance_lkr: parsePayrollLkr(payload.fixed_allowance_lkr),
    site_allowance_lkr: parsePayrollLkr(payload.site_allowance_lkr),
    meal_allowance_lkr: parsePayrollLkr(payload.meal_allowance_lkr),
    transport_allowance_lkr: parsePayrollLkr(payload.transport_allowance_lkr),
    special_allowance_lkr: parsePayrollLkr(payload.special_allowance_lkr),
    fixed_deduction_lkr: parsePayrollLkr(payload.fixed_deduction_lkr),
  };
}

export function employmentPayComponentsFromFormData(formData: FormData) {
  return employmentPayComponentsFromPayload({
    fixed_allowance_lkr: formData.get('fixed_allowance_lkr'),
    site_allowance_lkr: formData.get('site_allowance_lkr'),
    meal_allowance_lkr: formData.get('meal_allowance_lkr'),
    transport_allowance_lkr: formData.get('transport_allowance_lkr'),
    special_allowance_lkr: formData.get('special_allowance_lkr'),
    fixed_deduction_lkr: formData.get('fixed_deduction_lkr'),
  });
}
