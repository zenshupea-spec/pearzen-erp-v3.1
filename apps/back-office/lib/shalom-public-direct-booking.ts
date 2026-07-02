import {
  calculateStayTotal,
  countStayNights,
  isStayRangeAvailable,
  validateShalomGuestStayRules,
  validateShalomPublicSlug,
  type ShalomPublicListingView,
} from './shalom-public-listings';
import {
  parseShalomBookGuestDetailsPayload,
  validateShalomGuestDetails,
} from './shalom-public-guest-details';
import type { ShalomBookGuestDetailsActionResult } from './shalom-public-guest-details';

export const SHALOM_PENDING_PAYMENT_TTL_MS = 30 * 60 * 1000;

export type ShalomDirectBookingCreated = {
  bookingId: string;
  pendingPaymentExpiresAt: string;
  propertySlug: string;
  propertyName: string;
  checkIn: string;
  checkOut: string;
  nights: number;
  nightlyRateLkr: number;
  totalLkr: number;
  guestName: string;
  guestEmail: string;
  guestPhone: string;
  notes: string;
};

export type CreateShalomDirectBookingResult =
  | { ok: true; booking: ShalomDirectBookingCreated }
  | { ok: false; error?: string; fieldErrors?: Record<string, string> };

type PreparedDirectBooking = {
  listing: ShalomPublicListingView;
  companyId: string;
  propertyId: string;
  checkIn: string;
  checkOut: string;
  nights: number;
  totalLkr: number;
  nightlyRateLkr: number;
  propertyName: string;
  propertySlug: string;
  guestName: string;
  guestEmail: string;
  guestPhone: string;
  notes: string;
  pendingPaymentExpiresAt: string;
};

export function mapShalomDirectBookingRpcError(message: string): CreateShalomDirectBookingResult {
  const normalized = message.toLowerCase();

  if (normalized.includes('dates_unavailable')) {
    return {
      ok: false,
      error: 'Those dates are no longer available. Please choose different dates.',
      fieldErrors: { dates: 'This date range is no longer available.' },
    };
  }

  if (normalized.includes('property_unavailable')) {
    return { ok: false, error: 'This property is not available to book.' };
  }

  if (normalized.includes('invalid_stay_range')) {
    return {
      ok: false,
      error: 'Please choose valid check-in and check-out dates (minimum 1 night).',
      fieldErrors: { dates: 'Select a valid date range before continuing.' },
    };
  }

  return {
    ok: false,
    error: 'We could not reserve those dates right now. Please try again in a moment.',
  };
}

async function prepareShalomDirectBooking(
  payload: unknown,
  deps: {
    fetchListing: typeof import('./shalom-public-data').fetchPublishedListingWithAvailability;
    now?: Date;
  },
): Promise<
  | CreateShalomDirectBookingResult
  | { ok: true; prepared: PreparedDirectBooking; bookings: import('./shalom-public-listings').ShalomAvailabilityBooking[] }
> {
  const parsed = parseShalomBookGuestDetailsPayload(payload);
  if (!parsed) {
    return { ok: false, error: 'Invalid booking request. Please refresh and try again.' };
  }

  if (validateShalomPublicSlug(parsed.propertySlug)) {
    return { ok: false, error: 'This property is not available to book.' };
  }

  const guestValidation = validateShalomGuestDetails(parsed);
  if (!guestValidation.ok) {
    return { ok: false, fieldErrors: guestValidation.fieldErrors };
  }

  const fetchListing = deps.fetchListing;

  const data = await fetchListing(parsed.propertySlug);
  if (!data) {
    return { ok: false, error: 'This property is not available to book.' };
  }

  const now = deps.now ?? new Date();
  const nights = countStayNights(parsed.checkIn, parsed.checkOut);
  const stayRules = validateShalomGuestStayRules({
    checkIn: parsed.checkIn,
    checkOut: parsed.checkOut,
    minNights: data.listing.minNights,
    leadHours: data.listing.bookingLeadHours,
    now,
  });
  if (!stayRules.ok) {
    return {
      ok: false,
      error: stayRules.message,
      fieldErrors: { dates: stayRules.message },
    };
  }

  if (
    !isStayRangeAvailable(data.bookings, parsed.checkIn, parsed.checkOut, {
      propertyId: data.listing.id,
      now,
    })
  ) {
    return {
      ok: false,
      error: 'Those dates are no longer available. Please choose different dates.',
      fieldErrors: { dates: 'This date range is no longer available.' },
    };
  }

  const totalLkr = calculateStayTotal(nights, data.listing.nightlyRateLkr);
  const propertyName = data.listing.headline.trim() || data.listing.name;
  const pendingPaymentExpiresAt = new Date(
    now.getTime() + SHALOM_PENDING_PAYMENT_TTL_MS,
  ).toISOString();

  return {
    ok: true,
    prepared: {
      listing: data.listing,
      companyId: data.listing.companyId,
      propertyId: data.listing.id,
      checkIn: parsed.checkIn,
      checkOut: parsed.checkOut,
      nights,
      totalLkr,
      nightlyRateLkr: data.listing.nightlyRateLkr,
      propertyName,
      propertySlug: parsed.propertySlug,
      guestName: guestValidation.normalized.guestName,
      guestEmail: guestValidation.normalized.guestEmail,
      guestPhone: guestValidation.normalized.guestPhone,
      notes: guestValidation.normalized.notes,
      pendingPaymentExpiresAt,
    },
    bookings: data.bookings,
  };
}

