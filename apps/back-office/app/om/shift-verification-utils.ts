import type { ShiftVerificationRecord } from './actions';

export type ShiftTimingSettings = {
  security_day_start: string;
  security_day_end: string;
  security_night_start: string;
  security_night_end: string;
};

export type ShiftAggregateStatus = 'PENDING' | 'FLAGGED' | 'APPROVED' | 'REJECTED';

/** Rolling retention for field verification selfies (and SM visit photos). */
export const VERIFICATION_PHOTO_RETENTION_DAYS = 60;

const LATE_EARLY_THRESHOLD_MINUTES = 15;
const TIMING_CLEARED_TAG = 'TIMING_OK';

function colomboToUTC(timeStr: string): { hour: number; minute: number } | null {
  const parts = timeStr.split(':');
  if (parts.length < 2) return null;
  const localHour = parseInt(parts[0], 10);
  const localMinute = parseInt(parts[1], 10);
  if (isNaN(localHour) || isNaN(localMinute)) return null;

  let utcMinute = localMinute - 30;
  let utcHour = localHour - 5;
  if (utcMinute < 0) {
    utcMinute += 60;
    utcHour -= 1;
  }
  if (utcHour < 0) {
    utcHour += 24;
  }
  return { hour: utcHour, minute: utcMinute };
}

function mdTimeOnDate(shiftDate: string, timeStr: string): Date | null {
  const utc = colomboToUTC(timeStr);
  if (!utc) return null;
  const dt = new Date(`${shiftDate}T00:00:00Z`);
  dt.setUTCHours(utc.hour, utc.minute, 0, 0);
  return dt;
}

export function inferShiftType(
  checkInIso: string,
  settings: ShiftTimingSettings,
): 'DAY' | 'NIGHT' {
  const checkIn = new Date(checkInIso);
  const shiftDate = checkInIso.slice(0, 10);
  const dayStart = mdTimeOnDate(shiftDate, settings.security_day_start);
  const dayEnd = mdTimeOnDate(shiftDate, settings.security_day_end);
  if (dayStart && dayEnd && checkIn >= dayStart && checkIn < dayEnd) {
    return 'DAY';
  }
  return 'NIGHT';
}

function getExpectedStart(
  shiftDate: string,
  shiftType: 'DAY' | 'NIGHT',
  settings: ShiftTimingSettings,
): Date | null {
  const timeStr =
    shiftType === 'DAY' ? settings.security_day_start : settings.security_night_start;
  return mdTimeOnDate(shiftDate, timeStr);
}

function getExpectedEnd(
  shiftDate: string,
  shiftType: 'DAY' | 'NIGHT',
  settings: ShiftTimingSettings,
): Date | null {
  const timeStr =
    shiftType === 'DAY' ? settings.security_day_end : settings.security_night_end;
  const end = mdTimeOnDate(shiftDate, timeStr);
  if (!end) return null;

  if (shiftType === 'NIGHT') {
    const nightStart = mdTimeOnDate(shiftDate, settings.security_night_start);
    if (nightStart && end <= nightStart) {
      const nextDate = new Date(`${shiftDate}T12:00:00Z`);
      nextDate.setUTCDate(nextDate.getUTCDate() + 1);
      return mdTimeOnDate(nextDate.toISOString().slice(0, 10), settings.security_night_end);
    }
  }
  return end;
}

export function deriveAggregateStatus(
  checkInStatus: string | null | undefined,
  checkOutStatus: string | null | undefined,
): ShiftAggregateStatus {
  const statuses = [checkInStatus, checkOutStatus].filter(Boolean) as string[];
  if (!statuses.length) return 'PENDING';
  if (statuses.some((s) => s === 'REJECTED')) return 'REJECTED';
  if (statuses.every((s) => s === 'APPROVED')) return 'APPROVED';
  if (statuses.some((s) => s === 'FLAGGED')) return 'FLAGGED';
  return 'PENDING';
}

