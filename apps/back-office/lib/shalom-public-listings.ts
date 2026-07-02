import {
  parseShalomPublicPropertyPhotos,
  resolveShalomPublicMediaPublicUrl,
  type ShalomPublicPropertyPhoto,
} from '../../../packages/supabase/shalom-public-media-storage';

import { addColomboDays, colomboTodayIso } from './shalom-public-colombo-dates';
import { bookingOverlapsRange } from './shalom-calendar';

export const SHALOM_PUBLIC_LISTING_SELECT =
  'id, company_id, name, location, bedrooms, public_slug, public_published, public_headline, public_description, public_hero_image_url, public_gallery_urls, public_nightly_rate_lkr, public_max_guests, public_bathrooms, public_amenities, public_sort_order, public_min_nights, public_booking_lead_hours';

export const SHALOM_DEFAULT_MIN_NIGHTS = 1;
export const SHALOM_DEFAULT_BOOKING_LEAD_HOURS = 0;
export const SHALOM_CHECK_IN_HOUR_COLOMBO = 14;

/** Server-only — includes MD calendar settings for default nightly rate fallback. */
export const SHALOM_PUBLIC_GUEST_SITE_PROPERTY_SELECT = `${SHALOM_PUBLIC_LISTING_SELECT}, settings`;

export const SHALOM_PUBLIC_AVAILABILITY_BOOKING_SELECT =
  'id, property_id, check_in, check_out, channel, booking_status, pending_payment_expires_at';

export type ShalomPublicGalleryPhoto = ShalomPublicPropertyPhoto & {
  publicUrl: string | null;
};

export type ShalomPublicListingView = ShalomPublicListing & {
  heroImagePublicUrl: string | null;
  galleryPhotos: ShalomPublicGalleryPhoto[];
};

export type ShalomPublicPropertyCatalogItem = ShalomPublicListingView & {
  bookable: boolean;
  publishedOnWebsite: boolean;
  setupHint: string | null;
};

export function parseShalomPropertyDefaultRateLkr(settingsRaw: unknown): number {
  if (!settingsRaw || typeof settingsRaw !== 'object' || Array.isArray(settingsRaw)) return 0;
  const rate = (settingsRaw as Record<string, unknown>).defaultRate;
  const parsed = Number(rate);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return Math.round(parsed);
}

export function resolveShalomPublicListingSlugFromRow(row: Record<string, unknown>): string {
  const explicit =
    typeof row.public_slug === 'string' ? normalizeShalomPublicSlug(row.public_slug) : '';
  if (explicit) return explicit;
  const name = typeof row.name === 'string' ? row.name : '';
  return slugifyShalomPropertyName(name);
}

export function mapShalomPublicListingForGuestSite(
  row: Record<string, unknown>,
): ShalomPublicListingView | null {
  const listing = mapShalomPublicListingFromRow(row);
  if (!listing || !listing.name.trim()) return null;

  const slug = resolveShalomPublicListingSlugFromRow(row);
  if (!slug || validateShalomPublicSlug(slug)) return null;

  const defaultRate = parseShalomPropertyDefaultRateLkr(row.settings);
  const nightlyRateLkr = listing.nightlyRateLkr > 0 ? listing.nightlyRateLkr : defaultRate;

  if (nightlyRateLkr <= 0) return null;

  const headline = listing.headline.trim() || listing.name.trim();
  const maxGuests =
    listing.maxGuests > 0 ? listing.maxGuests : Math.max(2, listing.bedrooms > 0 ? listing.bedrooms * 2 : 2);

  return enrichShalomPublicListingMedia({
    ...listing,
    slug,
    headline,
    nightlyRateLkr,
    maxGuests,
  });
}

