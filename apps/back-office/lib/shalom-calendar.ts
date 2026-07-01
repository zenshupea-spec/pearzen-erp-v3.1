export type ShalomCalendarChannel = 'AIRBNB' | 'BOOKING' | 'BLOCKED';

export type ShalomCalendarBooking = {
  id: string;
  propertyId: string;
  propertyName: string;
  guestName: string;
  channel: string;
  checkIn: string;
  checkOut: string;
  nights: number;
  otaImported?: boolean;
  notes?: string;
  caretakerCollectLkr?: number | null;
};

export const SHALOM_CALENDAR_DAY_NAMES = [
  'Sun',
  'Mon',
  'Tue',
  'Wed',
  'Thu',
  'Fri',
  'Sat',
] as const;

export const SHALOM_CALENDAR_MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

export function shalomDateKey(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function shalomMonthRange(year: number, month: number) {
  const prefix = `${year}-${String(month).padStart(2, '0')}`;
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  return {
    monthKey: prefix,
    monthStart: `${prefix}-01`,
    monthEndExclusive: `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`,
    daysInMonth: new Date(year, month, 0).getDate(),
  };
}

/** Shalom executive reporting always uses calendar months starting on the 1st. */
export function formatShalomCalendarMonthPeriod(year: number, month: number): string {
  const { daysInMonth } = shalomMonthRange(year, month);
  const monthName = SHALOM_CALENDAR_MONTH_NAMES[month - 1] ?? String(month);
  return `1–${daysInMonth} ${monthName} ${year}`;
}

function nightsBetweenDates(startIso: string, endIso: string): number {
  const start = new Date(`${startIso}T12:00:00.000Z`);
  const end = new Date(`${endIso}T12:00:00.000Z`);
  const diff = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  return diff > 0 ? diff : 0;
}

/** Guest nights that fall inside a calendar month (check-out day excluded). */
export function nightsInCalendarMonth(
  checkIn: string,
  checkOut: string,
  year: number,
  month: number,
): number {
  const { monthStart, monthEndExclusive } = shalomMonthRange(year, month);
  const start = checkIn < monthStart ? monthStart : checkIn;
  const end = checkOut < monthEndExclusive ? checkOut : monthEndExclusive;
  if (start >= end) return 0;
  return nightsBetweenDates(start, end);
}

export function normalizeShalomCalendarChannel(channel: string): ShalomCalendarChannel {
  if (channel === 'AIRBNB' || channel === 'BOOKING' || channel === 'BLOCKED') return channel;
  if (channel === 'DIRECT') return 'BOOKING';
  if (channel === 'AUTO_BLOCK') return 'BLOCKED';
  return 'BLOCKED';
}

export function isShalomAvailabilityBlock(booking: ShalomCalendarBooking): boolean {
  return (
    normalizeShalomCalendarChannel(booking.channel) === 'BLOCKED' ||
    booking.guestName === 'Blocked' ||
    /blocked \/ unavailable/i.test(booking.notes ?? '')
  );
}

function isOtaReservation(booking: ShalomCalendarBooking): boolean {
  return Boolean(booking.otaImported) && !isShalomAvailabilityBlock(booking);
}

export function shalomCalendarDayLabel(booking: ShalomCalendarBooking): string {
  if (isShalomAvailabilityBlock(booking)) return 'Block';
  if (booking.otaImported && normalizeShalomCalendarChannel(booking.channel) === 'BOOKING') {
    return 'B.com';
  }
  if (isOtaReservation(booking)) return 'Reserved';
  const first = booking.guestName.split(' ')[0] ?? '';
  if (/^reserved\b/i.test(first) || first === 'Airbnb' || first === 'Booking.com') {
    return 'Reserved';
  }
  if (/^occupied\b/i.test(first)) return 'B.com';
  return first;
}

export function bookingOverlapsRange(
  booking: Pick<ShalomCalendarBooking, 'checkIn' | 'checkOut'>,
  rangeStart: string,
  rangeEndExclusive: string,
): boolean {
  return (
    (booking.checkIn >= rangeStart && booking.checkIn < rangeEndExclusive) ||
    (booking.checkOut > rangeStart && booking.checkOut <= rangeEndExclusive) ||
    (booking.checkIn < rangeStart && booking.checkOut > rangeEndExclusive)
  );
}

export function bookingOverlapsMonth(
  booking: Pick<ShalomCalendarBooking, 'checkIn' | 'checkOut'>,
  year: number,
  month: number,
): boolean {
  const { monthStart, monthEndExclusive } = shalomMonthRange(year, month);
  return bookingOverlapsRange(booking, monthStart, monthEndExclusive);
}

export function buildShalomCalendarCells(year: number, month: number): (number | null)[] {
  const firstDayOfWeek = new Date(year, month - 1, 1).getDay();
  const daysInMonth = new Date(year, month, 0).getDate();
  const cells: (number | null)[] = [
    ...Array(firstDayOfWeek).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

export function findBookingsForDay(
  bookings: ShalomCalendarBooking[],
  year: number,
  month: number,
  day: number,
): ShalomCalendarBooking[] {
  const key = shalomDateKey(year, month, day);
  const active = bookings.filter((booking) => key >= booking.checkIn && key < booking.checkOut);
  const reservations = active.filter((booking) => !isShalomAvailabilityBlock(booking));
  if (reservations.length > 0) return reservations;
  return active;
}

export function primaryBookingForDay(
  bookings: ShalomCalendarBooking[],
  year: number,
  month: number,
  day: number,
): ShalomCalendarBooking | null {
  const matches = findBookingsForDay(bookings, year, month, day);
  return matches[0] ?? null;
}

export function parseCaretakerCollectLkr(value: unknown): number | null {
  if (value == null || value === '') return null;
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return amount;
}

export function hasCaretakerCollectAmount(
  booking: Pick<ShalomCalendarBooking, 'caretakerCollectLkr'>,
): boolean {
  return parseCaretakerCollectLkr(booking.caretakerCollectLkr) != null;
}

export function formatShalomCollectLkr(amount: number): string {
  if (amount >= 1_000_000) return `LKR ${(amount / 1_000_000).toFixed(2)}M`;
  if (amount >= 1_000) return `LKR ${(amount / 1_000).toFixed(1)}K`;
  return `LKR ${amount.toLocaleString('en-LK')}`;
}

export function caretakerCollectTotalForDay(bookings: ShalomCalendarBooking[]): number {
  return bookings.reduce(
    (sum, booking) => sum + (parseCaretakerCollectLkr(booking.caretakerCollectLkr) ?? 0),
    0,
  );
}

export type ShalomLoginDotStatus = 'green' | 'red' | null;

export function buildShalomLoginDateSet(dates: Iterable<string>): Set<string> {
  return new Set(Array.from(dates, (date) => date.slice(0, 10)));
}

/** Past/today days: green when logged in; red when not (optionally only on booking days). */
export function resolveShalomLoginDotStatus(
  dateKey: string,
  loggedInDates: ReadonlySet<string>,
  todayKey: string,
  options?: { onlyOnBookingDays?: boolean; hasBooking?: boolean },
): ShalomLoginDotStatus {
  if (dateKey > todayKey) return null;
  if (loggedInDates.has(dateKey)) return 'green';
  if (options?.onlyOnBookingDays && !options.hasBooking) return null;
  return 'red';
}

export function shalomLoginDotTitle(status: ShalomLoginDotStatus): string | undefined {
  if (status === 'green') return 'Caretaker logged in';
  if (status === 'red') return 'No login';
  return undefined;
}
