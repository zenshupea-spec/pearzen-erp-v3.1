'use server';

import { revalidatePath } from 'next/cache';

import {
  FORGE_PARTNER_DEAL_TYPES,
  FORGE_PARTNER_PORTFOLIO_STATUSES,
  isForgePartnerDealType,
  type ForgePartnerDealType,
  type ForgePartnerPortfolioStatus,
} from '../../../lib/forge-partners';
import { mergeTenantLandingContent } from '../../../lib/tenant-public-site-types';
import { pearsLoginUrl } from '../../../lib/pears-host';
import {
  getPartnerScopedServerClient,
  partnerServiceClient,
  requirePartnerSession,
} from '../../../lib/partner-portal-session';
import { tenantProductionDomain } from '../../../lib/tenant-host';

export type PartnerPortfolioListItem = {
  id: string;
  companyId: string;
  companyName: string;
  companySlug: string | null;
  productionDomain: string | null;
  dealType: ForgePartnerDealType;
  status: ForgePartnerPortfolioStatus;
  closedAt: string;
  referralCode: string | null;
  notes: string | null;
};

export type LinkableCompanyOption = {
  id: string;
  name: string;
  slug: string | null;
};

function mapPortfolioRow(
  row: Record<string, unknown>,
  company?: Record<string, unknown> | null,
): PartnerPortfolioListItem {
  const companyId = String(row.company_id);
  const slug = company?.slug != null ? String(company.slug) : null;

  return {
    id: String(row.id),
    companyId,
    companyName: String(company?.name ?? 'Unknown tenant'),
    companySlug: slug,
    productionDomain: slug ? tenantProductionDomain(slug) : null,
    dealType: String(row.deal_type) as ForgePartnerDealType,
    status: String(row.status) as ForgePartnerPortfolioStatus,
    closedAt: String(row.closed_at ?? ''),
    referralCode: row.referral_code != null ? String(row.referral_code) : null,
    notes: row.notes != null ? String(row.notes) : null,
  };
}

function revalidatePortfolioPaths(companyId?: string) {
  revalidatePath('/partners');
  revalidatePath('/partners/portfolio');
  if (companyId) {
    revalidatePath(`/partners/portfolio/${companyId}`);
  }
}