export async function createShalomDirectBookingFromPayload(
  payload: unknown,
  deps: {
    rpc: (args: Record<string, unknown>) => Promise<{
      data: string | null;
      error: { message: string } | null;
    }>;
    fetchListing?: typeof import('./shalom-public-data').fetchPublishedListingWithAvailability;
    now?: Date;
  },
): Promise<CreateShalomDirectBookingResult> {
  const preparedResult = await prepareShalomDirectBooking(payload, deps);
  if (!preparedResult.ok) {
    return preparedResult;
  }

  const { prepared } = preparedResult;

  const { data: bookingId, error } = await deps.rpc({
    p_property_id: prepared.propertyId,
    p_company_id: prepared.companyId,
    p_check_in: prepared.checkIn,
    p_check_out: prepared.checkOut,
    p_guest_name: prepared.guestName,
    p_guest_email: prepared.guestEmail,
    p_guest_phone: prepared.guestPhone,
    p_notes: prepared.notes,
    p_nights: prepared.nights,
    p_rate_per_night: prepared.nightlyRateLkr,
    p_total_revenue: prepared.totalLkr,
    p_pending_expires_at: prepared.pendingPaymentExpiresAt,
  });

  if (error) {
    return mapShalomDirectBookingRpcError(error.message);
  }

  if (!bookingId) {
    return {
      ok: false,
      error: 'We could not reserve those dates right now. Please try again in a moment.',
    };
  }

  return {
    ok: true,
    booking: {
      bookingId,
      pendingPaymentExpiresAt: prepared.pendingPaymentExpiresAt,
      propertySlug: prepared.propertySlug,
      propertyName: prepared.propertyName,
      checkIn: prepared.checkIn,
      checkOut: prepared.checkOut,
      nights: prepared.nights,
      nightlyRateLkr: prepared.nightlyRateLkr,
      totalLkr: prepared.totalLkr,
      guestName: prepared.guestName,
      guestEmail: prepared.guestEmail,
      guestPhone: prepared.guestPhone,
      notes: prepared.notes,
    },
  };
}

export async function validateShalomBookGuestDetailsPayload(
  payload: unknown,
  deps: {
    fetchListing: typeof import('./shalom-public-data').fetchPublishedListingWithAvailability;
    now?: Date;
  },
): Promise<ShalomBookGuestDetailsActionResult> {
  const preparedResult = await prepareShalomDirectBooking(payload, deps);
  if (!preparedResult.ok) {
    return preparedResult;
  }

  const { prepared } = preparedResult;

  return {
    ok: true,
    summary: {
      propertySlug: prepared.propertySlug,
      propertyName: prepared.propertyName,
      checkIn: prepared.checkIn,
      checkOut: prepared.checkOut,
      nights: prepared.nights,
      nightlyRateLkr: prepared.nightlyRateLkr,
      totalLkr: prepared.totalLkr,
      guestName: prepared.guestName,
      guestEmail: prepared.guestEmail,
      guestPhone: prepared.guestPhone,
      notes: prepared.notes,
    },
  };
}
