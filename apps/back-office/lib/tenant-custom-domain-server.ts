import {
  normalizeCustomDomainHostname,
  type TenantCustomDomainType,
  type TenantDomainSslStatus,
} from './tenant-assist-setup';
import { createSupabaseServiceClient } from '../../../packages/supabase/service';

export type TenantCustomDomainBinding = {
  id: string;
  hostname: string;
  companyId: string;
  tenantSlug: string;
  domainType: TenantCustomDomainType;
  sslStatus: TenantDomainSslStatus;
  verifiedAt: string | null;
};

type CacheEntry = {
  expiresAt: number;
  binding: TenantCustomDomainBinding | null;
};

const CACHE_TTL_MS = 60_000;
const cache = new Map<string, CacheEntry>();

function cacheKey(hostname: string): string {
  return normalizeCustomDomainHostname(hostname);
}

export function invalidateTenantCustomDomainCache(hostname?: string | null) {
  if (!hostname?.trim()) {
    cache.clear();
    return;
  }
  cache.delete(cacheKey(hostname));
}

function mapBindingRow(row: Record<string, unknown>): TenantCustomDomainBinding | null {
  const nested = row.companies as Record<string, unknown> | null | undefined;
  const slug = nested?.slug != null ? String(nested.slug) : '';
  if (!slug) return null;

  return {
    id: String(row.id),
    hostname: String(row.hostname ?? ''),
    companyId: String(row.company_id),
    tenantSlug: slug,
    domainType: String(row.domain_type) as TenantCustomDomainType,
    sslStatus: String(row.ssl_status ?? 'pending') as TenantDomainSslStatus,
    verifiedAt: row.verified_at != null ? String(row.verified_at) : null,
  };
}

/** Resolve a custom hostname to tenant routing metadata (cached). */
export async function lookupTenantCustomDomain(
  hostname: string,
): Promise<TenantCustomDomainBinding | null> {
  const key = cacheKey(hostname);
  if (!key) return null;

  const hit = cache.get(key);
  if (hit && hit.expiresAt > Date.now()) {
    return hit.binding;
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
    return null;
  }

  try {
    const supabase = createSupabaseServiceClient();
    const { data, error } = await supabase
      .from('tenant_custom_domains')
      .select('id, company_id, hostname, domain_type, verified_at, ssl_status, companies(slug)')
      .eq('hostname', key)
      .maybeSingle();

    if (error && error.code !== '42P01') {
      console.error('lookupTenantCustomDomain:', error.message);
      return null;
    }

    const binding = data ? mapBindingRow(data as Record<string, unknown>) : null;
    cache.set(key, { binding, expiresAt: Date.now() + CACHE_TTL_MS });
    return binding;
  } catch (error: unknown) {
    console.error(
      'lookupTenantCustomDomain:',
      error instanceof Error ? error.message : error,
    );
    return null;
  }
}

export function customDomainRoutesTraffic(binding: TenantCustomDomainBinding): boolean {
  return binding.sslStatus === 'active';
}
