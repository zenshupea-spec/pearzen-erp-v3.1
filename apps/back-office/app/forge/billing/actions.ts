'use server';

import { revalidatePath } from 'next/cache';

import { resolveCompanyIdForSession } from '../../../lib/company-context-server';
import { syncTenantSubscriptionFromBilling } from '../../../lib/company-subscription-server';
import {
  recordPartnerPayoutForSaasInvoice,
} from '../../../lib/forge-payout-ledger';
import { assertForgeOperator } from '../../../lib/forge-operator-server';
import {
  currentMonthlyDueDate,
  invoiceMonthForDueDate,
  shouldShowPaymentNotice,
  type SaasBillingSettings,
  type SaasPlatformInvoice,
} from '../../../lib/saas-billing';
import { SAAS_RECEIPT_BUCKET, saasReceiptPublicUrl } from '../../../lib/saas-receipt-storage';
import { createSupabaseServerClient } from '../../../../../packages/supabase/server';
import { createSupabaseServiceClient } from '../../../../../packages/supabase/service';
import { forgeBillingDefaultCompanyId, type ForgeBillingCompany } from './forge-billing-default';

export type { ForgeBillingCompany } from './forge-billing-default';

function assertServiceRoleConfigured() {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY is missing on the server. Add it in Vercel → Project → Environment Variables, then redeploy.',
    );
  }
}

const MAX_RECEIPT_BYTES = 10 * 1024 * 1024;
const RECEIPT_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/pdf',
]);

const UUID_RE = /^[0-9a-f-]{36}$/i;

function requireForgeBillingCompanyId(companyId?: string | null): string {
  const trimmed = companyId?.trim();
  if (trimmed && UUID_RE.test(trimmed)) return trimmed;
  throw new Error('Select a tenant before continuing.');
}

async function resolveFmCompanyId(): Promise<string> {
  const session = await createSupabaseServerClient();
  const companyId = await resolveCompanyIdForSession(session);
  if (!companyId) throw new Error('Tenant context is required.');
  return companyId;
}

function revalidateSaasBillingPaths() {
  revalidatePath('/forge');
  revalidatePath('/forge/billing');
  revalidatePath('/forge/tenants');
  revalidatePath('/forge/partners/payouts');
  revalidatePath('/partners/payouts');
  revalidatePath('/partners');
  revalidatePath('/fm/pearzen-payment');
  revalidatePath('/executive', 'layout');
  revalidatePath('/', 'layout');
}

function mapSettings(row: Record<string, unknown>): SaasBillingSettings {
  return {
    companyId: String(row.company_id),
    databaseCostLkr: Number(row.database_cost_lkr ?? 0),
    frontendCostLkr: Number(row.frontend_cost_lkr ?? 0),
    perEmployeePriceLkr: Number(row.per_employee_price_lkr ?? 0),
    billingStartDate: String(row.billing_start_date ?? new Date().toISOString().slice(0, 10)),
  };
}

function mapInvoice(row: Record<string, unknown>): SaasPlatformInvoice {
  const receiptStoragePath = row.receipt_storage_path
    ? String(row.receipt_storage_path)
    : null;

  return {
    id: String(row.id),
    companyId: String(row.company_id),
    invoiceMonth: String(row.invoice_month),
    dueDate: String(row.due_date),
    databaseCostLkr: Number(row.database_cost_lkr ?? 0),
    frontendCostLkr: Number(row.frontend_cost_lkr ?? 0),
    employeeCount: Number(row.employee_count ?? 0),
    perEmployeePriceLkr: Number(row.per_employee_price_lkr ?? 0),
    employeeCostLkr: Number(row.employee_cost_lkr ?? 0),
    totalLkr: Number(row.total_lkr ?? 0),
    status: row.status === 'paid' ? 'paid' : 'unpaid',
    paidAt: row.paid_at ? String(row.paid_at) : null,
    createdAt: String(row.created_at ?? ''),
    receiptStoragePath,
    receiptFileName: row.receipt_file_name ? String(row.receipt_file_name) : null,
    receiptUploadedAt: row.receipt_uploaded_at ? String(row.receipt_uploaded_at) : null,
    receiptUploadedBy: row.receipt_uploaded_by ? String(row.receipt_uploaded_by) : null,
    receiptUrl: saasReceiptPublicUrl(receiptStoragePath),
  };
}

function receiptExtension(fileName: string, mime: string): string {
  const fromName = fileName.split('.').pop()?.toLowerCase();
  if (fromName && ['jpg', 'jpeg', 'png', 'webp', 'gif', 'pdf'].includes(fromName)) {
    return fromName === 'jpeg' ? 'jpg' : fromName;
  }
  if (mime === 'application/pdf') return 'pdf';
  if (mime === 'image/webp') return 'webp';
  if (mime === 'image/png') return 'png';
  if (mime === 'image/gif') return 'gif';
  return 'jpg';
}

async function countMnrEmployees(companyId: string): Promise<number> {
  const supabase = createSupabaseServiceClient();
  const { count, error } = await supabase
    .from('employees')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .ilike('status', 'active');

  if (error) return 0;
  return count ?? 0;
}

