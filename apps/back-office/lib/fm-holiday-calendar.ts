export type FmHolidayType = 'POYA' | 'STATUTORY' | 'PUBLIC_HOLIDAY';

export type FmHolidayCalendarEntry = {
  id: string;
  date: string;
  label: string;
  type: FmHolidayType;
};

/** Default UI seed when no DB row exists (FM settings editor). */
export const FM_HOLIDAY_CALENDAR_DEFAULTS: FmHolidayCalendarEntry[] = [
  { id: 'h1', date: '2026-06-11', label: 'Poson Poya', type: 'POYA' },
  { id: 'h2', date: '2026-07-10', label: 'Esala Poya', type: 'POYA' },
  { id: 'h3', date: '2026-08-08', label: 'Nikini Poya', type: 'POYA' },
  { id: 'h4', date: '2026-09-07', label: 'Binara Poya', type: 'POYA' },
  { id: 'h5', date: '2026-02-04', label: 'Independence Day', type: 'PUBLIC_HOLIDAY' },
  { id: 'h6', date: '2026-04-13', label: 'Sinhala & Tamil New Year', type: 'STATUTORY' },
  { id: 'h7', date: '2026-05-01', label: 'Labour Day', type: 'STATUTORY' },
];

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function parseHolidayCalendarEntries(raw: unknown): FmHolidayCalendarEntry[] {
  if (!Array.isArray(raw)) return [];

  const out: FmHolidayCalendarEntry[] = [];
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue;
    const entry = row as Record<string, unknown>;
    const date = typeof entry.date === 'string' ? entry.date.trim() : '';
    const label = typeof entry.label === 'string' ? entry.label.trim() : '';
    const type = entry.type;
    if (!DATE_RE.test(date) || !label) continue;
    if (type !== 'POYA' && type !== 'STATUTORY' && type !== 'PUBLIC_HOLIDAY') continue;
    const id =
      typeof entry.id === 'string' && entry.id.trim()
        ? entry.id.trim()
        : `h-${date}-${type}`;
    out.push({ id, date, label, type });
  }

  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/** True when Poya and statutory/public holidays are not configured ≥1 year ahead. */
export function isHolidayCalendarIncomplete(
  entries: FmHolidayCalendarEntry[],
  now = new Date(),
): boolean {
  if (entries.length === 0) return true;

  const oneYearFromNow = new Date(now);
  oneYearFromNow.setFullYear(oneYearFromNow.getFullYear() + 1);

  const latestPoya = entries
    .filter((entry) => entry.type === 'POYA')
    .sort((a, b) => b.date.localeCompare(a.date))[0];
  const latestStatutory = entries
    .filter((entry) => entry.type === 'STATUTORY' || entry.type === 'PUBLIC_HOLIDAY')
    .sort((a, b) => b.date.localeCompare(a.date))[0];

  const poyaFilled =
    latestPoya != null && new Date(`${latestPoya.date}T12:00:00`) >= oneYearFromNow;
  const statutoryFilled =
    latestStatutory != null &&
    new Date(`${latestStatutory.date}T12:00:00`) >= oneYearFromNow;

  return !poyaFilled || !statutoryFilled;
}

export function sanitizeHolidayCalendarEntries(
  entries: FmHolidayCalendarEntry[],
): FmHolidayCalendarEntry[] {
  return parseHolidayCalendarEntries(entries);
}