export function mapShalomPublicPropertyCatalogItem(
  row: Record<string, unknown>,
): ShalomPublicPropertyCatalogItem | null {
  const listing = mapShalomPublicListingFromRow(row);
  if (!listing || !listing.name.trim()) return null;

  const slug = resolveShalomPublicListingSlugFromRow(row);
  const defaultRate = parseShalomPropertyDefaultRateLkr(row.settings);
  const nightlyRateLkr = listing.nightlyRateLkr > 0 ? listing.nightlyRateLkr : defaultRate;
  const publishedOnWebsite = Boolean(row.public_published);
  const headline = listing.headline.trim() || listing.name.trim();
  const maxGuests =
    listing.maxGuests > 0 ? listing.maxGuests : Math.max(2, listing.bedrooms > 0 ? listing.bedrooms * 2 : 2);

  let setupHint: string | null = null;
  if (!slug || validateShalomPublicSlug(slug)) {
    setupHint = 'Add a valid URL slug in the guest listing editor.';
  } else if (nightlyRateLkr <= 0) {
    setupHint = 'Set a nightly rate on the guest listing or in MD property settings.';
  } else if (!publishedOnWebsite) {
    setupHint = 'Toggle Publish in the guest listing editor when you are ready.';
  }

  const bookable = Boolean(slug && !validateShalomPublicSlug(slug) && nightlyRateLkr > 0);

  return enrichShalomPublicListingMedia({
    ...listing,
    slug: slug || listing.slug,
    headline,
    nightlyRateLkr,
    maxGuests,
    bookable,
    publishedOnWebsite,
    setupHint,
  });
}

export function enrichShalomPublicListingMedia(
  listing: ShalomPublicListing,
  supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? '',
): ShalomPublicListingView {
  const heroImagePublicUrl = resolveShalomPublicMediaPublicUrl(
    supabaseUrl,
    listing.heroImageUrl,
  );

  const galleryPhotos: ShalomPublicGalleryPhoto[] = listing.galleryPhotos.map((photo) => ({
    ...photo,
    publicUrl: resolveShalomPublicMediaPublicUrl(supabaseUrl, photo.storageRef),
  }));

  return {
    ...listing,
    heroImagePublicUrl: heroImagePublicUrl ?? (listing.heroImageUrl || null),
    galleryPhotos,
  };
}

export const SHALOM_PUBLIC_SLUG_MIN_LENGTH = 3;
export const SHALOM_PUBLIC_SLUG_MAX_LENGTH = 60;
export const SHALOM_PUBLIC_SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,58}[a-z0-9])?$/;

export const SHALOM_GUEST_BOOKING_STATUSES = [
  'PENDING_PAYMENT',
  'CONFIRMED',
  'CANCELLED',
  'EXPIRED',
] as const;

export type ShalomGuestBookingStatus = (typeof SHALOM_GUEST_BOOKING_STATUSES)[number];

export type ShalomPublicListing = {
  id: string;
  companyId: string;
  slug: string;
  name: string;
  headline: string;
  description: string;
  location: string;
  bedrooms: number;
  bathrooms: number;
  maxGuests: number;
  nightlyRateLkr: number;
  minNights: number;
  bookingLeadHours: number;
  sortOrder: number;
  heroImageUrl: string;
  galleryPhotos: ShalomPublicPropertyPhoto[];
  amenities: string[];
};

export type ShalomAvailabilityBooking = {
  id?: string;
  propertyId: string;
  checkIn: string;
  checkOut: string;
  channel: string;
  bookingStatus?: string | null;
  pendingPaymentExpiresAt?: string | null;
};

export type ShalomAvailabilityDay = {
  date: string;
  available: boolean;
  blockedByChannel?: string;
};

