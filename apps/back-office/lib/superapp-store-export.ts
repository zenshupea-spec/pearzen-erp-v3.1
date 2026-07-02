/**
 * Pears super-app store profile export — read-only snapshot builder + job runner.
 */

import { getCompanyLogoUrl } from '../../../packages/supabase/company-branding';
import { createSupabaseServiceClient } from '../../../packages/supabase/service';
import {
  isCompanySubscriptionStatus,
  subscriptionStatusFromFlags,
  type CompanySubscriptionStatus,
} from './company-subscription';
import { listTenantPublicSites } from './tenant-public-site-data';
import {
  mergeTenantLandingContent,
  type TenantLandingProduct,
} from './tenant-public-site-types';
import type { TenantPublicSiteType } from './tenant-public-site-types';
import {
  assertSuperappListingConsentForExport,
  fetchSuperappListingConsent,
  isSuperappListingActive,
  type SuperappListingConsent,
} from './superapp-listing-consent';

export const SUPERAPP_STORE_PROFILE_VERSION = 1;

export type SuperappPublicSiteExport = {
  siteType: TenantPublicSiteType | string;
  hostname: string | null;
  url: string | null;
  publishedAt: string | null;
};

export type SuperappShopProductExport = {
  id: string;
  name: string;
  description: string;
  priceLkr: number;
  imageUrl: string | null;
};

export type SuperappShopExport = {
  heroImageUrl: string | null;
  products: SuperappShopProductExport[];
};

export type SuperappStoreProfilePayload = {
  version: typeof SUPERAPP_STORE_PROFILE_VERSION;
  exportedAt: string;
  companyId: string;
  displayName: string;
  slug: string | null;
  logoUrl: string | null;
  subscriptionStatus: CompanySubscriptionStatus;
  verticalTags: string[];
  publicSites: SuperappPublicSiteExport[];
  shop: SuperappShopExport | null;
  owner: {
    fullName: string | null;
    email: string | null;
    pearsProfileId: string | null;
  };
  listings: {
    securityServices: boolean;
    hospitality: boolean;
    retail: boolean;
    salon: boolean;
  };
  listingConsent: {
    active: boolean;
    listProducts: boolean;
    listBooking: boolean;
    consentedAt: string | null;
  };
};

export type SuperappExportJobRecord = {
  id: string;
  companyId: string;
  companyName: string | null;
  jobType: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  snapshotId: string | null;
  errorMessage: string | null;
  requestedBy: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
};

export type SuperappStoreSnapshotRecord = {
  id: string;
  companyId: string;
  payload: SuperappStoreProfilePayload;
  payloadVersion: number;
  createdAt: string;
};

function resolvePearsOwnerProfileId(companyId: string): string | null {
  const raw = process.env.SUPERAPP_OWNER_PROFILE_BY_COMPANY?.trim();
  if (!raw) return null;
  try {
    const map = JSON.parse(raw) as Record<string, string>;
    return map[companyId]?.trim() || null;
  } catch {
    return null;
  }
}

function normalizeHostnameUrl(hostname: string | null | undefined): string | null {
  if (!hostname?.trim()) return null;
  const trimmed = hostname.trim();
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed;
  return `https://${trimmed.replace(/^\/\//, '')}`;
}

function fallbackSiteUrl(siteType: TenantPublicSiteType, companyId: string): string | null {
  if (siteType === 'security_marketing') {
    const host = process.env.NEXT_PUBLIC_SECURITY_WEBSITE_HOST?.trim();
    if (host) return normalizeHostnameUrl(host);
  }
  if (siteType === 'menu') {
    const menuUrl = process.env.NEXT_PUBLIC_CUSTOMER_MENU_URL?.trim();
    const menuCompanyId = process.env.NEXT_PUBLIC_CUSTOMER_MENU_COMPANY_ID?.trim();
    if (menuUrl && (!menuCompanyId || menuCompanyId === companyId)) {
      return menuUrl.startsWith('http') ? menuUrl : `https://${menuUrl}`;
    }
    const menuHost = process.env.NEXT_PUBLIC_CUSTOMER_MENU_HOST?.trim();
    if (menuHost && (!menuCompanyId || menuCompanyId === companyId)) {
      return normalizeHostnameUrl(menuHost);
    }
  }
  return null;
}