export async function fetchPartnerPortfolioList() {
  try {
    const { supabase, partner } = await getPartnerScopedServerClient();

    const { data, error } = await supabase
      .from('forge_partner_portfolios')
      .select('*')
      .eq('partner_id', partner.id)
      .order('closed_at', { ascending: false });

    if (error) throw new Error(error.message);

    const companyIds = [...new Set((data ?? []).map((row) => String(row.company_id)))];
    let companiesById = new Map<string, Record<string, unknown>>();

    if (companyIds.length > 0) {
      const db = partnerServiceClient();
      const { data: companies, error: companiesError } = await db
        .from('companies')
        .select('id, name, slug')
        .in('id', companyIds);

      if (companiesError) throw new Error(companiesError.message);
      companiesById = new Map(
        (companies ?? []).map((row) => [String(row.id), row as Record<string, unknown>]),
      );
    }

    return {
      success: true as const,
      portfolios: (data ?? []).map((row) =>
        mapPortfolioRow(row as Record<string, unknown>, companiesById.get(String(row.company_id))),
      ),
      dealTypes: FORGE_PARTNER_DEAL_TYPES,
      statuses: FORGE_PARTNER_PORTFOLIO_STATUSES,
      partnerReferralCode: partner.referralCode,
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load portfolio';
    return {
      success: false as const,
      error: message,
      portfolios: [],
      dealTypes: FORGE_PARTNER_DEAL_TYPES,
      statuses: FORGE_PARTNER_PORTFOLIO_STATUSES,
      partnerReferralCode: '',
    };
  }
}

export async function fetchLinkableCompaniesForPartner() {
  try {
    const { partner } = await requirePartnerSession();
    const db = partnerServiceClient();

    const [{ data: companies, error: companiesError }, { data: linked, error: linkedError }] =
      await Promise.all([
        db
          .from('companies')
          .select('id, name, slug')
          .neq('name', 'HQ_MASTER_ACCOUNT')
          .order('name', { ascending: true }),
        db.from('forge_partner_portfolios').select('company_id').eq('partner_id', partner.id),
      ]);

    if (companiesError) throw new Error(companiesError.message);
    if (linkedError) throw new Error(linkedError.message);

    const linkedIds = new Set((linked ?? []).map((row) => String(row.company_id)));

    return {
      success: true as const,
      companies: (companies ?? [])
        .filter((row) => !linkedIds.has(String(row.id)))
        .map(
          (row): LinkableCompanyOption => ({
            id: String(row.id),
            name: String(row.name ?? 'Unknown'),
            slug: row.slug != null ? String(row.slug) : null,
          }),
        ),
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load companies';
    return { success: false as const, error: message, companies: [] };
  }
}

export async function createPartnerPortfolioEntry(input: {
  companyId: string;
  dealType: ForgePartnerDealType;
  closedAt?: string;
  notes?: string | null;
  usePartnerReferralCode?: boolean;
}) {
  try {
    const { supabase, partner } = await getPartnerScopedServerClient();

    if (!input.companyId?.trim()) throw new Error('Select a tenant company');
    if (!isForgePartnerDealType(input.dealType)) throw new Error('Invalid deal type');

    const closedAt = input.closedAt?.trim() || new Date().toISOString().slice(0, 10);

    const { data, error } = await supabase
      .from('forge_partner_portfolios')
      .insert({
        partner_id: partner.id,
        company_id: input.companyId.trim(),
        deal_type: input.dealType,
        closed_at: closedAt,
        status: 'active',
        referral_code: input.usePartnerReferralCode ? partner.referralCode : null,
        notes: input.notes?.trim() || null,
      })
      .select('id, company_id')
      .single();

    if (error) throw new Error(error.message);

    revalidatePortfolioPaths(String(data.company_id));

    return { success: true as const, portfolioId: String(data.id) };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to add client';
    return { success: false as const, error: message };
  }
}

export async function updatePartnerPortfolioEntry(input: {
  portfolioId: string;
  status?: ForgePartnerPortfolioStatus;
  notes?: string | null;
  dealType?: ForgePartnerDealType;
}) {
  try {
    const { supabase, partner } = await getPartnerScopedServerClient();
    if (!input.portfolioId?.trim()) throw new Error('Missing portfolio row');

    const patch: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (input.status) patch.status = input.status;
    if (input.dealType && isForgePartnerDealType(input.dealType)) patch.deal_type = input.dealType;
    if (input.notes !== undefined) patch.notes = input.notes?.trim() || null;

    const { data, error } = await supabase
      .from('forge_partner_portfolios')
      .update(patch)
      .eq('id', input.portfolioId.trim())
      .eq('partner_id', partner.id)
      .select('company_id')
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!data) throw new Error('Portfolio entry not found');

    revalidatePortfolioPaths(String(data.company_id));

    return { success: true as const };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to update portfolio';
    return { success: false as const, error: message };
  }
}

export type PartnerPearsShopSummary = {
  clientLoginUrl: string;
  activeProductCount: number;
  heroImageConfigured: boolean;
  sitePublished: boolean;
  pearsListed: boolean;
  lastSnapshotAt: string | null;
};

async function fetchPartnerPearsShopSummary(
  companyId: string,
): Promise<PartnerPearsShopSummary | null> {
  const db = partnerServiceClient();

  const [{ data: site }, { data: consent }, { data: snapshot }] = await Promise.all([
    db
      .from('tenant_public_sites')
      .select('published_at, content_json')
      .eq('company_id', companyId)
      .eq('site_type', 'landing')
      .maybeSingle(),
    db
      .from('superapp_listing_consent')
      .select('consented_at, list_products, list_booking')
      .eq('company_id', companyId)
      .maybeSingle(),
    db
      .from('superapp_store_snapshots')
      .select('created_at')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const landing = mergeTenantLandingContent(site?.content_json ?? null);
  const consentActive = Boolean(
    consent?.consented_at && (consent.list_products || consent.list_booking),
  );

  return {
    clientLoginUrl: pearsLoginUrl(),
    activeProductCount: landing.products.filter((product) => product.isActive).length,
    heroImageConfigured: Boolean(landing.heroImageUrl),
    sitePublished: Boolean(site?.published_at),
    pearsListed: consentActive && Boolean(snapshot?.created_at),
    lastSnapshotAt: snapshot?.created_at != null ? String(snapshot.created_at) : null,
  };
}

export async function fetchPartnerPortfolioDetail(companyId: string) {
  try {
    const { supabase, partner } = await getPartnerScopedServerClient();
    const scopedCompanyId = companyId?.trim();
    if (!scopedCompanyId) throw new Error('Missing company');

    const { data: portfolioRow, error } = await supabase
      .from('forge_partner_portfolios')
      .select('*')
      .eq('partner_id', partner.id)
      .eq('company_id', scopedCompanyId)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!portfolioRow) throw new Error('Portfolio entry not found');

    const db = partnerServiceClient();
    const { data: company, error: companyError } = await db
      .from('companies')
      .select('id, name, slug, subscription_status')
      .eq('id', scopedCompanyId)
      .maybeSingle();

    if (companyError) throw new Error(companyError.message);
    if (!company) throw new Error('Company not found');

    const { count: purchaseCount } = await db
      .from('forge_product_purchases')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', scopedCompanyId)
      .eq('partner_id', partner.id);

    const portfolio = mapPortfolioRow(portfolioRow as Record<string, unknown>, company as Record<string, unknown>);
    const pearsShop =
      portfolio.dealType === 'website_build'
        ? await fetchPartnerPearsShopSummary(scopedCompanyId)
        : null;

    return {
      success: true as const,
      portfolio,
      subscriptionStatus: company.subscription_status != null ? String(company.subscription_status) : null,
      commercePurchaseCount: purchaseCount ?? 0,
      dealTypes: FORGE_PARTNER_DEAL_TYPES,
      statuses: FORGE_PARTNER_PORTFOLIO_STATUSES,
      pearsShop,
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load client';
    return { success: false as const, error: message };
  }
}
