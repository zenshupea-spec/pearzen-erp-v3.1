import { describe, expect, it } from 'vitest';

import { validateShalomBookGuestDetailsPayload } from './shalom-public-direct-booking';
import type { ShalomPublicListingView } from './shalom-public-listings';

describe('shalom-public-book-guest-details-server', () => {
  const listing: ShalomPublicListingView = {
    id: 'prop-1',
    companyId: 'co-1',
    slug: 'garden-villa',
    name: 'Garden Villa',
    headline: 'Peaceful garden villa',
    description: '',
    location: 'Nawala',
    bedrooms: 2,
    maxGuests: 4,
    nightlyRateLkr: 15000,
    minNights: 1,
    bookingLeadHours: 0,
    sortOrder: 0,
    heroImageUrl: '',
    galleryPhotos: [],
    amenities: [],
    heroImagePublicUrl: null,
  };

  it('returns field errors for invalid guest payload', async () => {
    const result = await validateShalomBookGuestDetailsPayload(
      {
        propertySlug: 'garden-villa',
        checkIn: '2026-08-01',
        checkOut: '2026-08-03',
        guestName: '',
        guestEmail: 'bad',
        guestPhone: '12',
        acceptedTerms: false,
        acceptedCancellation: false,
      },
      {
        fetchListing: async () => ({ listing, bookings: [] }),
      },
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.fieldErrors?.guestName).toBeTruthy();
    }
  });

  it('rejects unavailable date ranges on the server', async () => {
    const result = await validateShalomBookGuestDetailsPayload(
      {
        propertySlug: 'garden-villa',
        checkIn: '2026-08-10',
        checkOut: '2026-08-12',
        guestName: 'Amaya Perera',
        guestEmail: 'amaya@example.com',
        guestPhone: '+94 77 123 4567',
        acceptedTerms: true,
        acceptedCancellation: true,
      },
      {
        fetchListing: async () => ({
          listing,
          bookings: [
            {
              propertyId: 'prop-1',
              checkIn: '2026-08-10',
              checkOut: '2026-08-14',
              channel: 'AIRBNB',
              bookingStatus: 'CONFIRMED',
            },
          ],
        }),
      },
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/no longer available/i);
    }
  });

  it('returns a booking summary when valid', async () => {
    const result = await validateShalomBookGuestDetailsPayload(
      {
        propertySlug: 'garden-villa',
        checkIn: '2026-08-01',
        checkOut: '2026-08-04',
        guestName: 'Amaya Perera',
        guestEmail: 'amaya@example.com',
        guestPhone: '+94 77 123 4567',
        specialRequests: 'Late check-in',
        acceptedTerms: true,
        acceptedCancellation: true,
      },
      {
        fetchListing: async () => ({ listing, bookings: [] }),
      },
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.summary.nights).toBe(3);
      expect(result.summary.totalLkr).toBe(45000);
      expect(result.summary.notes).toBe('Late check-in');
    }
  });
});
