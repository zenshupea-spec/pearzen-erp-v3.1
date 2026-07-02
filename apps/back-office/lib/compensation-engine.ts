import {
  DEFAULT_GUARD_PAY_FORMULAS,
  evaluatePayFormula,
  type GuardPayFormulas,
} from '../../../packages/pay-formulas';

export type PayStructureTag =
  | 'GUARD_STATUTORY'
  | 'SECTOR_MANAGER'
  | 'CAFE_HOURLY';

export interface EmployeeFinancialProfile {
  emp_number: string;
  starting_basic: number;
  annual_increment: number;
  years_of_service: number;
  pay_structure_tag: PayStructureTag;
  requires_md_approval: boolean;
}

export interface ShiftCalculationResult {
  shiftType: string;
  adjustedBasic: number;
  grossPay: number;
  deductions: number;
  netPay: number;
  breakdown: {
    baseComponent: number;
    leaveComponent: number;
    overtimeComponent: number;
  };
  notes?: string;
}

/** MD `wb_working_days` / `wb_hours` — per-shift standard-day divisors (defaults match Wages Boards). */
export type GuardPayDayDivisors = {
  wbWorkingDays: number;
  wbHours: number;
};

export const DEFAULT_GUARD_PAY_DAY_DIVISORS: GuardPayDayDivisors = {
  wbWorkingDays: 26,
  wbHours: 200,
};

function resolveGuardPayDayDivisors(
  divisors?: Partial<GuardPayDayDivisors>,
): GuardPayDayDivisors {
  const wbWorkingDays =
    divisors?.wbWorkingDays != null && divisors.wbWorkingDays > 0
      ? divisors.wbWorkingDays
      : DEFAULT_GUARD_PAY_DAY_DIVISORS.wbWorkingDays;
  const wbHours =
    divisors?.wbHours != null && divisors.wbHours > 0
      ? divisors.wbHours
      : DEFAULT_GUARD_PAY_DAY_DIVISORS.wbHours;
  return { wbWorkingDays, wbHours };
}

function guardFormulaGross(
  key: keyof GuardPayFormulas,
  B: number,
  divisors?: Partial<GuardPayDayDivisors>,
  guardFormulas: GuardPayFormulas = DEFAULT_GUARD_PAY_FORMULAS,
): number {
  const { wbWorkingDays, wbHours } = resolveGuardPayDayDivisors(divisors);
  return evaluatePayFormula(guardFormulas[key], {
    B,
    HRS: 9,
    wbWorkingDays,
    wbHours,
  });
}

function breakdownFromGross(
  shiftType: string,
  B: number,
  gross: number,
  breakdown: ShiftCalculationResult['breakdown'],
): ShiftCalculationResult {
  return {
    shiftType,
    adjustedBasic: B,
    grossPay: gross,
    deductions: 0,
    netPay: gross,
    breakdown,
  };
}

export function calculateAdjustedBasic(
  profile: EmployeeFinancialProfile
): number {
  return profile.starting_basic + profile.annual_increment * profile.years_of_service;
}

export function calculateStandardDay(
  B: number,
  divisors?: Partial<GuardPayDayDivisors>,
  guardFormulas?: GuardPayFormulas,
): ShiftCalculationResult {
  const { wbWorkingDays: D, wbHours: H } = resolveGuardPayDayDivisors(divisors);
  const baseComponent = B / D;
  const leaveComponent = (B / D) * (14 / 12) * (1 / D);
  const overtimeComponent = (B / H) * 1.5 * 3;
  const gross = guardFormulaGross('standardWorkingDay', B, divisors, guardFormulas);
  return breakdownFromGross('STANDARD', B, gross, {
    baseComponent: Number(baseComponent.toFixed(2)),
    leaveComponent: Number(leaveComponent.toFixed(2)),
    overtimeComponent: Number(overtimeComponent.toFixed(2)),
  });
}

export function calculatePoyaDay(
  B: number,
  divisors?: Partial<GuardPayDayDivisors>,
  guardFormulas?: GuardPayFormulas,
): ShiftCalculationResult {
  const { wbWorkingDays: D, wbHours: H } = resolveGuardPayDayDivisors(divisors);
  const baseComponent = (B / D) * 1.5;
  const overtimeComponent = (B / H) * 1.5 * 3;
  const gross = guardFormulaGross('poyaDay', B, divisors, guardFormulas);
  return breakdownFromGross('POYA', B, gross, {
    baseComponent: Number(baseComponent.toFixed(2)),
    leaveComponent: 0,
    overtimeComponent: Number(overtimeComponent.toFixed(2)),
  });
}

export function calculateWeeklyHoliday(
  B: number,
  divisors?: Partial<GuardPayDayDivisors>,
  guardFormulas?: GuardPayFormulas,
): ShiftCalculationResult {
  const { wbHours: H } = resolveGuardPayDayDivisors(divisors);
  const overtimeComponent = (B / H) * 1.5 * 11;
  const gross = guardFormulaGross('weeklyHolidaySunday', B, divisors, guardFormulas);
  return breakdownFromGross('WEEKLY_HOLIDAY', B, gross, {
    baseComponent: 0,
    leaveComponent: 0,
    overtimeComponent: Number(overtimeComponent.toFixed(2)),
  });
}

export function calculateSaturday(
  B: number,
  divisors?: Partial<GuardPayDayDivisors>,
  guardFormulas?: GuardPayFormulas,
): ShiftCalculationResult {
  const { wbWorkingDays: D, wbHours: H } = resolveGuardPayDayDivisors(divisors);
  const baseComponent = (B / D) * (6 / 8);
  const overtimeComponent = (B / H) * 1.5 * 5;
  const gross = guardFormulaGross('saturdayHalfDay', B, divisors, guardFormulas);
  return breakdownFromGross('SATURDAY', B, gross, {
    baseComponent: Number(baseComponent.toFixed(2)),
    leaveComponent: 0,
    overtimeComponent: Number(overtimeComponent.toFixed(2)),
  });
}

