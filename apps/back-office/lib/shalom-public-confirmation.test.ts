import { describe, expect, it } from 'vitest';

import {
  buildShalomGuestConfirmationEmailContent,
  buildShalomGuestConfirmationPageUrl,
  buildShalomGuestGoogleCalendarUrl,
  formatShalomBookingReferenceId,
  isShalomGuestBookingConfirmed,
} from './shalom-public-confirmation';

describe('shalom-public-confirmation', () => {
  const booking = {
    bookingId: '11111111-1111-4111-8111-111111111111',
    guestName: 'Jane Guest',
    guestEmail: 'jane@example.com',
    propertyName: 'Ocean Villa',
    propertySlug: 'ocean-villa',
    propertyLocation: 'Colombo 03',
    checkIn: '2026-08-10',
    checkOut: '2026-08-12',
    nights: 2,
    totalLkr: 45000,
    paid: true,
    bookingStatus: 'CONFIRMED',
    channel: 'DIRECT',
  };

  it('formats short booking reference', () => {
    expect(formatShalomBookingReferenceId(booking.bookingId)).toBe('11111111');
  });

  it('detects confirmed bookings', () => {
    expect(isShalomGuestBookingConfirmed({ paid: true, bookingStatus: 'CONFIRMED' })).toBe(true);
    expect(isShalomGuestBookingConfirmed({ paid: false, bookingStatus: 'PENDING_PAYMENT' })).toBe(
      false,
    );
  });

  it('builds confirmation page url', () => {
    expect(buildShalomGuestConfirmationPageUrl(booking.bookingId)).toContain(
      '/confirmation/11111111-1111-4111-8111-111111111111',
    );
  });

  it('builds google calendar url for stay dates', () => {
    const url = buildShalomGuestGoogleCalendarUrl(booking);
    expect(url).toContain('calendar.google.com');
    expect(url).toContain('dates=20260810%2F20260812');
  });

  it('builds guest confirmation email content', () => {
    const { subject, text, html } = buildShalomGuestConfirmationEmailContent(booking);
    expect(subject).toContain('11111111');
    expect(text).toContain('Jane Guest');
    expect(text).toContain('Ocean Villa');
    expect(html).toContain('45,000');
  });
});