export function computeShiftTiming(
  shift: Pick<ShiftVerificationRecord, 'shiftDate' | 'checkIn' | 'checkOut'>,
  settings: ShiftTimingSettings,
): {
  shiftType: 'DAY' | 'NIGHT' | null;
  isLateStart: boolean;
  isEarlyCheckout: boolean;
  lateMinutes: number | null;
  earlyMinutes: number | null;
} {
  const empty = {
    shiftType: null as 'DAY' | 'NIGHT' | null,
    isLateStart: false,
    isEarlyCheckout: false,
    lateMinutes: null as number | null,
    earlyMinutes: null as number | null,
  };

  if (!shift.checkIn?.device_time) return empty;

  const shiftType = inferShiftType(shift.checkIn.device_time, settings);
  const expectedStart = getExpectedStart(shift.shiftDate, shiftType, settings);
  let isLateStart = false;
  let lateMinutes: number | null = null;

  if (expectedStart) {
    const checkInAt = new Date(shift.checkIn.device_time);
    const diffMs = checkInAt.getTime() - expectedStart.getTime();
    lateMinutes = Math.round(diffMs / 60000);
    isLateStart = lateMinutes > LATE_EARLY_THRESHOLD_MINUTES;
  }

  let isEarlyCheckout = false;
  let earlyMinutes: number | null = null;
  if (shift.checkOut?.device_time) {
    const expectedEnd = getExpectedEnd(shift.shiftDate, shiftType, settings);
    if (expectedEnd) {
      const checkOutAt = new Date(shift.checkOut.device_time);
      const diffMs = expectedEnd.getTime() - checkOutAt.getTime();
      earlyMinutes = Math.round(diffMs / 60000);
      isEarlyCheckout = earlyMinutes > LATE_EARLY_THRESHOLD_MINUTES;
    }
  }

  return { shiftType, isLateStart, isEarlyCheckout, lateMinutes, earlyMinutes };
}

export function hasCompleteFieldPhotos(shift: ShiftVerificationRecord) {
  return Boolean(shift.checkIn?.photo_url && shift.checkOut?.photo_url);
}

export function hasMissingFieldPhoto(shift: ShiftVerificationRecord) {
  return !shift.checkIn?.photo_url || !shift.checkOut?.photo_url;
}

export function isActiveForVerification(status: ShiftAggregateStatus) {
  return status === 'PENDING' || status === 'FLAGGED';
}

export function timingHoldCleared(shift: ShiftVerificationRecord) {
  const hasTag = (sync: string | null | undefined) =>
    Boolean(sync?.includes(TIMING_CLEARED_TAG));
  return hasTag(shift.checkIn?.sync_type) || hasTag(shift.checkOut?.sync_type);
}

/** Payroll blocked until photos uploaded or timing exception cleared. */
export function isOnHold(shift: ShiftVerificationRecord) {
  if (!isActiveForVerification(shift.aggregateStatus)) return false;
  if (isMissedManualCheckout(shift)) return true;
  if (hasMissingFieldPhoto(shift)) return true;
  if (
    (shift.isLateStart || shift.isEarlyCheckout) &&
    !timingHoldCleared(shift)
  ) {
    return true;
  }
  return false;
}

export function photoRetentionCutoffDate() {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - VERIFICATION_PHOTO_RETENTION_DAYS);
  return d.toISOString().slice(0, 10);
}

export function isVerificationPhotoExpired(shiftDate: string) {
  return shiftDate < photoRetentionCutoffDate();
}

/** Shifts with both selfies ready for 3-point photo review (not on hold). */
export function isPhotoVerificationQueue(shift: ShiftVerificationRecord) {
  if (!hasCompleteFieldPhotos(shift)) return false;
  if (!isActiveForVerification(shift.aggregateStatus)) return false;
  if (isOnHold(shift)) return false;
  return true;
}

/** Shifts TM/OM can action in the active verification grid (includes flagged auto check-outs). */
export function isReviewableVerificationShift(shift: ShiftVerificationRecord) {
  if (!shift.checkIn) return false;
  if (!isActiveForVerification(shift.aggregateStatus)) return false;
  if (isPhotoVerificationQueue(shift)) return true;
  if (isMissedManualCheckout(shift)) return true;
  if (shift.aggregateStatus === 'FLAGGED' && shift.checkOut) return true;
  // Open shift: show live check-in selfies while the guard is still on site.
  if (!shift.checkOut && shift.checkIn.photo_url) return true;
  return false;
}

