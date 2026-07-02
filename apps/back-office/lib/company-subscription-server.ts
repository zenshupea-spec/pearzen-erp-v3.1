import 'server-only';

import { createSupabaseServiceClient } from '../../../packages/supabase/service';
import { shouldShowPaymentNotice } from './saas-billing';
import {
  type CompanySubscriptionStatus,
  isCompanySubscriptionStatus,
} from './company-subscription';

function mapInvoiceRow(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    companyId: String(row.company_id),
    dueDate: String(row.due_date),
    status: row.status === 'paid' ? ('paid' as const) : ('unpaid' as const),
    totalLkr: Number(row.total_lkr ?? 0),
    invoiceMonth: String(row.invoice_month ?? ''),
    databaseCostLkr: Number(row.database_cost_lkr ?? 0),
    frontendCostLkr: Number(row.frontend_cost_lkr ?? 0),
    employeeCount: Number(row.employee_count ?? 0),
    perEmployeePriceLkr: Number(row.per_employee_price_lkr ?? 0),
    employeeCostLkr: Number(row.employee_cost_lkr ?? 0),
    paidAt: row.paid_at ? String(row.paid_at) : null,
    createdAt: String(row.created_at ?? ''),
    receiptStoragePath: null,
    receiptFileName: null,
    receiptUploadedAt: null,
    receiptUploadedBy: null,
    receiptUrl: null,
  };
}

/** Align subscription_status with unpaid platform invoices (due today or overdue). */
export async function syncTenantSubscriptionFromBilling(
  companyId: string,
): Promise<CompanySubscriptionStatus | null> {
  const supabase = createSupabaseServiceClient();

  const { data: companyRow, error: companyError } = await supabase
    .from('companies')
    .select('subscription_status')
    .eq('id', companyId)
    .maybeSingle();

  if (companyError || !companyRow) return null;

  const currentStatus = String(companyRow.subscription_status ?? 'active');
  if (!isCompanySubscriptionStatus(currentStatus) || currentStatus === 'suspended') {
    return isCompanySubscriptionStatus(currentStatus) ? currentStatus : null;
  }

  const { data: invoiceRows, error: invoiceError } = await supabase
    .from('saas_platform_invoices')
    .select('id, company_id, due_date, status, total_lkr, invoice_month, database_cost_lkr, frontend_cost_lkr, employee_count, per_employee_price_lkr, employee_cost_lkr, paid_at, created_at')
    .eq('company_id', companyId)
    .eq('status', 'unpaid')
    .order('due_date', { ascending: true });

  if (invoiceError && invoiceError.code !== '42P01') return null;

  const hasPaymentNotice = (invoiceRows ?? []).some((row) =>
    shouldShowPaymentNotice(mapInvoiceRow(row as Record<string, unknown>)),
  );

  let nextStatus: CompanySubscriptionStatus;
  if (hasPaymentNotice) {
    nextStatus = 'past_due';
  } else if (currentStatus === 'past_due') {
    nextStatus = 'active';
  } else {
    return currentStatus;
  }

  if (nextStatus === currentStatus) return currentStatus;

  const { error: updateError } = await supabase
    .from('companies')
    .update({ subscription_status: nextStatus })
    .eq('id', companyId);

  if (updateError) return null;
  return nextStatus;
}

export async function setTenantSubscriptionStatus(
  companyId: string,
  status: CompanySubscriptionStatus,
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const supabase = createSupabaseServiceClient();
    const { error } = await supabase
      .from('companies')
      .update({ subscription_status: status })
      .eq('id', companyId);

    if (error) throw new Error(error.message);
    return { success: true };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to update subscription status';
    return { success: false, error: message };
  }
}
