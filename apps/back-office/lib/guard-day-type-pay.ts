import {
  DEFAULT_GUARD_PAY_FORMULAS,
  evaluatePayFormula,
  type GuardPayFormulas,
} from '../../../packages/pay-formulas';
import {
  calculateCafeShift,
  calculatePoyaDay,
  calculateSaturday,
  calculateStandardDay,
  calculateWeeklyHoliday,
  type GuardPayDayDivisors,
} from './compensation-engine';
import { DEFAULT_CAFE_WEEKLY_OT_THRESHOLD_HOURS } from './cafe-weekly-ot';

export type GuardEngineDayType =
  | 'STANDARD'
  | 'POYA'
  | 'WEEKLY_HOLIDAY'
  | 'SATURDAY'
  | 'PUBLIC_HOLIDAY';

export type GuardMonthPreviewQty = {
  std: number;
  sun: number;
  poya: number;
  pubHol: number;
  sat: number;
};

export function guardShiftGrossLkr(
  monthlyBasicLkr: number,
  dayType: GuardEngineDayType,
  divisors?: Partial<GuardPayDayDivisors>,
  guardFormulas?: GuardPayFormulas,
): number {
  const formulas = guardFormulas ?? DEFAULT_GUARD_PAY_FORMULAS;
  const { wbWorkingDays, wbHours } = {
    wbWorkingDays: divisors?.wbWorkingDays ?? 26,
    wbHours: divisors?.wbHours ?? 200,
  };
  const ctx = { B: monthlyBasicLkr, HRS: 9, wbWorkingDays, wbHours };

  switch (dayType) {
    case 'STANDARD':
      return evaluatePayFormula(formulas.standardWorkingDay, ctx);
    case 'POYA':
      return evaluatePayFormula(formulas.poyaDay, ctx);
    case 'WEEKLY_HOLIDAY':
      return evaluatePayFormula(formulas.weeklyHolidaySunday, ctx);
    case 'SATURDAY':
      return evaluatePayFormula(formulas.saturdayHalfDay, ctx);
    case 'PUBLIC_HOLIDAY':
      return evaluatePayFormula(formulas.publicHoliday, ctx);
    default:
      return calculateStandardDay(monthlyBasicLkr, divisors).grossPay;
  }
}

export function guardMonthPreviewRates(
  monthlyBasicLkr: number,
  divisors?: Partial<GuardPayDayDivisors>,
  guardFormulas?: GuardPayFormulas,
) {
  return {
    std: guardShiftGrossLkr(monthlyBasicLkr, 'STANDARD', divisors, guardFormulas),
    sun: guardShiftGrossLkr(monthlyBasicLkr, 'WEEKLY_HOLIDAY', divisors, guardFormulas),
    poya: guardShiftGrossLkr(monthlyBasicLkr, 'POYA', divisors, guardFormulas),
    pubHol: guardShiftGrossLkr(monthlyBasicLkr, 'PUBLIC_HOLIDAY', divisors, guardFormulas),
    sat: guardShiftGrossLkr(monthlyBasicLkr, 'SATURDAY', divisors, guardFormulas),
  };
}

export function computeGuardMonthSimulatorGross(
  qty: GuardMonthPreviewQty,
  monthlyBasicLkr: number,
  divisors?: Partial<GuardPayDayDivisors>,
  guardFormulas?: GuardPayFormulas,
): number {
  const rates = guardMonthPreviewRates(monthlyBasicLkr, divisors, guardFormulas);
  return Number(
    (
      qty.std * rates.std +
      qty.sun * rates.sun +
      qty.poya * rates.poya +
      qty.pubHol * rates.pubHol +
      qty.sat * rates.sat
    ).toFixed(2),
  );
}

export function computeGuardMonthSimulatorNetPay(
  grossPay: number,
  epfEmployeeRate = 8,
): number {
  const epfEmployee = Math.round(grossPay * (epfEmployeeRate / 100));
  return Number((grossPay - epfEmployee).toFixed(2));
}

export function computeFmPortfolioGuardShiftGrossLkr(
  dayType: GuardEngineDayType,
  monthlyBasicLkr: number,
  divisors?: Partial<GuardPayDayDivisors>,
): number {
  return Math.round(guardShiftGrossLkr(monthlyBasicLkr, dayType, divisors));
}

export function cafeOtHourlyRateLkr(monthlyBasicLkr: number): number {
  return Number((((monthlyBasicLkr / 26 / 9) * 1.5)).toFixed(2));
}

export function computeCafeStandardShiftGrossLkr(monthlyBasicLkr: number): number {
  const hourlyRate = cafeOtHourlyRateLkr(monthlyBasicLkr);
  return calculateCafeShift(9, hourlyRate, { weeklyHoursBefore: 0 }).grossPay;
}

export function computeCafeOtEdgeGrossLkr(monthlyBasicLkr: number): number {
  const hourlyRate = cafeOtHourlyRateLkr(monthlyBasicLkr);
  const threshold = DEFAULT_CAFE_WEEKLY_OT_THRESHOLD_HOURS;
  return Number(
    (
      calculateCafeShift(48, hourlyRate, { weeklyHoursBefore: 0, weeklyOtThresholdHours: threshold })
        .grossPay +
      calculateCafeShift(2, hourlyRate, {
        weeklyHoursBefore: threshold,
        weeklyOtThresholdHours: threshold,
      }).grossPay
    ).toFixed(2),
  );
}

/** Sanity check — engine helpers should match formula evaluator on defaults. */
export function engineMatchesDefaultFormulas(
  monthlyBasicLkr: number,
  divisors?: Partial<GuardPayDayDivisors>,
): boolean {
  const tolerance = 0.02;
  const checks = [
    ['STANDARD', calculateStandardDay(monthlyBasicLkr, divisors).grossPay],
    ['POYA', calculatePoyaDay(monthlyBasicLkr, divisors).grossPay],
    ['WEEKLY_HOLIDAY', calculateWeeklyHoliday(monthlyBasicLkr, divisors).grossPay],
    ['SATURDAY', calculateSaturday(monthlyBasicLkr, divisors).grossPay],
  ] as const;

  return checks.every(([dayType, engineGross]) => {
    const formulaGross = guardShiftGrossLkr(
      monthlyBasicLkr,
      dayType,
      divisors,
      DEFAULT_GUARD_PAY_FORMULAS,
    );
    return Math.abs(engineGross - formulaGross) <= tolerance;
  });
}
