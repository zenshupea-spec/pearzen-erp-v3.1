/**
 * Forge platform health — cross-tenant aggregates computed server-side only.
 */

import type { CompanySubscriptionStatus } from './company-subscription';
import {
  COMPANY_SUBSCRIPTION_STATUSES,
  isCompanySubscriptionStatus,
  subscriptionStatusFromFlags,
} from './company-subscription';
import { isProductBundle, type ProductBundle } from './tenant-product-bundle';
import { isInvoiceOverdue, toDateOnly } from './saas-billing';
import { createSupabaseServiceClient } from '../../../packages/supabase/service';

export type ForgePlatformHealthMetrics = {
  capturedAt: string;
  tenants: {
    total: number;
    byStatus: Record<CompanySubscriptionStatus, number>;
    activeOrTrial: number;
    suspended: number;
    pastDue: number;
  };
  mrr: {
    erpLkr: number;
    productLkr: number;
    totalLkr: number;
  };
  overdue: {
    erpInvoiceCount: number;
    erpAmountLkr: number;
    productInvoiceCount: number;
    productAmountLkr: number;
  };
  workforce: {
    employeeHeadcount: number;
    checkIns7d: number;
    checkIns30d: number;
    cafeOrders7d: number;
    cafeOrders30d: number;
  };
  partners: {
    activePartnerCount: number;
    closedClientLinks: number;
    payoutPartnerShareLkr: number;
    payoutPearzenShareLkr: number;
  };
};

export type ForgeTenantHealthRow = {
  companyId: string;
  name: string;
  slug: string | null;
  subscriptionStatus: CompanySubscriptionStatus;
  productBundle: ProductBundle;
  employeeCount: number;
  erpMrrLkr: number;
  checkIns7d: number;
  checkIns30d: number;
  cafeOrders7d: number;
  overdueErpLkr: number;
  hasCafeModule: boolean;
};

export type ForgePartnerHealthRow = {
  partnerId: string;
  displayName: string;
  email: string;
  isActive: boolean;
  closedClients: number;
  activePortfolios: number;
  partnerShareLkr: number;
  pearzenShareLkr: number;
};

export type ForgeHealthSnapshotSummary = {
  id: string;
  capturedAt: string;
  createdBy: string | null;
};

function emptyStatusCounts(): Record<CompanySubscriptionStatus, number> {
  return {
    trial: 0,
    active: 0,
    past_due: 0,
    suspended: 0,
  };
}

function resolveSubscriptionStatus(row: Record<string, unknown>): CompanySubscriptionStatus {
  const raw = String(row.subscription_status ?? '');
  if (isCompanySubscriptionStatus(raw)) return raw;
  return subscriptionStatusFromFlags({
    isActive: row.is_active as boolean | null | undefined,
    isSuspended: row.is_suspended as boolean | null | undefined,
  });
}

function daysAgoIso(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return toDateOnly(date);
}

async function countEmployeesByCompany(
  supabase: ReturnType<typeof createSupabaseServiceClient>,
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  const { data, error } = await supabase
    .from('employees')
    .select('company_id')
    .ilike('status', 'active');

  if (error || !data) return map;

  for (const row of data) {
    const companyId = String(row.company_id ?? '');
    if (!companyId) continue;
    map.set(companyId, (map.get(companyId) ?? 0) + 1);
  }
  return map;
}

async function countCheckInsSince(
  supabase: ReturnType<typeof createSupabaseServiceClient>,
  sinceDate: string,
  companyId?: string,
): Promise<number> {
  let query = supabase
    .from('attendance_logs')
    .select('id', { count: 'exact', head: true })
    .gte('shift_date', sinceDate);

  if (companyId) {
    query = query.eq('company_id', companyId);
  }

  const { count, error } = await query;
  if (error) return 0;
  return count ?? 0;
}

async function countCafeOrdersSince(
  supabase: ReturnType<typeof createSupabaseServiceClient>,
  sinceIso: string,
  companyId?: string,
): Promise<number> {
  let query = supabase
    .from('cafe_customer_orders')
    .select('id', { count: 'exact', head: true })
    .gte('placed_at', sinceIso);

  if (companyId) {
    query = query.eq('company_id', companyId);
  }

  const { count, error } = await query;
  if (error) return 0;
  return count ?? 0;
}

function erpMrrForTenant(
  settings: Record<string, unknown> | undefined,
  employeeCount: number,
): number {
  if (!settings) return 0;
  const database = Number(settings.database_cost_lkr ?? 0);
  const frontend = Number(settings.frontend_cost_lkr ?? 0);
  const perEmployee = Number(settings.per_employee_price_lkr ?? 0);
  return database + frontend + employeeCount * perEmployee;
}

