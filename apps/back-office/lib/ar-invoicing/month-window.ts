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

/** Calendar month immediately after a service month key (`YYYY-MM`). */
export function billingMonthAfterService(monthKey: string): { year: number; month: number } {
  const [y, m] = monthKey.split('-').map(Number);
  if (!y || !m) {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() + 1 };
  }
  return m === 12 ? { year: y + 1, month: 1 } : { year: y, month: m + 1 };
}

function clampBillingDay(day: number): number {
  return Math.min(28, Math.max(1, Math.round(day)));
}

function billingDateIso(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(clampBillingDay(day)).padStart(2, '0')}`;
}

export type InvoiceBillingDateOptions = {
  invoiceDispatchDay?: number;
  collectionWarningDay?: number;
};

/**
 * Invoice dispatch lands on `invoiceDispatchDay` of the month after the service month.
 * Payment due is the day after the collection-warning threshold in that same billing month.
 */
export function invoiceDispatchDate(
  monthKey: string,
  invoiceDispatchDay = 1,
): string {
  const { year, month } = billingMonthAfterService(monthKey);
  return billingDateIso(year, month, invoiceDispatchDay);
}

export function invoiceDueDate(
  monthKey: string,
  options: InvoiceBillingDateOptions = {},
): string {
  const { year, month } = billingMonthAfterService(monthKey);
  const warningDay = clampBillingDay(options.collectionWarningDay ?? 6);
  const dueDay = clampBillingDay(warningDay + 1);
  return billingDateIso(year, month, dueDay);
}

/** ISO timestamp for audit trail — dispatch morning on the configured billing day. */
export function invoiceGeneratedAtIso(
  monthKey: string,
  invoiceDispatchDay = 1,
): string {
  const dispatch = invoiceDispatchDate(monthKey, invoiceDispatchDay);
  const [y, m, d] = dispatch.split('-').map(Number);
  if (!y || !m || !d) return new Date().toISOString();
  return new Date(y, m - 1, d, 9, 0, 0).toISOString();
}

/** Render `YYYY-MM-DD` due dates on tax invoice printouts. */
export function formatInvoiceDueDateLabel(dueDate: string): string {
  const [y, m, d] = dueDate.split('-').map(Number);
  if (!y || !m || !d) return dueDate;
  return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`;
}
