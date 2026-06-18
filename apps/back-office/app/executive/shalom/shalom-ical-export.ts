type IcalBookingRow = {
  id: string;
  guest_name: string;
  channel: string;
  check_in: string;
  check_out: string;
  notes: string;
};

export type IcalCancelledEvent = {
  uid: string;
  check_in: string;
  check_out: string;
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Booking rows exported to Airbnb / Booking.com (blocks only — not OTA imports). */
export const SHALOM_ICAL_EXPORT_CHANNELS = ['DIRECT', 'BLOCKED', 'AUTO_BLOCK'] as const;

export function parseShalomIcalPropertyId(filename: string): string | null {
  const id = filename.replace(/\.ics$/i, '').trim();
  return UUID_RE.test(id) ? id : null;
}

function icalDate(isoDate: string): string {
  return isoDate.slice(0, 10).replace(/-/g, '');
}

function escapeIcalText(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

function icalUtcStamp(date = new Date()): string {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

function eventSummary(row: IcalBookingRow): string {
  if (row.channel === 'BLOCKED' || row.channel === 'AUTO_BLOCK') return 'Not available';
  if (row.guest_name.trim()) return row.guest_name.trim();
  return 'Reserved';
}

/** Airbnb-compatible minimal feed — blocks/direct only, never OTA imports. */
export function buildShalomIcalFeed(
  propertyName: string,
  bookings: IcalBookingRow[],
  cancellations: IcalCancelledEvent[] = [],
): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'PRODID:-//Pearzen//Shalom Calendar 1.0//EN',
    'CALSCALE:GREGORIAN',
    'VERSION:2.0',
    `X-WR-CALNAME:${escapeIcalText(propertyName)}`,
  ];

  const stamp = icalUtcStamp();

  for (const row of bookings) {
    const start = icalDate(String(row.check_in));
    const end = icalDate(String(row.check_out));
    if (!start || !end || start >= end) continue;

    lines.push(
      'BEGIN:VEVENT',
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${start}`,
      `DTEND;VALUE=DATE:${end}`,
      `SUMMARY:${escapeIcalText(eventSummary(row))}`,
      `UID:${row.id}@pearzen-shalom`,
      'END:VEVENT',
    );
  }

  for (const row of cancellations) {
    const start = icalDate(String(row.check_in));
    const end = icalDate(String(row.check_out));
    if (!start || !end || start >= end) continue;

    lines.push(
      'BEGIN:VEVENT',
      `DTSTAMP:${stamp}`,
      `UID:${row.uid}`,
      `STATUS:CANCELLED`,
      `DTSTART;VALUE=DATE:${start}`,
      `DTEND;VALUE=DATE:${end}`,
      'SUMMARY:Not available',
      'END:VEVENT',
    );
  }

  lines.push('END:VCALENDAR');
  return `${lines.join('\r\n')}\r\n`;
}