export type ShalomPublishListingInput = {
  name: string;
  location: string;
  slug: string;
  headline: string;
  description: string;
  heroImageUrl: string;
  galleryPhotos: ShalomPublicPropertyPhoto[];
  nightlyRateLkr: number;
  maxGuests: number;
  bedrooms: number;
};

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDateKey(value: string): boolean {
  if (!ISO_DATE_PATTERN.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
}

export function slugifyShalomPropertyName(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/['']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  if (!slug) return '';
  if (slug.length <= SHALOM_PUBLIC_SLUG_MAX_LENGTH) return slug;

  return slug.slice(0, SHALOM_PUBLIC_SLUG_MAX_LENGTH).replace(/-$/, '');
}

export function normalizeShalomPublicSlug(raw: string): string {
  return raw.trim().toLowerCase().replace(/-+/g, '-').replace(/^-|-$/g, '');
}

export function validateShalomPublicSlug(slug: string): string | null {
  const normalized = normalizeShalomPublicSlug(slug);
  if (!normalized) return 'URL slug is required.';
  if (normalized.length < SHALOM_PUBLIC_SLUG_MIN_LENGTH) {
    return `URL slug must be at least ${SHALOM_PUBLIC_SLUG_MIN_LENGTH} characters.`;
  }
  if (normalized.length > SHALOM_PUBLIC_SLUG_MAX_LENGTH) {
    return `URL slug must be at most ${SHALOM_PUBLIC_SLUG_MAX_LENGTH} characters.`;
  }
  if (!SHALOM_PUBLIC_SLUG_PATTERN.test(normalized)) {
    return 'URL slug may only use lowercase letters, numbers, and hyphens.';
  }
  return null;
}

export function isShalomPublicSlugUnique(
  existing: Array<{ propertyId: string; slug: string }>,
  candidate: string,
  excludePropertyId?: string,
): boolean {
  const normalized = normalizeShalomPublicSlug(candidate);
  if (!normalized) return false;

  return !existing.some((row) => {
    if (excludePropertyId && row.propertyId === excludePropertyId) return false;
    return normalizeShalomPublicSlug(row.slug) === normalized;
  });
}

export function validateShalomPublishListing(
  input: ShalomPublishListingInput,
): { ok: true } | { ok: false; errors: string[] } {
  const errors: string[] = [];

  if (!input.name.trim()) errors.push('Property name is required.');
  if (!input.location.trim()) errors.push('Location is required.');

  const slugError = validateShalomPublicSlug(input.slug);
  if (slugError) errors.push(slugError);

  const headline = input.headline.trim();
  if (headline.length < 10 || headline.length > 120) {
    errors.push('Headline must be between 10 and 120 characters.');
  }

  const description = input.description.trim();
  if (description.length < 80) {
    errors.push('Description must be at least 80 characters.');
  }

  const hero = input.heroImageUrl.trim();
  const galleryCount = input.galleryPhotos.filter((photo) => photo.storageRef.trim()).length;
  if (!hero && galleryCount === 0) {
    errors.push('Upload at least one property photo and choose a cover image.');
  }

  if (!Number.isFinite(input.nightlyRateLkr) || input.nightlyRateLkr <= 0) {
    errors.push('Nightly rate must be greater than zero.');
  }

  if (!Number.isFinite(input.maxGuests) || input.maxGuests < 1) {
    errors.push('Maximum guests must be at least 1.');
  }

  if (!Number.isFinite(input.bedrooms) || input.bedrooms < 0) {
    errors.push('Bedroom count is invalid.');
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true };
}

export function normalizeShalomPublicBathrooms(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return 1;
  return Math.min(Math.round(parsed), 99);
}

export function normalizeShalomMinNights(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) return SHALOM_DEFAULT_MIN_NIGHTS;
  return Math.min(Math.round(parsed), 365);
}

export function normalizeShalomBookingLeadHours(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return SHALOM_DEFAULT_BOOKING_LEAD_HOURS;
  return Math.min(Math.round(parsed), 24 * 365);
}

/** Check-in is treated as 2:00 PM Asia/Colombo on the check-in date. */
export function shalomCheckInInstantMs(isoDate: string): number {
  const hour = String(SHALOM_CHECK_IN_HOUR_COLOMBO).padStart(2, '0');
  return Date.parse(`${isoDate}T${hour}:00:00+05:30`);
}

export function earliestShalomCheckInIso(leadHours: number, at = Date.now()): string {
  const hours = normalizeShalomBookingLeadHours(leadHours);
  if (hours === 0) return colomboTodayIso(at);

  const deadline = at + hours * 60 * 60 * 1000;
  let cursor = colomboTodayIso(at);
  const limit = addColomboDays(cursor, 400);

  while (cursor <= limit) {
    if (shalomCheckInInstantMs(cursor) >= deadline) {
      return cursor;
    }
    cursor = addColomboDays(cursor, 1);
  }

  return cursor;
}

export function validateShalomGuestStayRules(input: {
  checkIn: string;
  checkOut: string;
  minNights?: number;
  leadHours?: number;
  now?: Date;
}):
  | { ok: true; nights: number }
  | { ok: false; message: string; field: 'dates' } {
  const minNights = normalizeShalomMinNights(input.minNights ?? SHALOM_DEFAULT_MIN_NIGHTS);
  const leadHours = normalizeShalomBookingLeadHours(
    input.leadHours ?? SHALOM_DEFAULT_BOOKING_LEAD_HOURS,
  );
  const now = input.now ?? new Date();

  if (!isIsoDateKey(input.checkIn) || !isIsoDateKey(input.checkOut)) {
    return {
      ok: false,
      message: 'Select valid check-in and check-out dates.',
      field: 'dates',
    };
  }

  const nights = countStayNights(input.checkIn, input.checkOut);
  if (nights < 1) {
    return {
      ok: false,
      message: 'Check-out must be after check-in.',
      field: 'dates',
    };
  }

  if (nights < minNights) {
    return {
      ok: false,
      message:
        minNights === 1
          ? 'Minimum stay is 1 night.'
          : `Minimum stay is ${minNights} nights.`,
      field: 'dates',
    };
  }

  const earliestMs = now.getTime() + leadHours * 60 * 60 * 1000;
  if (shalomCheckInInstantMs(input.checkIn) < earliestMs) {
    return {
      ok: false,
      message:
        leadHours === 0
          ? 'That check-in date is no longer available.'
          : `Book at least ${leadHours} hour${leadHours === 1 ? '' : 's'} before check-in (2:00 PM Colombo).`,
      field: 'dates',
    };
  }

  return { ok: true, nights };
}

