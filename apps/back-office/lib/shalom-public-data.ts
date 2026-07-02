import 'server-only';

import { createSupabaseServiceClient } from '../../../packages/supabase/service';
import { CVS_COMPANY_ID } from './company-ids';
import {
  enrichShalomPublicListingMedia,
  mapShalomAvailabilityBookingFromRow,
  mapShalomPublicListingForGuestSite,
  mapShalomPublicPropertyCatalogItem,
  mapShalomPublicListingFromRow,
  normalizeShalomPublicSlug,
  resolveShalomPublicListingSlugFromRow,
  SHALOM_PUBLIC_AVAILABILITY_BOOKING_SELECT,
  SHALOM_PUBLIC_GUEST_SITE_PROPERTY_SELECT,
  SHALOM_PUBLIC_LISTING_SELECT,
  type ShalomAvailabilityBooking,
  type ShalomPublicListingView,
  type ShalomPublicPropertyCatalogItem,
} from './shalom-public-listings';
import { resolveTenantCompanyFromRequest } from './tenant-context-server';
import { createSupabaseServerClient } from '../../../packages/supabase/server';
import { resolveCompanyIdForSession, rosterCompanyId } from './company-context-server';

export {
  enrichShalomPublicListingMedia,
  SHALOM_PUBLIC_AVAILABILITY_BOOKING_SELECT,
  SHALOM_PUBLIC_LISTING_SELECT,
} from './shalom-public-listings';
export type {
  ShalomPublicGalleryPhoto,
  ShalomPublicListingView,
  ShalomPublicPropertyCatalogItem,
} from './shalom-public-listings';

function isMissingShalomTable(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return error.code === '42P01' || /shalom_/i.test(error.message ?? '');
}

/** v1: Shalom Residence public site serves the CVS tenant unless request tenant context resolves otherwise. */
export async function resolveShalomPublicCompanyId(): Promise<string> {
  const tenant = await resolveTenantCompanyFromRequest();
  if (tenant?.id) return tenant.id;
  return CVS_COMPANY_ID;
}

/**
 * Company scope for guest-website listing editor saves.
 * Prefer the signed-in session tenant; fall back to the Shalom public tenant
 * so MD/OD editing on /shalom-public targets the same rows as the guest site.
 */
export async function resolveShalomPublicEditorCompanyId(): Promise<string> {
  const supabase = await createSupabaseServerClient();
  const sessionCompanyId = rosterCompanyId(await resolveCompanyIdForSession(supabase));
  if (sessionCompanyId) return sessionCompanyId;
  return resolveShalomPublicCompanyId();
}

async function fetchCompanyPropertyRows(companyId: string): Promise<Record<string, unknown>[]> {
  const db = createSupabaseServiceClient();
  const { data, error } = await db
    .from('shalom_properties')
    .select(SHALOM_PUBLIC_GUEST_SITE_PROPERTY_SELECT)
    .eq('company_id', companyId)
    .order('public_sort_order', { ascending: true })
    .order('name', { ascending: true });

  if (error) {
    if (isMissingShalomTable(error)) return [];
    console.error('fetchCompanyPropertyRows:', error.message);
    return [];
  }

  return (data ?? []) as Record<string, unknown>[];
}

/** Guest-facing bookable stays — MD calendar properties with slug + nightly rate (public or MD default). */
export async function fetchPublishedShalomListings(
  companyId?: string,
): Promise<ShalomPublicListingView[]> {
  const scopedCompanyId = companyId ?? (await resolveShalomPublicCompanyId());
  const rows = await fetchCompanyPropertyRows(scopedCompanyId);

  return rows
    .map((row) => mapShalomPublicListingForGuestSite(row))
    .filter((listing): listing is ShalomPublicListingView => listing != null);
}

/** All MD properties for website editors — includes setup hints for unpublished/incomplete listings. */
export async function fetchShalomPublicPropertyCatalog(
  companyId?: string,
): Promise<ShalomPublicPropertyCatalogItem[]> {
  const scopedCompanyId = companyId ?? (await resolveShalomPublicCompanyId());
  const rows = await fetchCompanyPropertyRows(scopedCompanyId);

  return rows
    .map((row) => mapShalomPublicPropertyCatalogItem(row))
    .filter((item): item is ShalomPublicPropertyCatalogItem => item != null);
}

export async function fetchPublishedListingBySlug(
  slug: string,
  companyId?: string,
): Promise<ShalomPublicListingView | null> {
  const normalizedSlug = normalizeShalomPublicSlug(slug);
  if (!normalizedSlug) return null;

  const scopedCompanyId = companyId ?? (await resolveShalomPublicCompanyId());
  const rows = await fetchCompanyPropertyRows(scopedCompanyId);

  for (const row of rows) {
    if (resolveShalomPublicListingSlugFromRow(row) !== normalizedSlug) continue;
    const listing = mapShalomPublicListingForGuestSite(row);
    if (listing?.slug === normalizedSlug) return listing;
  }

  return null;
}

export async function fetchShalomPublicAvailabilityBookings(
  propertyId: string,
  companyId?: string,
): Promise<ShalomAvailabilityBooking[]> {
  const scopedCompanyId = companyId ?? (await resolveShalomPublicCompanyId());
  const db = createSupabaseServiceClient();

  const { data, error } = await db
    .from('shalom_bookings')
    .select(SHALOM_PUBLIC_AVAILABILITY_BOOKING_SELECT)
    .eq('company_id', scopedCompanyId)
    .eq('property_id', propertyId)
    .order('check_in', { ascending: true });

  if (error) {
    if (isMissingShalomTable(error)) return [];
    console.error('fetchShalomPublicAvailabilityBookings:', error.message);
    return [];
  }

  return (data ?? [])
    .map((row) => mapShalomAvailabilityBookingFromRow(row as Record<string, unknown>))
    .filter((booking): booking is ShalomAvailabilityBooking => booking != null);
}

/** Published listing + availability rows for property detail / book flow. */
export async function fetchPublishedListingWithAvailability(
  slug: string,
  companyId?: string,
): Promise<{
  listing: ShalomPublicListingView;
  bookings: ShalomAvailabilityBooking[];
} | null> {
  const listing = await fetchPublishedListingBySlug(slug, companyId);
  if (!listing) return null;

  const bookings = await fetchShalomPublicAvailabilityBookings(listing.id, listing.companyId);
  return { listing, bookings };
}
