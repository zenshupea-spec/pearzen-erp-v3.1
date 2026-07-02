import 'server-only';

import {
  assistGrantAllowsDomainSetup,
  assistGrantAllowsPayhereSetup,
  type PartnerAssistGrant,
} from './tenant-assist-setup';
import {
  getPartnerScopedServerClient,
  partnerServiceClient,
} from './partner-portal-session';

function mapAssistGrantRow(row: Record<string, unknown>): PartnerAssistGrant {
  return {
    id: String(row.id),
    partnerId: String(row.partner_id),
    companyId: String(row.company_id),
    domainSetup: Boolean(row.domain_setup),
    payhereSetup: Boolean(row.payhere_setup),
    grantedBy: row.granted_by != null ? String(row.granted_by) : null,
    expiresAt: row.expires_at != null ? String(row.expires_at) : null,
  };
}

export async function assertPartnerPortfolioLink(companyId: string) {
  const { supabase, partner } = await getPartnerScopedServerClient();
  const scopedCompanyId = companyId?.trim();
  if (!scopedCompanyId) throw new Error('Missing company');

  const { data, error } = await supabase
    .from('forge_partner_portfolios')
    .select('id')
    .eq('partner_id', partner.id)
    .eq('company_id', scopedCompanyId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data?.id) throw new Error('Portfolio link required for this tenant');

  return { partner, companyId: scopedCompanyId };
}

export async function fetchPartnerAssistGrantForCompany(companyId: string) {
  const { supabase, partner } = await assertPartnerPortfolioLink(companyId);

  const { data, error } = await supabase
    .from('forge_partner_assist_grants')
    .select('*')
    .eq('partner_id', partner.id)
    .eq('company_id', companyId)
    .maybeSingle();

  if (error && error.code !== '42P01') throw new Error(error.message);

  return data ? mapAssistGrantRow(data as Record<string, unknown>) : null;
}

export async function assertPartnerDomainAssist(companyId: string) {
  const { partner } = await assertPartnerPortfolioLink(companyId);
  const grant = await fetchPartnerAssistGrantForCompany(companyId);

  if (!assistGrantAllowsDomainSetup(grant)) {
    throw new Error('Domain setup assist is not enabled for this client');
  }

  return { partner, companyId, grant };
}

export async function assertPartnerPayhereAssist(companyId: string) {
  const { partner } = await assertPartnerPortfolioLink(companyId);
  const grant = await fetchPartnerAssistGrantForCompany(companyId);

  if (!assistGrantAllowsPayhereSetup(grant)) {
    throw new Error('PayHere setup assist is not enabled for this client');
  }

  return { partner, companyId, grant };
}

export async function fetchCompanyName(companyId: string): Promise<string> {
  const db = partnerServiceClient();
  const { data, error } = await db
    .from('companies')
    .select('name')
    .eq('id', companyId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data?.name != null ? String(data.name) : 'Tenant';
}
