import { describe, expect, it } from 'vitest';

import {
  buildShalomPublicListingPreviewUrl,
  buildShalomPublicListingSaveRow,
  parseShalomAmenitiesInput,
  suggestShalomPublicSlug,
  validateShalomPublicListingDraft,
} from './shalom-public-publish';

describe('shalom-public-publish', () => {
  const baseDraft = {
    propertyId: 'prop-1',
    name: 'Ocean Villa',
    location: 'Colombo 03',
    bedrooms: 3,
    bathrooms: 2,
    published: true,
    slug: 'ocean-villa',
    headline: 'Ocean Villa with garden terrace',
    description:
      'A calm Colombo stay with leafy garden views, fast Wi-Fi, and easy access to cafes and the seafront promenade.',
    heroImageUrl: 'storage://shalom-public-media/co/prop-1/a.jpg',
    galleryPhotos: [
      {
        id: 'photo-1',
        storageRef: 'storage://shalom-public-media/co/prop-1/a.jpg',
        sortOrder: 0,
      },
    ],
    nightlyRateLkr: 45000,
    maxGuests: 6,
    minNights: 2,
    bookingLeadHours: 24,
    amenities: ['Wi-Fi', 'Parking'],
    sortOrder: 10,
  };

  it('suggests slug from property name', () => {
    expect(suggestShalomPublicSlug('Ocean Villa')).toBe('ocean-villa');
    expect(suggestShalomPublicSlug('Ocean Villa', 'custom-slug')).toBe('custom-slug');
  });

  it('parses amenities input', () => {
    expect(parseShalomAmenitiesInput('Wi-Fi, Parking; Garden')).toEqual([
      'Wi-Fi',
      'Parking',
      'Garden',
    ]);
  });

  it('builds preview url', () => {
    expect(buildShalomPublicListingPreviewUrl('ocean-villa')).toContain('/properties/ocean-villa');
  });

  it('validates unique slug', () => {
    const invalid = validateShalomPublicListingDraft(baseDraft, [
      { propertyId: 'prop-2', slug: 'ocean-villa' },
    ]);
    expect(invalid.ok).toBe(false);
  });

  it('builds save row with cover fallback', () => {
    const row = buildShalomPublicListingSaveRow({
      ...baseDraft,
      heroImageUrl: '',
    });
    expect(row.public_hero_image_url).toContain('shalom-public-media');
    expect(row.public_published).toBe(true);
    expect(row.public_min_nights).toBe(2);
    expect(row.public_booking_lead_hours).toBe(24);
    expect(row.public_bathrooms).toBe(2);
  });
});
