'use server';

import { revalidatePath } from 'next/cache';

import { isForgeOperatorEmail } from '../../../../../lib/forge-access';
import { invalidateTenantCustomDomainCache } from '../../../../../lib/tenant-custom-domain-server';
import {
  isTenantCustomDomainType,
  isValidCustomDomainHostname,
  normalizeCustomDomainHostname,
  TENANT_CUSTOM_DOMAIN_TYPES,
  TENANT_DOMAIN_SSL_STATUSES,
  type TenantCustomDomainRow,
  type TenantCustomDomainType,
  type TenantDomainSslStatus,
} from '../../../../../lib/tenant-assist-setup';
import { createSupabaseServerClient } from '../../../../../../../packages/supabase/server';
import { createSupabaseServiceClient } from '../../../../../../../packages/supabase/service';

export type ForgeTenantDomainContext = {
  companyId: string;
  companyName: string;
  companySlug: string | null;
};

function mapDomainRow(row: Record<string, unknown>): TenantCustomDomainRow {
  return {
    id: String(row.id),
    companyId: String(row.company_id),
    hostname: String(row.hostname ?? ''),
    domainType: String(row.domain_type) as TenantCustomDomainType,
    verifiedAt: row.verified_at != null ? String(row.verified_at) : null,
    sslStatus: String(row.ssl_status ?? 'pending') as TenantDomainSslStatus,
    createdAt: String(row.created_at ?? ''),
  };
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

function revalidateDomainPaths(companyId: string, hostname?: string) {
  revalidatePath('/forge');
  revalidatePath('/forge/tenants');
  revalidatePath(`/forge/tenants/${companyId}/domains`);
  invalidateTenantCustomDomainCache(hostname);
}

export async function fetchForgeTenantDomainContext(companyId: string) {
  try {
    await assertForgeOperator();
    const scopedCompanyId = companyId?.trim();
    if (!scopedCompanyId) throw new Error('Missing company');

    const db = createSupabaseServiceClient();
    const [{ data: company, error: companyError }, { data: domains, error: domainError }] =
      await Promise.all([
        db.from('companies').select('id, name, slug').eq('id', scopedCompanyId).maybeSingle(),
        db
          .from('tenant_custom_domains')
          .select('*')
          .eq('company_id', scopedCompanyId)
          .order('hostname', { ascending: true }),
      ]);

    if (companyError) throw new Error(companyError.message);
    if (!company?.id) throw new Error('Company not found');
    if (domainError && domainError.code !== '42P01') throw new Error(domainError.message);

    return {
      success: true as const,
      context: {
        companyId: String(company.id),
        companyName: String(company.name ?? 'Tenant'),
        companySlug: company.slug != null ? String(company.slug) : null,
      } satisfies ForgeTenantDomainContext,
      domains: (domains ?? []).map((row) => mapDomainRow(row as Record<string, unknown>)),
      domainTypes: TENANT_CUSTOM_DOMAIN_TYPES,
      sslStatuses: TENANT_DOMAIN_SSL_STATUSES,
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load domains';
    return { success: false as const, error: message };
  }
}

export async function upsertForgeTenantDomain(input: {
  companyId: string;
  hostname: string;
  domainType: TenantCustomDomainType;
  domainId?: string | null;
}) {
  try {
    await assertForgeOperator();

    const hostname = normalizeCustomDomainHostname(input.hostname);
    if (!isValidCustomDomainHostname(hostname)) {
      throw new Error('Enter a valid hostname (e.g. classicventuresecurity.com)');
    }
    if (!isTenantCustomDomainType(input.domainType)) {
      throw new Error('Invalid domain type');
    }

    const db = createSupabaseServiceClient();
    const now = new Date().toISOString();

    if (input.domainId?.trim()) {
      const { error } = await db
        .from('tenant_custom_domains')
        .update({
          hostname,
          domain_type: input.domainType,
          updated_at: now,
        })
        .eq('id', input.domainId.trim())
        .eq('company_id', input.companyId);

      if (error) throw new Error(error.message);
    } else {
      const { error } = await db.from('tenant_custom_domains').insert({
        company_id: input.companyId,
        hostname,
        domain_type: input.domainType,
        ssl_status: 'pending',
        updated_at: now,
      });

      if (error) throw new Error(error.message);
    }

    revalidateDomainPaths(input.companyId, hostname);
    return { success: true as const };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to save domain';
    return { success: false as const, error: message };
  }
}

export async function updateForgeTenantDomainStatus(input: {
  companyId: string;
  domainId: string;
  sslStatus: TenantDomainSslStatus;
  markVerified?: boolean;
}) {
  try {
    await assertForgeOperator();

    const db = createSupabaseServiceClient();
    const now = new Date().toISOString();
    const patch: Record<string, unknown> = {
      ssl_status: input.sslStatus,
      updated_at: now,
    };

    if (input.markVerified || input.sslStatus === 'active') {
      patch.verified_at = now;
    }

    const { data, error } = await db
      .from('tenant_custom_domains')
      .update(patch)
      .eq('id', input.domainId.trim())
      .eq('company_id', input.companyId)
      .select('hostname')
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!data) throw new Error('Domain not found');

    revalidateDomainPaths(input.companyId, String(data.hostname));
    return { success: true as const };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to update domain status';
    return { success: false as const, error: message };
  }
}

export async function deleteForgeTenantDomain(input: { companyId: string; domainId: string }) {
  try {
    await assertForgeOperator();
    const db = createSupabaseServiceClient();

    const { data, error } = await db
      .from('tenant_custom_domains')
      .delete()
      .eq('id', input.domainId.trim())
      .eq('company_id', input.companyId)
      .select('hostname')
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!data) throw new Error('Domain not found');

    revalidateDomainPaths(input.companyId, String(data.hostname));
    return { success: true as const };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to remove domain';
    return { success: false as const, error: message };
  }
}
