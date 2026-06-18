import type { InternalWorkLocation } from './internal-work-locations';
import { loadInternalWorkLocationsForCompany } from './internal-work-locations';
import { CLASSIC_VENTURE_COMPANY_ID } from './company-context';
import { createSupabaseServiceClient } from '../../../packages/supabase/service';

export function haversineDistanceM(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const toRad = (n: number) => (n * Math.PI) / 180;
  const earthRadiusM = 6_371_000;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * earthRadiusM * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function legacyEnvHeadOfficeGeofence(lat: number, lng: number): boolean {
  const headOfficeLatRaw = process.env.HEAD_OFFICE_LAT;
  const headOfficeLngRaw = process.env.HEAD_OFFICE_LNG;
  const radiusKmRaw =
    process.env.HEAD_OFFICE_RADIUS_KM ?? process.env.HEAD_OFFICE_RADIUS_KM_STR;

  const headOfficeLat = headOfficeLatRaw
    ? Number.parseFloat(headOfficeLatRaw)
    : Number.NaN;
  const headOfficeLng = headOfficeLngRaw
    ? Number.parseFloat(headOfficeLngRaw)
    : Number.NaN;
  const radiusKm = radiusKmRaw
    ? Number.parseFloat(String(radiusKmRaw))
    : Number.NaN;

  if (
    Number.isNaN(headOfficeLat) ||
    Number.isNaN(headOfficeLng) ||
    Number.isNaN(radiusKm)
  ) {
    return true;
  }

  return haversineDistanceM(lat, lng, headOfficeLat, headOfficeLng) <= radiusKm * 1000;
}

export function isWithinHeadOfficeGeofence(
  lat: number,
  lng: number,
  locations: InternalWorkLocation[],
): boolean {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;

  const configured = locations.filter(
    (loc) =>
      Number.isFinite(loc.latitude) &&
      Number.isFinite(loc.longitude) &&
      loc.latitude !== 0 &&
      loc.longitude !== 0,
  );

  if (configured.length === 0) {
    return legacyEnvHeadOfficeGeofence(lat, lng);
  }

  return configured.some((loc) => {
    const distanceM = haversineDistanceM(
      lat,
      lng,
      loc.latitude,
      loc.longitude,
    );
    return distanceM <= loc.geofenceRadiusM;
  });
}

export async function verifyHeadOfficeGeofenceForCompany(
  companyId: string | null | undefined,
  lat: number,
  lng: number,
): Promise<boolean> {
  const resolvedCompanyId = companyId?.trim() || CLASSIC_VENTURE_COMPANY_ID;
  const service = createSupabaseServiceClient();
  const settings = await loadInternalWorkLocationsForCompany(
    service,
    resolvedCompanyId,
  );
  return isWithinHeadOfficeGeofence(lat, lng, settings.headOffice);
}

export async function resolveHeadOfficeProvisionerLocationLabel(
  companyId: string | null | undefined,
  lat: number | null | undefined,
  lng: number | null | undefined,
  actorIsExecutive = false,
): Promise<string> {
  if (lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return actorIsExecutive ? 'Remote · Executive console' : 'Location unavailable';
  }

  const service = createSupabaseServiceClient();
  const resolvedCompanyId = companyId?.trim() || CLASSIC_VENTURE_COMPANY_ID;
  const settings = await loadInternalWorkLocationsForCompany(service, resolvedCompanyId);

  const configured = settings.headOffice.filter(
    (loc) =>
      Number.isFinite(loc.latitude) &&
      Number.isFinite(loc.longitude) &&
      loc.latitude !== 0 &&
      loc.longitude !== 0,
  );

  for (const loc of configured) {
    const distanceM = haversineDistanceM(lat, lng, loc.latitude, loc.longitude);
    if (distanceM <= loc.geofenceRadiusM) {
      return loc.name;
    }
  }

  if (actorIsExecutive) {
    return `Remote · ${lat.toFixed(4)}, ${lng.toFixed(4)}`;
  }

  return `Off-site · ${lat.toFixed(4)}, ${lng.toFixed(4)}`;
}

export function parseHeadOfficeCoordinates(
  latRaw: unknown,
  lngRaw: unknown,
): { lat: number; lng: number } | null {
  const lat =
    typeof latRaw === 'number'
      ? latRaw
      : Number.parseFloat(String(latRaw ?? '').trim());
  const lng =
    typeof lngRaw === 'number'
      ? lngRaw
      : Number.parseFloat(String(lngRaw ?? '').trim());

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}
