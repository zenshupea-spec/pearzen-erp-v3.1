'use server';

import { revalidatePath } from 'next/cache';

import type { ForgePayoutSourceType } from '../../../lib/forge-partners';
import { payoutLedgerCsv } from '../../../lib/forge-payout-ledger';
import { getPartnerScopedServerClient, partnerServiceClient } from '../../../lib/partner-portal-session';

export type PartnerPayoutLedgerRow = {
  id: string;
  billingMonth: string;
  partnerShareLkr: number;
  pearzenShareLkr: number;
  sourceType: ForgePayoutSourceType;
  sourceInvoiceId: string | null;
  notes: string | null;
  createdAt: string;
  companyName: string | null;
};

export async function fetchPartnerPayoutLedger() {
  try {
    const { supabase, partner } = await getPartnerScopedServerClient();

    const { data, error } = await supabase
      .from('forge_payout_ledger')
      .select('*')
      .eq('partner_id', partner.id)
      .order('billing_month', { ascending: false })
      .order('created_at', { ascending: false });

    if (error) throw new Error(error.message);

    const portfolioIds = [
      ...new Set(
        (data ?? [])
          .map((row) => (row.portfolio_id != null ? String(row.portfolio_id) : null))
          .filter(Boolean),
      ),
    ] as string[];

    let companyByPortfolio = new Map<string, string>();

    if (portfolioIds.length > 0) {
      const db = partnerServiceClient();
      const { data: portfolios, error: portfolioError } = await db
        .from('forge_partner_portfolios')
        .select('id, company_id')
        .in('id', portfolioIds)
        .eq('partner_id', partner.id);

      if (portfolioError) throw new Error(portfolioError.message);

      const companyIds = [...new Set((portfolios ?? []).map((row) => String(row.company_id)))];
      const { data: companies, error: companiesError } = companyIds.length
        ? await db.from('companies').select('id, name').in('id', companyIds)
        : { data: [], error: null };

      if (companiesError) throw new Error(companiesError.message);

      const companyNameById = new Map(
        (companies ?? []).map((row) => [String(row.id), String(row.name ?? 'Tenant')]),
      );

      companyByPortfolio = new Map(
        (portfolios ?? []).map((row) => [
          String(row.id),
          companyNameById.get(String(row.company_id)) ?? 'Tenant',
        ]),
      );
    }

    const rows: PartnerPayoutLedgerRow[] = (data ?? []).map((row) => ({
      id: String(row.id),
      billingMonth: String(row.billing_month ?? ''),
      partnerShareLkr: Number(row.partner_share_lkr ?? 0),
      pearzenShareLkr: Number(row.pearzen_share_lkr ?? 0),
      sourceType: String(row.source_type) as ForgePayoutSourceType,
      sourceInvoiceId: row.source_invoice_id != null ? String(row.source_invoice_id) : null,
      notes: row.notes != null ? String(row.notes) : null,
      createdAt: String(row.created_at ?? ''),
      companyName:
        row.portfolio_id != null
          ? companyByPortfolio.get(String(row.portfolio_id)) ?? null
          : null,
    }));

    const partnerTotalLkr = rows.reduce((sum, row) => sum + row.partnerShareLkr, 0);
    const pearzenTotalLkr = rows.reduce((sum, row) => sum + row.pearzenShareLkr, 0);

    return {
      success: true as const,
      rows,
      partnerTotalLkr,
      pearzenTotalLkr,
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load payouts';
    return {
      success: false as const,
      error: message,
      rows: [],
      partnerTotalLkr: 0,
      pearzenTotalLkr: 0,
    };
  }
}

export async function exportPartnerPayoutLedgerCsv() {
  const result = await fetchPartnerPayoutLedger();
  if (!result.success) {
    return { success: false as const, error: result.error ?? 'Failed to export' };
  }

  const csv = payoutLedgerCsv(
    result.rows.map((row) => ({
      billing_month: row.billingMonth,
      source_type: row.sourceType,
      company: row.companyName ?? '',
      partner_share_lkr: row.partnerShareLkr,
      pearzen_share_lkr: row.pearzenShareLkr,
      notes: row.notes ?? '',
      created_at: row.createdAt,
    })),
  );

  revalidatePath('/partners/payouts');

  return { success: true as const, csv, filename: `pearzen-partner-payouts-${new Date().toISOString().slice(0, 10)}.csv` };
}
