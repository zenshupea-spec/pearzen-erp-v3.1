/** Roster vs biometric tolerance — OM Integrity queue (45-minute rule). */
export const ROSTER_CHECKIN_TOLERANCE_MS = 45 * 60 * 1000;

export type CheckInIntegrityResult = {
  status: 'PENDING' | 'PENDING_RESOLUTION';
  rostered_start: string | null;
  biometric_check_in: string | null;
  is_overlap_conflict: boolean;
};

/**
 * Decide whether a guard check-in belongs in the OM discrepancy queue.
 * Triggers: roster time differs from device time by >45 min, or shift overlap.
 */
export function resolveCheckInIntegrity(
  rosteredStartIso: string,
  deviceTimeIso: string,
  isOverlapConflict: boolean,
): CheckInIntegrityResult {
  const delta = Math.abs(Date.parse(deviceTimeIso) - Date.parse(rosteredStartIso));
  const exceedsTolerance = delta > ROSTER_CHECKIN_TOLERANCE_MS;
  const needsResolution = exceedsTolerance || isOverlapConflict;

  if (!needsResolution) {
    return {
      status: 'PENDING',
      rostered_start: null,
      biometric_check_in: null,
      is_overlap_conflict: false,
    };
  }

  return {
    status: 'PENDING_RESOLUTION',
    rostered_start: rosteredStartIso,
    biometric_check_in: deviceTimeIso,
    is_overlap_conflict: isOverlapConflict,
  };
}