export async function computeForgePlatformHealthMetrics(): Promise<ForgePlatformHealthMetrics> {
  const supabase = createSupabaseServiceClient();
  const today = toDateOnly(new Date());
  const since7d = daysAgoIso(7);
  const since30d = daysAgoIso(30);
  const since7dIso = `${since7d}T00:00:00.000Z`;
  const since30dIso = `${since30d}T00:00:00.000Z`;

  const [
    companiesResult,
    billingSettingsResult,
    productPurchasesResult,
    saasInvoicesResult,
    productInvoicesResult,
    partnersResult,
    portfoliosResult,
    payoutResult,
    employeeMap,
    checkIns7d,
    checkIns30d,
    cafeOrders7d,
    cafeOrders30d,
  ] = await Promise.all([
    supabase
      .from('companies')
      .select('id, name, slug, subscription_status, product_bundle, is_active, is_suspended, has_cafe_module')
      .neq('name', 'HQ_MASTER_ACCOUNT'),
    supabase.from('saas_billing_settings').select('company_id, database_cost_lkr, frontend_cost_lkr, per_employee_price_lkr'),
    supabase
      .from('forge_product_purchases')
      .select('price_lkr, status, billing_interval')
      .eq('status', 'active')
      .eq('billing_interval', 'monthly'),
    supabase.from('saas_platform_invoices').select('total_lkr, status, due_date'),
    supabase.from('forge_product_invoices').select('amount_lkr, status, due_date'),
    supabase.from('forge_service_partners').select('id, is_active'),
    supabase.from('forge_partner_portfolios').select('id, status'),
    supabase.from('forge_payout_ledger').select('partner_share_lkr, pearzen_share_lkr'),
    countEmployeesByCompany(supabase),
    countCheckInsSince(supabase, since7d),
    countCheckInsSince(supabase, since30d),
    countCafeOrdersSince(supabase, since7dIso),
    countCafeOrdersSince(supabase, since30dIso),
  ]);

  const companies = companiesResult.data ?? [];
  const billingByCompany = new Map<string, Record<string, unknown>>();
  for (const row of billingSettingsResult.data ?? []) {
    billingByCompany.set(String(row.company_id), row as Record<string, unknown>);
  }

  const byStatus = emptyStatusCounts();
  let erpMrrLkr = 0;

  for (const company of companies) {
    const row = company as Record<string, unknown>;
    const status = resolveSubscriptionStatus(row);
    byStatus[status] += 1;

    if (status === 'suspended') continue;

    const companyId = String(row.id);
    const employees = employeeMap.get(companyId) ?? 0;
    erpMrrLkr += erpMrrForTenant(billingByCompany.get(companyId), employees);
  }

  const productMrrLkr = (productPurchasesResult.data ?? []).reduce(
    (sum, row) => sum + Number(row.price_lkr ?? 0),
    0,
  );

  let erpInvoiceCount = 0;
  let erpAmountLkr = 0;
  for (const row of saasInvoicesResult.data ?? []) {
    if (row.status !== 'unpaid') continue;
    if (!isInvoiceOverdue(String(row.due_date ?? ''), new Date(today))) continue;
    erpInvoiceCount += 1;
    erpAmountLkr += Number(row.total_lkr ?? 0);
  }

  let productInvoiceCount = 0;
  let productAmountLkr = 0;
  for (const row of productInvoicesResult.data ?? []) {
    const status = String(row.status ?? '');
    if (!['unpaid', 'sent'].includes(status)) continue;
    if (!isInvoiceOverdue(String(row.due_date ?? ''), new Date(today))) continue;
    productInvoiceCount += 1;
    productAmountLkr += Number(row.amount_lkr ?? 0);
  }

  const activePartners = (partnersResult.data ?? []).filter((row) => row.is_active !== false);
  const activePortfolios = (portfoliosResult.data ?? []).filter(
    (row) => String(row.status) === 'active',
  );

  let payoutPartnerShareLkr = 0;
  let payoutPearzenShareLkr = 0;
  for (const row of payoutResult.data ?? []) {
    payoutPartnerShareLkr += Number(row.partner_share_lkr ?? 0);
    payoutPearzenShareLkr += Number(row.pearzen_share_lkr ?? 0);
  }

  const employeeHeadcount = Array.from(employeeMap.values()).reduce((sum, count) => sum + count, 0);

  return {
    capturedAt: new Date().toISOString(),
    tenants: {
      total: companies.length,
      byStatus,
      activeOrTrial: byStatus.active + byStatus.trial,
      suspended: byStatus.suspended,
      pastDue: byStatus.past_due,
    },
    mrr: {
      erpLkr: erpMrrLkr,
      productLkr: productMrrLkr,
      totalLkr: erpMrrLkr + productMrrLkr,
    },
    overdue: {
      erpInvoiceCount,
      erpAmountLkr,
      productInvoiceCount,
      productAmountLkr,
    },
    workforce: {
      employeeHeadcount,
      checkIns7d,
      checkIns30d,
      cafeOrders7d,
      cafeOrders30d,
    },
    partners: {
      activePartnerCount: activePartners.length,
      closedClientLinks: activePortfolios.length,
      payoutPartnerShareLkr,
      payoutPearzenShareLkr,
    },
  };
}

