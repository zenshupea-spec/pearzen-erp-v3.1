'use server';

import { revalidatePath } from 'next/cache';

import { isForgeOperatorEmail } from '../../../lib/forge-access';
import {
  DEFAULT_FORGE_PAYOUT_RULES,
  type ForgePayoutRules,
} from '../../../lib/forge-partners';
import {
  customPricingToMetadata,
  readCustomPricingDefaults,
  readCustomPricingOverride,
  readWfmPerEmployeeOverride,
  readWfmPricingDefaults,
  type ForgeCustomMonthlyMode,
  type ForgeCustomPricingDefaults,
} from '../../../lib/forge-pricing';
import { createSupabaseServerClient } from '../../../../../packages/supabase/server';
import { createSupabaseServiceClient } from '../../../../../packages/supabase/service';

function assertServiceRoleConfigured() {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY is missing on the server. Add it in Vercel → Project → Environment Variables, then redeploy.',
    );
  }
}

async function assertForgeOperator() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email || !(await isForgeOperatorEmail(user.email))) {
    throw new Error('Forge operator access required');
  }
}

function revalidatePricingConsumers() {
  revalidatePath('/forge/settings/pricing');
  revalidatePath('/forge/partners');
  revalidatePath('/forge/clients');
  revalidatePath('/forge/commerce/pricing');
}

function mapPayoutRules(row: Record<string, unknown>): ForgePayoutRules {
  return {
    monthOneClientLkr: Number(row.month_one_client_lkr ?? DEFAULT_FORGE_PAYOUT_RULES.monthOneClientLkr),
    monthTwoPlusClientLkr: Number(
      row.month_two_plus_client_lkr ?? DEFAULT_FORGE_PAYOUT_RULES.monthTwoPlusClientLkr,
    ),
    monthOnePartnerLkr: Number(row.month_one_partner_lkr ?? DEFAULT_FORGE_PAYOUT_RULES.monthOnePartnerLkr),
    monthOnePearzenLkr: Number(row.month_one_pearzen_lkr ?? DEFAULT_FORGE_PAYOUT_RULES.monthOnePearzenLkr),
    monthTwoPlusPartnerLkr: Number(
      row.month_two_plus_partner_lkr ?? DEFAULT_FORGE_PAYOUT_RULES.monthTwoPlusPartnerLkr,
    ),
    monthTwoPlusPearzenLkr: Number(
      row.month_two_plus_pearzen_lkr ?? DEFAULT_FORGE_PAYOUT_RULES.monthTwoPlusPearzenLkr,
    ),
  };
}

function mapCatalogMetadata(row: Record<string, unknown> | null | undefined): Record<string, unknown> {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return {};
  return row as Record<string, unknown>;
}

export type ForgeWfmPricingRow = {
  id: string;
  purchaseId: string | null;
  name: string;
  employeeCount: number;
  perEmployeeLkr: number;
  monthlyTotalLkr: number;
  hasOverride: boolean;
};

export type ForgeCustomPricingRow = {
  purchaseId: string;
  projectName: string;
  buyerName: string;
  pricing: ForgeCustomPricingDefaults;
  hasOverride: boolean;
};

export type ForgePricingDashboard = {
  websiteRules: ForgePayoutRules;
  wfmDefaults: { perEmployeeLkr: number };
  wfmSubscribers: ForgeWfmPricingRow[];
  customDefaults: ForgeCustomPricingDefaults;
  customClients: ForgeCustomPricingRow[];
};