export async function fetchForgeBillingCompanies() {
  try {
    await assertForgeOperator();
    assertServiceRoleConfigured();
    const supabase = createSupabaseServiceClient();
    const { data, error } = await supabase
      .from('companies')
      .select('id, name, slug')
      .neq('name', 'HQ_MASTER_ACCOUNT')
      .order('name', { ascending: true });

    if (error) throw new Error(error.message);

    const companies = (data ?? []).map(
      (row): ForgeBillingCompany => ({
        id: String(row.id),
        name: String(row.name),
        slug: row.slug != null ? String(row.slug) : null,
      }),
    );

    return {
      success: true as const,
      companies,
      defaultCompanyId: forgeBillingDefaultCompanyId(companies),
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load companies';
    return { success: false as const, error: message, companies: [], defaultCompanyId: null };
  }
}

export async function fetchSaasBillingDashboard(companyId?: string | null) {
  try {
    await assertForgeOperator();
    assertServiceRoleConfigured();
    const trimmed = companyId?.trim();
    if (!trimmed || !UUID_RE.test(trimmed)) {
      return { success: false as const, error: 'Select a tenant to view billing.' };
    }
    const scopedCompanyId = trimmed;
    const supabase = createSupabaseServiceClient();

    const [{ data: company }, { data: settingsRow }, { data: invoices }] = await Promise.all([
      supabase.from('companies').select('id, name, slug').eq('id', scopedCompanyId).maybeSingle(),
      supabase
        .from('saas_billing_settings')
        .select('*')
        .eq('company_id', scopedCompanyId)
        .maybeSingle(),
      supabase
        .from('saas_platform_invoices')
        .select('*')
        .eq('company_id', scopedCompanyId)
        .order('due_date', { ascending: false })
        .limit(12),
    ]);

    const employeeCount = await countMnrEmployees(scopedCompanyId);

    await syncTenantSubscriptionFromBilling(scopedCompanyId);

    const settings: SaasBillingSettings = settingsRow
      ? mapSettings(settingsRow as Record<string, unknown>)
      : {
          companyId: scopedCompanyId,
          databaseCostLkr: 0,
          frontendCostLkr: 0,
          perEmployeePriceLkr: 0,
          billingStartDate: new Date().toISOString().slice(0, 10),
        };

    return {
      success: true as const,
      companyId: scopedCompanyId,
      company: company ?? {
        id: scopedCompanyId,
        name: 'Unknown tenant',
        slug: null,
      },
      settings,
      employeeCount,
      invoices: (invoices ?? []).map((row) => mapInvoice(row as Record<string, unknown>)),
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load billing';
    return { success: false as const, error: message };
  }
}

export async function saveSaasBillingSettings(input: {
  companyId?: string | null;
  databaseCostLkr: number;
  frontendCostLkr: number;
  perEmployeePriceLkr: number;
  billingStartDate: string;
}) {
  try {
    await assertForgeOperator();
    assertServiceRoleConfigured();
    const scopedCompanyId = requireForgeBillingCompanyId(input.companyId);
    const supabase = createSupabaseServiceClient();
    const { error } = await supabase.from('saas_billing_settings').upsert(
      {
        company_id: scopedCompanyId,
        database_cost_lkr: input.databaseCostLkr,
        frontend_cost_lkr: input.frontendCostLkr,
        per_employee_price_lkr: input.perEmployeePriceLkr,
        billing_start_date: input.billingStartDate,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'company_id' },
    );

    if (error) throw new Error(error.message);

    revalidateSaasBillingPaths();

    return { success: true as const };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to save settings';
    return { success: false as const, error: message };
  }
}

export async function generateSaasInvoice(companyId?: string | null) {
  try {
    await assertForgeOperator();
    const scopedCompanyId = requireForgeBillingCompanyId(companyId);
    const supabase = createSupabaseServiceClient();

    const { data: settingsRow, error: settingsError } = await supabase
      .from('saas_billing_settings')
      .select('*')
      .eq('company_id', scopedCompanyId)
      .maybeSingle();

    if (settingsError) throw new Error(settingsError.message);

    const settings = settingsRow
      ? mapSettings(settingsRow as Record<string, unknown>)
      : {
          companyId: scopedCompanyId,
          databaseCostLkr: 0,
          frontendCostLkr: 0,
          perEmployeePriceLkr: 0,
          billingStartDate: new Date().toISOString().slice(0, 10),
        };

    const employeeCount = await countMnrEmployees(scopedCompanyId);
    const employeeCostLkr = employeeCount * settings.perEmployeePriceLkr;
    const totalLkr = settings.databaseCostLkr + settings.frontendCostLkr + employeeCostLkr;
    const dueDate = currentMonthlyDueDate(settings.billingStartDate);
    const invoiceMonth = invoiceMonthForDueDate(dueDate);

    const { error } = await supabase.from('saas_platform_invoices').upsert(
      {
        company_id: scopedCompanyId,
        invoice_month: invoiceMonth,
        due_date: dueDate,
        database_cost_lkr: settings.databaseCostLkr,
        frontend_cost_lkr: settings.frontendCostLkr,
        employee_count: employeeCount,
        per_employee_price_lkr: settings.perEmployeePriceLkr,
        employee_cost_lkr: employeeCostLkr,
        total_lkr: totalLkr,
        status: 'unpaid',
      },
      { onConflict: 'company_id,invoice_month' },
    );

    if (error) throw new Error(error.message);

    await syncTenantSubscriptionFromBilling(scopedCompanyId);
    revalidateSaasBillingPaths();

    return { success: true as const };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to generate invoice';
    return { success: false as const, error: message };
  }
}

export async function markSaasInvoicePaid(invoiceId: string, companyId?: string | null) {
  try {
    await assertForgeOperator();
    const scopedCompanyId = requireForgeBillingCompanyId(companyId);
    const supabase = createSupabaseServiceClient();
    const { error } = await supabase
      .from('saas_platform_invoices')
      .update({ status: 'paid', paid_at: new Date().toISOString() })
      .eq('id', invoiceId)
      .eq('company_id', scopedCompanyId);

    if (error) throw new Error(error.message);

    await recordPartnerPayoutForSaasInvoice(invoiceId);
    await syncTenantSubscriptionFromBilling(scopedCompanyId);
    revalidateSaasBillingPaths();

    return { success: true as const };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to mark paid';
    return { success: false as const, error: message };
  }
}

export async function fetchPendingSaasPayment() {
  try {
    const scopedCompanyId = await resolveFmCompanyId();
    const supabase = createSupabaseServiceClient();

    const { data, error } = await supabase
      .from('saas_platform_invoices')
      .select('*')
      .eq('company_id', scopedCompanyId)
      .eq('status', 'unpaid')
      .order('due_date', { ascending: true });

    if (error && error.code !== '42P01') throw new Error(error.message);

    const pending = (data ?? [])
      .map((row) => mapInvoice(row as Record<string, unknown>))
      .find((invoice) => shouldShowPaymentNotice(invoice));

    return { success: true as const, pending: pending ?? null };
  } catch {
    return { success: true as const, pending: null };
  }
}

export async function uploadSaasPaymentReceipt(formData: FormData) {
  try {
    assertServiceRoleConfigured();

    const invoiceId = String(formData.get('invoiceId') ?? '').trim();
    const file = formData.get('file');

    if (!invoiceId) throw new Error('Missing invoice');
    if (!(file instanceof File) || file.size === 0) throw new Error('Choose a receipt file');

    if (file.size > MAX_RECEIPT_BYTES) {
      throw new Error('Receipt must be 10 MB or smaller');
    }

    const mime = file.type || 'application/octet-stream';
    if (!RECEIPT_MIME_TYPES.has(mime)) {
      throw new Error('Upload a JPG, PNG, WebP, GIF, or PDF receipt');
    }

    const scopedCompanyId = await resolveFmCompanyId();
    const supabase = createSupabaseServiceClient();
    const { data: invoice, error: invoiceError } = await supabase
      .from('saas_platform_invoices')
      .select('id, company_id')
      .eq('id', invoiceId)
      .eq('company_id', scopedCompanyId)
      .maybeSingle();

    if (invoiceError) throw new Error(invoiceError.message);
    if (!invoice) throw new Error('Invoice not found');

    const session = await createSupabaseServerClient();
    const {
      data: { user },
    } = await session.auth.getUser();

    const ext = receiptExtension(file.name, mime);
    const storagePath = `${scopedCompanyId}/${invoiceId}/receipt.${ext}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    const { error: uploadError } = await supabase.storage
      .from(SAAS_RECEIPT_BUCKET)
      .upload(storagePath, buffer, {
        contentType: mime,
        upsert: true,
      });

    if (uploadError) throw new Error(uploadError.message);

    const { error: updateError } = await supabase
      .from('saas_platform_invoices')
      .update({
        receipt_storage_path: storagePath,
        receipt_file_name: file.name,
        receipt_uploaded_at: new Date().toISOString(),
        receipt_uploaded_by: user?.email ?? null,
      })
      .eq('id', invoiceId)
      .eq('company_id', scopedCompanyId);

    if (updateError) throw new Error(updateError.message);

    revalidatePath('/fm/pearzen-payment');
    revalidatePath('/forge/billing');

    return { success: true as const, receiptUrl: saasReceiptPublicUrl(storagePath) };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to upload receipt';
    return { success: false as const, error: message };
  }
}

export async function fetchFmSaasInvoices() {
  try {
    const scopedCompanyId = await resolveFmCompanyId();
    const supabase = createSupabaseServiceClient();
    const { data, error } = await supabase
      .from('saas_platform_invoices')
      .select('*')
      .eq('company_id', scopedCompanyId)
      .order('due_date', { ascending: false });

    if (error && error.code !== '42P01') throw new Error(error.message);

    return {
      success: true as const,
      invoices: (data ?? []).map((row) => mapInvoice(row as Record<string, unknown>)),
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load invoices';
    return { success: false as const, invoices: [], error: message };
  }
}
