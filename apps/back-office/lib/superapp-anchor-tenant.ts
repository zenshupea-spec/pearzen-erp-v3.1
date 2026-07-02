/**
 * Forge PEARS export anchor tenant — reads company from forge_settings.anchor_tenant_id.
 */

import { DEFAULT_SECURITY_WEBSITE_DOMAIN } from './security-website-host';
import { getForgeAnchorTenant, getForgeAnchorTenantId } from './forge-anchor-tenant-server';
import { buildSuperappInventoryPayload } from './superapp-inventory-export';
import { upsertSuperappListingConsent } from './superapp-listing-consent';
import {
  fetchLatestSuperappStoreSnapshot,
  runSuperappStoreProfileExport,
  type SuperappStoreProfilePayload,
} from './superapp-store-export';
import type { SuperappInventoryPayload } from './superapp-inventory-export';
import {
  DEFAULT_TENANT_MENU_CONTENT,
  mergeTenantMenuContent,
} from './tenant-public-site-types';
import { fetchTenantPublicSiteRow } from './tenant-public-site-data';
import { createSupabaseServiceClient } from '../../../packages/supabase/service';

export type SuperappAnchorReference = {
  companyId: string;
  tenantSlug: string;
  displayName: string;
  securityHostname: string;
  menuHostname: string;
};

export type SuperappPearsExportBundle = {
  seededAt: string;
  companyId: string;
  tenantSlug: string;
  pearsMapping: {
    erpTenant: string;
    securitySite: string;
    hospitalityMenu: string;
    internalErp: string;
  };
  consentSeeded: boolean;
  sitePatches: string[];
  jobId: string;
  snapshotId: string;
  storeProfile: SuperappStoreProfilePayload;
  inventory: SuperappInventoryPayload;
  apiPaths: {
    storeProfile: string;
    inventory: string;
    exportJob: string;
  };
};

