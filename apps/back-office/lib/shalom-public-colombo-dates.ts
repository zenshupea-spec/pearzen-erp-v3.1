const COLOMBO_TZ = 'Asia/Colombo';

export { COLOMBO_TZ as SHALOM_PUBLIC_COLOMBO_TZ };

export type ColomboDateParts = {
  year: number;
  month: number;
  day: number;
};

export function colomboDateParts(at = Date.now()): ColomboDateParts {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: COLOMBO_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(at));

  return {
    year: Number(parts.find((part) => part.type === 'year')?.value ?? 1970),
    month: Number(parts.find((part) => part.type === 'month')?.value ?? 1),
    day: Number(parts.find((part) => part.type === 'day')?.value ?? 1),
  };
}

export function colomboIsoFromParts(parts: ColomboDateParts): string {
  const month = String(parts.month).padStart(2, '0');
  const day = String(parts.day).padStart(2, '0');
  return `${parts.year}-${month}-${day}`;
}

/** Current calendar date in Asia/Colombo as YYYY-MM-DD. */
export function colomboTodayIso(at = Date.now()): string {
  return colomboIsoFromParts(colomboDateParts(at));
}

export function addColomboDays(isoDate: string, days: number): string {
  const base = Date.parse(`${isoDate}T12:00:00.000Z`);
  const next = new Date(base + days * 24 * 60 * 60 * 1000);
  return next.toISOString().slice(0, 10);
}

export function colomboWeekdayIndex(isoDate: string): number {
  const utc = Date.parse(`${isoDate}T12:00:00.000Z`);
  return new Date(utc).getUTCDay();
}

export function daysInColomboMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function colomboMonthStartIso(year: number, month: number): string {
  return colomboIsoFromParts({ year, month, day: 1 });
}

export function colomboMonthEndExclusiveIso(year: number, month: number): string {
  const days = daysInColomboMonth(year, month);
  return addColomboDays(colomboIsoFromParts({ year, month, day: days }), 1);
}

export function shiftColomboMonth(
  year: number,
  month: number,
  delta: number,
): { year: number; month: number } {
  const index = year * 12 + (month - 1) + delta;
  return {
    year: Math.floor(index / 12),
    month: (index % 12) + 1,
  };
}

export function formatColomboGuestDate(isoDate: string): string {
  const utc = Date.parse(`${isoDate}T12:00:00.000Z`);
  return new Intl.DateTimeFormat('en-LK', {
    timeZone: COLOMBO_TZ,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(utc));
}

export function formatColomboMonthLabel(year: number, month: number): string {
  const iso = colomboMonthStartIso(year, month);
  const utc = Date.parse(`${iso}T12:00:00.000Z`);
  return new Intl.DateTimeFormat('en-LK', {
    timeZone: COLOMBO_TZ,
    month: 'long',
    year: 'numeric',
  }).format(new Date(utc));
}

export function buildColomboMonthGrid(year: number, month: number): Array<string | null> {
  const days = daysInColomboMonth(year, month);
  const firstWeekday = colomboWeekdayIndex(colomboMonthStartIso(year, month));
  const cells: Array<string | null> = [];

  for (let index = 0; index < firstWeekday; index += 1) {
    cells.push(null);
  }

  for (let day = 1; day <= days; day += 1) {
    cells.push(colomboIsoFromParts({ year, month, day }));
  }

  return cells;
}

/** Booking flow horizon from today (inclusive) in Colombo. */
export function shalomBookingHorizonEndIso(todayIso: string, horizonDays = 365): string {
  return addColomboDays(todayIso, horizonDays);
}
