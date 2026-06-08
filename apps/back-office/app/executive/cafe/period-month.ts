export function currentPeriodMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

/** Normalize YYYY-MM or YYYY-MM-DD to period month (first of month). */
export function normalizePeriodMonth(input?: string): string {
  if (!input?.trim()) return currentPeriodMonth();
  const trimmed = input.trim();
  if (/^\d{4}-\d{2}$/.test(trimmed)) return `${trimmed}-01`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return `${trimmed.slice(0, 7)}-01`;
  return currentPeriodMonth();
}

export function formatPeriodMonthLabel(periodMonth: string): string {
  const d = new Date(`${normalizePeriodMonth(periodMonth)}T12:00:00`);
  return d.toLocaleDateString('en-LK', { month: 'long', year: 'numeric' });
}