export function countStayNights(checkIn: string, checkOut: string): number {
  if (!isIsoDateKey(checkIn) || !isIsoDateKey(checkOut)) return 0;
  if (checkOut <= checkIn) return 0;

  const start = Date.parse(`${checkIn}T12:00:00.000Z`);
  const end = Date.parse(`${checkOut}T12:00:00.000Z`);
  const nights = Math.round((end - start) / (1000 * 60 * 60 * 24));
  return nights > 0 ? nights : 0;
}

export function calculateStayTotal(
  nights: number,
  nightlyRateLkr: number,
  feesLkr = 0,
): number {
  const safeNights = Math.max(0, Math.round(nights));
  const rate = Number.isFinite(nightlyRateLkr) ? nightlyRateLkr : 0;
  const fees = Number.isFinite(feesLkr) ? feesLkr : 0;
  return Math.round(safeNights * rate + fees);
}

export function formatShalomPublicLkr(amount: number): string {
  return `Rs. ${Math.round(amount).toLocaleString('en-LK')}`;
}

export function normalizeShalomGuestBookingStatus(
  value: string | null | undefined,
): ShalomGuestBookingStatus {
  const normalized = String(value ?? 'CONFIRMED').trim().toUpperCase();
  if (normalized === 'PENDING_PAYMENT') return 'PENDING_PAYMENT';
  if (normalized === 'CANCELLED') return 'CANCELLED';
  if (normalized === 'EXPIRED') return 'EXPIRED';
  return 'CONFIRMED';
}

/** Whether an existing row should block a new guest stay (checkout day is free). */
export function bookingBlocksGuestStay(
  booking: ShalomAvailabilityBooking,
  now: Date = new Date(),
): boolean {
  const status = normalizeShalomGuestBookingStatus(booking.bookingStatus);
  if (status === 'CANCELLED' || status === 'EXPIRED') return false;

  if (status === 'PENDING_PAYMENT') {
    const expiresAt = booking.pendingPaymentExpiresAt?.trim();
    if (expiresAt) {
      const expiresMs = Date.parse(expiresAt);
      if (Number.isFinite(expiresMs) && expiresMs <= now.getTime()) {
        return false;
      }
    }
  }

  return true;
}

export function stayRangesOverlap(
  requested: { checkIn: string; checkOut: string },
  existing: { checkIn: string; checkOut: string },
): boolean {
  if (!isIsoDateKey(requested.checkIn) || !isIsoDateKey(requested.checkOut)) {
    return false;
  }
  if (!isIsoDateKey(existing.checkIn) || !isIsoDateKey(existing.checkOut)) {
    return false;
  }
  if (requested.checkOut <= requested.checkIn) return false;

  return bookingOverlapsRange(existing, requested.checkIn, requested.checkOut);
}

export function findStayRangeConflicts(
  bookings: ShalomAvailabilityBooking[],
  checkIn: string,
  checkOut: string,
  options?: {
    propertyId?: string;
    excludeBookingId?: string;
    now?: Date;
  },
): ShalomAvailabilityBooking[] {
  const now = options?.now ?? new Date();

  return bookings.filter((booking) => {
    if (options?.propertyId && booking.propertyId !== options.propertyId) return false;
    if (options?.excludeBookingId && booking.id === options.excludeBookingId) return false;
    if (!bookingBlocksGuestStay(booking, now)) return false;
    return stayRangesOverlap({ checkIn, checkOut }, booking);
  });
}

export function isStayRangeAvailable(
  bookings: ShalomAvailabilityBooking[],
  checkIn: string,
  checkOut: string,
  options?: {
    propertyId?: string;
    excludeBookingId?: string;
    now?: Date;
  },
): boolean {
  return (
    isIsoDateKey(checkIn) &&
    isIsoDateKey(checkOut) &&
    checkOut > checkIn &&
    findStayRangeConflicts(bookings, checkIn, checkOut, options).length === 0
  );
}

