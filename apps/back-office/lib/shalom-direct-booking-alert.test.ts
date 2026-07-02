import { describe, expect, it } from 'vitest';

import {
  buildShalomDirectBookingAlertEmailContent,
  buildShalomDirectBookingAlertMessage,
  DEFAULT_SHALOM_BOOKINGS_ALERT_EMAIL,
  formatShalomBookingChannelLabel,
  normalizeShalomBookingAlertEmail,
  normalizeShalomBookingAlertRecipients,
  normalizeShalomDirectBookingAlertRecipients,
  resolveShalomBookingsAlertEmail,
  SHALOM_BOOKING_RECEIVED_ALERT_EVENT,
  SHALOM_DIRECT_BOOKING_ALERT_EVENT,
} from './shalom-direct-booking-alert';

describe('shalom-direct-booking-alert', () => {
  const booking = {
    bookingId: '11111111-1111-4111-8111-111111111111',
    companyId: 'co-1',
    propertyId: 'prop-1',
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
    caretakerEpf: '12345',
    caretakerName: 'Sam Caretaker',
  };

  it('uses stable event types', () => {
    expect(SHALOM_DIRECT_BOOKING_ALERT_EVENT).toBe('shalom_direct_booking_confirmed');
    expect(SHALOM_BOOKING_RECEIVED_ALERT_EVENT).toBe('shalom_booking_received');
  });

  it('defaults bookings alert email', () => {
    expect(resolveShalomBookingsAlertEmail()).toBe(DEFAULT_SHALOM_BOOKINGS_ALERT_EMAIL);
  });

  it('builds portal notification message with channel label', () => {
    const message = buildShalomDirectBookingAlertMessage(booking);
    expect(message).toContain('Jane Guest');
    expect(message).toContain('Ocean Villa');
    expect(message).toContain('11111111');
    expect(message).toContain('Shalom website');
  });

  it('formats OTA channel labels', () => {
    expect(formatShalomBookingChannelLabel('AIRBNB')).toBe('Airbnb');
    expect(formatShalomBookingChannelLabel('BOOKING')).toBe('Booking.com');
  });

  it('validates booking alert emails', () => {
    expect(normalizeShalomBookingAlertEmail(' alerts@shalom.test ')).toBe('alerts@shalom.test');
    expect(normalizeShalomBookingAlertEmail('not-an-email')).toBeNull();
  });

  it('builds operations email content', () => {
    const { subject, text } = buildShalomDirectBookingAlertEmailContent(
      booking,
      'https://erp.example.com/executive/shalom',
    );
    expect(subject).toContain('11111111');
    expect(text).toContain('Sam Caretaker');
    expect(text).toContain('/executive/shalom');
  });

  it('dedupes alert recipients', () => {
    expect(
      normalizeShalomDirectBookingAlertRecipients('bookings@shalom.pearzen.tech', 'bookings@shalom.pearzen.tech'),
    ).toEqual(['bookings@shalom.pearzen.tech']);
    expect(
      normalizeShalomBookingAlertRecipients(
        'property@shalom.test',
        'bookings@shalom.pearzen.tech',
        'caretaker@shalom.test',
      ),
    ).toEqual(['property@shalom.test', 'caretaker@shalom.test']);
  });
});
