import { billingMonthAfterService } from './month-window';

function clampDay(day: number): number {
  return Math.min(28, Math.max(1, Math.round(day)));
}

export function previousCalendarMonth(
  year: number,
  month: number,
): { year: number; month: number } {
  return month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
}

export function monthKeyFromParts(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}

/**
 * Prorate the service-month invoice target based on how far into the billing month
 * (month after service) we are past `invoiceDispatchDay`.
 */
export function proratedInvoiceTargetForDispatchDay(
  fullTarget: number,
  serviceMonthKey: string,
  invoiceDispatchDay: number,
  asOf: Date = new Date(),
): number {
  if (fullTarget <= 0) return 0;

  const { year: billingYear, month: billingMonth } = billingMonthAfterService(serviceMonthKey);
  const asOfYear = asOf.getFullYear();
  const asOfMonth = asOf.getMonth() + 1;
  const asOfDay = asOf.getDate();

  if (asOfYear < billingYear || (asOfYear === billingYear && asOfMonth < billingMonth)) {
    return 0;
  }

  if (asOfYear > billingYear || (asOfYear === billingYear && asOfMonth > billingMonth)) {
    return fullTarget;
  }

  const dispatchDay = clampDay(invoiceDispatchDay);
  if (asOfDay < dispatchDay) return 0;

  const daysInMonth = new Date(billingYear, billingMonth, 0).getDate();
  const elapsed = asOfDay - dispatchDay + 1;
  return Math.round(fullTarget * (elapsed / daysInMonth));
}

/** Payroll liability for the service month before the selected billing period. */
export function payrollLiabilityServiceMonth(
  selectedYear: number,
  selectedMonth: number,
): { year: number; month: number; monthKey: string } {
  const prior = previousCalendarMonth(selectedYear, selectedMonth);
  return {
    ...prior,
    monthKey: monthKeyFromParts(prior.year, prior.month),
  };
}

export function asOfForCashflowGap(serviceMonthKey: string, now: Date = new Date()): Date {
  const { year, month } = billingMonthAfterService(serviceMonthKey);
  const billingEnd = new Date(year, month, 0, 23, 59, 59, 999);
  return now.getTime() > billingEnd.getTime() ? billingEnd : now;
}

/** True once the billing month for a service period reaches `collectionWarningDay`. */
export function isCollectionWarningDayReached(
  serviceMonthKey: string,
  collectionWarningDay: number,
  asOf: Date = new Date(),
): boolean {
  const { year: billingYear, month: billingMonth } = billingMonthAfterService(serviceMonthKey);
  const asOfYear = asOf.getFullYear();
  const asOfMonth = asOf.getMonth() + 1;
  const asOfDay = asOf.getDate();

  if (asOfYear < billingYear || (asOfYear === billingYear && asOfMonth < billingMonth)) {
    return false;
  }

  if (asOfYear > billingYear || (asOfYear === billingYear && asOfMonth > billingMonth)) {
    return true;
  }

  return asOfDay >= clampDay(collectionWarningDay);
}

export function collectionCashShortfall(gapTarget: number, cashReceived: number): number {
  return Math.max(0, gapTarget - cashReceived);
}

export type CollectionWarningEvaluation = {
  active: boolean;
  shortfall: number;
  gapTarget: number;
  warningDayReached: boolean;
};

/** Gate MD / EA collection alerts on billing-cycle warning day, cash shortfall, and dispute holds. */
export function evaluateCollectionWarning(input: {
  gapTarget: number;
  cashReceived: number;
  serviceMonthKey: string;
  collectionWarningDay: number;
  silencedByDisputes: boolean;
  asOf?: Date;
}): CollectionWarningEvaluation {
  const gapTarget = Math.max(0, input.gapTarget);
  const shortfall = collectionCashShortfall(gapTarget, input.cashReceived);
  const warningDayReached = isCollectionWarningDayReached(
    input.serviceMonthKey,
    input.collectionWarningDay,
    input.asOf,
  );
  const active = warningDayReached && shortfall > 0 && !input.silencedByDisputes;

  return { active, shortfall, gapTarget, warningDayReached };
}
