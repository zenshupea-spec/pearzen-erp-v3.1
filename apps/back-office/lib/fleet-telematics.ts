import { getDistanceInMeters } from './geofence';

type TripSeverity = 'RECKLESS' | 'SPEEDING' | 'AGGRESSIVE';

/** Colombo metro bounds mapped to the fleet SVG (800×420). */
export const COLOMBO_MAP_BOUNDS = {
  minLat: 6.85,
  maxLat: 6.98,
  minLng: 79.82,
  maxLng: 79.92,
  width: 800,
  height: 420,
} as const;

export type MapPoint = { x: number; y: number; lat: number; lng: number };

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function latLngToMapXY(lat: number, lng: number): { x: number; y: number } {
  const { minLat, maxLat, minLng, maxLng, width, height } = COLOMBO_MAP_BOUNDS;
  const x = ((lng - minLng) / (maxLng - minLng)) * width;
  const y = ((maxLat - lat) / (maxLat - minLat)) * height;
  return {
    x: Math.round(clamp(x, 0, width)),
    y: Math.round(clamp(y, 0, height)),
  };
}

export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  return getDistanceInMeters(lat1, lng1, lat2, lng2) / 1000;
}

export function buildRoutePath(points: MapPoint[]): string {
  if (points.length === 0) return '';
  if (points.length === 1) return `M ${points[0].x},${points[0].y}`;

  let path = `M ${points[0].x},${points[0].y}`;
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const cx = Math.round((prev.x + curr.x) / 2);
    const cy = Math.round((prev.y + curr.y) / 2);
    path += ` Q ${prev.x},${prev.y} ${cx},${cy}`;
  }
  const last = points[points.length - 1];
  path += ` T ${last.x},${last.y}`;
  return path;
}

export function deriveVehicleStatus(
  speedKmh: number,
  lastPingAt: Date,
  now = new Date(),
): 'ONLINE' | 'PARKED' | 'IDLE' {
  const ageMs = now.getTime() - lastPingAt.getTime();
  if (ageMs >= 15 * 60 * 1000) return 'PARKED';
  if (speedKmh >= 5) return 'ONLINE';
  return 'IDLE';
}

export function estimateExpectedMins(distanceKm: number): number {
  if (distanceKm <= 0) return 2;
  const urbanAvgKmh = 28;
  return Math.max(2, Math.round((distanceKm / urbanAvgKmh) * 60));
}

export function evaluateTripSeverity(input: {
  actualMins: number;
  expectedMins: number;
  avgSpeedKmh: number;
  speedLimitKmh?: number;
}): { flagged: boolean; severity: TripSeverity | null } {
  const speedLimit = input.speedLimitKmh ?? 50;
  const timeRatio = input.expectedMins > 0 ? input.actualMins / input.expectedMins : 1;

  if (timeRatio >= 0.7 && input.avgSpeedKmh <= speedLimit) {
    return { flagged: false, severity: null };
  }

  if (timeRatio < 0.55 || input.avgSpeedKmh >= speedLimit + 15) {
    return { flagged: true, severity: 'RECKLESS' };
  }
  if (input.avgSpeedKmh > speedLimit) {
    return { flagged: true, severity: 'SPEEDING' };
  }
  return { flagged: true, severity: 'AGGRESSIVE' };
}

export function parseRoutePoints(raw: unknown): MapPoint[] {
  if (!Array.isArray(raw)) return [];
  const out: MapPoint[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    const lat = Number(row.lat);
    const lng = Number(row.lng);
    const x = Number(row.x);
    const y = Number(row.y);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    out.push({
      lat,
      lng,
      x: Number.isFinite(x) ? x : latLngToMapXY(lat, lng).x,
      y: Number.isFinite(y) ? y : latLngToMapXY(lat, lng).y,
    });
  }
  return out;
}

export function appendRoutePoint(points: MapPoint[], lat: number, lng: number): MapPoint[] {
  const { x, y } = latLngToMapXY(lat, lng);
  const last = points[points.length - 1];
  if (last && last.x === x && last.y === y) return points;
  return [...points, { x, y, lat, lng }];
}

export const FLEET_TELEMATICS = {
  tripStartSpeedKmh: 15,
  tripEndSpeedKmh: 5,
  tripIdleMinutes: 3,
  minTripDistanceKm: 0.3,
  minTripDurationMins: 2,
  pingRetentionDays: 7,
  routeRetentionDays: 60,
  staleOnlineMinutes: 15,
} as const;
