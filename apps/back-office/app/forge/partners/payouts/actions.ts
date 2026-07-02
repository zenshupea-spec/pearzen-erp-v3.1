'use server';

import { isForgeOperatorEmail } from '../../../../lib/forge-access';
import type { ForgePayoutSourceType } from '../../../../lib/forge-partners';
import { payoutLedgerCsv } from '../../../../lib/forge-payout-ledger';
import { createSupabaseServerClient } from '../../../../../../packages/supabase/server';
import { createSupabaseServiceClient } from '../../../../../../packages/supabase/service';

export type ForgePayoutAuditRow = {
  id: string;
  partnerName: string;
  partnerEmail: string;
  billingMonth: string;
  partnerShareLkr: number;
  pearzenShareLkr: number;
  sourceType: ForgePayoutSourceType;
  companyName: string | null;
  createdAt: string;
};

async function assertForgeOperator() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !(await isForgeOperatorEmail(user.email))) {
    throw new Error('Forge operator access required');
  }
}

export async function fetchForgePayoutAuditLedger() {
  try {
    await assertForgeOperator();
    const supabase = createSupabaseServiceClient();

    const { data, error } = await supabase
      .from('forge_payout_ledger')
      .select(
        '*, forge_service_partners(display_name, email), forge_partner_portfolios(companies(name))',
      )
      .order('created_at', { ascending: false })
      .limit(200);

    if (error) throw new Error(error.message);

    const rows: ForgePayoutAuditRow[] = (data ?? []).map((row) => {
      const partner = (row as Record<string, unknown>).forge_service_partners as
        | Record<string, unknown>
        | null;
      const portfolio = (row as Record<string, unknown>).forge_partner_portfolios as
        | Record<string, unknown>
        | null;
      const company = portfolio?.companies as Record<string, unknown> | null;

      return {
        id: String(row.id),
        partnerName: partner?.display_name != null ? String(partner.display_name) : 'Partner',
        partnerEmail: partner?.email != null ? String(partner.email) : '',
        billingMonth: String(row.billing_month ?? ''),
        partnerShareLkr: Number(row.partner_share_lkr ?? 0),
        pearzenShareLkr: Number(row.pearzen_share_lkr ?? 0),
        sourceType: String(row.source_type) as ForgePayoutSourceType,
        companyName: company?.name != null ? String(company.name) : null,
        createdAt: String(row.created_at ?? ''),
      };
    });

    const partnerTotalLkr = rows.reduce((sum, row) => sum + row.partnerShareLkr, 0);
    const pearzenTotalLkr = rows.reduce((sum, row) => sum + row.pearzenShareLkr, 0);

    return { success: true as const, rows, partnerTotalLkr, pearzenTotalLkr };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load payout audit';
    return { success: false as const, error: message, rows: [], partnerTotalLkr: 0, pearzenTotalLkr: 0 };
  }
}

export async function exportForgePayoutAuditCsv() {
  const result = await fetchForgePayoutAuditLedger();
  if (!result.success) {
    return { success: false as const, error: result.error ?? 'Failed to export' };
  }

  const csv = payoutLedgerCsv(
    result.rows.map((row) => ({
      partner: row.partnerName,
      partner_email: row.partnerEmail,
      billing_month: row.billingMonth,
      source_type: row.sourceType,
      company: row.companyName ?? '',
      partner_share_lkr: row.partnerShareLkr,
      pearzen_share_lkr: row.pearzenShareLkr,
      created_at: row.createdAt,
    })),
  );

  return {
    success: true as const,
    csv,
    filename: `forge-partner-payout-audit-${new Date().toISOString().slice(0, 10)}.csv`,
  };
}
