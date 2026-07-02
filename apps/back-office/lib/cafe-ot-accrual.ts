import { normalizeCafeOpenTime } from '../../../packages/cafe-open-hours';

import {
  cafeMarginalOtHours,
  DEFAULT_CAFE_WEEKLY_OT_THRESHOLD_HOURS,
} from './cafe-weekly-ot';

export type CafeOtAccrualResult = {
  otHours: number;
  otLkr: number;
  /** Minutes counted toward OT after cutoff clip (for validation). */
  otMinutes: number;
};

function timeHmToMinutes(hhmm: string): number {
  const normalized = normalizeCafeOpenTime(hhmm, '19:00');
  const [h, m] = normalized.split(':').map(Number);
  return h * 60 + m;
}

function isoToLocalMinutes(iso: string): number {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return NaN;
  return d.getHours() * 60 + d.getMinutes();
}

/** Shift span in hours — check-in to checkout clipped at cutoff (R-CAF-02). */
export function cafeShiftHoursFromMinutes(input: {
  checkinMinutes: number;
  checkoutMinutes: number;
  cutoffMinutes: number;
}): number {
  const checkin = Number(input.checkinMinutes);
  const checkout = Number(input.checkoutMinutes);
  const cutoff = Number(input.cutoffMinutes);

  if (!Number.isFinite(checkin) || !Number.isFinite(checkout) || checkout <= checkin) {
    return 0;
  }

  const effectiveEnd = Math.min(checkout, cutoff);
  const minutes = Math.max(0, effectiveEnd - checkin);
  return Math.round((minutes / 60) * 100) / 100;
}

/** Core OT accrual — clip checkout at `cafeOtCutoffTime`, then weekly marginal OT (R-CAF-03). */
export function accrueCafeOtMinutes(input: {
  checkinMinutes: number;
  checkoutMinutes: number;
  cutoffMinutes: number;
  otRatePerHour: number;
  weeklyHoursBefore?: number;
  cafeWeeklyOtThresholdHours?: number;
}): CafeOtAccrualResult {
  const rate = Math.max(0, Number(input.otRatePerHour) || 0);
  const shiftHours = cafeShiftHoursFromMinutes(input);

  if (shiftHours <= 0) {
    return { otHours: 0, otLkr: 0, otMinutes: 0 };
  }

  const otHours = cafeMarginalOtHours({
    shiftHours,
    weeklyHoursBefore: input.weeklyHoursBefore ?? 0,
    weeklyThresholdHours:
      input.cafeWeeklyOtThresholdHours ?? DEFAULT_CAFE_WEEKLY_OT_THRESHOLD_HOURS,
  });
  const otMinutes = Math.round(otHours * 60);
  const otLkr = Math.round(otHours * rate);

  return { otHours, otLkr, otMinutes };
}

export function accrueCafeOtFromCheckin(input: {
  checkedInAt: string;
  checkedOutAt: string | null | undefined;
  cafeOtCutoffTime: string;
  otRatePerHour: number;
  weeklyHoursBefore?: number;
  cafeWeeklyOtThresholdHours?: number;
}): CafeOtAccrualResult {
  if (!input.checkedInAt?.trim() || !input.checkedOutAt?.trim()) {
    return { otHours: 0, otLkr: 0, otMinutes: 0 };
  }

  const checkinMinutes = isoToLocalMinutes(input.checkedInAt);
  const checkoutMinutes = isoToLocalMinutes(input.checkedOutAt);
  if (!Number.isFinite(checkinMinutes) || !Number.isFinite(checkoutMinutes)) {
    return { otHours: 0, otLkr: 0, otMinutes: 0 };
  }

  return accrueCafeOtMinutes({
    checkinMinutes,
    checkoutMinutes,
    cutoffMinutes: timeHmToMinutes(input.cafeOtCutoffTime),
    otRatePerHour: input.otRatePerHour,
    weeklyHoursBefore: input.weeklyHoursBefore,
    cafeWeeklyOtThresholdHours: input.cafeWeeklyOtThresholdHours,
  });
}
