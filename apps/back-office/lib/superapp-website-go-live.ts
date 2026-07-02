/**
 * PEARS auto-listing when a Forge website client publishes a public site.
 */

import { createSupabaseServiceClient } from '../../../packages/supabase/service';
import { runSuperappStoreProfileExport } from './superapp-store-export';
import { upsertSuperappListingConsent } from './superapp-listing-consent';
import type { TenantPublicSiteType } from './tenant-public-site-types';

export const FORGE_PEARS_AUTO_LISTING_ACTOR = 'forge-auto-listing@pearzen.tech';

export type PearsWebsiteGoLiveSyncResult = {
  companyId: string;
  siteType: TenantPublicSiteType;
  consentSeeded: boolean;
  jobId: string;
  snapshotId: string;
};

export async function isForgeWebsiteClientCompany(companyId: string): Promise<boolean> {
  const supabase = createSupabaseServiceClient();

  const [portfolioResult, purchaseResult] = await Promise.all([
    supabase
      .from('forge_partner_portfolios')
      .select('id')
      .eq('company_id', companyId)
      .eq('deal_type', 'website_build')
      .limit(1),
    supabase
      .from('forge_product_purchases')
      .select('id, forge_product_catalog!inner(code)')
      .eq('company_id', companyId)
      .eq('forge_product_catalog.code', 'website_build')
      .limit(1),
  ]);

  if (portfolioResult.error && portfolioResult.error.code !== '42P01') {
    throw new Error(portfolioResult.error.message);
  }
  if (purchaseResult.error && purchaseResult.error.code !== '42P01') {
    throw new Error(purchaseResult.error.message);
  }

  return (portfolioResult.data?.length ?? 0) > 0 || (purchaseResult.data?.length ?? 0) > 0;
}

function listingFlagsForSiteType(siteType: TenantPublicSiteType): {
  listProducts: boolean;
  listBooking: boolean;
} {
  switch (siteType) {
    case 'menu':
      return { listProducts: true, listBooking: true };
    case 'security_marketing':
      return { listProducts: true, listBooking: true };
    case 'landing':
    default:
      return { listProducts: true, listBooking: false };
  }
}

/**
 * Seeds listing consent (when needed) and exports a fresh store snapshot for website clients.
 * Returns null when the company is not a Forge website-build client.
 */
export async function syncPearsListingOnWebsiteGoLive(input: {
  companyId: string;
  siteType: TenantPublicSiteType;
  requestedBy?: string | null;
}): Promise<PearsWebsiteGoLiveSyncResult | null> {
  const companyId = input.companyId.trim();
  if (!companyId) return null;

  const isWebsiteClient = await isForgeWebsiteClientCompany(companyId);
  if (!isWebsiteClient) return null;

  const actor = input.requestedBy?.trim() || FORGE_PEARS_AUTO_LISTING_ACTOR;
  const flags = listingFlagsForSiteType(input.siteType);

  await upsertSuperappListingConsent({
    companyId,
    optIn: true,
    listProducts: flags.listProducts,
    listBooking: flags.listBooking,
    consentedByEmail: actor,
  });

  const exportResult = await runSuperappStoreProfileExport({
    companyId,
    requestedBy: actor,
  });

  return {
    companyId,
    siteType: input.siteType,
    consentSeeded: true,
    jobId: exportResult.job.id,
    snapshotId: exportResult.snapshot.id,
  };
}
