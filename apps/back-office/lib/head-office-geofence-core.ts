export type HeadOfficeGeofenceLocation = {
  latitude: number;
  longitude: number;
  geofenceRadiusM: number;
};

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

function isProductionHeadOfficeGeofenceRuntime(): boolean {
  return (
    process.env.NODE_ENV === 'production' ||
    process.env.VERCEL_ENV === 'production'
  );
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
    // Fail-closed in production when tenant HO locations and env coords are unset.
    return !isProductionHeadOfficeGeofenceRuntime();
  }

  return haversineDistanceM(lat, lng, headOfficeLat, headOfficeLng) <= radiusKm * 1000;
}

export function isWithinHeadOfficeGeofence(
  lat: number,
  lng: number,
  locations: HeadOfficeGeofenceLocation[],
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
