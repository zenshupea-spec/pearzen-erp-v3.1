import { describe, expect, it, vi } from 'vitest';

import {
  createShalomDirectBookingFromPayload,
  mapShalomDirectBookingRpcError,
  SHALOM_PENDING_PAYMENT_TTL_MS,
} from './shalom-public-direct-booking';
import type { ShalomPublicListingView } from './shalom-public-listings';

describe('shalom-public-direct-booking', () => {
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

  const validPayload = {
    propertySlug: 'garden-villa',
    checkIn: '2026-08-01',
    checkOut: '2026-08-04',
    guestName: 'Amaya Perera',
    guestEmail: 'amaya@example.com',
    guestPhone: '+94 77 123 4567',
    acceptedTerms: true,
    acceptedCancellation: true,
  };

  it('maps RPC conflict errors to guest-friendly messages', () => {
    expect(mapShalomDirectBookingRpcError('dates_unavailable: overlap')).toMatchObject({
      ok: false,
      fieldErrors: { dates: expect.any(String) },
    });
  });

  it('creates a booking via RPC', async () => {
    const now = new Date('2026-07-01T12:00:00.000Z');
    const rpc = vi.fn().mockResolvedValue({ data: 'booking-uuid-1', error: null });

    const result = await createShalomDirectBookingFromPayload(validPayload, {
      fetchListing: async () => ({ listing, bookings: [] }),
      rpc,
      now,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.booking.bookingId).toBe('booking-uuid-1');
      expect(result.booking.nights).toBe(3);
      expect(result.booking.totalLkr).toBe(45000);
      expect(result.booking.pendingPaymentExpiresAt).toBe(
        new Date(now.getTime() + SHALOM_PENDING_PAYMENT_TTL_MS).toISOString(),
      );
    }

    expect(rpc).toHaveBeenCalledWith(
      expect.objectContaining({
        p_property_id: 'prop-1',
        p_company_id: 'co-1',
        p_guest_email: 'amaya@example.com',
        p_nights: 3,
      }),
    );
  });

  it('returns idempotent booking id from RPC on double submit', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: 'existing-hold-id', error: null });

    const result = await createShalomDirectBookingFromPayload(validPayload, {
      fetchListing: async () => ({ listing, bookings: [] }),
      rpc,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.booking.bookingId).toBe('existing-hold-id');
    }
  });

  it('surfaces RPC date conflicts', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { message: 'dates_unavailable: Those dates are no longer available.' },
    });

    const result = await createShalomDirectBookingFromPayload(validPayload, {
      fetchListing: async () => ({ listing, bookings: [] }),
      rpc,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/no longer available/i);
    }
  });
});
