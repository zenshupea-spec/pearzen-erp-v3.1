import { formatColomboGuestDate } from './shalom-public-colombo-dates';
import { formatShalomPublicLkr } from './shalom-public-listings';
import { resolveShalomPublicSiteBaseUrl } from './shalom-public-payhere';
import { shalomPublicHref } from './shalom-public-path';
import { SHALOM_RESIDENCE_BRAND } from './shalom-stay-invoice';

export type ShalomGuestConfirmationDetails = {
  bookingId: string;
  guestName: string;
  guestEmail: string;
  propertyName: string;
  propertySlug: string;
  propertyLocation: string;
  checkIn: string;
  checkOut: string;
  nights: number;
  totalLkr: number;
  paid: boolean;
  bookingStatus: string;
  channel: string;
};

export function formatShalomBookingReferenceId(bookingId: string): string {
  return bookingId.trim().slice(0, 8).toUpperCase();
}

export function isShalomGuestBookingConfirmed(
  booking: Pick<ShalomGuestConfirmationDetails, 'paid' | 'bookingStatus'>,
): boolean {
  return booking.paid || booking.bookingStatus === 'CONFIRMED';
}

export function buildShalomGuestConfirmationPageUrl(bookingId: string): string {
  const base = resolveShalomPublicSiteBaseUrl();
  const path = shalomPublicHref(`/confirmation/${bookingId.trim()}`);
  if (base.endsWith('/shalom-public') && path.startsWith('/')) {
    return `${base}${path}`;
  }
  return `${base}${path}`;
}

export function buildShalomPropertyPublicUrl(slug: string): string {
  const base = resolveShalomPublicSiteBaseUrl();
  const path = shalomPublicHref(`/properties/${slug.trim()}`);
  if (base.endsWith('/shalom-public') && path.startsWith('/')) {
    return `${base}${path}`;
  }
  return `${base}${path}`;
}

function isoToGoogleCalendarDate(isoDate: string): string {
  return isoDate.trim().slice(0, 10).replace(/-/g, '');
}

/** All-day stay event — Google Calendar end date is exclusive. */
export function buildShalomGuestGoogleCalendarUrl(
  booking: Pick<
    ShalomGuestConfirmationDetails,
    'propertyName' | 'propertyLocation' | 'checkIn' | 'checkOut' | 'bookingId'
  >,
): string | null {
  const checkIn = booking.checkIn.trim().slice(0, 10);
  const checkOut = booking.checkOut.trim().slice(0, 10);
  if (!checkIn || !checkOut) return null;

  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: `${booking.propertyName} — ${SHALOM_RESIDENCE_BRAND}`,
    dates: `${isoToGoogleCalendarDate(checkIn)}/${isoToGoogleCalendarDate(checkOut)}`,
    details: `Booking reference ${formatShalomBookingReferenceId(booking.bookingId)}`,
  });

  const location = booking.propertyLocation.trim();
  if (location) params.set('location', location);

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function stayNightLabel(nights: number): string {
  return nights === 1 ? '1 night' : `${nights} nights`;
}

export function buildShalomGuestConfirmationEmailContent(
  booking: ShalomGuestConfirmationDetails,
): { subject: string; html: string; text: string } {
  const reference = formatShalomBookingReferenceId(booking.bookingId);
  const confirmationUrl = buildShalomGuestConfirmationPageUrl(booking.bookingId);
  const propertyUrl = buildShalomPropertyPublicUrl(booking.propertySlug);
  const checkInLabel = formatColomboGuestDate(booking.checkIn);
  const checkOutLabel = formatColomboGuestDate(booking.checkOut);
  const totalLabel = formatShalomPublicLkr(booking.totalLkr);
  const calendarUrl = buildShalomGuestGoogleCalendarUrl(booking);

  const subject = `${SHALOM_RESIDENCE_BRAND} — booking confirmed · ${reference}`;

  const textLines = [
    `${SHALOM_RESIDENCE_BRAND}`,
    '',
    `Hi ${booking.guestName},`,
    '',
    `Your stay is confirmed. Reference ${reference}.`,
    '',
    `Property: ${booking.propertyName}`,
    `Check-in: ${checkInLabel}`,
    `Check-out: ${checkOutLabel}`,
    `Stay: ${stayNightLabel(booking.nights)}`,
    `Total paid: ${totalLabel}`,
    '',
    `View confirmation: ${confirmationUrl}`,
    ...(calendarUrl ? [`Add to calendar: ${calendarUrl}`, ''] : ['']),
    'We look forward to welcoming you.',
    '',
    SHALOM_RESIDENCE_BRAND,
  ];

  const calendarLinkHtml = calendarUrl
    ? `<p style="margin:16px 0 0;"><a href="${escapeHtml(calendarUrl)}" style="color:#0d9488;">Add stay to Google Calendar</a></p>`
    : '';

  const html = `<!DOCTYPE html>
<html>
<body style="margin:0;padding:24px;background:#f5f0ea;font-family:system-ui,-apple-system,sans-serif;color:#1c1917;">
  <div style="max-width:560px;margin:0 auto;background:#fffdf9;border:1px solid #e7e5e4;border-radius:16px;padding:28px;">
    <p style="margin:0 0 4px;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#78716c;">Booking confirmed</p>
    <h1 style="margin:0 0 8px;font-size:24px;color:#1c1917;">${escapeHtml(SHALOM_RESIDENCE_BRAND)}</h1>
    <p style="margin:0 0 20px;font-size:14px;color:#78716c;">Reference ${escapeHtml(reference)}</p>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;">Hi ${escapeHtml(booking.guestName)}, thank you for your booking. Your payment was received and your stay is confirmed.</p>
    <table style="width:100%;border-collapse:collapse;margin-bottom:20px;font-size:14px;">
      <tr><td style="padding:6px 0;color:#78716c;width:120px;">Property</td><td style="padding:6px 0;font-weight:600;"><a href="${escapeHtml(propertyUrl)}" style="color:#0d9488;text-decoration:none;">${escapeHtml(booking.propertyName)}</a></td></tr>
      <tr><td style="padding:6px 0;color:#78716c;">Check-in</td><td style="padding:6px 0;font-weight:600;">${escapeHtml(checkInLabel)}</td></tr>
      <tr><td style="padding:6px 0;color:#78716c;">Check-out</td><td style="padding:6px 0;font-weight:600;">${escapeHtml(checkOutLabel)}</td></tr>
      <tr><td style="padding:6px 0;color:#78716c;">Stay</td><td style="padding:6px 0;font-weight:600;">${escapeHtml(stayNightLabel(booking.nights))}</td></tr>
      <tr><td style="padding:6px 0;color:#78716c;">Total paid</td><td style="padding:6px 0;font-weight:600;color:#0d9488;">${escapeHtml(totalLabel)}</td></tr>
    </table>
    <p style="margin:0;"><a href="${escapeHtml(confirmationUrl)}" style="display:inline-block;background:#0d9488;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:12px;font-weight:600;font-size:14px;">View confirmation</a></p>
    ${calendarLinkHtml}
    <p style="margin:24px 0 0;font-size:13px;color:#78716c;">We look forward to welcoming you.</p>
  </div>
</body>
</html>`;

  return { subject, html, text: textLines.join('\n') };
}
