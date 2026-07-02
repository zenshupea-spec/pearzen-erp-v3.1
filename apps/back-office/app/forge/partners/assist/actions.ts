'use server';

import { revalidatePath } from 'next/cache';

import { isForgeOperatorEmail } from '../../../../lib/forge-access';
import { createSupabaseServerClient } from '../../../../../../packages/supabase/server';
import { createSupabaseServiceClient } from '../../../../../../packages/supabase/service';

export type ForgeAssistPortfolioRow = {
  partnerId: string;
  partnerName: string;
  partnerEmail: string;
  companyId: string;
  companyName: string;
  portfolioStatus: string;
  grantId: string | null;
  domainSetup: boolean;
  payhereSetup: boolean;
  expiresAt: string | null;
  grantedBy: string | null;
};

async function assertForgeOperator() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email || !(await isForgeOperatorEmail(user.email))) {
    throw new Error('Forge operator access required');
  }
  return user.email;
}

export async function fetchForgePartnerAssistOverview() {
  try {
    await assertForgeOperator();
    const db = createSupabaseServiceClient();

    const [
      { data: portfolios, error: portfolioError },
      { data: partners, error: partnerError },
      { data: grants, error: grantError },
    ] = await Promise.all([
      db
        .from('forge_partner_portfolios')
        .select('id, partner_id, company_id, status')
        .order('closed_at', { ascending: false }),
      db.from('forge_service_partners').select('id, display_name, email, is_active'),
      db.from('forge_partner_assist_grants').select('*'),
    ]);

    if (portfolioError && portfolioError.code !== '42P01') throw new Error(portfolioError.message);
    if (partnerError) throw new Error(partnerError.message);
    if (grantError && grantError.code !== '42P01') throw new Error(grantError.message);

    const companyIds = [...new Set((portfolios ?? []).map((row) => String(row.company_id)))];
    const { data: companies, error: companiesError } = companyIds.length
      ? await db.from('companies').select('id, name').in('id', companyIds)
      : { data: [], error: null };

    if (companiesError) throw new Error(companiesError.message);

    const partnerById = new Map(
      (partners ?? []).map((row) => [String(row.id), row as Record<string, unknown>]),
    );
    const companyById = new Map(
      (companies ?? []).map((row) => [String(row.id), String(row.name ?? 'Tenant')]),
    );
    const grantByKey = new Map(
      (grants ?? []).map((row) => [
        `${String(row.partner_id)}:${String(row.company_id)}`,
        row as Record<string, unknown>,
      ]),
    );

    const rows: ForgeAssistPortfolioRow[] = (portfolios ?? [])
      .map((portfolio) => {
        const partnerId = String(portfolio.partner_id);
        const companyId = String(portfolio.company_id);
        const partner = partnerById.get(partnerId);
        const grant = grantByKey.get(`${partnerId}:${companyId}`);

        return {
          partnerId,
          partnerName:
            partner?.display_name != null ? String(partner.display_name) : 'Partner',
          partnerEmail: partner?.email != null ? String(partner.email) : '',
          companyId,
          companyName: companyById.get(companyId) ?? 'Tenant',
          portfolioStatus: String(portfolio.status ?? 'active'),
          grantId: grant?.id != null ? String(grant.id) : null,
          domainSetup: Boolean(grant?.domain_setup),
          payhereSetup: Boolean(grant?.payhere_setup),
          expiresAt: grant?.expires_at != null ? String(grant.expires_at) : null,
          grantedBy: grant?.granted_by != null ? String(grant.granted_by) : null,
        };
      })
      .filter((row) => {
        const partner = partnerById.get(row.partnerId);
        return partner?.is_active !== false;
      });

    return { success: true as const, rows };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load assist overview';
    return { success: false as const, error: message, rows: [] };
  }
}

export async function upsertForgePartnerAssistGrant(input: {
  partnerId: string;
  companyId: string;
  domainSetup: boolean;
  payhereSetup: boolean;
  expiresAt?: string | null;
}) {
  try {
    const operatorEmail = await assertForgeOperator();
    const db = createSupabaseServiceClient();
    const now = new Date().toISOString();

    const { data: portfolio, error: portfolioError } = await db
      .from('forge_partner_portfolios')
      .select('id')
      .eq('partner_id', input.partnerId.trim())
      .eq('company_id', input.companyId.trim())
      .maybeSingle();

    if (portfolioError) throw new Error(portfolioError.message);
    if (!portfolio?.id) throw new Error('Portfolio link not found for partner and tenant');

    const expiresAt = input.expiresAt?.trim() ? input.expiresAt.trim() : null;

    const { error } = await db.from('forge_partner_assist_grants').upsert(
      {
        partner_id: input.partnerId.trim(),
        company_id: input.companyId.trim(),
        domain_setup: input.domainSetup,
        payhere_setup: input.payhereSetup,
        granted_by: operatorEmail,
        expires_at: expiresAt,
        updated_at: now,
      },
      { onConflict: 'partner_id,company_id' },
    );

    if (error) throw new Error(error.message);

    revalidatePath('/forge/partners/assist');
    revalidatePath(`/partners/clients/${input.companyId.trim()}/setup`);

    return { success: true as const };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to update assist grant';
    return { success: false as const, error: message };
  }
}