/** Keep the latest check-in/out when multiple logs share the same guard + shift date. */
export function mergeAttendanceLogIntoShift<
  T extends { device_time: string },
>(
  record: { checkIn: T | null; checkOut: T | null },
  actionType: string,
  log: T,
) {
  if (actionType === 'CHECK_IN') {
    if (!record.checkIn || log.device_time > record.checkIn.device_time) {
      record.checkIn = log;
    }
    return;
  }
  if (actionType === 'CHECK_OUT') {
    if (!record.checkOut || log.device_time > record.checkOut.device_time) {
      record.checkOut = log;
    }
  }
}

/** Drop a check-out that belongs to an earlier session on the same calendar day. */
export function reconcileShiftCheckInOut<
  T extends { device_time: string },
>(record: { checkIn: T | null; checkOut: T | null }) {
  if (
    record.checkIn &&
    record.checkOut &&
    record.checkOut.device_time < record.checkIn.device_time
  ) {
    record.checkOut = null;
  }
}

/**
 * Pair synthetic AUTO_CHECKOUT rows with their open check-in when the
 * check-out device_time falls on the next Colombo calendar day (night shifts).
 */
export function attachOrphanAutoCheckouts(
  grouped: Map<string, ShiftVerificationRecord>,
): void {
  const orphans: ShiftVerificationRecord[] = [];

  for (const [key, record] of grouped.entries()) {
    if (
      !record.checkIn &&
      record.checkOut?.sync_type === AUTO_CHECKOUT_SYNC_TYPE
    ) {
      orphans.push(record);
      grouped.delete(key);
    }
  }

  for (const orphan of orphans) {
    const checkout = orphan.checkOut!;
    let best: ShiftVerificationRecord | null = null;

    for (const record of grouped.values()) {
      if (record.empNumber !== orphan.empNumber || !record.checkIn) continue;
      if (record.checkIn.device_time > checkout.device_time) continue;
      if (
        record.checkOut &&
        record.checkOut.device_time >= checkout.device_time
      ) {
        continue;
      }
      if (!best || record.checkIn.device_time > best.checkIn!.device_time) {
        best = record;
      }
    }

    if (best) {
      best.checkOut = checkout;
      if (checkout.status === 'FLAGGED') {
        best.hasFlagged = true;
      }
    } else {
      grouped.set(orphan.shiftKey, orphan);
    }
  }
}

/** On-hold panel — timing/missing-photo holds not already in the review grid. */
export function isOnHoldPanelShift(shift: ShiftVerificationRecord) {
  if (!isOnHold(shift)) return false;
  if (isReviewableVerificationShift(shift)) return false;
  return true;
}

export type OnHoldReason =
  | 'missing_photo'
  | 'late_start'
  | 'early_checkout'
  | 'missed_checkout';

export const AUTO_CHECKOUT_SYNC_TYPE = 'AUTO_CHECKOUT';

export function isMissedManualCheckout(shift: ShiftVerificationRecord) {
  return shift.checkOut?.sync_type === AUTO_CHECKOUT_SYNC_TYPE;
}

export function getOnHoldReason(shift: ShiftVerificationRecord): OnHoldReason {
  if (isMissedManualCheckout(shift)) return 'missed_checkout';
  if (hasMissingFieldPhoto(shift)) return 'missing_photo';
  if (shift.isLateStart) return 'late_start';
  return 'early_checkout';
}

/** Parse unix-ms timestamp embedded in storage object paths (e.g. …-1778575280816.webp). */
export function parsePhotoCapturedAtFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const match = url.match(/-(\d{13})(?:\.[a-z0-9]+)?(?:\?|$)/i);
  if (!match) return null;
  const ms = Number(match[1]);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toISOString();
}

export function resolveIdPhotoCapturedAt(
  capturedAt: string | null | undefined,
  photoUrl: string | null | undefined,
): string | null {
  if (capturedAt) return capturedAt;
  return parsePhotoCapturedAtFromUrl(photoUrl);
}

export function formatIdPhotoDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: '2-digit',
  });
}