export async function computeForgeTenantHealthRows(): Promise<ForgeTenantHealthRow[]> {
  const supabase = createSupabaseServiceClient();
  const today = toDateOnly(new Date());
  const since7d = daysAgoIso(7);
  const since30d = daysAgoIso(30);
  const since7dIso = `${since7d}T00:00:00.000Z`;

  const [companiesResult, billingSettingsResult, saasInvoicesResult, employeeMap] =
    await Promise.all([
      supabase
        .from('companies')
        .select('id, name, slug, subscription_status, product_bundle, is_active, is_suspended, has_cafe_module')
        .neq('name', 'HQ_MASTER_ACCOUNT')
        .order('name', { ascending: true }),
      supabase.from('saas_billing_settings').select('company_id, database_cost_lkr, frontend_cost_lkr, per_employee_price_lkr'),
      supabase.from('saas_platform_invoices').select('company_id, total_lkr, status, due_date'),
      countEmployeesByCompany(supabase),
    ]);

  const billingByCompany = new Map<string, Record<string, unknown>>();
  for (const row of billingSettingsResult.data ?? []) {
    billingByCompany.set(String(row.company_id), row as Record<string, unknown>);
  }

  const overdueByCompany = new Map<string, number>();
  for (const row of saasInvoicesResult.data ?? []) {
    if (row.status !== 'unpaid') continue;
    if (!isInvoiceOverdue(String(row.due_date ?? ''), new Date(today))) continue;
    const companyId = String(row.company_id ?? '');
    overdueByCompany.set(
      companyId,
      (overdueByCompany.get(companyId) ?? 0) + Number(row.total_lkr ?? 0),
    );
  }

  const companies = companiesResult.data ?? [];
  const rows: ForgeTenantHealthRow[] = [];

  for (const company of companies) {
    const row = company as Record<string, unknown>;
    const companyId = String(row.id);
    const rawBundle = String(row.product_bundle ?? 'full_erp');
    const employeeCount = employeeMap.get(companyId) ?? 0;

    const [checkIns7d, checkIns30d, cafeOrders7d] = await Promise.all([
      countCheckInsSince(supabase, since7d, companyId),
      countCheckInsSince(supabase, since30d, companyId),
      Boolean(row.has_cafe_module)
        ? countCafeOrdersSince(supabase, since7dIso, companyId)
        : Promise.resolve(0),
    ]);

    rows.push({
      companyId,
      name: String(row.name ?? 'Unknown tenant'),
      slug: row.slug != null ? String(row.slug) : null,
      subscriptionStatus: resolveSubscriptionStatus(row),
      productBundle: isProductBundle(rawBundle) ? rawBundle : 'full_erp',
      employeeCount,
      erpMrrLkr: erpMrrForTenant(billingByCompany.get(companyId), employeeCount),
      checkIns7d,
      checkIns30d,
      cafeOrders7d,
      overdueErpLkr: overdueByCompany.get(companyId) ?? 0,
      hasCafeModule: Boolean(row.has_cafe_module),
    });
  }

  return rows;
}

