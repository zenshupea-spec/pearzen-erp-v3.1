import 'server-only';

import { createSupabaseServiceClient } from '../../../packages/supabase/service';

import {
  buildShalomGuestConfirmationEmailContent,
  isShalomGuestBookingConfirmed,
  type ShalomGuestConfirmationDetails,
} from './shalom-public-confirmation';
import {
  portalResendConfigured,
  resolveResendApiKey,
  shalomStayInvoiceEmailFrom,
} from './portal-resend';

const BOOKING_SELECT =
  'id, guest_name, guest_email, check_in, check_out, nights, total_revenue, paid, booking_status, channel, shalom_properties!inner(public_slug, name, public_headline, location, public_published)';

function mapConfirmationBookingRow(
  row: Record<string, unknown>,
): ShalomGuestConfirmationDetails | null {
  const id = typeof row.id === 'string' ? row.id : null;
  if (!id) return null;

  const propertyRaw = row.shalom_properties;
  const property = Array.isArray(propertyRaw) ? propertyRaw[0] : propertyRaw;
  if (!property || typeof property !== 'object') return null;

  const propertyRecord = property as Record<string, unknown>;
  const slug =
    typeof propertyRecord.public_slug === 'string' ? propertyRecord.public_slug.trim() : '';
  const headline =
    typeof propertyRecord.public_headline === 'string'
      ? propertyRecord.public_headline.trim()
      : '';
  const name = typeof propertyRecord.name === 'string' ? propertyRecord.name.trim() : '';
  const location =
    typeof propertyRecord.location === 'string' ? propertyRecord.location.trim() : '';

  return {
    bookingId: id,
    guestName: typeof row.guest_name === 'string' ? row.guest_name.trim() : 'Guest',
    guestEmail:
      typeof row.guest_email === 'string' ? row.guest_email.trim().toLowerCase() : '',
    propertyName: headline || name || 'Shalom stay',
    propertySlug: slug,
    propertyLocation: location,
    checkIn: typeof row.check_in === 'string' ? row.check_in.slice(0, 10) : '',
    checkOut: typeof row.check_out === 'string' ? row.check_out.slice(0, 10) : '',
    nights: Number(row.nights) || 0,
    totalLkr: Number(row.total_revenue) || 0,
    paid: Boolean(row.paid),
    bookingStatus: typeof row.booking_status === 'string' ? row.booking_status : '',
    channel: typeof row.channel === 'string' ? row.channel : '',
  };
}

export async function fetchShalomGuestConfirmationBooking(
  bookingId: string,
): Promise<ShalomGuestConfirmationDetails | null> {
  const normalizedId = bookingId.trim().toLowerCase();
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
      normalizedId,
    )
  ) {
    return null;
  }

  const db = createSupabaseServiceClient();
  const { data, error } = await db
    .from('shalom_bookings')
    .select(BOOKING_SELECT)
    .eq('id', normalizedId)
    .maybeSingle();

  if (error || !data) return null;
  return mapConfirmationBookingRow(data as Record<string, unknown>);
}

export type ShalomGuestConfirmationEmailResult = {
  ok: boolean;
  emailed: boolean;
  error?: string;
  resendMessageId?: string;
};

export async function sendShalomGuestConfirmationEmail(
  booking: ShalomGuestConfirmationDetails,
): Promise<ShalomGuestConfirmationEmailResult> {
  const to = booking.guestEmail.trim();
  if (!to) {
    return { ok: false, emailed: false, error: 'Guest email is missing on this booking.' };
  }

  if (!isShalomGuestBookingConfirmed(booking)) {
    return { ok: false, emailed: false, error: 'Booking is not confirmed yet.' };
  }

  const apiKey = resolveResendApiKey();
  if (!apiKey) {
    return { ok: true, emailed: false };
  }

  const { subject, html, text } = buildShalomGuestConfirmationEmailContent(booking);

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: shalomStayInvoiceEmailFrom(),
        to: [to],
        subject,
        html,
        text,
      }),
    });

    if (!response.ok) {
      let detail = await response.text();
      try {
        const parsed = JSON.parse(detail) as { message?: string };
        if (parsed.message) detail = parsed.message;
      } catch {
        /* keep raw detail */
      }
      return {
        ok: false,
        emailed: false,
        error: detail || `Email API returned ${response.status}.`,
      };
    }

    const json = (await response.json()) as { id?: string };
    return { ok: true, emailed: true, resendMessageId: json.id };
  } catch (err) {
    return {
      ok: false,
      emailed: false,
      error: err instanceof Error ? err.message : 'Email delivery failed.',
    };
  }
}

export async function sendShalomGuestConfirmationEmailForBookingId(
  bookingId: string,
): Promise<ShalomGuestConfirmationEmailResult> {
  const booking = await fetchShalomGuestConfirmationBooking(bookingId);
  if (!booking) {
    return { ok: false, emailed: false, error: 'Booking not found.' };
  }
  return sendShalomGuestConfirmationEmail(booking);
}

export function shalomGuestConfirmationEmailAvailable(): boolean {
  return portalResendConfigured();
}
