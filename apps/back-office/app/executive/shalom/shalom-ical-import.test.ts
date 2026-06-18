import { describe, expect, it } from 'vitest';
import { buildShalomIcalFeed } from './shalom-ical-export';
import {
  countRawIcalEvents,
  isAllowedOtaIcalUrl,
  isBookingComClosedSummary,
  isIcalCalendarDocument,
  isOtaBlockedSummary,
  parseIcalEvents,
  resolveBookingComImport,
  resolveOtaImport,
} from './shalom-ical-import';

describe('parseIcalEvents', () => {
  it('parses compact and dashed all-day dates', () => {
    const compact = `BEGIN:VCALENDAR
BEGIN:VEVENT
DTSTART;VALUE=DATE:20260610
DTEND;VALUE=DATE:20260613
SUMMARY:Reserved
UID:compact@airbnb.com
END:VEVENT
END:VCALENDAR`;

    const dashed = `BEGIN:VCALENDAR
BEGIN:VEVENT
DTSTART;VALUE=DATE:2026-06-20
DTEND;VALUE=DATE:2026-06-23
SUMMARY:Reserved
UID:dashed@airbnb.com
END:VEVENT
END:VCALENDAR`;

    expect(parseIcalEvents(compact)).toHaveLength(1);
    expect(parseIcalEvents(dashed)).toEqual([
      expect.objectContaining({
        checkIn: '2026-06-20',
        checkOut: '2026-06-23',
        nights: 3,
      }),
    ]);
  });

  it('skips cancelled events', () => {
    const ics = `BEGIN:VCALENDAR
BEGIN:VEVENT
DTSTART;VALUE=DATE:20260610
DTEND;VALUE=DATE:20260613
SUMMARY:Reserved
STATUS:CANCELLED
UID:cancel@airbnb.com
END:VEVENT
END:VCALENDAR`;

    expect(parseIcalEvents(ics)).toHaveLength(0);
  });
});

describe('resolveOtaImport', () => {
  it('marks Airbnb unavailable nights as blocks', () => {
    expect(resolveOtaImport('Airbnb (Not available)', 'AIRBNB')).toEqual({
      isBlock: true,
      guestName: 'Blocked',
    });
  });

  it('marks Airbnb reserved nights as guest bookings', () => {
    expect(resolveOtaImport('Reserved', 'AIRBNB')).toEqual({
      isBlock: false,
      guestName: 'Reserved (Airbnb)',
    });
    expect(isOtaBlockedSummary('Reserved')).toBe(false);
  });
});

describe('resolveBookingComImport', () => {
  it('treats all CLOSED - Not available events as occupied Booking.com nights', () => {
    expect(resolveBookingComImport('CLOSED - Not available')).toEqual({
      isBlock: false,
      guestName: 'Occupied (Booking.com)',
    });
    expect(isBookingComClosedSummary('CLOSED - Not available')).toBe(true);
  });

  it('treats single-night and long-range CLOSED events the same', () => {
    expect(resolveOtaImport('CLOSED - Not available', 'BOOKING', 1)).toEqual({
      isBlock: false,
      guestName: 'Occupied (Booking.com)',
    });
    expect(resolveOtaImport('CLOSED - Not available', 'BOOKING', 37)).toEqual({
      isBlock: false,
      guestName: 'Occupied (Booking.com)',
    });
  });
});

describe('OTA feed helpers', () => {
  it('accepts Airbnb and Booking.com export hosts', () => {
    expect(isAllowedOtaIcalUrl('https://www.airbnb.com/calendar/ical/123.ics?t=abc')).toBe(true);
    expect(isAllowedOtaIcalUrl('https://ical.booking.com/v1/export?t=abc')).toBe(true);
    expect(isAllowedOtaIcalUrl('https://admin.booking.com/hotel/hoteladmin/ical.html?t=abc')).toBe(
      true,
    );
    expect(isAllowedOtaIcalUrl('https://example.com/calendar.ics')).toBe(false);
  });

  it('detects invalid calendar payloads', () => {
    expect(isIcalCalendarDocument('BEGIN:VCALENDAR\nEND:VCALENDAR')).toBe(true);
    expect(isIcalCalendarDocument('<html>blocked</html>')).toBe(false);
    expect(countRawIcalEvents('BEGIN:VEVENT\nEND:VEVENT\nBEGIN:VEVENT\nEND:VEVENT')).toBe(2);
  });
});

describe('buildShalomIcalFeed', () => {
  it('emits STATUS:CANCELLED events for removed Pearzen blocks', () => {
    const body = buildShalomIcalFeed('Test Villa', [], [
      {
        uid: 'ab81c8af-9df9-4a9b-b7f7-0efc99fc1b34@pearzen-shalom',
        check_in: '2026-07-21',
        check_out: '2026-07-22',
      },
    ]);

    expect(body).toContain('STATUS:CANCELLED');
    expect(body).toContain('ab81c8af-9df9-4a9b-b7f7-0efc99fc1b34@pearzen-shalom');
    expect(body).toContain('DTSTART;VALUE=DATE:20260721');
  });
});
