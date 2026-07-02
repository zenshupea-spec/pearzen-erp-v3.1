'use server';

import { revalidatePath } from 'next/cache';

import {
  isCompanySubscriptionStatus,
  subscriptionStatusFromFlags,
  type CompanySubscriptionStatus,
} from '../../../lib/company-subscription';
import {
  readWfmPerEmployeeOverride,
  readWfmPricingDefaults,
} from '../../../lib/forge-pricing';
import { syncPearsListingOnWebsiteGoLive } from '../../../lib/superapp-website-go-live';
import { listTenantPublicSites } from '../../../lib/tenant-public-site-data';
import { assertForgeOperator } from '../../../lib/forge-operator-server';
import { createSupabaseServiceClient } from '../../../../../packages/supabase/service';

export type WfmSubscriberRow = {
  id: string;
  companyId: string | null;
  purchaseId: string | null;
  name: string;
  slug: string | null;
  buyerEmail: string | null;
  subscriptionStatus: CompanySubscriptionStatus | 'commerce_only';
  purchaseStatus: string | null;
  activeSince: string;
  monthlyTotalLkr: number;
  source: 'company' | 'purchase' | 'both';
};

function assertServiceRoleConfigured() {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY is missing on the server. Add it in Vercel → Project → Environment Variables, then redeploy.',
    );
  }
}

function resolveSubscriptionStatus(row: Record<string, unknown>): CompanySubscriptionStatus {
  const rawStatus = String(row.subscription_status ?? '');
  if (isCompanySubscriptionStatus(rawStatus)) return rawStatus;
  return subscriptionStatusFromFlags({
    isActive: row.is_active as boolean | null | undefined,
    isSuspended: row.is_suspended as boolean | null | undefined,
  });
}

function monthlyFromPurchase(priceLkr: number, billingInterval: string | null): number {
  if (billingInterval === 'monthly') return priceLkr;
  if (billingInterval === 'yearly') return priceLkr / 12;
  return 0;
}

function purchaseMetadata(row: Record<string, unknown> | null | undefined): Record<string, unknown> {
  if (!row?.metadata || typeof row.metadata !== 'object' || Array.isArray(row.metadata)) {
    return {};
  }
  return row.metadata as Record<string, unknown>;
}

function resolveWfmMonthlyLkr(input: {
  purchase: Record<string, unknown> | null | undefined;
  billing: Record<string, unknown> | null | undefined;
  employeeCount: number;
  wfmDefaults: ReturnType<typeof readWfmPricingDefaults>;
}): number {
  const { purchase, billing, employeeCount, wfmDefaults } = input;
  const perEmployeeLkr = readWfmPerEmployeeOverride(
    purchase ? purchaseMetadata(purchase) : null,
    wfmDefaults,
    billing?.per_employee_price_lkr != null ? Number(billing.per_employee_price_lkr) : null,
  );

  if (employeeCount > 0) {
    return perEmployeeLkr * employeeCount;
  }

  if (purchase) {
    const fromPurchase = monthlyFromPurchase(
      Number(purchase.price_lkr ?? 0),
      purchase.billing_interval != null ? String(purchase.billing_interval) : null,
    );
    if (fromPurchase > 0) return fromPurchase;
  }

  if (billing) {
    return (
      Number(billing.database_cost_lkr ?? 0) +
      Number(billing.frontend_cost_lkr ?? 0) +
      employeeCount * perEmployeeLkr
    );
  }

  return perEmployeeLkr;
}

async function countActiveEmployees(companyId: string): Promise<number> {
  const supabase = createSupabaseServiceClient();
  const { count, error } = await supabase
    .from('employees')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .ilike('status', 'active');

  if (error) return 0;
  return count ?? 0;
}

