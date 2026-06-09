/** MD sets geofence radius at site registration; OM only captures GPS coordinates. */
export const DEFAULT_GEOFENCE_RADIUS_M = 10;
export const MIN_GEOFENCE_RADIUS_M = 1;
export const MAX_GEOFENCE_RADIUS_M = 25;

export function clampGeofenceRadiusM(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_GEOFENCE_RADIUS_M;
  return Math.min(MAX_GEOFENCE_RADIUS_M, Math.max(MIN_GEOFENCE_RADIUS_M, Math.round(value)));
}

export function resolveGeofenceRadiusM(
  stored: number | null | undefined,
): number {
  if (stored == null) return DEFAULT_GEOFENCE_RADIUS_M;
  return clampGeofenceRadiusM(stored);
}
