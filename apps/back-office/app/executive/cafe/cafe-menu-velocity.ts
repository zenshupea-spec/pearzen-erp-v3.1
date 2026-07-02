/** Weekday sales velocity — avg of last 3 same weekdays + sold-out carry boost. */

export interface MenuDailySaleRecord {
  saleDate: string; // YYYY-MM-DD
  unitsSold: number;
  soldOut: boolean;
}

export interface MenuWeekdayVelocity {
  /** Same-weekday average over the last 3 completed occurrences (excludes today). */
  weekdayAvg: number;
  /** Cumulative +2 increments when 2+ of the last 3 same weekdays sold out at/above avg. */
  soldOutBoost: number;
  /** weekdayAvg + soldOutBoost — planning reference for min/day comparisons. */
  referenceDaily: number;
  /** ISO week (YYYY-Www) when carry was last incremented — avoids double-counting. */
  boostWeekIso?: string;
}

const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

export function weekdayShortLabel(date: Date): string {
  return WEEKDAY_SHORT[date.getDay()];
}

/** Last N calendar dates sharing `targetDow`, optionally excluding `anchor` day. */
export function getLastSameWeekdayDates(
  anchor: Date,
  targetDow: number,
  count: number,
  includeAnchor = false,
): string[] {
  const dates: string[] = [];
  const cursor = new Date(anchor);
  if (!includeAnchor) cursor.setDate(cursor.getDate() - 1);

  while (dates.length < count) {
    if (cursor.getDay() === targetDow) {
      dates.push(cursor.toISOString().slice(0, 10));
    }
    cursor.setDate(cursor.getDate() - 1);
    if (cursor.getFullYear() < anchor.getFullYear() - 2) break;
  }
  return dates;
}

export function isoWeekKey(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

function salesByDate(records: MenuDailySaleRecord[]): Map<string, MenuDailySaleRecord> {
  return new Map(records.map((r) => [r.saleDate, r]));
}

/** Count sold-out days in a trio where sales met or exceeded the trio average. */
export function countSoldOutDaysInTrio(
  trioDates: string[],
  byDate: Map<string, MenuDailySaleRecord>,
): number {
  const units = trioDates.map((d) => byDate.get(d)?.unitsSold ?? 0);
  const avg = units.length ? Math.round(units.reduce((a, b) => a + b, 0) / units.length) : 0;
  if (avg <= 0) return 0;
  return trioDates.filter((d) => {
    const row = byDate.get(d);
    return Boolean(row?.soldOut) && (row?.unitsSold ?? 0) >= avg;
  }).length;
}

/**
 * Reference daily units for planning: average of last 3 same weekdays + cumulative sold-out boost.
 * Sold-out boost: when 2+ of those 3 days sold out at/above the trio avg, add +2 (once per ISO week).
 */
export function calcMenuWeekdayVelocity(
  sales: MenuDailySaleRecord[],
  boostCarry = 0,
  boostWeekIso: string | undefined = undefined,
  today: Date = new Date(),
): MenuWeekdayVelocity {
  const dow = today.getDay();
  const last3 = getLastSameWeekdayDates(today, dow, 3, false);
  const byDate = salesByDate(sales);

  const units = last3.map((d) => byDate.get(d)?.unitsSold ?? 0);
  const weekdayAvg =
    units.length > 0 ? Math.round(units.reduce((a, b) => a + b, 0) / units.length) : 0;

  const soldOutInLast3 = countSoldOutDaysInTrio(last3, byDate);
  const currentWeek = isoWeekKey(today);

  let soldOutBoost = boostCarry;
  let nextBoostWeek = boostWeekIso;

  if (soldOutInLast3 >= 2 && boostWeekIso !== currentWeek) {
    soldOutBoost += 2;
    nextBoostWeek = currentWeek;
  }

  return {
    weekdayAvg,
    soldOutBoost,
    referenceDaily: weekdayAvg + soldOutBoost,
    boostWeekIso: nextBoostWeek,
  };
}