export async function fetchWfmSubscribers() {
  try {
    await assertForgeOperator();
    assertServiceRoleConfigured();
    const supabase = createSupabaseServiceClient();

    const [{ data: wfmCompanies, error: companiesError }, { data: wfmPurchases, error: purchasesError }, { data: wfmCatalog }] =
      await Promise.all([
        supabase
          .from('companies')
          .select(
            'id, name, slug, subscription_status, product_bundle, is_active, is_suspended, created_at',
          )
          .eq('product_bundle', 'wfm_only')
          .neq('name', 'HQ_MASTER_ACCOUNT')
          .order('name', { ascending: true }),
        supabase
          .from('forge_product_purchases')
          .select(
            'id, company_id, buyer_name, buyer_email, status, price_lkr, billing_interval, started_at, created_at, metadata, forge_product_catalog!inner(code)',
          )
          .eq('forge_product_catalog.code', 'wfm_tool')
          .order('created_at', { ascending: false }),
        supabase
          .from('forge_product_catalog')
          .select('metadata')
          .eq('code', 'wfm_tool')
          .maybeSingle(),
      ]);

    if (companiesError) throw new Error(companiesError.message);
    if (purchasesError) throw new Error(purchasesError.message);

    const wfmDefaults = readWfmPricingDefaults(
      wfmCatalog?.metadata && typeof wfmCatalog.metadata === 'object' && !Array.isArray(wfmCatalog.metadata)
        ? (wfmCatalog.metadata as Record<string, unknown>)
        : {},
    );

    const companyIds = (wfmCompanies ?? []).map((row) => String(row.id));
    const billingSettingsByCompany = new Map<string, Record<string, unknown>>();

    if (companyIds.length > 0) {
      const { data: billingRows, error: billingError } = await supabase
        .from('saas_billing_settings')
        .select('company_id, database_cost_lkr, frontend_cost_lkr, per_employee_price_lkr')
        .in('company_id', companyIds);

      if (billingError) throw new Error(billingError.message);

      for (const row of billingRows ?? []) {
        billingSettingsByCompany.set(String(row.company_id), row as Record<string, unknown>);
      }
    }

    const employeeCounts = new Map<string, number>();
    await Promise.all(
      companyIds.map(async (companyId) => {
        employeeCounts.set(companyId, await countActiveEmployees(companyId));
      }),
    );

    const purchasesByCompanyId = new Map<string, Record<string, unknown>>();
    const standalonePurchases: Record<string, unknown>[] = [];

    for (const row of wfmPurchases ?? []) {
      const companyId = row.company_id != null ? String(row.company_id) : null;
      if (companyId) {
        if (!purchasesByCompanyId.has(companyId)) {
          purchasesByCompanyId.set(companyId, row as Record<string, unknown>);
        }
      } else {
        standalonePurchases.push(row as Record<string, unknown>);
      }
    }

    const subscribers: WfmSubscriberRow[] = [];

    for (const companyRow of wfmCompanies ?? []) {
      const company = companyRow as Record<string, unknown>;
      const companyId = String(company.id);
      const purchase = purchasesByCompanyId.get(companyId);
      const billing = billingSettingsByCompany.get(companyId);
      const employeeCount = employeeCounts.get(companyId) ?? 0;
      const monthlyTotalLkr = resolveWfmMonthlyLkr({
        purchase: purchase ?? null,
        billing: billing ?? null,
        employeeCount,
        wfmDefaults,
      });

      const activeSince = purchase?.started_at
        ? String(purchase.started_at)
        : purchase?.created_at
          ? String(purchase.created_at)
          : String(company.created_at ?? '');

      subscribers.push({
        id: companyId,
        companyId,
        purchaseId: purchase ? String(purchase.id) : null,
        name: String(company.name ?? 'Unknown'),
        slug: company.slug != null ? String(company.slug) : null,
        buyerEmail: purchase?.buyer_email != null ? String(purchase.buyer_email) : null,
        subscriptionStatus: resolveSubscriptionStatus(company),
        purchaseStatus: purchase ? String(purchase.status ?? '') : null,
        activeSince,
        monthlyTotalLkr,
        source: purchase ? 'both' : 'company',
      });
    }

    const linkedCompanyIds = new Set(subscribers.map((row) => row.companyId).filter(Boolean));

    for (const purchase of standalonePurchases) {
      const purchaseCompanyId =
        purchase.company_id != null ? String(purchase.company_id) : null;
      if (purchaseCompanyId && linkedCompanyIds.has(purchaseCompanyId)) continue;

      subscribers.push({
        id: `purchase:${String(purchase.id)}`,
        companyId: purchaseCompanyId,
        purchaseId: String(purchase.id),
        name: String(purchase.buyer_name ?? 'Unknown buyer'),
        slug: null,
        buyerEmail: purchase.buyer_email != null ? String(purchase.buyer_email) : null,
        subscriptionStatus: 'commerce_only',
        purchaseStatus: String(purchase.status ?? ''),
        activeSince: purchase.started_at
          ? String(purchase.started_at)
          : String(purchase.created_at ?? ''),
        monthlyTotalLkr: resolveWfmMonthlyLkr({
          purchase,
          billing: purchaseCompanyId ? billingSettingsByCompany.get(purchaseCompanyId) : null,
          employeeCount: purchaseCompanyId ? employeeCounts.get(purchaseCompanyId) ?? 0 : 0,
          wfmDefaults,
        }),
        source: 'purchase',
      });
    }

    subscribers.sort((a, b) => a.name.localeCompare(b.name));

    return { success: true as const, subscribers };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load WFM subscribers';
    return { success: false as const, error: message, subscribers: [] as WfmSubscriberRow[] };
  }
}

export type WfmBillingInvoiceRow = {
  id: string;
  kind: 'commerce' | 'erp';
  title: string;
  subtitle: string | null;
  dueDate: string;
  invoiceMonth: string | null;
  amountLkr: number;
  status: string;
  paidAt: string | null;
};

