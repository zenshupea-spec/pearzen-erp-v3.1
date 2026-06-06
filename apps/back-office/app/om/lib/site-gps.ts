export function siteNeedsGpsCapture(site: {
  latitude: number | null;
  longitude: number | null;
  needs_om_gps_capture?: boolean | null;
}): boolean {
  if (site.needs_om_gps_capture) return true;
  const { latitude: lat, longitude: lng } = site;
  if (lat == null || lng == null) return true;
  if (lat === 0 && lng === 0) return true;
  return false;
}
