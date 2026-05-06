const TAMPER_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes in milliseconds

export interface TimeCheckResult {
  isTampered: boolean;
  timeDifferenceMinutes: number;
  deviceTime: number;
}

/**
 * Validates the device time against the hardware GPS timestamp.
 * Flags RED (true) if the difference exceeds 5 minutes.
 */
export const verifyDualClock = (gpsTimestamp: number): TimeCheckResult => {
  const deviceTime = Date.now();
  
  // Calculate absolute difference between device time and GPS satellite time
  const differenceMs = Math.abs(deviceTime - gpsTimestamp);
  const timeDifferenceMinutes = parseFloat((differenceMs / (1000 * 60)).toFixed(2));
  
  const isTampered = differenceMs > TAMPER_THRESHOLD_MS;

  if (isTampered) {
    console.warn(`🚨 TAMPER ALERT: Device time differs from GPS time by ${timeDifferenceMinutes} minutes.`);
  }

  return {
    isTampered,
    timeDifferenceMinutes,
    deviceTime
  };
};