function mapProductInvoiceRow(row: Record<string, unknown>): WfmBillingInvoiceRow {
  const nested = row.forge_product_purchases as Record<string, unknown> | null;
  const nestedProduct = nested?.forge_product_catalog as Record<string, unknown> | null;

  return {
    id: String(row.id),
    kind: 'commerce',
    title: String(nestedProduct?.name ?? 'WFM product invoice'),
    subtitle: nested?.buyer_email != null ? String(nested.buyer_email) : null,
    dueDate: String(row.due_date),
    invoiceMonth: row.invoice_month != null ? String(row.invoice_month) : null,
    amountLkr: Number(row.amount_lkr ?? 0),
    status: String(row.status ?? 'draft'),
    paidAt: row.paid_at ? String(row.paid_at) : null,
  };
}

function mapSaasInvoiceRow(row: Record<string, unknown>): WfmBillingInvoiceRow {
  return {
    id: String(row.id),
    kind: 'erp',
    title: 'ERP platform invoice',
    subtitle: row.invoice_month != null ? String(row.invoice_month) : null,
    dueDate: String(row.due_date),
    invoiceMonth: row.invoice_month != null ? String(row.invoice_month) : null,
    amountLkr: Number(row.total_lkr ?? 0),
    status: row.status === 'paid' ? 'paid' : 'unpaid',
    paidAt: row.paid_at ? String(row.paid_at) : null,
  };
}

export async function fetchWfmSubscriberBillings(input: {
  companyId?: string | null;
  purchaseId?: string | null;
}) {
  try {
    await assertForgeOperator();
    assertServiceRoleConfigured();
    const supabase = createSupabaseServiceClient();
    const purchaseIds = new Set<string>();

    if (input.purchaseId?.trim()) {
      purchaseIds.add(input.purchaseId.trim());
    }

    if (input.companyId?.trim()) {
      const { data: purchases, error: purchasesError } = await supabase
        .from('forge_product_purchases')
        .select('id, forge_product_catalog!inner(code)')
        .eq('company_id', input.companyId.trim())
        .eq('forge_product_catalog.code', 'wfm_tool');

      if (purchasesError) throw new Error(purchasesError.message);
      for (const row of purchases ?? []) {
        purchaseIds.add(String(row.id));
      }
    }

    const productInvoicePromise =
      purchaseIds.size > 0
        ? supabase
            .from('forge_product_invoices')
            .select(
              'id, purchase_id, due_date, invoice_month, amount_lkr, status, paid_at, forge_product_purchases(buyer_email, forge_product_catalog(name))',
            )
            .in('purchase_id', [...purchaseIds])
            .order('due_date', { ascending: false })
            .limit(24)
        : Promise.resolve({ data: [], error: null });

    const saasInvoicePromise = input.companyId?.trim()
      ? supabase
          .from('saas_platform_invoices')
          .select('id, invoice_month, due_date, total_lkr, status, paid_at')
          .eq('company_id', input.companyId.trim())
          .order('due_date', { ascending: false })
          .limit(24)
      : Promise.resolve({ data: [], error: null });

    const [productResult, saasResult] = await Promise.all([
      productInvoicePromise,
      saasInvoicePromise,
    ]);

    if (productResult.error) throw new Error(productResult.error.message);
    if (saasResult.error) throw new Error(saasResult.error.message);

    const commerceInvoices = (productResult.data ?? []).map((row) =>
      mapProductInvoiceRow(row as Record<string, unknown>),
    );
    const erpInvoices = (saasResult.data ?? []).map((row) =>
      mapSaasInvoiceRow(row as Record<string, unknown>),
    );

    const invoices = [...commerceInvoices, ...erpInvoices].sort((a, b) =>
      b.dueDate.localeCompare(a.dueDate),
    );

    return { success: true as const, invoices, commerceInvoices, erpInvoices };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load billings';
    return {
      success: false as const,
      error: message,
      invoices: [] as WfmBillingInvoiceRow[],
      commerceInvoices: [] as WfmBillingInvoiceRow[],
      erpInvoices: [] as WfmBillingInvoiceRow[],
    };
  }
}

export type CustomSoftwareClientRow = {
  id: string;
  purchaseId: string;
  companyId: string | null;
  projectName: string;
  buyerName: string;
  buyerEmail: string;
  companyName: string | null;
  status: string;
  milestoneProgressPct: number;
  milestonePaid: number;
  milestoneTotal: number;
  startedAt: string | null;
  priceLkr: number;
};

function resolveCustomProjectName(
  row: Record<string, unknown>,
  companyName: string | null,
): string {
  const notes = row.notes != null ? String(row.notes).trim() : '';
  if (notes) return notes.split('\n')[0].slice(0, 100);
  if (companyName) return `${companyName} build`;
  return `${String(row.buyer_name ?? 'Client')} project`;
}