function mapExportJob(row: Record<string, unknown>, companyName?: string | null): SuperappExportJobRecord {
  return {
    id: String(row.id),
    companyId: String(row.company_id),
    companyName: companyName ?? null,
    jobType: String(row.job_type ?? 'store_profile'),
    status: String(row.status) as SuperappExportJobRecord['status'],
    snapshotId: row.snapshot_id != null ? String(row.snapshot_id) : null,
    errorMessage: row.error_message != null ? String(row.error_message) : null,
    requestedBy: row.requested_by != null ? String(row.requested_by) : null,
    startedAt: row.started_at != null ? String(row.started_at) : null,
    completedAt: row.completed_at != null ? String(row.completed_at) : null,
    createdAt: String(row.created_at ?? ''),
  };
}

export async function buildSuperappStoreProfilePayload(
  companyId: string,
): Promise<SuperappStoreProfilePayload> {
  const supabase = createSupabaseServiceClient();

  const { data: company, error: companyError } = await supabase
    .from('companies')
    .select('id, name, slug, subscription_status, is_active, is_suspended, has_cafe_module')
    .eq('id', companyId)
    .maybeSingle();

  if (companyError) throw new Error(companyError.message);
  if (!company) throw new Error('Company not found.');

  const rawStatus = String(company.subscription_status ?? '');
  const subscriptionStatus = isCompanySubscriptionStatus(rawStatus)
    ? rawStatus
    : subscriptionStatusFromFlags({
        isActive: company.is_active,
        isSuspended: company.is_suspended,
      });

  const [logoUrl, publicSites, verticalsResult, ownerResult] = await Promise.all([
    getCompanyLogoUrl(companyId),
    listTenantPublicSites(companyId),
    supabase
      .from('tenant_vertical_subscriptions')
      .select('vertical, status')
      .eq('company_id', companyId),
    supabase
      .from('employees')
      .select('full_name, email, rank')
      .eq('company_id', companyId)
      .eq('rank', 'MD')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle(),
  ]);

  const activeVerticals = new Set<string>();
  for (const row of verticalsResult.data ?? []) {
    if (String(row.status) === 'active') {
      activeVerticals.add(String(row.vertical));
    }
  }
  if (company.has_cafe_module) activeVerticals.add('restaurant');

  const verticalTags: string[] = [];
  const hasSecuritySite = publicSites.some(
    (site) => site.siteType === 'security_marketing' && site.publishedAt,
  );
  if (hasSecuritySite || publicSites.some((site) => site.siteType === 'security_marketing')) {
    verticalTags.push('security');
  }
  if (activeVerticals.has('restaurant') || company.has_cafe_module) {
    verticalTags.push('hospitality');
  }
  if (activeVerticals.has('retail')) verticalTags.push('retail');
  if (activeVerticals.has('salon')) verticalTags.push('salon');

  const publicSiteExports: SuperappPublicSiteExport[] = publicSites.map((site) => ({
    siteType: site.siteType,
    hostname: site.hostname,
    url: normalizeHostnameUrl(site.hostname) ?? fallbackSiteUrl(site.siteType, companyId),
    publishedAt: site.publishedAt,
  }));

  for (const siteType of ['security_marketing', 'menu'] as TenantPublicSiteType[]) {
    if (publicSiteExports.some((site) => site.siteType === siteType)) continue;
    const fallback = fallbackSiteUrl(siteType, companyId);
    if (fallback) {
      publicSiteExports.push({
        siteType,
        hostname: null,
        url: fallback,
        publishedAt: null,
      });
    }
  }

  const owner = ownerResult.data;
  const listingConsentRow = await fetchSuperappListingConsent(companyId);

  const landingSite = publicSites.find(
    (site) => site.siteType === 'landing' && site.publishedAt,
  );
  let shop: SuperappShopExport | null = null;
  if (landingSite) {
    const landingRow = publicSites.find((site) => site.siteType === 'landing');
    const landingContent = mergeTenantLandingContent(landingRow?.contentJson ?? null);
    const activeProducts: SuperappShopProductExport[] = landingContent.products
      .filter((product: TenantLandingProduct) => product.isActive)
      .map((product) => ({
        id: product.id,
        name: product.name,
        description: product.description,
        priceLkr: product.priceLkr,
        imageUrl: product.imageUrl,
      }));

    shop = {
      heroImageUrl: landingContent.heroImageUrl,
      products: activeProducts,
    };
  }

  return {
    version: SUPERAPP_STORE_PROFILE_VERSION,
    exportedAt: new Date().toISOString(),
    companyId,
    displayName: String(company.name ?? 'Tenant'),
    slug: company.slug != null ? String(company.slug) : null,
    logoUrl,
    subscriptionStatus,
    verticalTags,
    publicSites: publicSiteExports,
    shop,
    owner: {
      fullName: owner?.full_name != null ? String(owner.full_name) : null,
      email: owner?.email != null ? String(owner.email) : null,
      pearsProfileId: resolvePearsOwnerProfileId(companyId),
    },
    listings: {
      securityServices: verticalTags.includes('security'),
      hospitality: verticalTags.includes('hospitality'),
      retail: verticalTags.includes('retail'),
      salon: verticalTags.includes('salon'),
    },
    listingConsent: mapListingConsentBlock(listingConsentRow),
  };
}

