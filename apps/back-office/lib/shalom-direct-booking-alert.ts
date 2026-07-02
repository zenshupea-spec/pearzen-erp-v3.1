import { formatColomboGuestDate } from './shalom-public-colombo-dates';
import {
  buildShalomGuestConfirmationPageUrl,
  formatShalomBookingReferenceId,
  type ShalomGuestConfirmationDetails,
} from './shalom-public-confirmation';
import { formatShalomPublicLkr } from './shalom-public-listings';
import { SHALOM_RESIDENCE_BRAND } from './shalom-stay-invoice';

export const SHALOM_DIRECT_BOOKING_ALERT_EVENT = 'shalom_direct_booking_confirmed';

export const SHALOM_BOOKING_RECEIVED_ALERT_EVENT = 'shalom_booking_received';

export const DEFAULT_SHALOM_BOOKINGS_ALERT_EMAIL = 'bookings@shalom.pearzen.tech';

export type ShalomDirectBookingAlertDetails = ShalomGuestConfirmationDetails & {
  companyId: string;
  propertyId: string;
  caretakerEpf: string;
  caretakerName: string;
};

export function resolveShalomBookingsAlertEmail(): string {
  return (
    process.env.SHALOM_BOOKINGS_ALERT_EMAIL?.trim() ||
    process.env.SHALOM_DIRECT_BOOKING_ALERT_EMAIL?.trim() ||
    DEFAULT_SHALOM_BOOKINGS_ALERT_EMAIL
  );
}

export function normalizeShalomBookingAlertEmail(
  email: string | null | undefined,
): string | null {
  const trimmed = email?.trim().toLowerCase() ?? '';
  if (!trimmed) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return null;
  return trimmed;
}

export function formatShalomBookingChannelLabel(channel: string): string {
  switch (channel.trim().toUpperCase()) {
    case 'DIRECT':
      return 'Shalom website';
    case 'AIRBNB':
      return 'Airbnb';
    case 'BOOKING':
      return 'Booking.com';
    default:
      return channel.trim() || 'Booking';
  }
}

function stayNightLabel(nights: number): string {
  return nights === 1 ? '1 night' : `${nights} nights`;
}

export function buildShalomDirectBookingAlertMessage(
  booking: Pick<
    ShalomDirectBookingAlertDetails,
    'guestName' | 'propertyName' | 'checkIn' | 'checkOut' | 'nights' | 'totalLkr' | 'bookingId' | 'channel'
  >,
): string {
  const reference = formatShalomBookingReferenceId(booking.bookingId);
  const checkIn = formatColomboGuestDate(booking.checkIn);
  const checkOut = formatColomboGuestDate(booking.checkOut);
  const total = formatShalomPublicLkr(booking.totalLkr);
  const channelLabel = formatShalomBookingChannelLabel(booking.channel);

  return (
    `New ${channelLabel} booking (${reference}) — ${booking.guestName} at ${booking.propertyName}. ` +
    `${stayNightLabel(booking.nights)} · ${checkIn} → ${checkOut} · ${total}.`
  );
}

export function buildShalomDirectBookingAlertEmailContent(
  booking: ShalomDirectBookingAlertDetails,
  executiveUrl: string,
): { subject: string; text: string } {
  const reference = formatShalomBookingReferenceId(booking.bookingId);
  const confirmationUrl = buildShalomGuestConfirmationPageUrl(booking.bookingId);
  const checkIn = formatColomboGuestDate(booking.checkIn);
  const checkOut = formatColomboGuestDate(booking.checkOut);
  const total = formatShalomPublicLkr(booking.totalLkr);

  const channelLabel = formatShalomBookingChannelLabel(booking.channel);
  const subject = `${SHALOM_RESIDENCE_BRAND} — new ${channelLabel} booking · ${reference}`;

  const caretakerLine = booking.caretakerEpf
    ? `Assigned caretaker: ${booking.caretakerName || 'Caretaker'} (EPF ${booking.caretakerEpf})`
    : 'Assigned caretaker: none';

  const paidLine =
    booking.channel === 'DIRECT'
      ? `Total paid: ${total}`
      : booking.totalLkr > 0
        ? `Revenue: ${total}`
        : 'Revenue: pending (OTA feed)';

  const text = [
    `${SHALOM_RESIDENCE_BRAND} — new ${channelLabel} booking`,
    '',
    `Reference: ${reference}`,
    `Channel: ${channelLabel}`,
    `Guest: ${booking.guestName}`,
    `Email: ${booking.guestEmail || '—'}`,
    `Property: ${booking.propertyName}`,
    `Stay: ${stayNightLabel(booking.nights)} · ${checkIn} → ${checkOut}`,
    paidLine,
    caretakerLine,
    '',
    ...(booking.channel === 'DIRECT'
      ? [`Guest confirmation: ${confirmationUrl}`, `Shalom desk: ${executiveUrl}`]
      : [`Shalom desk: ${executiveUrl}`]),
  ].join('\n');

  return { subject, text };
}

export function normalizeShalomDirectBookingAlertRecipients(
  bookingsEmail: string,
  caretakerEmail?: string | null,
): string[] {
  return normalizeShalomBookingAlertRecipients(null, bookingsEmail, caretakerEmail);
}

export function normalizeShalomBookingAlertRecipients(
  primaryEmail: string | null | undefined,
  fallbackEmail: string | null | undefined,
  caretakerEmail?: string | null,
): string[] {
  const recipients = new Set<string>();

  const primary = normalizeShalomBookingAlertEmail(primaryEmail);
  if (primary) {
    recipients.add(primary);
  } else {
    const fallback = normalizeShalomBookingAlertEmail(fallbackEmail);
    if (fallback) recipients.add(fallback);
  }

  const caretaker = normalizeShalomBookingAlertEmail(caretakerEmail);
  if (caretaker) recipients.add(caretaker);

  return [...recipients];
}
