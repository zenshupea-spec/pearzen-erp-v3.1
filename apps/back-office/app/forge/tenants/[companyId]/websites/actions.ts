'use server';

import { revalidatePath } from 'next/cache';

import { isForgeOperatorEmail } from '../../../../../lib/forge-access';
import {
  listTenantPublicSites,
  unpublishTenantPublicSite,
  upsertTenantPublicSiteDraft,
} from '../../../../../lib/tenant-public-site-data';
import {
  TENANT_PUBLIC_SITE_TYPES,
  tenantPublicSiteTypeLabel,
  type TenantPublicSiteType,
} from '../../../../../lib/tenant-public-site-types';
import { createSupabaseServerClient } from '../../../../../../../packages/supabase/server';
import { createSupabaseServiceClient } from '../../../../../../../packages/supabase/service';

export type ForgeTenantWebsiteRow = {
  siteType: TenantPublicSiteType;
  label: string;
  hostname: string | null;
  publishedAt: string | null;
  isPublished: boolean;
  updatedAt: string | null;
};

async function assertForgeOperator() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email || !(await isForgeOperatorEmail(user.email))) {
    throw new Error('Forge operator access required');
  }
}

export async function fetchForgeTenantWebsites(companyId: string) {
  try {
    await assertForgeOperator();
    const scopedCompanyId = companyId?.trim();
    if (!scopedCompanyId) throw new Error('Missing company');

    const db = createSupabaseServiceClient();
    const [{ data: company, error: companyError }, sites] = await Promise.all([
      db.from('companies').select('id, name, slug').eq('id', scopedCompanyId).maybeSingle(),
      listTenantPublicSites(scopedCompanyId),
    ]);

    if (companyError) throw new Error(companyError.message);
    if (!company?.id) throw new Error('Company not found');

    const siteByType = new Map(sites.map((site) => [site.siteType, site]));
    const rows: ForgeTenantWebsiteRow[] = TENANT_PUBLIC_SITE_TYPES.map((siteType) => {
      const row = siteByType.get(siteType);
      return {
        siteType,
        label: tenantPublicSiteTypeLabel(siteType),
        hostname: row?.hostname ?? null,
        publishedAt: row?.publishedAt ?? null,
        isPublished: Boolean(row?.publishedAt),
        updatedAt: row?.updatedAt ?? null,
      };
    });

    return {
      success: true as const,
      companyName: String(company.name ?? 'Tenant'),
      companySlug: company.slug != null ? String(company.slug) : null,
      rows,
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load tenant websites';
    return { success: false as const, error: message, rows: [], companyName: '', companySlug: null };
  }
}

export async function forgeUnpublishTenantWebsite(companyId: string, siteType: TenantPublicSiteType) {
  try {
    await assertForgeOperator();
    await unpublishTenantPublicSite(companyId.trim(), siteType);
    revalidatePath(`/forge/tenants/${companyId.trim()}/websites`);
    revalidatePath('/settings/public-website');
    revalidatePath('/public-website');
    revalidatePath('/security-website', 'layout');
    return { success: true as const };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to unpublish';
    return { success: false as const, error: message };
  }
}

export async function forgeSetTenantWebsiteHostname(input: {
  companyId: string;
  siteType: TenantPublicSiteType;
  hostname: string | null;
}) {
  try {
    await assertForgeOperator();
    const existing = await listTenantPublicSites(input.companyId.trim());
    const row = existing.find((site) => site.siteType === input.siteType);

    await upsertTenantPublicSiteDraft({
      companyId: input.companyId.trim(),
      siteType: input.siteType,
      hostname: input.hostname,
      contentJson: row?.contentJson ?? {},
      publish: Boolean(row?.publishedAt),
    });

    revalidatePath(`/forge/tenants/${input.companyId.trim()}/websites`);
    return { success: true as const };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to update hostname';
    return { success: false as const, error: message };
  }
}
