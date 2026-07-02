import { describe, expect, it } from 'vitest';

import {
  bookingBlocksGuestStay,
  buildAvailabilityDays,
  calculateStayTotal,
  countStayNights,
  earliestShalomCheckInIso,
  findStayRangeConflicts,
  isRangeAvailable,
  isStayRangeAvailable,
  mapShalomPublicListingForGuestSite,
  shalomCheckInInstantMs,
  slugifyShalomPropertyName,
  stayRangesOverlap,
  validateShalomGuestStayRules,
  validateShalomPublicSlug,
  validateShalomPublishListing,
} from './shalom-public-listings';

describe('shalom-public-listings', () => {
  const propertyId = 'prop-1';

  const bookings = [
    {
      id: 'ota-airbnb',
      propertyId,
      checkIn: '2026-08-10',
      checkOut: '2026-08-14',
      channel: 'AIRBNB',
      bookingStatus: 'CONFIRMED',
    },
    {
      id: 'ota-block',
      propertyId,
      checkIn: '2026-08-20',
      checkOut: '2026-08-22',
      channel: 'BLOCKED',
      bookingStatus: 'CONFIRMED',
    },
    {
      id: 'pending-direct',
      propertyId,
      checkIn: '2026-09-01',
      checkOut: '2026-09-04',
      channel: 'DIRECT',
      bookingStatus: 'PENDING_PAYMENT',
      pendingPaymentExpiresAt: '2026-08-30T12:00:00.000Z',
    },
    {
      id: 'expired-direct',
      propertyId,
      checkIn: '2026-09-10',
      checkOut: '2026-09-12',
      channel: 'DIRECT',
      bookingStatus: 'PENDING_PAYMENT',
      pendingPaymentExpiresAt: '2026-08-01T00:00:00.000Z',
    },
    {
      id: 'cancelled-direct',
      propertyId,
      checkIn: '2026-09-15',
      checkOut: '2026-09-17',
      channel: 'DIRECT',
      bookingStatus: 'CANCELLED',
    },
  ];

  it('slugifies property names', () => {
    expect(slugifyShalomPropertyName('  Nawala Garden Villa ')).toBe('nawala-garden-villa');
    expect(validateShalomPublicSlug('nawala-garden-villa')).toBeNull();
    expect(validateShalomPublicSlug('ab')).toMatch(/at least/i);
  });

  it('counts stay nights with checkout day free', () => {
    expect(countStayNights('2026-08-10', '2026-08-14')).toBe(4);
    expect(countStayNights('2026-08-14', '2026-08-10')).toBe(0);
  });

  it('enforces minimum nights and booking lead time', () => {
    const now = new Date('2026-08-01T08:00:00+05:30');

    expect(
      validateShalomGuestStayRules({
        checkIn: '2026-08-10',
        checkOut: '2026-08-12',
        minNights: 3,
        now,
      }),
    ).toMatchObject({ ok: false, message: /minimum stay is 3 nights/i });

    expect(
      validateShalomGuestStayRules({
        checkIn: '2026-08-01',
        checkOut: '2026-08-03',
        minNights: 2,
        leadHours: 24,
        now,
      }),
    ).toMatchObject({ ok: false, message: /24 hours/i });

    expect(
      validateShalomGuestStayRules({
        checkIn: '2026-08-02',
        checkOut: '2026-08-04',
        minNights: 2,
        leadHours: 24,
        now,
      }),
    ).toEqual({ ok: true, nights: 2 });
  });

  it('computes earliest check-in from lead hours at 2pm Colombo', () => {
    const now = new Date('2026-08-01T08:00:00+05:30');
    expect(earliestShalomCheckInIso(0, now.getTime())).toBe('2026-08-01');
    expect(earliestShalomCheckInIso(24, now.getTime())).toBe('2026-08-02');
    expect(shalomCheckInInstantMs('2026-08-02')).toBeGreaterThan(now.getTime() + 24 * 60 * 60 * 1000);
  });

  it('calculates stay totals in LKR', () => {
    expect(calculateStayTotal(3, 12500)).toBe(37500);
    expect(calculateStayTotal(2, 10000, 1500)).toBe(21500);
  });

  it('detects overlap against OTA and blocked ranges', () => {
    expect(stayRangesOverlap(
      { checkIn: '2026-08-12', checkOut: '2026-08-16' },
      { checkIn: '2026-08-10', checkOut: '2026-08-14' },
    )).toBe(true);

    expect(isRangeAvailable(bookings, propertyId, '2026-08-01', '2026-08-05')).toBe(true);
    expect(isRangeAvailable(bookings, propertyId, '2026-08-12', '2026-08-16')).toBe(false);
    expect(isRangeAvailable(bookings, propertyId, '2026-08-20', '2026-08-21')).toBe(false);
  });

  it('treats checkout day as available for a new check-in', () => {
    expect(isStayRangeAvailable(bookings, '2026-08-14', '2026-08-16', { propertyId })).toBe(true);
  });

  it('blocks active pending payments but not expired holds', () => {
    const now = new Date('2026-08-29T00:00:00.000Z');
    expect(
      isRangeAvailable(bookings, propertyId, '2026-09-02', '2026-09-03', { now }),
    ).toBe(false);

    const afterExpiry = new Date('2026-09-01T00:00:00.000Z');
    expect(
      isRangeAvailable(bookings, propertyId, '2026-09-10', '2026-09-11', { now: afterExpiry }),
    ).toBe(true);
    expect(bookingBlocksGuestStay(bookings[3], afterExpiry)).toBe(false);
  });

  it('ignores cancelled bookings for availability', () => {
    expect(isRangeAvailable(bookings, propertyId, '2026-09-15', '2026-09-16')).toBe(true);
    expect(findStayRangeConflicts(bookings, '2026-09-15', '2026-09-16', { propertyId })).toEqual([]);
  });

  it('builds per-day availability', () => {
    const days = buildAvailabilityDays(
      bookings,
      '2026-08-09',
      '2026-08-16',
      propertyId,
    );

    expect(days.find((day) => day.date === '2026-08-09')?.available).toBe(true);
    expect(days.find((day) => day.date === '2026-08-10')?.available).toBe(false);
    expect(days.find((day) => day.date === '2026-08-13')?.available).toBe(false);
    expect(days.find((day) => day.date === '2026-08-14')?.available).toBe(true);
  });

  it('validates publish requirements including photos', () => {
    const invalid = validateShalomPublishListing({
      name: 'Villa',
      location: 'Nawala',
      slug: 'ab',
      headline: 'Short',
      description: 'Too short',
      heroImageUrl: '',
      galleryPhotos: [],
      nightlyRateLkr: 0,
      maxGuests: 0,
      bedrooms: 1,
    });
    expect(invalid.ok).toBe(false);
    if (!invalid.ok) {
      expect(invalid.errors.length).toBeGreaterThan(3);
    }

    const valid = validateShalomPublishListing({
      name: 'Nawala Garden Villa',
      location: 'Nawala, Colombo',
      slug: 'nawala-garden-villa',
      headline: 'Peaceful garden villa near Colombo',
      description:
        'A calm two-bedroom villa with a private garden, fast WiFi, and easy access to Nawala and Rajagiriya.',
      heroImageUrl: 'storage://shalom-public-media/co/p/hero.jpg',
      galleryPhotos: [
        {
          id: '1',
          storageRef: 'storage://shalom-public-media/co/p/hero.jpg',
          sortOrder: 0,
        },
      ],
      nightlyRateLkr: 18500,
      maxGuests: 4,
      bedrooms: 2,
    });
    expect(valid.ok).toBe(true);
  });

  it('maps MD calendar properties using defaultRate when public nightly rate is unset', () => {
    const listing = mapShalomPublicListingForGuestSite({
      id: 'prop-md-1',
      company_id: 'co-1',
      name: 'Nawala Garden Villa',
      location: 'Nawala',
      bedrooms: 2,
      public_slug: '',
      public_published: false,
      public_headline: '',
      public_description: '',
      public_hero_image_url: '',
      public_gallery_urls: [],
      public_nightly_rate_lkr: 0,
      public_max_guests: 0,
      public_amenities: [],
      public_sort_order: 0,
      settings: { defaultRate: 15000 },
    });

    expect(listing?.slug).toBe('nawala-garden-villa');
    expect(listing?.nightlyRateLkr).toBe(15000);
  });
});
