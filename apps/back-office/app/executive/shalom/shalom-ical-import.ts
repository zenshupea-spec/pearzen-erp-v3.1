export type ParsedIcalEvent = {
  uid: string;
  summary: string;
  checkIn: string;
  checkOut: string;
  nights: number;
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

  const datePrefix = compact.slice(0, 8);
  if (/^\d{8}/.test(datePrefix)) {
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

export function parseIcalEvents(icsText: string): ParsedIcalEvent[] {
  const lines = unfoldIcalLines(icsText);
  const events: ParsedIcalEvent[] = [];
  let inEvent = false;
  let uid = '';
  let summary = '';
  let dtStart: string | null = null;
  let dtEnd: string | null = null;

  const flush = () => {
    if (!uid || !dtStart || !dtEnd) return;
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
  }

  return events;
}

export function guestNameFromOtaSummary(summary: string, channel: 'AIRBNB' | 'BOOKING'): string {
  const cleaned = summary.trim();
  if (!cleaned) return channel === 'AIRBNB' ? 'Airbnb Guest' : 'Booking.com Guest';

  const blocked = /^(reserved|not available|blocked|unavailable|airbnb|booking\.com)/i.test(cleaned);
  if (blocked) return channel === 'AIRBNB' ? 'Airbnb Guest' : 'Booking.com Guest';

  return cleaned;
}

export function isAllowedOtaIcalUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false;
    const host = parsed.hostname.toLowerCase();
    return host.includes('airbnb.') || host.includes('booking.com');
  } catch {
    return false;
  }
}