function computeMilestoneProgress(milestones: { status: string }[]): {
  milestoneProgressPct: number;
  milestonePaid: number;
  milestoneTotal: number;
} {
  const relevant = milestones.filter((row) => row.status !== 'skipped');
  const milestonePaid = relevant.filter((row) => row.status === 'paid').length;
  const milestoneTotal = relevant.length;
  const milestoneProgressPct =
    milestoneTotal === 0 ? 0 : Math.round((milestonePaid / milestoneTotal) * 100);

  return { milestoneProgressPct, milestonePaid, milestoneTotal };
}

export async function fetchCustomSoftwareClients() {
  try {
    await assertForgeOperator();
    assertServiceRoleConfigured();
    const supabase = createSupabaseServiceClient();

    const { data, error } = await supabase
      .from('forge_product_purchases')
      .select(
        'id, company_id, buyer_name, buyer_email, status, price_lkr, started_at, created_at, notes, companies(name), forge_product_catalog!inner(code), forge_project_milestones(status, sort_order)',
      )
      .eq('forge_product_catalog.code', 'custom_software')
      .order('created_at', { ascending: false });

    if (error) throw new Error(error.message);

    const clients: CustomSoftwareClientRow[] = (data ?? []).map((row) => {
      const purchase = row as Record<string, unknown>;
      const company = purchase.companies as Record<string, unknown> | null;
      const companyName = company?.name != null ? String(company.name) : null;
      const milestones = Array.isArray(purchase.forge_project_milestones)
        ? (purchase.forge_project_milestones as { status: string }[])
        : [];
      const progress = computeMilestoneProgress(milestones);
      const purchaseId = String(purchase.id);

      return {
        id: purchaseId,
        purchaseId,
        companyId: purchase.company_id != null ? String(purchase.company_id) : null,
        projectName: resolveCustomProjectName(purchase, companyName),
        buyerName: String(purchase.buyer_name ?? 'Unknown buyer'),
        buyerEmail: String(purchase.buyer_email ?? ''),
        companyName,
        status: String(purchase.status ?? 'pending'),
        ...progress,
        startedAt: purchase.started_at
          ? String(purchase.started_at)
          : purchase.created_at
            ? String(purchase.created_at)
            : null,
        priceLkr: Number(purchase.price_lkr ?? 0),
      };
    });

    clients.sort((a, b) => a.projectName.localeCompare(b.projectName));

    return { success: true as const, clients };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load custom software clients';
    return { success: false as const, error: message, clients: [] as CustomSoftwareClientRow[] };
  }
}

export type CustomSoftwareBillingMilestone = {
  id: string;
  title: string;
  description: string | null;
  amountLkr: number;
  dueDate: string | null;
  status: string;
  sortOrder: number;
};

export type CustomSoftwareBillingInvoice = {
  id: string;
  dueDate: string;
  amountLkr: number;
  status: string;
  paidAt: string | null;
  invoiceMonth: string | null;
};

export async function fetchCustomSoftwareClientBillings(purchaseId: string) {
  try {
    await assertForgeOperator();
    assertServiceRoleConfigured();
    const scopedPurchaseId = purchaseId.trim();
    if (!scopedPurchaseId) throw new Error('Purchase id is required.');

    const supabase = createSupabaseServiceClient();

    const [milestonesResult, invoicesResult] = await Promise.all([
      supabase
        .from('forge_project_milestones')
        .select('id, title, description, amount_lkr, due_date, status, sort_order')
        .eq('purchase_id', scopedPurchaseId)
        .order('sort_order', { ascending: true }),
      supabase
        .from('forge_product_invoices')
        .select('id, due_date, amount_lkr, status, paid_at, invoice_month')
        .eq('purchase_id', scopedPurchaseId)
        .order('due_date', { ascending: false })
        .limit(24),
    ]);

    if (milestonesResult.error) throw new Error(milestonesResult.error.message);
    if (invoicesResult.error) throw new Error(invoicesResult.error.message);

    const milestones: CustomSoftwareBillingMilestone[] = (milestonesResult.data ?? []).map(
      (row) => ({
        id: String(row.id),
        title: String(row.title),
        description: row.description != null ? String(row.description) : null,
        amountLkr: Number(row.amount_lkr ?? 0),
        dueDate: row.due_date != null ? String(row.due_date) : null,
        status: String(row.status ?? 'pending'),
        sortOrder: Number(row.sort_order ?? 0),
      }),
    );

    const invoices: CustomSoftwareBillingInvoice[] = (invoicesResult.data ?? []).map((row) => ({
      id: String(row.id),
      dueDate: String(row.due_date),
      amountLkr: Number(row.amount_lkr ?? 0),
      status: String(row.status ?? 'draft'),
      paidAt: row.paid_at ? String(row.paid_at) : null,
      invoiceMonth: row.invoice_month != null ? String(row.invoice_month) : null,
    }));

    const scheduledTotalLkr = milestones.reduce((sum, row) => sum + row.amountLkr, 0);

    return { success: true as const, milestones, invoices, scheduledTotalLkr };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load billings';
    return {
      success: false as const,
      error: message,
      milestones: [] as CustomSoftwareBillingMilestone[],
      invoices: [] as CustomSoftwareBillingInvoice[],
      scheduledTotalLkr: 0,
    };
  }
}

