/** SaaS platform billing helpers (Forge → FM → Executive notification). */

export type SaasBillingSettings = {
  companyId: string;
  databaseCostLkr: number;
  frontendCostLkr: number;
  perEmployeePriceLkr: number;
  billingStartDate: string;
};

export type SaasPlatformInvoice = {
  id: string;
  companyId: string;
  invoiceMonth: string;
  dueDate: string;
  databaseCostLkr: number;
  frontendCostLkr: number;
  employeeCount: number;
  perEmployeePriceLkr: number;
  employeeCostLkr: number;
  totalLkr: number;
  status: 'unpaid' | 'paid';
  paidAt: string | null;
  createdAt: string;
  receiptStoragePath: string | null;
  receiptFileName: string | null;
  receiptUploadedAt: string | null;
  receiptUploadedBy: string | null;
  receiptUrl: string | null;
};

export function toDateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export function parseDateOnly(value: string): Date {
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Most recent monthly due date on or before `from` (billing anchor day-of-month). */
export function currentMonthlyDueDate(billingStartDate: string, from = new Date()): string {
  const anchor = parseDateOnly(billingStartDate);
  const day = anchor.getDate();
  const today = new Date(from.getFullYear(), from.getMonth(), from.getDate());

  const lastDayThisMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  const thisMonthDue = new Date(
    today.getFullYear(),
    today.getMonth(),
    Math.min(day, lastDayThisMonth),
  );
  if (thisMonthDue <= today) return toDateOnly(thisMonthDue);

  const prevMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const lastDayPrev = new Date(prevMonth.getFullYear(), prevMonth.getMonth() + 1, 0).getDate();
  return toDateOnly(
    new Date(prevMonth.getFullYear(), prevMonth.getMonth(), Math.min(day, lastDayPrev)),
  );
}

/** Next monthly due date on or after `from` using anchor day-of-month from billing start. */
export function nextMonthlyDueDate(billingStartDate: string, from = new Date()): string {
  const anchor = parseDateOnly(billingStartDate);
  const day = anchor.getDate();
  const cursor = new Date(from.getFullYear(), from.getMonth(), 1);

  for (let i = 0; i < 24; i += 1) {
    const year = cursor.getFullYear();
    const month = cursor.getMonth();
    const lastDay = new Date(year, month + 1, 0).getDate();
    const candidate = new Date(year, month, Math.min(day, lastDay));
    if (candidate >= new Date(from.getFullYear(), from.getMonth(), from.getDate())) {
      return toDateOnly(candidate);
    }
    cursor.setMonth(cursor.getMonth() + 1);
  }

  return toDateOnly(from);
}

export function invoiceMonthForDueDate(dueDate: string): string {
  const d = parseDateOnly(dueDate);
  return toDateOnly(new Date(d.getFullYear(), d.getMonth(), 1));
}

export function isInvoiceDueToday(dueDate: string, today = new Date()): boolean {
  return dueDate === toDateOnly(today);
}

export function isInvoiceOverdue(dueDate: string, today = new Date()): boolean {
  return dueDate < toDateOnly(today);
}

export function daysUntilDue(dueDate: string, today = new Date()): number {
  const due = parseDateOnly(dueDate);
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((due.getTime() - t.getTime()) / 86_400_000);
}

/** Unpaid invoice due today or overdue — FM-only notice, no advance reminders. */
export function shouldShowPaymentNotice(
  invoice: SaasPlatformInvoice,
  today = new Date(),
): boolean {
  if (invoice.status === 'paid') return false;
  return isInvoiceDueToday(invoice.dueDate, today) || isInvoiceOverdue(invoice.dueDate, today);
}

export function isPaymentPending(invoice: SaasPlatformInvoice, today = new Date()): boolean {
  return shouldShowPaymentNotice(invoice, today);
}

export function paymentNoticeLabel(dueDate: string, today = new Date()): string {
  const days = daysUntilDue(dueDate, today);
  if (days < 0) return `Payment overdue by ${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'}`;
  return 'Payment due today';
}

export function formatLkr(amount: number): string {
  return `LKR ${amount.toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
