import type { FmHolidayCalendarEntry } from './fm-holiday-calendar';
import {
  guardMonthPreviewRates,
  type GuardEngineDayType,
  type GuardMonthPreviewQty,
} from './guard-day-type-pay';
import type { GuardPayDayDivisors } from './compensation-engine';
import type { GuardPayFormulas } from '../../../packages/pay-formulas';

export type GuardDayTypeBreakdownEntry = {
  type: 'Normal Days' | 'Poya Days' | 'Public Holidays' | 'Sundays' | 'Saturdays';
  totalShifts: number;
  rateMultiplier: string;
  lkrEarned: number;
  dates: { date: string; shift: string; premium: number }[];
};

const DAY_TYPE_ORDER: GuardDayTypeBreakdownEntry['type'][] = [
  'Normal Days',
  'Saturdays',
  'Sundays',
  'Poya Days',
  'Public Holidays',
];

const ENGINE_TO_BREAKDOWN: Record<
  GuardEngineDayType,
  GuardDayTypeBreakdownEntry['type']
> = {
  STANDARD: 'Normal Days',
  SATURDAY: 'Saturdays',
  WEEKLY_HOLIDAY: 'Sundays',
  POYA: 'Poya Days',
  PUBLIC_HOLIDAY: 'Public Holidays',
};

/** Classify a shift date using the FM holiday calendar and weekday rules. */
export function classifyGuardShiftDate(
  shiftDateIso: string,
  holidays: FmHolidayCalendarEntry[],
): GuardEngineDayType {
  const holidayByDate = new Map(holidays.map((entry) => [entry.date, entry.type]));
  const holidayType = holidayByDate.get(shiftDateIso);
  if (holidayType === 'POYA') return 'POYA';
  if (holidayType === 'STATUTORY' || holidayType === 'PUBLIC_HOLIDAY') {
    return 'PUBLIC_HOLIDAY';
  }

  const dow = new Date(`${shiftDateIso}T12:00:00`).getDay();
  if (dow === 0) return 'WEEKLY_HOLIDAY';
  if (dow === 6) return 'SATURDAY';
  return 'STANDARD';
}

/** Count shift records by MD day-type bucket (one record = one shift). */
export function aggregateGuardDayTypeQty(
  shiftDates: string[],
  holidays: FmHolidayCalendarEntry[],
): GuardMonthPreviewQty {
  const qty: GuardMonthPreviewQty = { std: 0, sun: 0, poya: 0, pubHol: 0, sat: 0 };
  for (const date of shiftDates) {
    if (!date) continue;
    switch (classifyGuardShiftDate(date, holidays)) {
      case 'STANDARD':
        qty.std += 1;
        break;
      case 'WEEKLY_HOLIDAY':
        qty.sun += 1;
        break;
      case 'POYA':
        qty.poya += 1;
        break;
      case 'PUBLIC_HOLIDAY':
        qty.pubHol += 1;
        break;
      case 'SATURDAY':
        qty.sat += 1;
        break;
      default:
        break;
    }
  }
  return qty;
}

function rateMultiplierLabel(
  monthlyBasicLkr: number,
  dayType: GuardEngineDayType,
  divisors?: Partial<GuardPayDayDivisors>,
  guardFormulas?: GuardPayFormulas,
): string {
  const rates = guardMonthPreviewRates(monthlyBasicLkr, divisors, guardFormulas);
  const std = rates.std || 1;
  const map: Record<GuardEngineDayType, number> = {
    STANDARD: rates.std,
    SATURDAY: rates.sat,
    WEEKLY_HOLIDAY: rates.sun,
    POYA: rates.poya,
    PUBLIC_HOLIDAY: rates.pubHol,
  };
  const ratio = map[dayType] / std;
  if (!Number.isFinite(ratio) || ratio <= 0) return '1.0x';
  return `${ratio.toFixed(2)}x`;
}

/** Build FM portfolio day-type breakdown using MD formula rates per shift type. */
export function buildGuardDayTypeBreakdown(
  qty: GuardMonthPreviewQty,
  monthlyBasicLkr: number,
  divisors?: Partial<GuardPayDayDivisors>,
  guardFormulas?: GuardPayFormulas,
): GuardDayTypeBreakdownEntry[] {
  const rates = guardMonthPreviewRates(monthlyBasicLkr, divisors, guardFormulas);
  const byType: Record<GuardDayTypeBreakdownEntry['type'], GuardDayTypeBreakdownEntry> = {
    'Normal Days': {
      type: 'Normal Days',
      totalShifts: qty.std,
      rateMultiplier: rateMultiplierLabel(monthlyBasicLkr, 'STANDARD', divisors, guardFormulas),
      lkrEarned: Math.round(qty.std * rates.std),
      dates: [],
    },
    Saturdays: {
      type: 'Saturdays',
      totalShifts: qty.sat,
      rateMultiplier: rateMultiplierLabel(monthlyBasicLkr, 'SATURDAY', divisors, guardFormulas),
      lkrEarned: Math.round(qty.sat * rates.sat),
      dates: [],
    },
    Sundays: {
      type: 'Sundays',
      totalShifts: qty.sun,
      rateMultiplier: rateMultiplierLabel(
        monthlyBasicLkr,
        'WEEKLY_HOLIDAY',
        divisors,
        guardFormulas,
      ),
      lkrEarned: Math.round(qty.sun * rates.sun),
      dates: [],
    },
    'Poya Days': {
      type: 'Poya Days',
      totalShifts: qty.poya,
      rateMultiplier: rateMultiplierLabel(monthlyBasicLkr, 'POYA', divisors, guardFormulas),
      lkrEarned: Math.round(qty.poya * rates.poya),
      dates: [],
    },
    'Public Holidays': {
      type: 'Public Holidays',
      totalShifts: qty.pubHol,
      rateMultiplier: rateMultiplierLabel(
        monthlyBasicLkr,
        'PUBLIC_HOLIDAY',
        divisors,
        guardFormulas,
      ),
      lkrEarned: Math.round(qty.pubHol * rates.pubHol),
      dates: [],
    },
  };

  return DAY_TYPE_ORDER.map((type) => byType[type]);
}

export function guardFormulaGrossFromBreakdown(
  breakdown: GuardDayTypeBreakdownEntry[],
): number {
  return breakdown.reduce((sum, row) => sum + row.lkrEarned, 0);
}

export function guardFormulaGrossFromShiftDates(input: {
  shiftDates: string[];
  holidays: FmHolidayCalendarEntry[];
  monthlyBasicLkr: number;
  divisors?: Partial<GuardPayDayDivisors>;
  guardFormulas?: GuardPayFormulas;
}): { qty: GuardMonthPreviewQty; breakdown: GuardDayTypeBreakdownEntry[]; grossLkr: number } {
  const qty = aggregateGuardDayTypeQty(input.shiftDates, input.holidays);
  const breakdown = buildGuardDayTypeBreakdown(
    qty,
    input.monthlyBasicLkr,
    input.divisors,
    input.guardFormulas,
  );
  return {
    qty,
    breakdown,
    grossLkr: guardFormulaGrossFromBreakdown(breakdown),
  };
}

export function guardPayslipSiteAllowanceLkr(
  siteRateGrossLkr: number,
  formulaGrossLkr: number,
): number {
  return Math.max(0, Math.round(siteRateGrossLkr - formulaGrossLkr));
}