export type WebsitePartnerRow = {
  id: string;
  displayName: string;
  email: string;
  referralCode: string;
  isActive: boolean;
  websiteClientCount: number;
  activePortfolioCount: number;
  totalBilledLkr: number;
  totalPaidToPartnerLkr: number;
  totalPearzenShareLkr: number;
  createdAt: string;
};

export async function fetchWebsitePartners() {
  try {
    await assertForgeOperator();
    assertServiceRoleConfigured();
    const supabase = createSupabaseServiceClient();

    const [
      { data: partners, error: partnersError },
      { data: portfolios, error: portfoliosError },
      { data: ledgerRows, error: ledgerError },
      { data: websitePurchases, error: purchasesError },
    ] = await Promise.all([
      supabase
        .from('forge_service_partners')
        .select('id, display_name, email, referral_code, is_active, created_at')
        .order('display_name', { ascending: true }),
      supabase
        .from('forge_partner_portfolios')
        .select('partner_id, deal_type, status')
        .eq('status', 'active'),
      supabase
        .from('forge_payout_ledger')
        .select('partner_id, partner_share_lkr, pearzen_share_lkr'),
      supabase
        .from('forge_product_purchases')
        .select('id, partner_id, forge_product_catalog!inner(code)')
        .eq('forge_product_catalog.code', 'website_build')
        .not('partner_id', 'is', null),
    ]);

    if (partnersError) throw new Error(partnersError.message);
    if (portfoliosError) throw new Error(portfoliosError.message);
    if (ledgerError) throw new Error(ledgerError.message);
    if (purchasesError) throw new Error(purchasesError.message);

    const websiteClientsByPartner = new Map<string, number>();
    const activePortfolioByPartner = new Map<string, number>();

    for (const row of portfolios ?? []) {
      const partnerId = String(row.partner_id);
      activePortfolioByPartner.set(
        partnerId,
        (activePortfolioByPartner.get(partnerId) ?? 0) + 1,
      );
      if (row.deal_type === 'website_build') {
        websiteClientsByPartner.set(
          partnerId,
          (websiteClientsByPartner.get(partnerId) ?? 0) + 1,
        );
      }
    }

    const paidToPartnerByPartner = new Map<string, number>();
    const pearzenShareByPartner = new Map<string, number>();

    for (const row of ledgerRows ?? []) {
      const partnerId = String(row.partner_id);
      paidToPartnerByPartner.set(
        partnerId,
        (paidToPartnerByPartner.get(partnerId) ?? 0) + Number(row.partner_share_lkr ?? 0),
      );
      pearzenShareByPartner.set(
        partnerId,
        (pearzenShareByPartner.get(partnerId) ?? 0) + Number(row.pearzen_share_lkr ?? 0),
      );
    }

    const purchaseIds: string[] = [];
    const purchasePartnerById = new Map<string, string>();

    for (const row of websitePurchases ?? []) {
      const purchaseId = String(row.id);
      const partnerId = row.partner_id != null ? String(row.partner_id) : null;
      if (!partnerId) continue;
      purchaseIds.push(purchaseId);
      purchasePartnerById.set(purchaseId, partnerId);
    }

    const billedByPartner = new Map<string, number>();

    if (purchaseIds.length > 0) {
      const { data: invoices, error: invoicesError } = await supabase
        .from('forge_product_invoices')
        .select('purchase_id, amount_lkr')
        .in('purchase_id', purchaseIds);

      if (invoicesError) throw new Error(invoicesError.message);

      for (const invoice of invoices ?? []) {
        const purchaseId = String(invoice.purchase_id);
        const partnerId = purchasePartnerById.get(purchaseId);
        if (!partnerId) continue;
        billedByPartner.set(
          partnerId,
          (billedByPartner.get(partnerId) ?? 0) + Number(invoice.amount_lkr ?? 0),
        );
      }
    }

    const rows: WebsitePartnerRow[] = (partners ?? []).map((row) => {
      const partnerId = String(row.id);
      return {
        id: partnerId,
        displayName: String(row.display_name ?? 'Partner'),
        email: String(row.email ?? ''),
        referralCode: String(row.referral_code ?? ''),
        isActive: row.is_active !== false,
        websiteClientCount: websiteClientsByPartner.get(partnerId) ?? 0,
        activePortfolioCount: activePortfolioByPartner.get(partnerId) ?? 0,
        totalBilledLkr: billedByPartner.get(partnerId) ?? 0,
        totalPaidToPartnerLkr: paidToPartnerByPartner.get(partnerId) ?? 0,
        totalPearzenShareLkr: pearzenShareByPartner.get(partnerId) ?? 0,
        createdAt: String(row.created_at ?? ''),
      };
    });

    rows.sort((a, b) => {
      if (b.websiteClientCount !== a.websiteClientCount) {
        return b.websiteClientCount - a.websiteClientCount;
      }
      return a.displayName.localeCompare(b.displayName);
    });

    return { success: true as const, partners: rows };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load web managers';
    return { success: false as const, error: message, partners: [] as WebsitePartnerRow[] };
  }
}

