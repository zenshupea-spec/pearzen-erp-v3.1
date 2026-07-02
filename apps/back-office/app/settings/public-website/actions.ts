'use server';

import { revalidatePath } from 'next/cache';

import { resolveCompanyIdForSession } from '../../../lib/company-context-server';
import { fetchBackOfficeUserProfile } from '../../../lib/hr-portal-access-server';
import { isExecutiveRank } from '../../../lib/portal-role-utils';
import {
  buildSecurityMarketingPublishPayload,
  fetchTenantPublicSiteRow,
  listTenantPublicSites,
  unpublishTenantPublicSite,
  upsertTenantPublicSiteDraft,
} from '../../../lib/tenant-public-site-data';
import {
  mergeTenantLandingContent,
  mergeTenantMenuContent,
  TENANT_PUBLIC_SITE_TYPES,
  tenantPublicSiteTypeLabel,
  type TenantLandingWebsiteContent,
  type TenantMenuWebsiteContent,
  type TenantPublicSiteType,
} from '../../../lib/tenant-public-site-types';
import { normalizeCustomDomainHostname } from '../../../lib/tenant-assist-setup';
import { createSupabaseServerClient } from '../../../../../packages/supabase/server';

export type PublicWebsiteEditorSite = {
  siteType: TenantPublicSiteType;
  label: string;
  hostname: string | null;
  publishedAt: string | null;
  isPublished: boolean;
};

async function requireWebsiteEditor() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    throw new Error('Please sign in again.');
  }

  const profile = await fetchBackOfficeUserProfile(supabase, user);
  if (!isExecutiveRank(profile.role)) {
    throw new Error('Only MD, OD, FM, or EA can manage public websites.');
  }

  const companyId = await resolveCompanyIdForSession(supabase);
  if (!companyId) throw new Error('Tenant company not resolved for this session.');

  return { companyId, profile, actorEmail: user.email ?? profile.email ?? null };
}

function revalidatePublicWebsitePaths() {
  revalidatePath('/settings/public-website');
  revalidatePath('/public-website');
  revalidatePath('/security-website', 'layout');
  revalidatePath('/dashboard');
}

export async function fetchPublicWebsiteEditorData() {
  try {
    const { companyId } = await requireWebsiteEditor();
    const sites = await listTenantPublicSites(companyId);

    const siteByType = new Map(sites.map((site) => [site.siteType, site]));
    const registry: PublicWebsiteEditorSite[] = TENANT_PUBLIC_SITE_TYPES.map((siteType) => {
      const row = siteByType.get(siteType);
      return {
        siteType,
        label: tenantPublicSiteTypeLabel(siteType),
        hostname: row?.hostname ?? null,
        publishedAt: row?.publishedAt ?? null,
        isPublished: Boolean(row?.publishedAt),
      };
    });

    const landingRow = siteByType.get('landing');
    const menuRow = siteByType.get('menu');

    return {
      success: true as const,
      companyId,
      registry,
      landing: mergeTenantLandingContent(landingRow?.contentJson ?? null),
      menu: mergeTenantMenuContent(menuRow?.contentJson ?? null),
      landingHostname: landingRow?.hostname ?? '',
      menuHostname: menuRow?.hostname ?? '',
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load public website settings';
    return { success: false as const, error: message };
  }
}

export async function saveTenantLandingWebsiteDraft(input: {
  content: TenantLandingWebsiteContent;
  hostname?: string;
}) {
  try {
    const { companyId } = await requireWebsiteEditor();
    const content = mergeTenantLandingContent(input.content);
    const hostname = input.hostname?.trim()
      ? normalizeCustomDomainHostname(input.hostname)
      : null;

    await upsertTenantPublicSiteDraft({
      companyId,
      siteType: 'landing',
      hostname,
      contentJson: content,
      publish: false,
    });

    revalidatePublicWebsitePaths();
    return { success: true as const };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to save landing draft';
    return { success: false as const, error: message };
  }
}

export async function publishTenantLandingWebsite(input: {
  content: TenantLandingWebsiteContent;
  hostname?: string;
}) {
  try {
    const { companyId, actorEmail } = await requireWebsiteEditor();
    const content = mergeTenantLandingContent(input.content);
    const hostname = input.hostname?.trim()
      ? normalizeCustomDomainHostname(input.hostname)
      : null;

    await upsertTenantPublicSiteDraft({
      companyId,
      siteType: 'landing',
      hostname,
      contentJson: content,
      publish: true,
      publishedByEmail: actorEmail,
    });

    revalidatePublicWebsitePaths();
    return { success: true as const };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to publish landing page';
    return { success: false as const, error: message };
  }
}

export async function saveTenantMenuWebsiteDraft(input: {
  content: TenantMenuWebsiteContent;
  hostname?: string;
}) {
  try {
    const { companyId } = await requireWebsiteEditor();
    const content = mergeTenantMenuContent(input.content);
    const hostname = input.hostname?.trim()
      ? normalizeCustomDomainHostname(input.hostname)
      : null;

    await upsertTenantPublicSiteDraft({
      companyId,
      siteType: 'menu',
      hostname,
      contentJson: content,
      publish: false,
    });

    revalidatePublicWebsitePaths();
    return { success: true as const };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to save menu settings';
    return { success: false as const, error: message };
  }
}

export async function publishTenantMenuWebsite(input: {
  content: TenantMenuWebsiteContent;
  hostname?: string;
}) {
  try {
    const { companyId, actorEmail } = await requireWebsiteEditor();
    const content = mergeTenantMenuContent(input.content);
    const hostname = input.hostname?.trim()
      ? normalizeCustomDomainHostname(input.hostname)
      : null;

    await upsertTenantPublicSiteDraft({
      companyId,
      siteType: 'menu',
      hostname,
      contentJson: content,
      publish: true,
      publishedByEmail: actorEmail,
    });

    revalidatePublicWebsitePaths();
    return { success: true as const };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to publish menu link';
    return { success: false as const, error: message };
  }
}

export async function publishSecurityMarketingWebsite(hostname?: string) {
  try {
    const { companyId, actorEmail } = await requireWebsiteEditor();
    const payload = await buildSecurityMarketingPublishPayload(companyId);
    const normalizedHost = hostname?.trim()
      ? normalizeCustomDomainHostname(hostname)
      : null;

    await upsertTenantPublicSiteDraft({
      companyId,
      siteType: 'security_marketing',
      hostname: normalizedHost,
      contentJson: payload,
      publish: true,
      publishedByEmail: actorEmail,
    });

    revalidatePublicWebsitePaths();
    return { success: true as const };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to publish security site';
    return { success: false as const, error: message };
  }
}

export async function unpublishTenantPublicWebsite(siteType: TenantPublicSiteType) {
  try {
    const { companyId } = await requireWebsiteEditor();
    await unpublishTenantPublicSite(companyId, siteType);
    revalidatePublicWebsitePaths();
    return { success: true as const };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to unpublish site';
    return { success: false as const, error: message };
  }
}

export async function fetchSecuritySitePublishStatus() {
  try {
    const { companyId } = await requireWebsiteEditor();
    const row = await fetchTenantPublicSiteRow(companyId, 'security_marketing');
    return {
      success: true as const,
      isPublished: Boolean(row?.publishedAt),
      publishedAt: row?.publishedAt ?? null,
      hostname: row?.hostname ?? null,
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load security publish status';
    return { success: false as const, error: message, isPublished: false, publishedAt: null, hostname: null };
  }
}
