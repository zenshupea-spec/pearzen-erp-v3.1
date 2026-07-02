import { describe, expect, it } from 'vitest';

import {
  enrichShalomPublicListingMedia,
  SHALOM_PUBLIC_AVAILABILITY_BOOKING_SELECT,
  SHALOM_PUBLIC_LISTING_SELECT,
} from './shalom-public-listings';
import type { ShalomPublicListing } from './shalom-public-listings';

describe('shalom-public-data', () => {
  it('selects only guest-safe property columns', () => {
    expect(SHALOM_PUBLIC_LISTING_SELECT).not.toMatch(/caretaker|ical|overhead|settings/i);
    expect(SHALOM_PUBLIC_LISTING_SELECT).toContain('public_slug');
    expect(SHALOM_PUBLIC_LISTING_SELECT).toContain('public_gallery_urls');
    expect(SHALOM_PUBLIC_LISTING_SELECT).toContain('public_min_nights');
    expect(SHALOM_PUBLIC_LISTING_SELECT).toContain('public_booking_lead_hours');
    expect(SHALOM_PUBLIC_LISTING_SELECT).toContain('public_bathrooms');
  });

  it('selects only availability booking columns', () => {
    expect(SHALOM_PUBLIC_AVAILABILITY_BOOKING_SELECT).not.toMatch(/guest_name|notes|damage/i);
    expect(SHALOM_PUBLIC_AVAILABILITY_BOOKING_SELECT).toContain('booking_status');
  });

  it('resolves storage refs to public media URLs', () => {
    const listing: ShalomPublicListing = {
      id: 'prop-1',
      companyId: 'co-1',
      slug: 'nawala-villa',
      name: 'Nawala Villa',
      headline: 'Garden villa',
      description: 'A calm stay.',
      location: 'Nawala',
      bedrooms: 2,
      bathrooms: 1,
      maxGuests: 4,
      nightlyRateLkr: 15000,
      minNights: 1,
      bookingLeadHours: 0,
      sortOrder: 0,
      heroImageUrl: 'storage://shalom-public-media/co-1/prop-1/hero.jpg',
      galleryPhotos: [
        {
          id: 'g1',
          storageRef: 'storage://shalom-public-media/co-1/prop-1/hero.jpg',
          sortOrder: 0,
        },
        {
          id: 'g2',
          storageRef: 'storage://shalom-public-media/co-1/prop-1/lounge.jpg',
          sortOrder: 1,
        },
      ],
      amenities: ['WiFi'],
    };

    const view = enrichShalomPublicListingMedia(listing, 'https://example.supabase.co');
    expect(view.heroImagePublicUrl).toBe(
      'https://example.supabase.co/storage/v1/object/public/shalom-public-media/co-1/prop-1/hero.jpg',
    );
    expect(view.galleryPhotos).toHaveLength(2);
    expect(view.galleryPhotos[1]?.publicUrl).toContain('lounge.jpg');
  });

  it('passes through external hero URLs unchanged', () => {
    const listing: ShalomPublicListing = {
      id: 'prop-2',
      companyId: 'co-1',
      slug: 'kandy-retreat',
      name: 'Kandy Retreat',
      headline: 'Hill country',
      description: 'Cool breezes.',
      location: 'Kandy',
      bedrooms: 3,
      bathrooms: 1,
      maxGuests: 6,
      nightlyRateLkr: 22000,
      minNights: 1,
      bookingLeadHours: 0,
      sortOrder: 1,
      heroImageUrl: 'https://cdn.example.com/hero.jpg',
      galleryPhotos: [],
      amenities: [],
    };

    const view = enrichShalomPublicListingMedia(listing, 'https://example.supabase.co');
    expect(view.heroImagePublicUrl).toBe('https://cdn.example.com/hero.jpg');
  });
});
