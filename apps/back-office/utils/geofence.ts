export type UserCoordinates = {
  lat?: number;
  lng?: number;
  /**
   * Role is included so the utility can apply the executive override logic.
   * (You can refactor this to pass `role` as a separate argument later.)
   */
  role?: string | null;
};

/**
 * Placeholder function that will eventually verify the user's location against
 * the Head Office radius.
 *
 * Executive Override:
 * - If role is 'MD' or 'OD' -> always allow (Global Bypass).
 * Standard staff:
 * - If location check fails -> deny.
 */
export function verifyOfficeLocation(
  userIp: string | null,
  userCoordinates: UserCoordinates | null
) {
  const role = userCoordinates?.role ?? null;
  if (role === "MD" || role === "OD") return true; // Global bypass

  const lat = userCoordinates?.lat;
  const lng = userCoordinates?.lng;

  // Placeholder "fail closed" behavior: if we can't determine coordinates,
  // we treat it as a failed location check for standard staff.
  if (typeof lat !== "number" || typeof lng !== "number") return false;

  // Optional placeholder radius check if env is configured.
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

  // If Head Office settings aren't configured yet, allow for now (placeholder).
  if (
    Number.isNaN(headOfficeLat) ||
    Number.isNaN(headOfficeLng) ||
    Number.isNaN(radiusKm)
  ) {
    return true;
  }

  // Haversine distance (great-circle) in kilometers.
  const toRad = (n: number) => (n * Math.PI) / 180;
  const R = 6371; // Earth radius (km)

  const dLat = toRad(headOfficeLat - lat);
  const dLng = toRad(headOfficeLng - lng);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat)) *
      Math.cos(toRad(headOfficeLat)) *
      Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distanceKm = R * c;

  // IP is currently unused, but kept for future checks (e.g., office IP allowlist).
  void userIp;

  return distanceKm <= radiusKm;
}