function mapListingConsentBlock(consent: SuperappListingConsent | null) {
  return {
    active: isSuperappListingActive(consent),
    listProducts: Boolean(consent?.listProducts && consent.consentedAt),
    listBooking: Boolean(consent?.listBooking && consent.consentedAt),
    consentedAt: consent?.consentedAt ?? null,
  };
}

export async function fetchSuperappStoreSnapshotById(
  snapshotId: string,
): Promise<SuperappStoreSnapshotRecord | null> {
  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase
    .from('superapp_store_snapshots')
    .select('id, company_id, payload, payload_version, created_at')
    .eq('id', snapshotId)
    .maybeSingle();

  if (error) {
    if (error.code === '42P01') return null;
    throw new Error(error.message);
  }
  if (!data) return null;

  return {
    id: String(data.id),
    companyId: String(data.company_id),
    payload: data.payload as SuperappStoreProfilePayload,
    payloadVersion: Number(data.payload_version ?? 1),
    createdAt: String(data.created_at ?? ''),
  };
}

export async function fetchLatestSuperappStoreSnapshot(
  companyId: string,
): Promise<SuperappStoreSnapshotRecord | null> {
  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase
    .from('superapp_store_snapshots')
    .select('id, company_id, payload, payload_version, created_at')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    if (error.code === '42P01') return null;
    throw new Error(error.message);
  }
  if (!data) return null;

  return {
    id: String(data.id),
    companyId: String(data.company_id),
    payload: data.payload as SuperappStoreProfilePayload,
    payloadVersion: Number(data.payload_version ?? 1),
    createdAt: String(data.created_at ?? ''),
  };
}

export async function fetchSuperappExportJob(jobId: string): Promise<SuperappExportJobRecord | null> {
  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase
    .from('superapp_export_jobs')
    .select('*, companies(name)')
    .eq('id', jobId)
    .maybeSingle();

  if (error) {
    if (error.code === '42P01') return null;
    throw new Error(error.message);
  }
  if (!data) return null;

  const company = (data as Record<string, unknown>).companies as Record<string, unknown> | null;
  return mapExportJob(data as Record<string, unknown>, company?.name != null ? String(company.name) : null);
}