export async function computeForgePartnerHealthRows(): Promise<ForgePartnerHealthRow[]> {
  const supabase = createSupabaseServiceClient();

  const [partnersResult, portfoliosResult, payoutResult] = await Promise.all([
    supabase
      .from('forge_service_partners')
      .select('id, display_name, email, is_active')
      .order('display_name', { ascending: true }),
    supabase.from('forge_partner_portfolios').select('partner_id, status'),
    supabase.from('forge_payout_ledger').select('partner_id, partner_share_lkr, pearzen_share_lkr'),
  ]);

  const portfolioCounts = new Map<string, { total: number; active: number }>();
  for (const row of portfoliosResult.data ?? []) {
    const partnerId = String(row.partner_id ?? '');
    const current = portfolioCounts.get(partnerId) ?? { total: 0, active: 0 };
    current.total += 1;
    if (String(row.status) === 'active') current.active += 1;
    portfolioCounts.set(partnerId, current);
  }

  const payoutTotals = new Map<string, { partner: number; pearzen: number }>();
  for (const row of payoutResult.data ?? []) {
    const partnerId = String(row.partner_id ?? '');
    const current = payoutTotals.get(partnerId) ?? { partner: 0, pearzen: 0 };
    current.partner += Number(row.partner_share_lkr ?? 0);
    current.pearzen += Number(row.pearzen_share_lkr ?? 0);
    payoutTotals.set(partnerId, current);
  }

  return (partnersResult.data ?? []).map((partner) => {
    const partnerId = String(partner.id);
    const counts = portfolioCounts.get(partnerId) ?? { total: 0, active: 0 };
    const payout = payoutTotals.get(partnerId) ?? { partner: 0, pearzen: 0 };

    return {
      partnerId,
      displayName: String(partner.display_name ?? 'Partner'),
      email: String(partner.email ?? ''),
      isActive: partner.is_active !== false,
      closedClients: counts.total,
      activePortfolios: counts.active,
      partnerShareLkr: payout.partner,
      pearzenShareLkr: payout.pearzen,
    };
  });
}

export async function fetchLatestForgeHealthSnapshot(): Promise<ForgeHealthSnapshotSummary | null> {
  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase
    .from('forge_platform_health_snapshots')
    .select('id, captured_at, created_by')
    .order('captured_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;

  return {
    id: String(data.id),
    capturedAt: String(data.captured_at),
    createdBy: data.created_by != null ? String(data.created_by) : null,
  };
}

export async function saveForgePlatformHealthSnapshot(input: {
  metrics: ForgePlatformHealthMetrics;
  createdBy?: string | null;
  notes?: string | null;
}): Promise<{ id: string; capturedAt: string }> {
  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase
    .from('forge_platform_health_snapshots')
    .insert({
      captured_at: input.metrics.capturedAt,
      metrics: input.metrics,
      created_by: input.createdBy ?? null,
      notes: input.notes ?? null,
    })
    .select('id, captured_at')
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? 'Failed to save health snapshot');
  }

  return {
    id: String(data.id),
    capturedAt: String(data.captured_at),
  };
}

export function parseForgePlatformHealthMetrics(value: unknown): ForgePlatformHealthMetrics | null {
  if (!value || typeof value !== 'object') return null;
  const metrics = value as Partial<ForgePlatformHealthMetrics>;
  if (!metrics.capturedAt || !metrics.tenants || !metrics.mrr) return null;

  const byStatus = emptyStatusCounts();
  for (const status of COMPANY_SUBSCRIPTION_STATUSES) {
    const count = metrics.tenants.byStatus?.[status];
    if (typeof count === 'number') byStatus[status] = count;
  }

  return {
    capturedAt: String(metrics.capturedAt),
    tenants: {
      total: Number(metrics.tenants.total ?? 0),
      byStatus,
      activeOrTrial: Number(metrics.tenants.activeOrTrial ?? 0),
      suspended: Number(metrics.tenants.suspended ?? 0),
      pastDue: Number(metrics.tenants.pastDue ?? 0),
    },
    mrr: {
      erpLkr: Number(metrics.mrr.erpLkr ?? 0),
      productLkr: Number(metrics.mrr.productLkr ?? 0),
      totalLkr: Number(metrics.mrr.totalLkr ?? 0),
    },
    overdue: {
      erpInvoiceCount: Number(metrics.overdue?.erpInvoiceCount ?? 0),
      erpAmountLkr: Number(metrics.overdue?.erpAmountLkr ?? 0),
      productInvoiceCount: Number(metrics.overdue?.productInvoiceCount ?? 0),
      productAmountLkr: Number(metrics.overdue?.productAmountLkr ?? 0),
    },
    workforce: {
      employeeHeadcount: Number(metrics.workforce?.employeeHeadcount ?? 0),
      checkIns7d: Number(metrics.workforce?.checkIns7d ?? 0),
      checkIns30d: Number(metrics.workforce?.checkIns30d ?? 0),
      cafeOrders7d: Number(metrics.workforce?.cafeOrders7d ?? 0),
      cafeOrders30d: Number(metrics.workforce?.cafeOrders30d ?? 0),
    },
    partners: {
      activePartnerCount: Number(metrics.partners?.activePartnerCount ?? 0),
      closedClientLinks: Number(metrics.partners?.closedClientLinks ?? 0),
      payoutPartnerShareLkr: Number(metrics.partners?.payoutPartnerShareLkr ?? 0),
      payoutPearzenShareLkr: Number(metrics.partners?.payoutPearzenShareLkr ?? 0),
    },
  };
}
