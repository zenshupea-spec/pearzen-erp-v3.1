import { loadInternalWorkLocationsForCompany } from './internal-work-locations';
import { createSupabaseServiceClient } from '../../../packages/supabase/service';

export {
  haversineDistanceM,
  isWithinHeadOfficeGeofence,
  parseHeadOfficeCoordinates,
} from './head-office-geofence-core';
export type { HeadOfficeGeofenceLocation } from './head-office-geofence-core';

import {
  haversineDistanceM,
  isWithinHeadOfficeGeofence,
} from './head-office-geofence-core';

export async function verifyHeadOfficeGeofenceForCompany(
  companyId: string | null | undefined,
  lat: number,
  lng: number,
): Promise<boolean> {
  const resolvedCompanyId = companyId?.trim();
  if (!resolvedCompanyId) return false;
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

  const resolvedCompanyId = companyId?.trim();
  if (!resolvedCompanyId) {
    return actorIsExecutive ? 'Remote · Executive console' : 'Location unavailable';
  }

  const service = createSupabaseServiceClient();
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
