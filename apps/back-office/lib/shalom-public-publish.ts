import type { ShalomPublicPropertyPhoto } from '../../../packages/supabase/shalom-public-media-storage';

function randomUuid(): string {
  return globalThis.crypto.randomUUID();
}

import {
  isShalomPublicSlugUnique,
  normalizeShalomBookingLeadHours,
  normalizeShalomMinNights,
  normalizeShalomPublicBathrooms,
  normalizeShalomPublicSlug,
  slugifyShalomPropertyName,
  validateShalomPublishListing,
  validateShalomPublicSlug,
  type ShalomPublishListingInput,
} from './shalom-public-listings';
import { SHALOM_PUBLIC_URL } from './shalom-public-host';
import { resolveShalomPublicSiteBaseUrl } from './shalom-public-site-url';
import { shalomPublicHref } from './shalom-public-path';

export const SHALOM_PUBLIC_LISTING_MAX_PHOTOS = 12;

export type ShalomPublicListingEditorDraft = {
  propertyId: string;
  name: string;
  location: string;
  bedrooms: number;
  bathrooms: number;
  published: boolean;
  slug: string;
  headline: string;
  description: string;
  heroImageUrl: string;
  galleryPhotos: ShalomPublicPropertyPhoto[];
  nightlyRateLkr: number;
  maxGuests: number;
  minNights: number;
  bookingLeadHours: number;
  amenities: string[];
  sortOrder: number;
};

export function suggestShalomPublicSlug(name: string, currentSlug?: string): string {
  const existing = normalizeShalomPublicSlug(currentSlug ?? '');
  if (existing) return existing;
  return slugifyShalomPropertyName(name);
}

export function parseShalomAmenitiesInput(raw: string): string[] {
  return raw
    .split(/[,;\n]+/)
    .map((value) => value.trim())
    .filter(Boolean)
    .slice(0, 24);
}

export function formatShalomAmenitiesInput(amenities: string[]): string {
  return amenities.join(', ');
}

export function normalizeShalomGalleryPhotos(
  photos: ShalomPublicPropertyPhoto[],
): ShalomPublicPropertyPhoto[] {
  return photos
    .filter((photo) => photo.storageRef.trim())
    .map((photo, index) => ({
      id: photo.id.trim() || randomUuid(),
      storageRef: photo.storageRef.trim(),
      sortOrder: index,
      caption: photo.caption?.trim() || undefined,
    }));
}

export function buildShalomPublicListingPreviewUrl(slug: string): string {
  const normalized = normalizeShalomPublicSlug(slug);
  if (!normalized) return SHALOM_PUBLIC_URL;

  const base = resolveShalomPublicSiteBaseUrl();
  const path = shalomPublicHref(`/properties/${normalized}`);
  if (base.endsWith('/shalom-public') && path.startsWith('/')) {
    return `${base}${path}`;
  }
  return `${base}${path}`;
}

export function validateShalomPublicListingDraft(
  draft: ShalomPublicListingEditorDraft,
  existingSlugs: Array<{ propertyId: string; slug: string }>,
): { ok: true } | { ok: false; errors: string[] } {
  const errors: string[] = [];

  if (draft.published) {
    const listingInput: ShalomPublishListingInput = {
      name: draft.name,
      location: draft.location,
      slug: draft.slug,
      headline: draft.headline,
      description: draft.description,
      heroImageUrl: draft.heroImageUrl,
      galleryPhotos: draft.galleryPhotos,
      nightlyRateLkr: draft.nightlyRateLkr,
      maxGuests: draft.maxGuests,
      bedrooms: draft.bedrooms,
    };

    const publishValidation = validateShalomPublishListing(listingInput);
    if (!publishValidation.ok) {
      errors.push(...publishValidation.errors);
    }
  } else {
    const slug = normalizeShalomPublicSlug(draft.slug);
    if (slug) {
      const slugError = validateShalomPublicSlug(slug);
      if (slugError) errors.push(slugError);
    }
  }

  const normalizedSlug = normalizeShalomPublicSlug(draft.slug);
  if (normalizedSlug && !isShalomPublicSlugUnique(existingSlugs, normalizedSlug, draft.propertyId)) {
    errors.push('This URL slug is already used by another property.');
  }

  if (draft.galleryPhotos.length > SHALOM_PUBLIC_LISTING_MAX_PHOTOS) {
    errors.push(`Gallery supports at most ${SHALOM_PUBLIC_LISTING_MAX_PHOTOS} photos.`);
  }

  if (!Number.isFinite(draft.sortOrder)) {
    errors.push('Sort order must be a number.');
  }

  const minNights = normalizeShalomMinNights(draft.minNights);
  if (minNights < 1) {
    errors.push('Minimum nights must be at least 1.');
  }

  const leadHours = normalizeShalomBookingLeadHours(draft.bookingLeadHours);
  if (leadHours < 0) {
    errors.push('Booking lead time cannot be negative.');
  }

  const bathrooms = normalizeShalomPublicBathrooms(draft.bathrooms);
  if (bathrooms < 0) {
    errors.push('Bathroom count cannot be negative.');
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true };
}

export function buildShalomPublicListingSaveRow(draft: ShalomPublicListingEditorDraft): {
  public_slug: string;
  public_published: boolean;
  public_headline: string;
  public_description: string;
  public_hero_image_url: string;
  public_gallery_urls: ShalomPublicPropertyPhoto[];
  public_nightly_rate_lkr: number;
  public_max_guests: number;
  public_bathrooms: number;
  public_min_nights: number;
  public_booking_lead_hours: number;
  public_amenities: string[];
  public_sort_order: number;
} {
  const galleryPhotos = normalizeShalomGalleryPhotos(draft.galleryPhotos);
  const hero =
    draft.heroImageUrl.trim() ||
    galleryPhotos.find((photo) => photo.storageRef)?.storageRef ||
    '';

  return {
    public_slug: normalizeShalomPublicSlug(draft.slug),
    public_published: draft.published,
    public_headline: draft.headline.trim(),
    public_description: draft.description.trim(),
    public_hero_image_url: hero,
    public_gallery_urls: galleryPhotos,
    public_nightly_rate_lkr: Math.round(Math.max(0, draft.nightlyRateLkr)),
    public_max_guests: Math.max(1, Math.round(draft.maxGuests)),
    public_bathrooms: normalizeShalomPublicBathrooms(draft.bathrooms),
    public_min_nights: normalizeShalomMinNights(draft.minNights),
    public_booking_lead_hours: normalizeShalomBookingLeadHours(draft.bookingLeadHours),
    public_amenities: draft.amenities.map((value) => value.trim()).filter(Boolean),
    public_sort_order: Math.round(draft.sortOrder),
  };
}
