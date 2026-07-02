/**
 * Browser Maps JS key — NEXT_PUBLIC only (R-MAPS-01).
 * Server-only `GOOGLE_MAPS_API_KEY` is for reverse geocode (`site-locality.ts`) only.
 */
export function resolveGoogleMapsBrowserKey(): string | null {
  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim();
  return key || null;
}
