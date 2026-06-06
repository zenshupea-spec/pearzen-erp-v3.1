export function payrollMonthFirstDay(yearMonth?: string): string {
  if (yearMonth && /^\d{4}-\d{2}$/.test(yearMonth)) {
    return `${yearMonth}-01`;
  }
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}-01`;
}

export function payrollMonthLabel(isoDate: string): string {
  const d = new Date(`${isoDate}T12:00:00`);
  return d.toLocaleDateString('en-LK', { month: 'long', year: 'numeric' });
}

export function isCurrentPayrollMonth(isoDate: string): boolean {
  return payrollMonthFirstDay(isoDate.slice(0, 7)) === payrollMonthFirstDay();
}

/** Inclusive calendar range for a payroll month (YYYY-MM-01 … last day). */
export function payrollMonthDateRange(payrollMonthIso: string): { start: string; end: string } {
  const start = payrollMonthFirstDay(payrollMonthIso.slice(0, 7));
  const endDate = new Date(`${start}T12:00:00`);
  endDate.setMonth(endDate.getMonth() + 1);
  endDate.setDate(0);
  const end = endDate.toISOString().slice(0, 10);
  return { start, end };
}
