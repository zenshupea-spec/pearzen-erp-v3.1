import {
  guardEligibleForAdvanceSalary,
  maxAdvanceForEmployee,
  type AdvanceSalarySettings,
} from '../../../../../packages/advance-salary';
import { isGuardPayrollCohort } from './guard-payroll-cohorts';

export type AdvancePortfolioEmployee = {
  id: string;
  empNumber: string;
  name: string;
  rank: string;
  shiftsAtSite: number;
  totalGross: number;
};

export type AdvanceEmployeeRow = AdvancePortfolioEmployee & {
  isGuard: boolean;
  eligible: boolean;
  maxAdvanceLkr: number;
  ineligibilityReason?: string;
};

export function isGuardPayrollGroup(payrollGroup?: string): boolean {
  return isGuardPayrollCohort(payrollGroup);
}

export function buildAdvanceEmployeeRow(
  emp: AdvancePortfolioEmployee,
  isGuard: boolean,
  settings: AdvanceSalarySettings,
): AdvanceEmployeeRow {
  const maxAdvanceLkr = maxAdvanceForEmployee(isGuard, settings);
  const shifts = emp.shiftsAtSite;

  if (isGuard) {
    const eligible = guardEligibleForAdvanceSalary(shifts, settings);
    return {
      ...emp,
      isGuard: true,
      eligible,
      maxAdvanceLkr,
      ineligibilityReason: eligible
        ? undefined
        : `Below ${settings.guardMinShifts} shifts (${shifts} worked this month)`,
    };
  }

  return {
    ...emp,
    isGuard: false,
    eligible: true,
    maxAdvanceLkr,
  };
}

export function buildAdvanceRowsForSite(
  employees: AdvancePortfolioEmployee[],
  payrollGroup: string | undefined,
  settings: AdvanceSalarySettings,
): AdvanceEmployeeRow[] {
  const isGuard = isGuardPayrollGroup(payrollGroup);
  return employees.map((emp) => buildAdvanceEmployeeRow(emp, isGuard, settings));
}

/** Guards must meet the shift minimum; other staff are always eligible. */
export function eligibleAdvanceRows(rows: AdvanceEmployeeRow[]): AdvanceEmployeeRow[] {
  return rows.filter((row) => row.eligible);
}
