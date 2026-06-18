import type { SecurityWebsiteLocale } from './security-website-i18n';

export type SiteLocality = {
  /** Suburb / neighbourhood — roughly a 10 km area, not the exact site address. */
  area: string | null;
  city: string | null;
  district: string | null;
};

const localityCache = new Map<string, SiteLocality>();

function cacheKey(lat: number, lng: number, locale: SecurityWebsiteLocale): string {
  return `${lat.toFixed(5)},${lng.toFixed(5)},${locale}`;
}

const NOMINATIM_ACCEPT_LANGUAGE: Record<SecurityWebsiteLocale, string> = {
  en: 'en',
  si: 'si',
  ta: 'ta',
};

function resolveGoogleMapsKey(): string | null {
  return (
    process.env.GOOGLE_MAPS_API_KEY?.trim() ||
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim() ||
    null
  );
}

type GoogleAddressComponent = {
  long_name: string;
  types: string[];
};

function pickGoogleComponent(
  components: GoogleAddressComponent[],
  types: string[],
): string | null {
  for (const type of types) {
    const match = components.find((component) => component.types.includes(type));
    if (match?.long_name?.trim()) return match.long_name.trim();
  }
  return null;
}

function parseGoogleLocality(components: GoogleAddressComponent[]): SiteLocality {
  const area = pickGoogleComponent(components, [
    'sublocality_level_1',
    'sublocality',
    'neighborhood',
    'administrative_area_level_3',
  ]);
  const city = pickGoogleComponent(components, ['locality', 'postal_town']);
  const district = pickGoogleComponent(components, [
    'administrative_area_level_2',
    'administrative_area_level_1',
  ]);
  return { area, city, district };
}

async function reverseGeocodeGoogle(
  lat: number,
  lng: number,
  apiKey: string,
  locale: SecurityWebsiteLocale,
): Promise<SiteLocality | null> {
  const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
  url.searchParams.set('latlng', `${lat},${lng}`);
  url.searchParams.set('key', apiKey);
  url.searchParams.set('language', locale);

  const response = await fetch(url, { next: { revalidate: 86_400 } });
  if (!response.ok) return null;

  const payload = (await response.json()) as {
    status?: string;
    results?: Array<{ address_components?: GoogleAddressComponent[] }>;
  };
  if (payload.status !== 'OK' || !payload.results?.length) return null;

  for (const result of payload.results) {
    const locality = parseGoogleLocality(result.address_components ?? []);
    if (locality.area || locality.city || locality.district) return locality;
  }
  return null;
}

type NominatimAddress = {
  hamlet?: string;
  suburb?: string;
  neighbourhood?: string;
  quarter?: string;
  city?: string;
  town?: string;
  village?: string;
  municipality?: string;
  state_district?: string;
  county?: string;
  state?: string;
};

async function reverseGeocodeNominatim(
  lat: number,
  lng: number,
  locale: SecurityWebsiteLocale,
): Promise<SiteLocality | null> {
  const url = new URL('https://nominatim.openstreetmap.org/reverse');
  url.searchParams.set('format', 'json');
  url.searchParams.set('lat', String(lat));
  url.searchParams.set('lon', String(lng));
  url.searchParams.set('zoom', '14');
  url.searchParams.set('addressdetails', '1');

  const response = await fetch(url, {
    headers: {
      'User-Agent': 'PearzenSecurityCareers/1.0 (classicventuresecurity.com)',
      'Accept-Language': NOMINATIM_ACCEPT_LANGUAGE[locale],
    },
    next: { revalidate: 86_400 },
  });
  if (!response.ok) return null;

  const payload = (await response.json()) as { address?: NominatimAddress };
  const address = payload.address;
  if (!address) return null;

  const area =
    address.suburb?.trim() ||
    address.neighbourhood?.trim() ||
    address.hamlet?.trim() ||
    address.quarter?.trim() ||
    null;
  const city =
    address.city?.trim() ||
    address.town?.trim() ||
    address.municipality?.trim() ||
    address.village?.trim() ||
    null;
  const district =
    address.state_district?.trim() || address.county?.trim() || address.state?.trim() || null;

  if (!area && !city && !district) return null;
  return { area, city, district };
}

export async function resolveSiteLocalityFromCoords(
  lat: number,
  lng: number,
  locale: SecurityWebsiteLocale = 'en',
): Promise<SiteLocality> {
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) {
    return { area: null, city: null, district: null };
  }

  const key = cacheKey(lat, lng, locale);
  const cached = localityCache.get(key);
  if (cached) return cached;

  const googleKey = resolveGoogleMapsKey();
  const locality =
    (googleKey ? await reverseGeocodeGoogle(lat, lng, googleKey, locale) : null) ??
    (await reverseGeocodeNominatim(lat, lng, locale)) ??
    { city: null, district: null, area: null };

  localityCache.set(key, locality);
  return locality;
}

export function formatSiteLocalityLabel(
  locality: SiteLocality,
  pendingLabel = 'Location pending',
): string {
  const area = locality.area?.trim() ?? '';
  const city = locality.city?.trim() ?? '';
  const districtRaw = locality.district?.trim() ?? '';
  const district = districtRaw.replace(/\s+district$/i, '').trim();

  if (area && city && area.toLowerCase() !== city.toLowerCase()) {
    return `${area}, ${city}`;
  }
  if (area) return area;
  if (city && district && city.toLowerCase() !== district.toLowerCase()) {
    return `${city}, ${district}`;
  }
  return city || district || districtRaw || pendingLabel;
}
