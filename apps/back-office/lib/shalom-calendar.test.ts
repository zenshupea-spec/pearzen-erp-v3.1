import { describe, expect, it } from 'vitest';

import {
  bookingOverlapsMonth,
  caretakerCollectTotalForDay,
  findBookingsForDay,
  formatShalomCalendarMonthPeriod,
  formatShalomCollectLkr,
  hasCaretakerCollectAmount,
  isShalomAvailabilityBlock,
  nightsInCalendarMonth,
  parseCaretakerCollectLkr,
  primaryBookingForDay,
  resolveShalomLoginDotStatus,
  shalomDateKey,
  shalomMonthRange,
} from './shalom-calendar';

describe('shalom-calendar', () => {
  const bookings = [
    {
      id: 'b1',
      propertyId: 'p1',
      propertyName: 'Nawala',
      guestName: 'Amelia',
      channel: 'AIRBNB',
      checkIn: '2026-05-10',
      checkOut: '2026-05-14',
      nights: 4,
    },
    {
      id: 'b2',
      propertyId: 'p2',
      propertyName: 'Kandy',
      guestName: 'Ravi',
      channel: 'BOOKING',
      checkIn: '2026-05-12',
      checkOut: '2026-05-16',
      nights: 4,
    },
  ];

  it('builds ISO date keys', () => {
    expect(shalomDateKey(2026, 5, 3)).toBe('2026-05-03');
  });

  it('uses calendar months starting on the 1st for Shalom reporting', () => {
    const july = shalomMonthRange(2026, 7);
    expect(july.monthStart).toBe('2026-07-01');
    expect(july.monthEndExclusive).toBe('2026-08-01');
    expect(july.daysInMonth).toBe(31);
    expect(formatShalomCalendarMonthPeriod(2026, 7)).toBe('1–31 July 2026');
  });

  it('counts only nights inside the calendar month', () => {
    expect(nightsInCalendarMonth('2026-06-28', '2026-07-05', 2026, 7)).toBe(4);
    expect(nightsInCalendarMonth('2026-07-01', '2026-07-05', 2026, 7)).toBe(4);
    expect(nightsInCalendarMonth('2026-07-28', '2026-08-03', 2026, 7)).toBe(4);
  });

  it('detects month overlap', () => {
    expect(bookingOverlapsMonth(bookings[0], 2026, 5)).toBe(true);
    expect(bookingOverlapsMonth(bookings[0], 2026, 6)).toBe(false);
  });

  it('returns multiple bookings on the same day across properties', () => {
    const dayBookings = findBookingsForDay(bookings, 2026, 5, 12);
    expect(dayBookings).toHaveLength(2);
    expect(primaryBookingForDay(bookings, 2026, 5, 12)?.propertyName).toBe('Nawala');
  });

  it('formats caretaker collect amounts and hides zero/null', () => {
    const withCollect = { ...bookings[0], caretakerCollectLkr: 8500 };
    const withoutCollect = { ...bookings[0], caretakerCollectLkr: null };
    expect(hasCaretakerCollectAmount(withCollect)).toBe(true);
    expect(hasCaretakerCollectAmount(withoutCollect)).toBe(false);
    expect(formatShalomCollectLkr(8500)).toBe('LKR 8.5K');
    expect(parseCaretakerCollectLkr(null)).toBeNull();
    expect(parseCaretakerCollectLkr(0)).toBeNull();
    expect(caretakerCollectTotalForDay([withCollect, { ...bookings[1], caretakerCollectLkr: 2000 }])).toBe(
      10500,
    );
    expect(caretakerCollectTotalForDay([withoutCollect])).toBe(0);
  });

  it('treats blocked channel days as availability blocks', () => {
    const blocked = {
      ...bookings[0],
      guestName: 'Blocked',
      channel: 'BLOCKED',
    };
    expect(isShalomAvailabilityBlock(blocked)).toBe(true);
    expect(isShalomAvailabilityBlock(bookings[0])).toBe(false);
  });

  it('resolves login dot status for caretaker and MD views', () => {
    const loggedIn = new Set(['2026-05-10', '2026-05-12']);
    const today = '2026-05-15';

    expect(resolveShalomLoginDotStatus('2026-05-10', loggedIn, today)).toBe('green');
    expect(resolveShalomLoginDotStatus('2026-05-11', loggedIn, today)).toBe('red');
    expect(resolveShalomLoginDotStatus('2026-05-20', loggedIn, today)).toBe(null);
    expect(
      resolveShalomLoginDotStatus('2026-05-11', loggedIn, today, {
        onlyOnBookingDays: true,
        hasBooking: false,
      }),
    ).toBe(null);
    expect(
      resolveShalomLoginDotStatus('2026-05-11', loggedIn, today, {
        onlyOnBookingDays: true,
        hasBooking: true,
      }),
    ).toBe('red');
  });
});
