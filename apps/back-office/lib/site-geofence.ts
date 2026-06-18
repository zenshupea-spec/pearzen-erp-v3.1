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

export function formatGpsCoords(lat: number, lng: number): string {
  const hasLat = Number.isFinite(lat) && lat !== 0;
  const hasLng = Number.isFinite(lng) && lng !== 0;
  if (!hasLat && !hasLng) return '';
  return `${lat}, ${lng}`;
}

export function parseGpsCoords(input: string): { lat: number | null; lng: number | null } {
  const parts = input.split(',').map((part) => part.trim());
  const latRaw = parts[0] ?? '';
  const lngRaw = parts[1] ?? '';
  const lat = latRaw ? Number.parseFloat(latRaw) : null;
  const lng = lngRaw ? Number.parseFloat(lngRaw) : null;
  return {
    lat: lat != null && Number.isFinite(lat) ? lat : null,
    lng: lng != null && Number.isFinite(lng) ? lng : null,
  };
}

/** Pick a Maps zoom level so the geofence diameter fits comfortably in view. */
export function zoomForGeofenceRadiusM(lat: number, radiusM: number): number {
  const radius = clampGeofenceRadiusM(radiusM);
  const latRad = (lat * Math.PI) / 180;
  const viewDiameterM = Math.max(radius * 2.8, 30);
  const metersPerPixel = viewDiameterM / 512;
  const zoom = Math.log2((156543.03392 * Math.cos(latRad)) / metersPerPixel);
  return Math.max(14, Math.min(20, Math.round(zoom)));
}

/** Opens OpenStreetMap centered on the geofence (no API key). */
export function buildOpenStreetMapExternalUrl(
  lat: number,
  lng: number,
  radiusM: number,
): string | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) return null;
  const zoom = zoomForGeofenceRadiusM(lat, radiusM);
  return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=${zoom}/${lat}/${lng}`;
}

/** Opens Google Maps with a pin dropped on the GPS coordinates. */
export function buildGoogleMapsExternalUrl(
  lat: number,
  lng: number,
  _radiusM?: number,
): string | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) return null;
  return `https://maps.google.com/?q=${lat},${lng}`;
}

export const GEOFENCE_MAP_WIDTH = 640;
export const GEOFENCE_MAP_HEIGHT = 480;

export function metersPerPixelAtLatZoom(lat: number, zoom: number): number {
  const latRad = (lat * Math.PI) / 180;
  return (156543.03392 * Math.cos(latRad)) / 2 ** zoom;
}

export function geofenceCircleRadiusPx(lat: number, radiusM: number, zoom: number): number {
  return clampGeofenceRadiusM(radiusM) / metersPerPixelAtLatZoom(lat, zoom);
}

export type GeofenceMapPreview = {
  lat: number;
  lng: number;
  radiusM: number;
  zoom: number;
  mapWidth: number;
  mapHeight: number;
  circleRadiusPx: number;
};

export function buildGeofenceMapPreview(
  lat: number,
  lng: number,
  radiusM: number,
): GeofenceMapPreview | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) return null;
  const radius = clampGeofenceRadiusM(radiusM);
  const zoom = zoomForGeofenceRadiusM(lat, radius);
  return {
    lat,
    lng,
    radiusM: radius,
    zoom,
    mapWidth: GEOFENCE_MAP_WIDTH,
    mapHeight: GEOFENCE_MAP_HEIGHT,
    circleRadiusPx: geofenceCircleRadiusPx(lat, radius, zoom),
  };
}

/** Bounding box sized so the geofence diameter fits comfortably in map view. */
export function bboxForGeofenceRadiusM(lat: number, lng: number, radiusM: number) {
  const radius = clampGeofenceRadiusM(radiusM);
  const latRad = (lat * Math.PI) / 180;
  const viewDiameterM = Math.max(radius * 2.8, 30);
  const latDelta = viewDiameterM / 2 / 111320;
  const lngDelta = viewDiameterM / 2 / (111320 * Math.cos(latRad));
  return {
    minLat: lat - latDelta,
    maxLat: lat + latDelta,
    minLng: lng - lngDelta,
    maxLng: lng + lngDelta,
  };
}

export const OSM_TILE_SIZE = 256;

export function latLngToWorldPixel(lat: number, lng: number, zoom: number): { x: number; y: number } {
  const scale = OSM_TILE_SIZE * 2 ** zoom;
  const x = ((lng + 180) / 360) * scale;
  const sinLat = Math.sin((lat * Math.PI) / 180);
  const y = (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * scale;
  return { x, y };
}

export type OsmMapTile = {
  key: string;
  url: string;
  left: number;
  top: number;
};

/** Tile grid for a fixed-size map viewport (no iframe, no API key). */
export function osmTilesForView(
  lat: number,
  lng: number,
  zoom: number,
  width: number,
  height: number,
): OsmMapTile[] {
  const center = latLngToWorldPixel(lat, lng, zoom);
  const tileCount = 2 ** zoom;

  const minX = Math.floor((center.x - width / 2) / OSM_TILE_SIZE);
  const maxX = Math.floor((center.x + width / 2) / OSM_TILE_SIZE);
  const minY = Math.floor((center.y - height / 2) / OSM_TILE_SIZE);
  const maxY = Math.floor((center.y + height / 2) / OSM_TILE_SIZE);

  const tiles: OsmMapTile[] = [];
  for (let tx = minX; tx <= maxX; tx += 1) {
    for (let ty = minY; ty <= maxY; ty += 1) {
      if (ty < 0 || ty >= tileCount) continue;
      const wrappedX = ((tx % tileCount) + tileCount) % tileCount;
      tiles.push({
        key: `${zoom}/${wrappedX}/${ty}`,
        url: `https://tile.openstreetmap.org/${zoom}/${wrappedX}/${ty}.png`,
        left: tx * OSM_TILE_SIZE - center.x + width / 2,
        top: ty * OSM_TILE_SIZE - center.y + height / 2,
      });
    }
  }
  return tiles;
}

