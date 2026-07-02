'use server';

import { revalidatePath } from 'next/cache';

import { syncPearsListingOnWebsiteGoLive } from '../../../lib/superapp-website-go-live';
import {
  listPearsWebsiteClientAccess,
  requirePearsWebsiteClientSession,
} from '../../../lib/pears-website-client-auth';
import {
  fetchTenantPublicSiteRow,
  upsertTenantPublicSiteDraft,
} from '../../../lib/tenant-public-site-data';
import {
  mergeTenantLandingContent,
  type TenantLandingProduct,
  type TenantLandingWebsiteContent,
} from '../../../lib/tenant-public-site-types';
import { formatLkr } from '../../../lib/saas-billing';

export type PearsProfileDashboard = {
  companyId: string;
  companyName: string;
  companySlug: string | null;
  accessRole: 'buyer' | 'executive';
  isPublished: boolean;
  publishedAt: string | null;
  shop: TenantLandingWebsiteContent;
  activeProductCount: number;
};

export async function fetchPearsProfileDashboard(companyId?: string) {
  try {
    const session = await requirePearsWebsiteClientSession(companyId);
    const { access, accessList } = session;

    const site = await fetchTenantPublicSiteRow(access.companyId, 'landing');
    const shop = mergeTenantLandingContent(site?.contentJson ?? null);

    return {
      success: true as const,
      dashboard: {
        companyId: access.companyId,
        companyName: access.companyName,
        companySlug: access.companySlug,
        accessRole: access.accessRole,
        isPublished: Boolean(site?.publishedAt),
        publishedAt: site?.publishedAt ?? null,
        shop,
        activeProductCount: shop.products.filter((product) => product.isActive).length,
      } satisfies PearsProfileDashboard,
      shops: accessList,
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load PEARS profile';
    return {
      success: false as const,
      error: message,
      dashboard: null,
      shops: [] as Awaited<ReturnType<typeof listPearsWebsiteClientAccess>>,
    };
  }
}

export async function savePearsShopDraft(input: {
  companyId: string;
  shop: TenantLandingWebsiteContent;
}) {
  try {
    const session = await requirePearsWebsiteClientSession(input.companyId);
    const shop = mergeTenantLandingContent(input.shop);
    const existing = await fetchTenantPublicSiteRow(session.access.companyId, 'landing');

    await upsertTenantPublicSiteDraft({
      companyId: session.access.companyId,
      siteType: 'landing',
      hostname: existing?.hostname ?? null,
      contentJson: shop,
      publish: false,
    });

    revalidatePath('/pears/profile');
    revalidatePath('/public-website');

    return { success: true as const };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to save shop draft';
    return { success: false as const, error: message };
  }
}

export async function publishPearsShop(input: {
  companyId: string;
  shop: TenantLandingWebsiteContent;
}) {
  try {
    const session = await requirePearsWebsiteClientSession(input.companyId);
    const shop = mergeTenantLandingContent(input.shop);
    const existing = await fetchTenantPublicSiteRow(session.access.companyId, 'landing');

    await upsertTenantPublicSiteDraft({
      companyId: session.access.companyId,
      siteType: 'landing',
      hostname: existing?.hostname ?? null,
      contentJson: shop,
      publish: true,
      publishedByEmail: session.email,
    });

    revalidatePath('/pears/profile');
    revalidatePath('/public-website');
    revalidatePath('/forge/clients');
    revalidatePath('/forge/superapp/exports');

    return { success: true as const };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to publish shop';
    return { success: false as const, error: message };
  }
}

export async function listPearsAccessibleShops() {
  try {
    const session = await requirePearsWebsiteClientSession();
    return { success: true as const, shops: session.accessList };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to list shops';
    return { success: false as const, error: message, shops: [] };
  }
}

export { formatLkr, type TenantLandingProduct };