/** Step-plan alias — pass bookings already scoped to one property. */
export function isRangeAvailable(
  bookings: ShalomAvailabilityBooking[],
  propertyId: string,
  checkIn: string,
  checkOut: string,
  options?: {
    excludeBookingId?: string;
    now?: Date;
  },
): boolean {
  return isStayRangeAvailable(bookings, checkIn, checkOut, {
    ...options,
    propertyId,
  });
}

function addDaysIso(dateKey: string, days: number): string {
  const base = Date.parse(`${dateKey}T12:00:00.000Z`);
  const next = new Date(base + days * 24 * 60 * 60 * 1000);
  return next.toISOString().slice(0, 10);
}

export function buildAvailabilityDays(
  bookings: ShalomAvailabilityBooking[],
  rangeStart: string,
  rangeEndExclusive: string,
  propertyId: string,
  now: Date = new Date(),
): ShalomAvailabilityDay[] {
  if (!isIsoDateKey(rangeStart) || !isIsoDateKey(rangeEndExclusive)) return [];
  if (rangeEndExclusive <= rangeStart) return [];

  const days: ShalomAvailabilityDay[] = [];
  let cursor = rangeStart;

  while (cursor < rangeEndExclusive) {
    const nextDay = addDaysIso(cursor, 1);
    const conflicts = findStayRangeConflicts(
      bookings,
      cursor,
      nextDay,
      { propertyId, now },
    );

    days.push({
      date: cursor,
      available: conflicts.length === 0,
      blockedByChannel: conflicts[0]?.channel,
    });

    cursor = nextDay;
  }

  return days;
}

export function mapShalomPublicListingFromRow(row: Record<string, unknown>): ShalomPublicListing | null {
  const id = typeof row.id === 'string' ? row.id : null;
  const companyId = typeof row.company_id === 'string' ? row.company_id : null;
  if (!id || !companyId) return null;

  const amenitiesRaw = row.public_amenities;
  const amenities = Array.isArray(amenitiesRaw)
    ? amenitiesRaw.map(String).map((value) => value.trim()).filter(Boolean)
    : [];

  return {
    id,
    companyId,
    slug: typeof row.public_slug === 'string' ? normalizeShalomPublicSlug(row.public_slug) : '',
    name: typeof row.name === 'string' ? row.name.trim() : '',
    headline: typeof row.public_headline === 'string' ? row.public_headline.trim() : '',
    description: typeof row.public_description === 'string' ? row.public_description.trim() : '',
    location: typeof row.location === 'string' ? row.location.trim() : '',
    bedrooms: Number(row.bedrooms) || 0,
    bathrooms: normalizeShalomPublicBathrooms(row.public_bathrooms),
    maxGuests: Number(row.public_max_guests) || 0,
    nightlyRateLkr: Number(row.public_nightly_rate_lkr) || 0,
    minNights: normalizeShalomMinNights(row.public_min_nights),
    bookingLeadHours: normalizeShalomBookingLeadHours(row.public_booking_lead_hours),
    sortOrder: Number(row.public_sort_order) || 0,
    heroImageUrl:
      typeof row.public_hero_image_url === 'string' ? row.public_hero_image_url.trim() : '',
    galleryPhotos: parseShalomPublicPropertyPhotos(row.public_gallery_urls),
    amenities,
  };
}

export function mapShalomAvailabilityBookingFromRow(
  row: Record<string, unknown>,
): ShalomAvailabilityBooking | null {
  const propertyId = typeof row.property_id === 'string' ? row.property_id : null;
  const checkIn = typeof row.check_in === 'string' ? row.check_in.slice(0, 10) : null;
  const checkOut = typeof row.check_out === 'string' ? row.check_out.slice(0, 10) : null;
  if (!propertyId || !checkIn || !checkOut) return null;

  return {
    id: typeof row.id === 'string' ? row.id : undefined,
    propertyId,
    checkIn,
    checkOut,
    channel: typeof row.channel === 'string' ? row.channel : 'DIRECT',
    bookingStatus:
      typeof row.booking_status === 'string' ? row.booking_status : 'CONFIRMED',
    pendingPaymentExpiresAt:
      typeof row.pending_payment_expires_at === 'string'
        ? row.pending_payment_expires_at
        : null,
  };
}
