'use server';

import { revalidatePath } from 'next/cache';

import { invalidateTenantCustomDomainCache } from '../../../../../lib/tenant-custom-domain-server';

import { encrypt } from '../../../../../lib/encryption';
import {
  assertPartnerDomainAssist,
  assertPartnerPayhereAssist,
  assertPartnerPortfolioLink,
  fetchCompanyName,
  fetchPartnerAssistGrantForCompany,
} from '../../../../../lib/partner-assist-server';
import { getPartnerScopedServerClient, partnerServiceClient } from '../../../../../lib/partner-portal-session';
import {
  assistGrantAllowsDomainSetup,
  assistGrantAllowsPayhereSetup,
  isTenantCustomDomainType,
  isValidCustomDomainHostname,
  maskMerchantId,
  normalizeCustomDomainHostname,
  TENANT_CUSTOM_DOMAIN_TYPES,
  type TenantCustomDomainRow,
  type TenantCustomDomainType,
  type TenantPayhereCredentialStatus,
} from '../../../../../lib/tenant-assist-setup';

function revalidatePartnerSetupPaths(companyId: string) {
  revalidatePath('/partners');
  revalidatePath('/partners/portfolio');
  revalidatePath(`/partners/portfolio/${companyId}`);
  revalidatePath(`/partners/clients/${companyId}/setup`);
}

function mapDomainRow(row: Record<string, unknown>): TenantCustomDomainRow {
  return {
    id: String(row.id),
    companyId: String(row.company_id),
    hostname: String(row.hostname ?? ''),
    domainType: String(row.domain_type) as TenantCustomDomainType,
    verifiedAt: row.verified_at != null ? String(row.verified_at) : null,
    sslStatus: String(row.ssl_status ?? 'pending') as TenantCustomDomainRow['sslStatus'],
    createdAt: String(row.created_at ?? ''),
  };
}

export async function fetchPartnerClientSetup(companyId: string) {
  try {
    const { partner } = await assertPartnerPortfolioLink(companyId);
    const grant = await fetchPartnerAssistGrantForCompany(companyId);
    const companyName = await fetchCompanyName(companyId);

    const { supabase } = await getPartnerScopedServerClient();
    const { data: domainRows, error: domainError } = await supabase
      .from('tenant_custom_domains')
      .select('*')
      .eq('company_id', companyId)
      .order('hostname', { ascending: true });

    if (domainError && domainError.code !== '42P01') throw new Error(domainError.message);

    let payhereStatus: TenantPayhereCredentialStatus = {
      configured: false,
      merchantIdMasked: null,
      sandbox: true,
      configuredAt: null,
    };

    if (assistGrantAllowsPayhereSetup(grant)) {
      const db = partnerServiceClient();
      const { data: payhereRow, error: payhereError } = await db
        .from('tenant_payhere_credentials')
        .select('merchant_id, sandbox, configured_at')
        .eq('company_id', companyId)
        .maybeSingle();

      if (payhereError && payhereError.code !== '42P01') throw new Error(payhereError.message);

      if (payhereRow?.merchant_id) {
        payhereStatus = {
          configured: true,
          merchantIdMasked: maskMerchantId(String(payhereRow.merchant_id)),
          sandbox: Boolean(payhereRow.sandbox),
          configuredAt:
            payhereRow.configured_at != null ? String(payhereRow.configured_at) : null,
        };
      }
    }

    return {
      success: true as const,
      companyId,
      companyName,
      partnerName: partner.displayName,
      grant,
      domainSetupEnabled: assistGrantAllowsDomainSetup(grant),
      payhereSetupEnabled: assistGrantAllowsPayhereSetup(grant),
      domains: (domainRows ?? []).map((row) => mapDomainRow(row as Record<string, unknown>)),
      domainTypes: TENANT_CUSTOM_DOMAIN_TYPES,
      payhereStatus,
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load client setup';
    return { success: false as const, error: message };
  }
}

export async function upsertPartnerClientDomain(input: {
  companyId: string;
  hostname: string;
  domainType: TenantCustomDomainType;
  domainId?: string | null;
}) {
  try {
    await assertPartnerDomainAssist(input.companyId);

    const hostname = normalizeCustomDomainHostname(input.hostname);
    if (!isValidCustomDomainHostname(hostname)) {
      throw new Error('Enter a valid hostname (e.g. menu.client.lk)');
    }
    if (!isTenantCustomDomainType(input.domainType)) {
      throw new Error('Invalid domain type');
    }

    const { supabase } = await getPartnerScopedServerClient();
    const now = new Date().toISOString();

    if (input.domainId?.trim()) {
      const { error } = await supabase
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
      const { error } = await supabase.from('tenant_custom_domains').insert({
        company_id: input.companyId,
        hostname,
        domain_type: input.domainType,
        ssl_status: 'pending',
        updated_at: now,
      });

      if (error) throw new Error(error.message);
    }

    revalidatePartnerSetupPaths(input.companyId);
    invalidateTenantCustomDomainCache(hostname);
    return { success: true as const };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to save domain';
    return { success: false as const, error: message };
  }
}

export async function deletePartnerClientDomain(input: {
  companyId: string;
  domainId: string;
}) {
  try {
    await assertPartnerDomainAssist(input.companyId);

    const { supabase } = await getPartnerScopedServerClient();
    const { data, error } = await supabase
      .from('tenant_custom_domains')
      .delete()
      .eq('id', input.domainId.trim())
      .eq('company_id', input.companyId)
      .select('hostname')
      .maybeSingle();

    if (error) throw new Error(error.message);

    if (data?.hostname) {
      invalidateTenantCustomDomainCache(String(data.hostname));
    }

    revalidatePartnerSetupPaths(input.companyId);
    return { success: true as const };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to remove domain';
    return { success: false as const, error: message };
  }
}

export async function savePartnerClientPayhereCredentials(input: {
  companyId: string;
  merchantId: string;
  merchantSecret: string;
  sandbox?: boolean;
}) {
  try {
    const { partner } = await assertPartnerPayhereAssist(input.companyId);

    const merchantId = input.merchantId?.trim();
    const merchantSecret = input.merchantSecret?.trim();
    if (!merchantId) throw new Error('Merchant ID is required');
    if (!merchantSecret) throw new Error('Merchant secret is required');

    const encryptedSecret = encrypt(merchantSecret);
    if (!encryptedSecret || encryptedSecret === merchantSecret) {
      throw new Error('ENCRYPTION_KEY must be configured to store PayHere credentials');
    }

    const db = partnerServiceClient();
    const now = new Date().toISOString();
    const { error } = await db.from('tenant_payhere_credentials').upsert(
      {
        company_id: input.companyId,
        merchant_id: merchantId,
        merchant_secret_encrypted: encryptedSecret,
        sandbox: input.sandbox !== false,
        configured_at: now,
        updated_at: now,
        updated_by_partner_id: partner.id,
      },
      { onConflict: 'company_id' },
    );

    if (error) throw new Error(error.message);

    revalidatePartnerSetupPaths(input.companyId);
    return { success: true as const };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to save PayHere credentials';
    return { success: false as const, error: message };
  }
}
