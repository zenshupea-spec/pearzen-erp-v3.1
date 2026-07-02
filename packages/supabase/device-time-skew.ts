/** Maximum allowed |server_now − device_time| for live attendance submissions. */
export const DEVICE_CLOCK_SKEW_MS = 5 * 60 * 1000;

/** Offline vault replays older than this are rejected (stale queue cleanup). */
export const OFFLINE_REPLAY_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export function parseDeviceTimeMs(deviceTime: string): number | null {
  const ms = Date.parse(deviceTime);
  return Number.isFinite(ms) ? ms : null;
}

export function deviceClockSkewMs(
  deviceTimeMs: number,
  serverNowMs: number = Date.now(),
): number {
  return Math.abs(serverNowMs - deviceTimeMs);
}

export type DeviceClockSkewResult =
  | { ok: true; skewMs: number; offlineReplay?: boolean }
  | { ok: false; error: string };

/**
 * Clock-skew policy:
 * - Live pings (`sync_type !== OFFLINE_CACHE`): reject when skew > 5 min.
 * - Offline replay (`OFFLINE_CACHE`): skip live skew gate (device_time is the
 *   event timestamp). Accept for OM review via roster/discrepancy rules; reject
 *   only if device_time is in the future or older than 7 days.
 */
export function evaluateDeviceClockSkew(
  deviceTimeIso: string,
  options?: { offlineReplay?: boolean; serverNowMs?: number },
): DeviceClockSkewResult {
  const deviceMs = parseDeviceTimeMs(deviceTimeIso);
  if (deviceMs === null) {
    return { ok: false, error: 'INVALID_DEVICE_TIME' };
  }

  const serverMs = options?.serverNowMs ?? Date.now();

  if (options?.offlineReplay) {
    if (deviceMs > serverMs + DEVICE_CLOCK_SKEW_MS) {
      return { ok: false, error: 'INVALID_DEVICE_TIME' };
    }
    if (serverMs - deviceMs > OFFLINE_REPLAY_MAX_AGE_MS) {
      return { ok: false, error: 'OFFLINE_PING_EXPIRED' };
    }
    return {
      ok: true,
      skewMs: deviceClockSkewMs(deviceMs, serverMs),
      offlineReplay: true,
    };
  }

  const skewMs = deviceClockSkewMs(deviceMs, serverMs);
  if (skewMs > DEVICE_CLOCK_SKEW_MS) {
    return { ok: false, error: 'DEVICE_CLOCK_SKEW' };
  }

  return { ok: true, skewMs };
}
