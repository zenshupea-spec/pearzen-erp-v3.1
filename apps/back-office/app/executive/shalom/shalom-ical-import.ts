export type ParsedIcalEvent = {
  uid: string;
  summary: string;
  checkIn: string;
  checkOut: string;
  nights: number;
};

export type OtaImportResolution = {
  /** True when the OTA feed marks the night unavailable (not a guest reservation). */
  isBlock: boolean;
  guestName: string;
};

/** Unfold RFC 5545 continuation lines. */
function unfoldIcalLines(text: string): string[] {
  const raw = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const lines: string[] = [];
  for (const line of raw) {
    if (line.startsWith(' ') || line.startsWith('\t')) {
      if (lines.length > 0) lines[lines.length - 1] += line.slice(1);
      continue;
    }
    lines.push(line);
  }
  return lines;
}

function parseIcalPropertyValue(line: string): { key: string; value: string } {
  const colon = line.indexOf(':');
  if (colon < 0) return { key: line.toUpperCase(), value: '' };
  const left = line.slice(0, colon);
  const value = line.slice(colon + 1).trim();
  const key = left.split(';')[0]?.toUpperCase() ?? left.toUpperCase();
  return { key, value };
}

function icalValueToIsoDate(value: string): string | null {
  const compact = value.trim();
  if (!compact) return null;

  if (/^\d{8}$/.test(compact)) {
    return `${compact.slice(0, 4)}-${compact.slice(4, 6)}-${compact.slice(6, 8)}`;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(compact)) {
    return compact;
  }

  const datePrefix = compact.slice(0, 8);
  if (/^\d{8}$/.test(datePrefix)) {
    return `${datePrefix.slice(0, 4)}-${datePrefix.slice(4, 6)}-${datePrefix.slice(6, 8)}`;
  }

  return null;
}

function nightsBetween(checkIn: string, checkOut: string): number {
  const start = new Date(`${checkIn}T00:00:00Z`).getTime();
  const end = new Date(`${checkOut}T00:00:00Z`).getTime();
  const diff = Math.round((end - start) / 86_400_000);
  return diff > 0 ? diff : 0;
}

function unescapeIcalText(value: string): string {
  return value.replace(/\\n/gi, '\n').replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\\\/g, '\\');
}

/** Airbnb / Booking.com blocked-night labels in iCal SUMMARY fields. */
export function isOtaBlockedSummary(summary: string): boolean {
  const cleaned = summary.trim();
  if (!cleaned) return false;

  if (/^reserved\b/i.test(cleaned)) return false;
  if (/reservation/i.test(cleaned) && !/not available|unavailable/i.test(cleaned)) return false;

  return (
    /not available/i.test(cleaned) ||
    /unavailable/i.test(cleaned) ||
    /^blocked\b/i.test(cleaned) ||
    /^closed\b/i.test(cleaned) ||
    /\(blocked\)/i.test(cleaned)
  );
}

/** Booking.com uses "CLOSED - Not available" for both guest stays and manual blocks. */
export function isBookingComClosedSummary(summary: string): boolean {
  const cleaned = summary.trim();
  return !cleaned || /^closed\s*-\s*not available$/i.test(cleaned);
}

/**
 * Booking.com iCal labels every event "CLOSED - Not available" — bookings and manual
 * closures use the same text, and the feed often merges adjacent dates into long ranges
 * that do not match the extranet grid. We cannot split block vs guest stay from iCal.
 * Import every event as an occupied Booking.com night (blue), not a grey block.
 */
export function resolveBookingComImport(summary: string): OtaImportResolution {
  if (isOtaBlockedSummary(summary) && !isBookingComClosedSummary(summary)) {
    return { isBlock: true, guestName: 'Blocked' };
  }

  const cleaned = summary.trim();
  return {
    isBlock: false,
    guestName: cleaned && !isBookingComClosedSummary(cleaned)
      ? cleaned
      : 'Occupied (Booking.com)',
  };
}

export function resolveOtaImport(
  summary: string,
  feedChannel: 'AIRBNB' | 'BOOKING',
  _nights = 1,
): OtaImportResolution {
  if (feedChannel === 'BOOKING') {
    return resolveBookingComImport(summary);
  }

  if (isOtaBlockedSummary(summary)) {
    return { isBlock: true, guestName: 'Blocked' };
  }

  const cleaned = summary.trim();
  if (!cleaned || /^reserved\b/i.test(cleaned)) {
    return {
      isBlock: false,
      guestName: 'Reserved (Airbnb)',
    };
  }

  return { isBlock: false, guestName: cleaned };
}

export function otaUidMatchesFeed(uid: string, feedChannel: 'AIRBNB' | 'BOOKING'): boolean {
  const lower = uid.toLowerCase();
  if (feedChannel === 'AIRBNB') {
    return lower.includes('airbnb') || lower.includes('abnb');
  }
  return lower.includes('booking');
}

export function parseIcalEvents(icsText: string): ParsedIcalEvent[] {
  const lines = unfoldIcalLines(icsText);
  const events: ParsedIcalEvent[] = [];
  let inEvent = false;
  let uid = '';
  let summary = '';
  let dtStart: string | null = null;
  let dtEnd: string | null = null;
  let status = '';

  const flush = () => {
    if (!uid || !dtStart || !dtEnd) return;
    if (status === 'CANCELLED') return;
    const nights = nightsBetween(dtStart, dtEnd);
    if (nights < 1) return;
    events.push({
      uid,
      summary: unescapeIcalText(summary).trim(),
      checkIn: dtStart,
      checkOut: dtEnd,
      nights,
    });
  };

  for (const line of lines) {
    const upper = line.toUpperCase();
    if (upper === 'BEGIN:VEVENT') {
      inEvent = true;
      uid = '';
      summary = '';
      dtStart = null;
      dtEnd = null;
      status = '';
      continue;
    }
    if (upper === 'END:VEVENT') {
      if (inEvent) flush();
      inEvent = false;
      continue;
    }
    if (!inEvent) continue;

    const { key, value } = parseIcalPropertyValue(line);
    if (key === 'UID') uid = value;
    else if (key === 'SUMMARY') summary = value;
    else if (key === 'DTSTART') dtStart = icalValueToIsoDate(value);
    else if (key === 'DTEND') dtEnd = icalValueToIsoDate(value);
    else if (key === 'STATUS') status = value.toUpperCase();
  }

  return events;
}

/** @deprecated Use resolveOtaImport instead */
export function guestNameFromOtaSummary(summary: string, channel: 'AIRBNB' | 'BOOKING'): string {
  return resolveOtaImport(summary, channel).guestName;
}

export function isIcalCalendarDocument(icsText: string): boolean {
  return /BEGIN:VCALENDAR/i.test(icsText);
}

export function countRawIcalEvents(icsText: string): number {
  return (icsText.match(/BEGIN:VEVENT/gi) ?? []).length;
}

export function isAllowedOtaIcalUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false;
    const host = parsed.hostname.toLowerCase();
    return host.includes('airbnb.') || host.includes('airbnb.com') || host.includes('booking.com');
  } catch {
    return false;
  }
}
