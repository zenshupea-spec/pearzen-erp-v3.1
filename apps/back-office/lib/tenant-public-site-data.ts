import 'server-only';

import {
  loadSettingEnvelope,
  MD_SETTINGS_ENVELOPE_KEYS,
} from '../../../packages/supabase/md-settings-envelope';
import { mergeSecurityWebsiteContent } from './security-website-types';
import {
  mergeTenantLandingContent,
  mergeTenantMenuContent,
  type TenantLandingWebsiteContent,
  type TenantMenuWebsiteContent,
  type TenantPublicSiteRecord,
  type TenantPublicSiteType,
} from './tenant-public-site-types';
import { createSupabaseServiceClient } from '../../../packages/supabase/service';
import { syncPearsListingOnWebsiteGoLive } from './superapp-website-go-live';

function mapSiteRow(row: Record<string, unknown>): TenantPublicSiteRecord {
  return {
    id: String(row.id),
    companyId: String(row.company_id),
    siteType: String(row.site_type) as TenantPublicSiteType,
    hostname: row.hostname != null ? String(row.hostname) : null,
    contentJson:
      row.content_json && typeof row.content_json === 'object'
        ? (row.content_json as Record<string, unknown>)
        : {},
    publishedAt: row.published_at != null ? String(row.published_at) : null,
    updatedAt: String(row.updated_at ?? ''),
  };
}

export async function fetchTenantPublicSiteRow(
  companyId: string,
  siteType: TenantPublicSiteType,
): Promise<TenantPublicSiteRecord | null> {
  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase
    .from('tenant_public_sites')
    .select('*')
    .eq('company_id', companyId)
    .eq('site_type', siteType)
    .maybeSingle();

  if (error && error.code !== '42P01') {
    throw new Error(error.message);
  }

  return data ? mapSiteRow(data as Record<string, unknown>) : null;
}

export async function fetchPublishedTenantPublicSiteJson(
  companyId: string,
  siteType: TenantPublicSiteType,
): Promise<Record<string, unknown> | null> {
  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase.rpc('get_tenant_public_website', {
    p_company_id: companyId,
    p_site_type: siteType,
  });

  if (error && error.code !== '42883' && error.code !== '42P01') {
    console.error('fetchPublishedTenantPublicSiteJson:', error.message);
    return null;
  }

  if (!data || typeof data !== 'object' || Object.keys(data as object).length === 0) {
    return null;
  }

  return data as Record<string, unknown>;
}

export async function listTenantPublicSites(companyId: string): Promise<TenantPublicSiteRecord[]> {
  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase
    .from('tenant_public_sites')
    .select('*')
    .eq('company_id', companyId)
    .order('site_type', { ascending: true });

  if (error && error.code !== '42P01') throw new Error(error.message);
  return (data ?? []).map((row) => mapSiteRow(row as Record<string, unknown>));
}

export async function upsertTenantPublicSiteDraft(input: {
  companyId: string;
  siteType: TenantPublicSiteType;
  hostname?: string | null;
  contentJson: Record<string, unknown>;
  publish?: boolean;
  publishedByEmail?: string | null;
}): Promise<TenantPublicSiteRecord> {
  const supabase = createSupabaseServiceClient();
  const now = new Date().toISOString();

  const existing = await fetchTenantPublicSiteRow(input.companyId, input.siteType);
  const publishedAt = input.publish ? now : (existing?.publishedAt ?? null);

  const { data, error } = await supabase
    .from('tenant_public_sites')
    .upsert(
      {
        company_id: input.companyId,
        site_type: input.siteType,
        hostname: input.hostname?.trim() || null,
        content_json: input.contentJson,
        published_at: publishedAt,
        updated_at: now,
      },
      { onConflict: 'company_id,site_type' },
    )
    .select('*')
    .single();

  if (error) throw new Error(error.message);
  const site = mapSiteRow(data as Record<string, unknown>);

  if (input.publish && site.publishedAt) {
    try {
      await syncPearsListingOnWebsiteGoLive({
        companyId: input.companyId,
        siteType: input.siteType,
        requestedBy: input.publishedByEmail,
      });
    } catch (syncError: unknown) {
      console.error(
        'syncPearsListingOnWebsiteGoLive:',
        syncError instanceof Error ? syncError.message : syncError,
      );
    }
  }

  return site;
}

export async function unpublishTenantPublicSite(
  companyId: string,
  siteType: TenantPublicSiteType,
): Promise<void> {
  const supabase = createSupabaseServiceClient();
  const { error } = await supabase
    .from('tenant_public_sites')
    .update({ published_at: null, updated_at: new Date().toISOString() })
    .eq('company_id', companyId)
    .eq('site_type', siteType);

  if (error) throw new Error(error.message);
}

export async function buildSecurityMarketingPublishPayload(
  companyId: string,
): Promise<Record<string, unknown>> {
  const supabase = createSupabaseServiceClient();
  const envelope = await loadSettingEnvelope(supabase, companyId);
  const content = mergeSecurityWebsiteContent(
    envelope[MD_SETTINGS_ENVELOPE_KEYS.securityWebsite] ?? null,
  );
  return content as unknown as Record<string, unknown>;
}

export async function fetchTenantLandingContentForCompany(
  companyId: string,
): Promise<TenantLandingWebsiteContent> {
  const published = await fetchPublishedTenantPublicSiteJson(companyId, 'landing');
  if (published) return mergeTenantLandingContent(published);

  const draft = await fetchTenantPublicSiteRow(companyId, 'landing');
  if (draft?.contentJson) return mergeTenantLandingContent(draft.contentJson);

  return mergeTenantLandingContent(null);
}

export async function fetchTenantMenuContentForCompany(
  companyId: string,
): Promise<TenantMenuWebsiteContent> {
  const published = await fetchPublishedTenantPublicSiteJson(companyId, 'menu');
  if (published) return mergeTenantMenuContent(published);

  const draft = await fetchTenantPublicSiteRow(companyId, 'menu');
  if (draft?.contentJson) return mergeTenantMenuContent(draft.contentJson);

  return mergeTenantMenuContent(null);
}
