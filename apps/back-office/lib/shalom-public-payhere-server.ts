import 'server-only';

import { resolvePayHereCredentialsForCompany } from '../../../packages/cafe-customer-order/tenant-payhere-server';
import { createSupabaseServiceClient } from '../../../packages/supabase/service';

import {
  buildShalomPayHereCheckoutFields,
  isShalomBookingAwaitingPayment,
  mapShalomPayHereCheckoutError,
  type ShalomPayHereBookingRecord,
  type ShalomPayHereCheckoutSessionResult,
} from './shalom-public-payhere';

const BOOKING_SELECT =
  'id, company_id, property_id, guest_name, guest_email, guest_phone, check_in, check_out, nights, total_revenue, booking_status, channel, paid, pending_payment_expires_at, shalom_properties!inner(public_slug, name, public_headline, location, public_published)';

function mapBookingRow(row: Record<string, unknown>): ShalomPayHereBookingRecord | null {
  const id = typeof row.id === 'string' ? row.id : null;
  const companyId = typeof row.company_id === 'string' ? row.company_id : null;
  const propertyId = typeof row.property_id === 'string' ? row.property_id : null;
  if (!id || !companyId || !propertyId) return null;

  const propertyRaw = row.shalom_properties;
  const property = Array.isArray(propertyRaw) ? propertyRaw[0] : propertyRaw;
  if (!property || typeof property !== 'object') return null;

  const propertyRecord = property as Record<string, unknown>;
  const slug = typeof propertyRecord.public_slug === 'string' ? propertyRecord.public_slug.trim() : '';
  if (!slug) return null;

  const headline =
    typeof propertyRecord.public_headline === 'string' ? propertyRecord.public_headline.trim() : '';
  const name = typeof propertyRecord.name === 'string' ? propertyRecord.name.trim() : '';
  const location = typeof propertyRecord.location === 'string' ? propertyRecord.location.trim() : '';

  return {
    id,
    companyId,
    propertyId,
    propertySlug: slug,
    propertyName: headline || name || 'Shalom stay',
    propertyLocation: location,
    guestName: typeof row.guest_name === 'string' ? row.guest_name.trim() : '',
    guestEmail: typeof row.guest_email === 'string' ? row.guest_email.trim().toLowerCase() : '',
    guestPhone: typeof row.guest_phone === 'string' ? row.guest_phone.trim() : '',
    checkIn: typeof row.check_in === 'string' ? row.check_in.slice(0, 10) : '',
    checkOut: typeof row.check_out === 'string' ? row.check_out.slice(0, 10) : '',
    nights: Number(row.nights) || 0,
    totalRevenueLkr: Number(row.total_revenue) || 0,
    bookingStatus: typeof row.booking_status === 'string' ? row.booking_status : '',
    channel: typeof row.channel === 'string' ? row.channel : '',
    paid: Boolean(row.paid),
    pendingPaymentExpiresAt:
      typeof row.pending_payment_expires_at === 'string'
        ? row.pending_payment_expires_at
        : null,
  };
}

export async function createShalomPayHereCheckoutSession(
  bookingId: string,
): Promise<ShalomPayHereCheckoutSessionResult> {
  const normalizedId = bookingId.trim();
  if (!normalizedId) {
    return mapShalomPayHereCheckoutError('invalid');
  }

  const db = createSupabaseServiceClient();
  const { data, error } = await db
    .from('shalom_bookings')
    .select(BOOKING_SELECT)
    .eq('id', normalizedId)
    .maybeSingle();

  if (error || !data) {
    return mapShalomPayHereCheckoutError('not_found');
  }

  const booking = mapBookingRow(data as Record<string, unknown>);
  if (!booking) {
    return mapShalomPayHereCheckoutError('not_found');
  }

  if (!isShalomBookingAwaitingPayment(booking)) {
    return mapShalomPayHereCheckoutError('not_awaiting_payment');
  }

  const credentials = await resolvePayHereCredentialsForCompany(booking.companyId);
  if (!credentials) {
    return mapShalomPayHereCheckoutError('not_configured');
  }

  return {
    ok: true,
    fields: buildShalomPayHereCheckoutFields({ booking, credentials }),
    sandbox: credentials.sandbox,
  };
}