export async function listSuperappExportJobs(limit = 50): Promise<SuperappExportJobRecord[]> {
  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase
    .from('superapp_export_jobs')
    .select('*, companies(name)')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    if (error.code === '42P01') return [];
    throw new Error(error.message);
  }

  return (data ?? []).map((row) => {
    const company = (row as Record<string, unknown>).companies as Record<string, unknown> | null;
    return mapExportJob(row as Record<string, unknown>, company?.name != null ? String(company.name) : null);
  });
}

export async function runSuperappStoreProfileExport(input: {
  companyId: string;
  requestedBy?: string | null;
  existingJobId?: string | null;
  requireConsent?: boolean;
}): Promise<{
  job: SuperappExportJobRecord;
  snapshot: SuperappStoreSnapshotRecord;
}> {
  if (input.requireConsent !== false) {
    await assertSuperappListingConsentForExport(input.companyId);
  }

  const supabase = createSupabaseServiceClient();
  const now = new Date().toISOString();
  let jobId = input.existingJobId ?? null;

  if (!jobId) {
    const { data: jobRow, error: jobError } = await supabase
      .from('superapp_export_jobs')
      .insert({
        company_id: input.companyId,
        job_type: 'store_profile',
        status: 'pending',
        requested_by: input.requestedBy ?? null,
      })
      .select('id')
      .single();

    if (jobError) throw new Error(jobError.message);
    jobId = String(jobRow.id);
  }

  await supabase
    .from('superapp_export_jobs')
    .update({ status: 'running', started_at: now, error_message: null })
    .eq('id', jobId);

  try {
    const payload = await buildSuperappStoreProfilePayload(input.companyId);

    const { data: snapshotRow, error: snapshotError } = await supabase
      .from('superapp_store_snapshots')
      .insert({
        company_id: input.companyId,
        payload,
        payload_version: SUPERAPP_STORE_PROFILE_VERSION,
      })
      .select('id, company_id, payload, payload_version, created_at')
      .single();

    if (snapshotError) throw new Error(snapshotError.message);

    const completedAt = new Date().toISOString();
    await supabase
      .from('superapp_export_jobs')
      .update({
        status: 'completed',
        snapshot_id: snapshotRow.id,
        completed_at: completedAt,
      })
      .eq('id', jobId);

    const job = await fetchSuperappExportJob(jobId);
    if (!job) throw new Error('Export job not found after completion.');

    return {
      job,
      snapshot: {
        id: String(snapshotRow.id),
        companyId: String(snapshotRow.company_id),
        payload: snapshotRow.payload as SuperappStoreProfilePayload,
        payloadVersion: Number(snapshotRow.payload_version ?? 1),
        createdAt: String(snapshotRow.created_at ?? ''),
      },
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Export failed';
    await supabase
      .from('superapp_export_jobs')
      .update({
        status: 'failed',
        error_message: message,
        completed_at: new Date().toISOString(),
      })
      .eq('id', jobId);

    throw new Error(message);
  }
}

export async function listSuperappExportCompanies(): Promise<
  Array<{ id: string; name: string; slug: string | null; latestSnapshotAt: string | null }>
> {
  const supabase = createSupabaseServiceClient();
  const { data: companies, error } = await supabase
    .from('companies')
    .select('id, name, slug')
    .neq('name', 'HQ_MASTER_ACCOUNT')
    .order('name', { ascending: true });

  if (error) throw new Error(error.message);

  const rows = await Promise.all(
    (companies ?? []).map(async (company) => {
      const latest = await fetchLatestSuperappStoreSnapshot(String(company.id));
      return {
        id: String(company.id),
        name: String(company.name ?? 'Tenant'),
        slug: company.slug != null ? String(company.slug) : null,
        latestSnapshotAt: latest?.createdAt ?? null,
      };
    }),
  );

  return rows;
}