export type WebsitePartnerClientRow = {
  id: string;
  portfolioId: string;
  companyId: string;
  companyName: string;
  companySlug: string | null;
  portfolioStatus: string;
  closedAt: string;
  siteLive: boolean;
  siteHostname: string | null;
  siteType: string | null;
  monthlyStatus: 'current' | 'past_due' | 'setup' | 'churned' | 'unknown';
  purchaseStatus: string | null;
};

function resolveMonthlyStatus(input: {
  portfolioStatus: string;
  siteLive: boolean;
  latestInvoiceStatus: string | null;
  purchaseStatus: string | null;
}): WebsitePartnerClientRow['monthlyStatus'] {
  if (input.portfolioStatus === 'churned') return 'churned';
  if (!input.siteLive) return 'setup';
  if (input.latestInvoiceStatus === 'unpaid' || input.latestInvoiceStatus === 'sent') {
    return 'past_due';
  }
  if (
    input.latestInvoiceStatus === 'paid' ||
    input.purchaseStatus === 'active' ||
    input.purchaseStatus === 'completed'
  ) {
    return 'current';
  }
  return 'unknown';
}

export async function fetchWebsitePartnerClients(partnerId: string) {
  try {
    await assertForgeOperator();
    assertServiceRoleConfigured();
    const scopedPartnerId = partnerId.trim();
    if (!scopedPartnerId) throw new Error('Partner id is required.');

    const supabase = createSupabaseServiceClient();

    const { data: portfolios, error: portfolioError } = await supabase
      .from('forge_partner_portfolios')
      .select(
        'id, company_id, status, closed_at, companies(id, name, slug)',
      )
      .eq('partner_id', scopedPartnerId)
      .eq('deal_type', 'website_build')
      .order('closed_at', { ascending: false });

    if (portfolioError) throw new Error(portfolioError.message);

    const companyIds = [
      ...new Set(
        (portfolios ?? [])
          .map((row) => (row.company_id != null ? String(row.company_id) : null))
          .filter(Boolean) as string[],
      ),
    ];

    const sitesByCompany = new Map<
      string,
      { hostname: string | null; siteType: string; publishedAt: string | null }
    >();

    if (companyIds.length > 0) {
      const { data: sites, error: sitesError } = await supabase
        .from('tenant_public_sites')
        .select('company_id, hostname, site_type, published_at')
        .in('company_id', companyIds);

      if (sitesError) throw new Error(sitesError.message);

      for (const site of sites ?? []) {
        const companyId = String(site.company_id);
        const publishedAt = site.published_at != null ? String(site.published_at) : null;
        const existing = sitesByCompany.get(companyId);
        if (!publishedAt) continue;
        if (!existing?.publishedAt || publishedAt > existing.publishedAt) {
          sitesByCompany.set(companyId, {
            hostname: site.hostname != null ? String(site.hostname) : null,
            siteType: String(site.site_type ?? ''),
            publishedAt,
          });
        }
      }
    }

    const latestInvoiceByCompany = new Map<string, string>();
    const purchaseStatusByCompany = new Map<string, string>();

    if (companyIds.length > 0) {
      const { data: purchases, error: purchasesError } = await supabase
        .from('forge_product_purchases')
        .select(
          'id, company_id, status, forge_product_catalog!inner(code), forge_product_invoices(status, due_date, created_at)',
        )
        .eq('partner_id', scopedPartnerId)
        .eq('forge_product_catalog.code', 'website_build')
        .in('company_id', companyIds);

      if (purchasesError) throw new Error(purchasesError.message);

      for (const purchase of purchases ?? []) {
        const companyId =
          purchase.company_id != null ? String(purchase.company_id) : null;
        if (!companyId) continue;

        purchaseStatusByCompany.set(companyId, String(purchase.status ?? ''));

        const invoices = Array.isArray(purchase.forge_product_invoices)
          ? (purchase.forge_product_invoices as { status: string; due_date: string; created_at: string }[])
          : [];
        const sorted = [...invoices].sort((a, b) =>
          String(b.due_date ?? b.created_at).localeCompare(String(a.due_date ?? a.created_at)),
        );
        const latest = sorted[0];
        if (latest?.status) {
          latestInvoiceByCompany.set(companyId, String(latest.status));
        }
      }
    }

    const clients: WebsitePartnerClientRow[] = (portfolios ?? []).map((row) => {
      const portfolioId = String(row.id);
      const company = row.companies as Record<string, unknown> | null;
      const companyId = String(row.company_id);
      const site = sitesByCompany.get(companyId);
      const siteLive = Boolean(site?.publishedAt);
      const portfolioStatus = String(row.status ?? 'active');
      const latestInvoiceStatus = latestInvoiceByCompany.get(companyId) ?? null;
      const purchaseStatus = purchaseStatusByCompany.get(companyId) ?? null;

      return {
        id: portfolioId,
        portfolioId,
        companyId,
        companyName: company?.name != null ? String(company.name) : 'Unknown client',
        companySlug: company?.slug != null ? String(company.slug) : null,
        portfolioStatus,
        closedAt: String(row.closed_at ?? ''),
        siteLive,
        siteHostname: site?.hostname ?? null,
        siteType: site?.siteType ?? null,
        monthlyStatus: resolveMonthlyStatus({
          portfolioStatus,
          siteLive,
          latestInvoiceStatus,
          purchaseStatus,
        }),
        purchaseStatus,
      };
    });

    clients.sort((a, b) => a.companyName.localeCompare(b.companyName));

    return { success: true as const, clients };
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : 'Failed to load manager clients';
    return { success: false as const, error: message, clients: [] as WebsitePartnerClientRow[] };
  }
}