function stripUrlHost(value: string): string {
  return value.replace(/^https?:\/\//, '').split('/')[0];
}

async function resolveSecurityHostname(companyId: string): Promise<string> {
  const row = await fetchTenantPublicSiteRow(companyId, 'security_marketing');
  if (row?.hostname) return row.hostname;

  const configured = process.env.NEXT_PUBLIC_SECURITY_WEBSITE_HOST?.trim();
  if (configured) return stripUrlHost(configured);
  return DEFAULT_SECURITY_WEBSITE_DOMAIN;
}

async function resolveMenuHostname(companyId: string): Promise<string> {
  const row = await fetchTenantPublicSiteRow(companyId, 'menu');
  if (row?.hostname) return row.hostname;

  const configured = process.env.NEXT_PUBLIC_CUSTOMER_MENU_HOST?.trim();
  if (configured) return stripUrlHost(configured);
  return 'menu.example.com';
}

function resolveMenuUrl(hostname: string): string {
  const configured = process.env.NEXT_PUBLIC_CUSTOMER_MENU_URL?.trim();
  if (configured) return configured.startsWith('http') ? configured : `https://${configured}`;
  return `https://${hostname}`;
}

async function patchPublicSiteHostname(
  companyId: string,
  siteType: 'security_marketing' | 'menu',
  hostname: string,
  menuTitle: string,
): Promise<'updated' | 'created' | 'unchanged'> {
  const supabase = createSupabaseServiceClient();
  const existing = await fetchTenantPublicSiteRow(companyId, siteType);
  const now = new Date().toISOString();

  if (existing) {
    if (existing.hostname === hostname) return 'unchanged';
    const { error } = await supabase
      .from('tenant_public_sites')
      .update({ hostname, updated_at: now })
      .eq('company_id', companyId)
      .eq('site_type', siteType);
    if (error) throw new Error(error.message);
    return 'updated';
  }

  const contentJson =
    siteType === 'menu'
      ? mergeTenantMenuContent({
          ...DEFAULT_TENANT_MENU_CONTENT,
          title: menuTitle,
          menuUrl: resolveMenuUrl(hostname),
        })
      : { seededBy: 'forge_superapp_anchor', note: 'Publish security marketing from tenant settings.' };

  const { error } = await supabase.from('tenant_public_sites').insert({
    company_id: companyId,
    site_type: siteType,
    hostname,
    content_json: contentJson,
    published_at: null,
    updated_at: now,
  });

  if (error) throw new Error(error.message);
  return 'created';
}

async function ensureAnchorPublicSiteHostnames(
  companyId: string,
  displayName: string,
): Promise<string[]> {
  const securityHost = await resolveSecurityHostname(companyId);
  const menuHost = await resolveMenuHostname(companyId);
  const notes: string[] = [];

  const securityResult = await patchPublicSiteHostname(
    companyId,
    'security_marketing',
    securityHost,
    displayName,
  );
  if (securityResult === 'updated') {
    notes.push(`Security marketing hostname → ${securityHost}`);
  } else if (securityResult === 'created') {
    notes.push(`Security marketing draft created (${securityHost})`);
  }

  const menuResult = await patchPublicSiteHostname(companyId, 'menu', menuHost, `${displayName} menu`);
  if (menuResult === 'updated') {
    notes.push(`Menu link hostname → ${menuHost}`);
  } else if (menuResult === 'created') {
    notes.push(`Menu link draft created (${menuHost})`);
  }

  return notes;
}

export async function getSuperappAnchorReference(): Promise<SuperappAnchorReference | null> {
  const tenant = await getForgeAnchorTenant();
  if (!tenant) return null;

  const [securityHostname, menuHostname] = await Promise.all([
    resolveSecurityHostname(tenant.id),
    resolveMenuHostname(tenant.id),
  ]);

  return {
    companyId: tenant.id,
    tenantSlug: tenant.slug ?? 'tenant',
    displayName: tenant.name,
    securityHostname,
    menuHostname,
  };
}

function buildApiPaths(companyId: string, jobId = '{jobId}'): SuperappPearsExportBundle['apiPaths'] {
  return {
    storeProfile: `/api/superapp/v1/store-profile/${companyId}`,
    inventory: `/api/superapp/v1/inventory/${companyId}`,
    exportJob: `/api/superapp/v1/export-jobs/${jobId}?companyId=${companyId}`,
  };
}

export async function buildAnchorPearsExportBundleFromLatest(): Promise<SuperappPearsExportBundle | null> {
  const anchorId = await getForgeAnchorTenantId();
  const tenant = await getForgeAnchorTenant();
  const snapshot = await fetchLatestSuperappStoreSnapshot(anchorId);
  if (!snapshot) return null;

  const inventory = await buildSuperappInventoryPayload({
    companyId: anchorId,
    requireConsent: false,
  });

  const securityHostname = await resolveSecurityHostname(anchorId);
  const menuHostname = await resolveMenuHostname(anchorId);

  return {
    seededAt: snapshot.payload.exportedAt,
    companyId: anchorId,
    tenantSlug: tenant?.slug ?? 'tenant',
    pearsMapping: {
      erpTenant: `Business account · slug ${tenant?.slug ?? 'tenant'}`,
      securitySite: securityHostname,
      hospitalityMenu: menuHostname,
      internalErp: 'Private — not listed on Pears',
    },
    consentSeeded: Boolean(snapshot.payload.listingConsent?.active),
    sitePatches: [],
    jobId: '',
    snapshotId: snapshot.id,
    storeProfile: snapshot.payload,
    inventory,
    apiPaths: buildApiPaths(anchorId),
  };
}

export async function seedAnchorPearsExportProfile(input: {
  operatorEmail: string;
}): Promise<SuperappPearsExportBundle> {
  const anchorId = await getForgeAnchorTenantId();
  const supabase = createSupabaseServiceClient();
  const { data: company, error: companyError } = await supabase
    .from('companies')
    .select('id, name, slug')
    .eq('id', anchorId)
    .maybeSingle();

  if (companyError) throw new Error(companyError.message);
  if (!company) {
    throw new Error(`Anchor tenant company row not found (${anchorId}).`);
  }

  const companyId = String(company.id);
  const tenantSlug = String(company.slug ?? 'tenant');
  const displayName = String(company.name ?? 'Tenant');

  await upsertSuperappListingConsent({
    companyId,
    optIn: true,
    listProducts: true,
    listBooking: true,
    consentedByEmail: input.operatorEmail,
  });

  const sitePatches = await ensureAnchorPublicSiteHostnames(companyId, displayName);

  const exportResult = await runSuperappStoreProfileExport({
    companyId,
    requestedBy: input.operatorEmail,
  });

  const inventory = await buildSuperappInventoryPayload({
    companyId,
    requireConsent: true,
  });

  const securityHostname = await resolveSecurityHostname(companyId);
  const menuHostname = await resolveMenuHostname(companyId);
  const seededAt = new Date().toISOString();

  return {
    seededAt,
    companyId,
    tenantSlug,
    pearsMapping: {
      erpTenant: `Business account · ${displayName}`,
      securitySite: securityHostname,
      hospitalityMenu: menuHostname,
      internalErp: 'Private — not listed on Pears',
    },
    consentSeeded: true,
    sitePatches,
    jobId: exportResult.job.id,
    snapshotId: exportResult.snapshot.id,
    storeProfile: exportResult.snapshot.payload,
    inventory,
    apiPaths: buildApiPaths(companyId, exportResult.job.id),
  };
}

export function anchorPearsBundleJson(bundle: SuperappPearsExportBundle): string {
  return JSON.stringify(bundle, null, 2);
}

export async function anchorSecurityHostnameForDisplay(): Promise<string> {
  const anchorId = await getForgeAnchorTenantId();
  const hostname = await resolveSecurityHostname(anchorId);
  return hostname || DEFAULT_SECURITY_WEBSITE_DOMAIN;
}