export async function fetchForgePricingDashboard() {
  try {
    assertServiceRoleConfigured();
    await assertForgeOperator();

    const supabase = createSupabaseServiceClient();

    const [rulesResult, catalogResult, wfmPurchasesResult, customPurchasesResult] =
      await Promise.all([
        supabase.from('forge_payout_rules').select('*').eq('singleton', true).maybeSingle(),
        supabase
          .from('forge_product_catalog')
          .select('code, metadata, base_price_lkr')
          .in('code', ['wfm_tool', 'custom_software', 'website_build']),
        supabase
          .from('forge_product_purchases')
          .select(
            'id, company_id, buyer_name, price_lkr, billing_interval, metadata, companies(name), forge_product_catalog!inner(code)',
          )
          .eq('forge_product_catalog.code', 'wfm_tool')
          .order('created_at', { ascending: false }),
        supabase
          .from('forge_product_purchases')
          .select(
            'id, buyer_name, notes, metadata, forge_product_catalog!inner(code)',
          )
          .eq('forge_product_catalog.code', 'custom_software')
          .order('created_at', { ascending: false }),
      ]);

    if (rulesResult.error && rulesResult.error.code !== '42P01') {
      throw new Error(rulesResult.error.message);
    }

    const websiteRules = rulesResult.data
      ? mapPayoutRules(rulesResult.data as Record<string, unknown>)
      : { ...DEFAULT_FORGE_PAYOUT_RULES };

    const catalogByCode = new Map<string, Record<string, unknown>>();
    for (const row of catalogResult.data ?? []) {
      catalogByCode.set(String(row.code), mapCatalogMetadata(row.metadata as Record<string, unknown>));
    }

    const wfmCatalogMeta = catalogByCode.get('wfm_tool') ?? {};
    const wfmDefaults = readWfmPricingDefaults(wfmCatalogMeta);

    const customCatalogMeta = catalogByCode.get('custom_software') ?? {};
    const customDefaults = readCustomPricingDefaults(customCatalogMeta);

    const wfmCompanyIds = [
      ...new Set(
        (wfmPurchasesResult.data ?? [])
          .map((row) => (row.company_id != null ? String(row.company_id) : null))
          .filter(Boolean) as string[],
      ),
    ];

    const employeeCounts = new Map<string, number>();
    const billingPerEmployee = new Map<string, number>();

    await Promise.all(
      wfmCompanyIds.map(async (companyId) => {
        const [{ count }, billingResult] = await Promise.all([
          supabase
            .from('employees')
            .select('id', { count: 'exact', head: true })
            .eq('company_id', companyId)
            .ilike('status', 'active'),
          supabase
            .from('saas_billing_settings')
            .select('per_employee_price_lkr')
            .eq('company_id', companyId)
            .maybeSingle(),
        ]);
        employeeCounts.set(companyId, count ?? 0);
        if (billingResult.data?.per_employee_price_lkr != null) {
          billingPerEmployee.set(companyId, Number(billingResult.data.per_employee_price_lkr));
        }
      }),
    );

    const wfmSubscribers: ForgeWfmPricingRow[] = (wfmPurchasesResult.data ?? []).map((row) => {
      const companyId = row.company_id != null ? String(row.company_id) : null;
      const company = row.companies as Record<string, unknown> | null;
      const purchaseMeta = mapCatalogMetadata(row.metadata as Record<string, unknown>);
      const employeeCount = companyId ? employeeCounts.get(companyId) ?? 0 : 0;
      const perEmployeeLkr = readWfmPerEmployeeOverride(
        purchaseMeta,
        wfmDefaults,
        companyId ? billingPerEmployee.get(companyId) : null,
      );

      return {
        id: companyId ?? String(row.id),
        purchaseId: String(row.id),
        name: company?.name != null ? String(company.name) : String(row.buyer_name ?? 'WFM subscriber'),
        employeeCount,
        perEmployeeLkr,
        monthlyTotalLkr: employeeCount > 0 ? perEmployeeLkr * employeeCount : perEmployeeLkr,
        hasOverride: purchaseMeta.per_employee_lkr != null,
      };
    });

    const customClients: ForgeCustomPricingRow[] = (customPurchasesResult.data ?? []).map((row) => {
      const purchaseMeta = mapCatalogMetadata(row.metadata as Record<string, unknown>);
      const notes = row.notes != null ? String(row.notes).trim() : '';
      const projectName = notes ? notes.split('\n')[0].slice(0, 100) : String(row.buyer_name ?? 'Project');

      return {
        purchaseId: String(row.id),
        projectName,
        buyerName: String(row.buyer_name ?? 'Client'),
        pricing: readCustomPricingOverride(purchaseMeta, customDefaults),
        hasOverride: Object.keys(purchaseMeta).length > 0,
      };
    });

    return {
      success: true as const,
      dashboard: {
        websiteRules,
        wfmDefaults,
        wfmSubscribers,
        customDefaults,
        customClients,
      } satisfies ForgePricingDashboard,
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load pricing settings';
    return { success: false as const, error: message, dashboard: null };
  }
}

export async function updateForgeWebsitePricingRules(input: ForgePayoutRules) {
  try {
    assertServiceRoleConfigured();
    await assertForgeOperator();

    const supabase = createSupabaseServiceClient();
    const { error } = await supabase
      .from('forge_payout_rules')
      .update({
        month_one_client_lkr: input.monthOneClientLkr,
        month_two_plus_client_lkr: input.monthTwoPlusClientLkr,
        month_one_partner_lkr: input.monthOnePartnerLkr,
        month_one_pearzen_lkr: input.monthOnePearzenLkr,
        month_two_plus_partner_lkr: input.monthTwoPlusPartnerLkr,
        month_two_plus_pearzen_lkr: input.monthTwoPlusPearzenLkr,
        updated_at: new Date().toISOString(),
      })
      .eq('singleton', true);

    if (error) {
      if (error.code === '42P01') throw new Error('Payout rules table not migrated yet');
      throw new Error(error.message);
    }

    revalidatePricingConsumers();
    return { success: true as const };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to save website pricing';
    return { success: false as const, error: message };
  }
}

export async function updateForgeWfmDefaultPricing(perEmployeeLkr: number) {
  try {
    assertServiceRoleConfigured();
    await assertForgeOperator();

    if (!Number.isFinite(perEmployeeLkr) || perEmployeeLkr < 0) {
      throw new Error('Enter a valid per-employee rate');
    }

    const supabase = createSupabaseServiceClient();
    const { data: row, error: fetchError } = await supabase
      .from('forge_product_catalog')
      .select('metadata')
      .eq('code', 'wfm_tool')
      .maybeSingle();

    if (fetchError) throw new Error(fetchError.message);

    const metadata = {
      ...mapCatalogMetadata(row?.metadata as Record<string, unknown>),
      per_employee_lkr: perEmployeeLkr,
    };

    const { error } = await supabase
      .from('forge_product_catalog')
      .update({ metadata, base_price_lkr: perEmployeeLkr, updated_at: new Date().toISOString() })
      .eq('code', 'wfm_tool');

    if (error) throw new Error(error.message);

    revalidatePricingConsumers();
    return { success: true as const };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to save WFM default pricing';
    return { success: false as const, error: message };
  }
}

export async function updateForgeWfmSubscriberPricing(input: {
  purchaseId: string;
  perEmployeeLkr: number;
  employeeCount: number;
}) {
  try {
    assertServiceRoleConfigured();
    await assertForgeOperator();

    if (!input.purchaseId?.trim()) throw new Error('Purchase id is required');
    if (!Number.isFinite(input.perEmployeeLkr) || input.perEmployeeLkr < 0) {
      throw new Error('Enter a valid per-employee rate');
    }

    const supabase = createSupabaseServiceClient();
    const monthlyTotal =
      input.employeeCount > 0
        ? input.perEmployeeLkr * input.employeeCount
        : input.perEmployeeLkr;

    const { data: existing, error: fetchError } = await supabase
      .from('forge_product_purchases')
      .select('metadata')
      .eq('id', input.purchaseId.trim())
      .maybeSingle();

    if (fetchError) throw new Error(fetchError.message);
    if (!existing) throw new Error('WFM purchase not found');

    const metadata = {
      ...mapCatalogMetadata(existing.metadata as Record<string, unknown>),
      per_employee_lkr: input.perEmployeeLkr,
    };

    const { error } = await supabase
      .from('forge_product_purchases')
      .update({
        metadata,
        price_lkr: monthlyTotal,
        billing_interval: 'monthly',
      })
      .eq('id', input.purchaseId.trim());

    if (error) throw new Error(error.message);

    revalidatePricingConsumers();
    return { success: true as const };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to save subscriber pricing';
    return { success: false as const, error: message };
  }
}

export async function updateForgeCustomDefaultPricing(pricing: ForgeCustomPricingDefaults) {
  try {
    assertServiceRoleConfigured();
    await assertForgeOperator();

    const supabase = createSupabaseServiceClient();
    const { data: row, error: fetchError } = await supabase
      .from('forge_product_catalog')
      .select('metadata')
      .eq('code', 'custom_software')
      .maybeSingle();

    if (fetchError) throw new Error(fetchError.message);

    const metadata = {
      ...mapCatalogMetadata(row?.metadata as Record<string, unknown>),
      ...customPricingToMetadata(pricing),
    };

    const { error } = await supabase
      .from('forge_product_catalog')
      .update({ metadata, updated_at: new Date().toISOString() })
      .eq('code', 'custom_software');

    if (error) throw new Error(error.message);

    revalidatePricingConsumers();
    return { success: true as const };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to save custom defaults';
    return { success: false as const, error: message };
  }
}

export async function updateForgeCustomClientPricing(input: {
  purchaseId: string;
  pricing: ForgeCustomPricingDefaults;
}) {
  try {
    assertServiceRoleConfigured();
    await assertForgeOperator();

    if (!input.purchaseId?.trim()) throw new Error('Purchase id is required');

    const supabase = createSupabaseServiceClient();
    const { error } = await supabase
      .from('forge_product_purchases')
      .update({
        metadata: customPricingToMetadata(input.pricing),
      })
      .eq('id', input.purchaseId.trim());

    if (error) {
      if (error.code === '42703') {
        throw new Error(
          'Purchase metadata column not migrated yet. Apply 20260624170000_forge_pricing_settings.sql.',
        );
      }
      throw new Error(error.message);
    }

    revalidatePricingConsumers();
    return { success: true as const };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to save client pricing';
    return { success: false as const, error: message };
  }
}

export type { ForgeCustomMonthlyMode };