export type WebsiteClientSiteRow = {
  siteType: string;
  label: string;
  hostname: string | null;
  siteUrl: string | null;
  publishedAt: string | null;
  isPublished: boolean;
};

export type WebsiteClientInvoiceRow = {
  id: string;
  dueDate: string;
  amountLkr: number;
  status: string;
  paidAt: string | null;
  partnerShareLkr: number | null;
  pearzenShareLkr: number | null;
};

export type WebsiteClientPearsStatus = {
  status: 'listed' | 'pending' | 'not_listed';
  consentedAt: string | null;
  listProducts: boolean;
  listBooking: boolean;
  lastSnapshotAt: string | null;
};

export type WebsiteClientDetail = {
  companyName: string;
  companySlug: string | null;
  purchaseId: string | null;
  sites: WebsiteClientSiteRow[];
  pears: WebsiteClientPearsStatus;
  invoices: WebsiteClientInvoiceRow[];
};

function buildPublicSiteUrl(hostname: string | null, slug: string | null): string | null {
  if (hostname?.trim()) {
    const host = hostname.trim().replace(/^https?:\/\//i, '').replace(/\/$/, '');
    return host ? `https://${host}` : null;
  }
  if (slug?.trim()) {
    const base = process.env.NEXT_PUBLIC_TENANT_BASE_DOMAIN ?? 'pearzen.tech';
    return `https://${slug.trim().toLowerCase()}.${base}`;
  }
  return null;
}

export async function fetchWebsiteClientDetail(input: {
  partnerId: string;
  companyId: string;
  portfolioId: string;
}) {
  try {
    await assertForgeOperator();
    assertServiceRoleConfigured();
    const partnerId = input.partnerId.trim();
    const companyId = input.companyId.trim();
    const portfolioId = input.portfolioId.trim();
    if (!partnerId || !companyId || !portfolioId) {
      throw new Error('Partner, company, and portfolio are required.');
    }

    const supabase = createSupabaseServiceClient();

    const [
      { data: company, error: companyError },
      { data: sites, error: sitesError },
      { data: consent, error: consentError },
      { data: snapshot, error: snapshotError },
      { data: purchases, error: purchasesError },
    ] = await Promise.all([
      supabase.from('companies').select('id, name, slug').eq('id', companyId).maybeSingle(),
      supabase
        .from('tenant_public_sites')
        .select('site_type, hostname, published_at')
        .eq('company_id', companyId)
        .order('updated_at', { ascending: false }),
      supabase
        .from('superapp_listing_consent')
        .select('consented_at, list_products, list_booking')
        .eq('company_id', companyId)
        .maybeSingle(),
      supabase
        .from('superapp_store_snapshots')
        .select('created_at')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('forge_product_purchases')
        .select(
          'id, forge_product_catalog!inner(code), forge_product_invoices(id, due_date, amount_lkr, status, paid_at)',
        )
        .eq('partner_id', partnerId)
        .eq('company_id', companyId)
        .eq('forge_product_catalog.code', 'website_build')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    if (companyError) throw new Error(companyError.message);
    if (sitesError) throw new Error(sitesError.message);
    if (consentError && consentError.code !== '42P01') throw new Error(consentError.message);
    if (snapshotError && snapshotError.code !== '42P01') throw new Error(snapshotError.message);
    if (purchasesError) throw new Error(purchasesError.message);
    if (!company?.id) throw new Error('Company not found.');

    const companySlug = company.slug != null ? String(company.slug) : null;
    const companyName = String(company.name ?? 'Client');

    const siteRows: WebsiteClientSiteRow[] = (sites ?? []).map((row) => {
      const siteType = String(row.site_type ?? '');
      const hostname = row.hostname != null ? String(row.hostname) : null;
      const publishedAt = row.published_at != null ? String(row.published_at) : null;
      const label =
        siteType === 'security_marketing'
          ? 'Security marketing'
          : siteType === 'landing'
            ? 'Landing page'
            : siteType === 'menu'
              ? 'Customer menu'
              : siteType || 'Website';

      return {
        siteType,
        label,
        hostname,
        siteUrl: buildPublicSiteUrl(hostname, companySlug),
        publishedAt,
        isPublished: Boolean(publishedAt),
      };
    });

    const consentActive = Boolean(
      consent?.consented_at && (consent.list_products || consent.list_booking),
    );
    const hasSnapshot = Boolean(snapshot?.created_at);
    const siteLive = siteRows.some((row) => row.isPublished);

    let pearsStatus: WebsiteClientPearsStatus['status'] = 'not_listed';
    if (consentActive && hasSnapshot) pearsStatus = 'listed';
    else if (consentActive || siteLive) pearsStatus = 'pending';

    const pears: WebsiteClientPearsStatus = {
      status: pearsStatus,
      consentedAt: consent?.consented_at != null ? String(consent.consented_at) : null,
      listProducts: Boolean(consent?.list_products),
      listBooking: Boolean(consent?.list_booking),
      lastSnapshotAt: snapshot?.created_at != null ? String(snapshot.created_at) : null,
    };

    const purchaseId = purchases?.id != null ? String(purchases.id) : null;
    const rawInvoices = Array.isArray(purchases?.forge_product_invoices)
      ? (purchases.forge_product_invoices as Record<string, unknown>[])
      : [];

    const invoiceIds = rawInvoices.map((row) => String(row.id));
    const ledgerByInvoice = new Map<
      string,
      { partnerShareLkr: number; pearzenShareLkr: number }
    >();

    if (invoiceIds.length > 0) {
      const { data: ledgerRows, error: ledgerError } = await supabase
        .from('forge_payout_ledger')
        .select('source_invoice_id, partner_share_lkr, pearzen_share_lkr')
        .eq('partner_id', partnerId)
        .eq('portfolio_id', portfolioId)
        .in('source_invoice_id', invoiceIds);

      if (ledgerError) throw new Error(ledgerError.message);

      for (const row of ledgerRows ?? []) {
        if (row.source_invoice_id == null) continue;
        ledgerByInvoice.set(String(row.source_invoice_id), {
          partnerShareLkr: Number(row.partner_share_lkr ?? 0),
          pearzenShareLkr: Number(row.pearzen_share_lkr ?? 0),
        });
      }
    }

    const invoices: WebsiteClientInvoiceRow[] = rawInvoices
      .map((row) => {
        const id = String(row.id);
        const ledger = ledgerByInvoice.get(id);
        return {
          id,
          dueDate: String(row.due_date ?? ''),
          amountLkr: Number(row.amount_lkr ?? 0),
          status: String(row.status ?? 'draft'),
          paidAt: row.paid_at != null ? String(row.paid_at) : null,
          partnerShareLkr: ledger?.partnerShareLkr ?? null,
          pearzenShareLkr: ledger?.pearzenShareLkr ?? null,
        };
      })
      .sort((a, b) => b.dueDate.localeCompare(a.dueDate));

    return {
      success: true as const,
      detail: {
        companyName,
        companySlug,
        purchaseId,
        sites: siteRows,
        pears,
        invoices,
      } satisfies WebsiteClientDetail,
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load client detail';
    return { success: false as const, error: message, detail: null };
  }
}

export async function syncWebsiteClientPearsListing(input: { companyId: string }) {
  try {
    await assertForgeOperator();
    assertServiceRoleConfigured();
    const operatorEmail = await assertForgeOperator();

    const companyId = input.companyId.trim();
    if (!companyId) throw new Error('Company id is required');

    const sites = await listTenantPublicSites(companyId);
    const publishedSite =
      sites.find((site) => site.publishedAt && site.siteType === 'landing') ??
      sites.find((site) => site.publishedAt) ??
      null;

    if (!publishedSite) {
      throw new Error('Publish a public website before syncing to PEARS.');
    }

    const result = await syncPearsListingOnWebsiteGoLive({
      companyId,
      siteType: publishedSite.siteType,
      requestedBy: operatorEmail,
    });

    if (!result) {
      throw new Error('This company is not tracked as a Forge website-build client.');
    }

    revalidatePath('/forge/clients');
    revalidatePath('/forge/superapp/exports');

    return {
      success: true as const,
      jobId: result.jobId,
      snapshotId: result.snapshotId,
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to sync PEARS listing';
    return { success: false as const, error: message };
  }
}