export function calculateSectorManagerTally(
  visitsCompleted: number,
  ratePerVisit: number
): ShiftCalculationResult {
  const grossPay = visitsCompleted * ratePerVisit;
  return {
    shiftType: 'SECTOR_MANAGER_TALLY',
    adjustedBasic: 0,
    grossPay: Number(grossPay.toFixed(2)),
    deductions: 0,
    netPay: Number(grossPay.toFixed(2)),
    breakdown: {
      baseComponent: Number(grossPay.toFixed(2)),
      leaveComponent: 0,
      overtimeComponent: 0,
    },
    notes: `${visitsCompleted} Site Visits @ ${ratePerVisit} LKR`,
  };
}

/** Flat month gross when no shift counts — `standardDay × so_working_days`. */
export function flatMonthGrossFromStandardDay(
  monthlyBasicLkr: number,
  settings?: Partial<GuardPayDayDivisors & { soWorkingDays: number }>,
): number {
  const divisors = resolveGuardPayDayDivisors(settings);
  const soWorkingDays =
    settings?.soWorkingDays != null && settings.soWorkingDays > 0
      ? settings.soWorkingDays
      : 20;
  return Math.round(calculateStandardDay(monthlyBasicLkr, divisors).grossPay * soWorkingDays);
}

import {
  cafeMarginalOtHours,
  DEFAULT_CAFE_WEEKLY_OT_THRESHOLD_HOURS,
} from './cafe-weekly-ot';

export type CafeShiftWeeklyContext = {
  /** Rolling week hours already worked before this shift. */
  weeklyHoursBefore?: number;
  /** MD `cafeWeeklyOtThresholdHours` — defaults to 48. */
  weeklyOtThresholdHours?: number;
};

export function calculateCafeShift(
  hoursWorked: number,
  hourlyRate: number,
  weekly?: CafeShiftWeeklyContext,
): ShiftCalculationResult {
  const otHours = cafeMarginalOtHours({
    shiftHours: hoursWorked,
    weeklyHoursBefore: weekly?.weeklyHoursBefore ?? 0,
    weeklyThresholdHours:
      weekly?.weeklyOtThresholdHours ?? DEFAULT_CAFE_WEEKLY_OT_THRESHOLD_HOURS,
  });
  const baseHours = Math.max(0, hoursWorked - otHours);

  const baseComponent = baseHours * hourlyRate;
  const overtimeComponent = otHours * (hourlyRate * 1.5);
  const gross = Number((baseComponent + overtimeComponent).toFixed(2));

  return {
    shiftType: 'CAFE_HOURLY',
    adjustedBasic: 0,
    grossPay: gross,
    deductions: 0,
    netPay: gross,
    breakdown: {
      baseComponent: Number(baseComponent.toFixed(2)),
      leaveComponent: 0,
      overtimeComponent: Number(overtimeComponent.toFixed(2)),
    },
  };
}

export function processShiftPay(
  profile: EmployeeFinancialProfile,
  dayType: 'STANDARD' | 'POYA' | 'WEEKLY_HOLIDAY' | 'SATURDAY',
  meta?: {
    visitsCompleted?: number;
    ratePerVisit?: number;
    hoursWorked?: number;
    hourlyRate?: number;
    weeklyHoursBefore?: number;
    weeklyOtThresholdHours?: number;
    approvedAdvance?: number;
  }
): ShiftCalculationResult {
  if (profile.requires_md_approval) {
    throw new Error(
      `PAYROLL LOCKED: ${profile.emp_number} has a custom salary pending FM approval. Access Denied.`
    );
  }

  let result: ShiftCalculationResult;

  if (profile.pay_structure_tag === 'SECTOR_MANAGER') {
    result = calculateSectorManagerTally(
      meta?.visitsCompleted || 0,
      meta?.ratePerVisit || 0
    );
  } else if (profile.pay_structure_tag === 'CAFE_HOURLY') {
    result = calculateCafeShift(meta?.hoursWorked || 0, meta?.hourlyRate || 0, {
      weeklyHoursBefore: meta?.weeklyHoursBefore,
      weeklyOtThresholdHours: meta?.weeklyOtThresholdHours,
    });
  } else {
    const B = calculateAdjustedBasic(profile);
    switch (dayType) {
      case 'STANDARD':
        result = calculateStandardDay(B);
        break;
      case 'POYA':
        result = calculatePoyaDay(B);
        break;
      case 'WEEKLY_HOLIDAY':
        result = calculateWeeklyHoliday(B);
        break;
      case 'SATURDAY':
        result = calculateSaturday(B);
        break;
      default:
        throw new Error(
          `CRITICAL: Invalid Day Type [${dayType}] passed to Guard Compensation Engine.`
        );
    }
  }

  // THE DEDUCTOR: Apply approved advances to the final Net Pay
  if (meta?.approvedAdvance && meta.approvedAdvance > 0) {
    result.deductions = meta.approvedAdvance;
    // Ensure Net Pay doesn't drop below 0 mathematically
    result.netPay = Math.max(
      0,
      Number((result.grossPay - meta.approvedAdvance).toFixed(2))
    );
    result.notes = result.notes
      ? `${result.notes} | Advance Deduction: -${meta.approvedAdvance} LKR`
      : `Advance Deduction: -${meta.approvedAdvance} LKR`;
  }

  return result;
}
