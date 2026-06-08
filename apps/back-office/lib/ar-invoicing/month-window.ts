export const MONTH_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

export type MonthDef = { key: string; label: string; short: string };

export function getCurrentMonthKey(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

export function monthKeyToLabel(monthKey: string): string {
  const [yr, mo] = monthKey.split('-');
  const short = MONTH_SHORT[parseInt(mo ?? '0', 10) - 1];
  return short ? `${short} ${yr}` : monthKey;
}

export function buildMonthsForYear(year: number): MonthDef[] {
  return MONTH_SHORT.map((short, i) => {
    const month = i + 1;
    const key = `${year}-${String(month).padStart(2, '0')}`;
    return { key, label: `${short} ${year}`, short };
  });
}

/** Rolling N months ending at anchor (inclusive). */
export function buildRollingMonthKeys(anchorMonthKey: string, count = 12): string[] {
  const [y, m] = anchorMonthKey.split('-').map(Number);
  const keys: string[] = [];
  let year = y;
  let month = m;
  for (let i = 0; i < count; i++) {
    keys.unshift(`${year}-${String(month).padStart(2, '0')}`);
    month -= 1;
    if (month < 1) {
      month = 12;
      year -= 1;
    }
  }
  return keys;
}

export function buildRollingMonthDefs(anchorMonthKey: string, count = 12): MonthDef[] {
  return buildRollingMonthKeys(anchorMonthKey, count).map((key) => ({
    key,
    label: monthKeyToLabel(key),
    short: MONTH_SHORT[parseInt(key.split('-')[1] ?? '0', 10) - 1] ?? key,
  }));
}

export function buildChronoMonthKeys(fromYear: number, toYear: number): string[] {
  const keys: string[] = [];
  for (let y = fromYear; y <= toYear; y++) {
    for (let m = 1; m <= 12; m++) {
      keys.push(`${y}-${String(m).padStart(2, '0')}`);
    }
  }
  return keys;
}

export function monthKeyBefore(monthKey: string, chronoKeys: string[]): string | undefined {
  const idx = chronoKeys.indexOf(monthKey);
  return idx > 0 ? chronoKeys[idx - 1] : undefined;
}

export function monthKeyAfter(monthKey: string, chronoKeys: string[]): string | undefined {
  const idx = chronoKeys.indexOf(monthKey);
  return idx >= 0 && idx < chronoKeys.length - 1 ? chronoKeys[idx + 1] : undefined;
}

export function invoiceDueDate(monthKey: string): string {
  const [y, m] = monthKey.split('-').map(Number);
  const next = m === 12 ? { year: y + 1, month: 1 } : { year: y, month: m + 1 };
  return `${next.year}-${String(next.month).padStart(2, '0')}-07`;
}
