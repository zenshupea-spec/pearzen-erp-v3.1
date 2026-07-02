import 'server-only';

import {
  DEFAULT_FORGE_PAYOUT_RULES,
  type ForgePayoutRules,
  type ForgePayoutSourceType,
} from './forge-partners';
import { createSupabaseServiceClient } from '../../../packages/supabase/service';

export type PayoutLedgerRecordResult = {
  created: boolean;
  ledgerId?: string;
  skippedReason?: string;
};

function billingMonthFromDate(value: string | null | undefined): string {
  if (!value) return new Date().toISOString().slice(0, 7) + '-01';
  const trimmed = value.slice(0, 10);
  const [year, month] = trimmed.split('-');
  if (!year || !month) return new Date().toISOString().slice(0, 7) + '-01';
  return `${year}-${month}-01`;
}

export async function fetchForgePayoutRules(): Promise<ForgePayoutRules> {
  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase
    .from('forge_payout_rules')
    .select('*')
    .eq('singleton', true)
    .maybeSingle();

  if (error && error.code !== '42P01') {
    throw new Error(error.message);
  }

  if (!data) return { ...DEFAULT_FORGE_PAYOUT_RULES };

  return {
    monthOneClientLkr: Number(data.month_one_client_lkr ?? DEFAULT_FORGE_PAYOUT_RULES.monthOneClientLkr),
    monthTwoPlusClientLkr: Number(
      data.month_two_plus_client_lkr ?? DEFAULT_FORGE_PAYOUT_RULES.monthTwoPlusClientLkr,
    ),
    monthOnePartnerLkr: Number(data.month_one_partner_lkr ?? DEFAULT_FORGE_PAYOUT_RULES.monthOnePartnerLkr),
    monthOnePearzenLkr: Number(data.month_one_pearzen_lkr ?? DEFAULT_FORGE_PAYOUT_RULES.monthOnePearzenLkr),
    monthTwoPlusPartnerLkr: Number(
      data.month_two_plus_partner_lkr ?? DEFAULT_FORGE_PAYOUT_RULES.monthTwoPlusPartnerLkr,
    ),
    monthTwoPlusPearzenLkr: Number(
      data.month_two_plus_pearzen_lkr ?? DEFAULT_FORGE_PAYOUT_RULES.monthTwoPlusPearzenLkr,
    ),
  };
}

function sharesForMonthIndex(
  rules: ForgePayoutRules,
  priorPayoutCount: number,
): { partnerShareLkr: number; pearzenShareLkr: number } {
  if (priorPayoutCount <= 0) {
    return {
      partnerShareLkr: rules.monthOnePartnerLkr,
      pearzenShareLkr: rules.monthOnePearzenLkr,
    };
  }
  return {
    partnerShareLkr: rules.monthTwoPlusPartnerLkr,
    pearzenShareLkr: rules.monthTwoPlusPearzenLkr,
  };
}

async function countPriorPortfolioPayouts(
  portfolioId: string,
  sourceType: ForgePayoutSourceType,
): Promise<number> {
  const supabase = createSupabaseServiceClient();
  const { count, error } = await supabase
    .from('forge_payout_ledger')
    .select('id', { count: 'exact', head: true })
    .eq('portfolio_id', portfolioId)
    .eq('source_type', sourceType);

  if (error && error.code !== '42P01') return 0;
  return count ?? 0;
}

async function insertPayoutLedgerEntry(input: {
  partnerId: string;
  portfolioId: string | null;
  billingMonth: string;
  partnerShareLkr: number;
  pearzenShareLkr: number;
  sourceType: ForgePayoutSourceType;
  sourceInvoiceId: string;
  notes?: string | null;
}): Promise<PayoutLedgerRecordResult> {
  const supabase = createSupabaseServiceClient();

  const { data: existing } = await supabase
    .from('forge_payout_ledger')
    .select('id')
    .eq('source_type', input.sourceType)
    .eq('source_invoice_id', input.sourceInvoiceId)
    .maybeSingle();

  if (existing?.id) {
    return { created: false, ledgerId: String(existing.id), skippedReason: 'already_recorded' };
  }

  const { data, error } = await supabase
    .from('forge_payout_ledger')
    .insert({
      partner_id: input.partnerId,
      portfolio_id: input.portfolioId,
      billing_month: input.billingMonth,
      partner_share_lkr: input.partnerShareLkr,
      pearzen_share_lkr: input.pearzenShareLkr,
      source_type: input.sourceType,
      source_invoice_id: input.sourceInvoiceId,
      notes: input.notes ?? null,
    })
    .select('id')
    .single();

  if (error) {
    if (error.code === '23505') {
      return { created: false, skippedReason: 'already_recorded' };
    }
    throw new Error(error.message);
  }

  return { created: true, ledgerId: String(data.id) };
}

async function resolveActivePortfolioForCompany(companyId: string) {
  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase
    .from('forge_partner_portfolios')
    .select('id, partner_id, deal_type, status')
    .eq('company_id', companyId)
    .eq('status', 'active')
    .order('closed_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error && error.code !== '42P01') return null;
  if (!data?.id || !data.partner_id) return null;

  return {
    portfolioId: String(data.id),
    partnerId: String(data.partner_id),
    dealType: String(data.deal_type ?? 'saas_erp'),
  };
}

export async function recordPartnerPayoutForSaasInvoice(
  invoiceId: string,
): Promise<PayoutLedgerRecordResult> {
  try {
    const supabase = createSupabaseServiceClient();
    const { data: invoice, error } = await supabase
      .from('saas_platform_invoices')
      .select('id, company_id, invoice_month, due_date, status, total_lkr')
      .eq('id', invoiceId)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!invoice || invoice.status !== 'paid') {
      return { created: false, skippedReason: 'invoice_not_paid' };
    }

    const companyId = String(invoice.company_id);
    const portfolio = await resolveActivePortfolioForCompany(companyId);
    if (!portfolio) {
      return { created: false, skippedReason: 'no_active_portfolio' };
    }

    const rules = await fetchForgePayoutRules();
    const priorCount = await countPriorPortfolioPayouts(portfolio.portfolioId, 'saas_platform');
    const shares = sharesForMonthIndex(rules, priorCount);
    const billingMonth = billingMonthFromDate(
      invoice.invoice_month != null ? String(invoice.invoice_month) : String(invoice.due_date),
    );

    return await insertPayoutLedgerEntry({
      partnerId: portfolio.partnerId,
      portfolioId: portfolio.portfolioId,
      billingMonth,
      partnerShareLkr: shares.partnerShareLkr,
      pearzenShareLkr: shares.pearzenShareLkr,
      sourceType: 'saas_platform',
      sourceInvoiceId: String(invoice.id),
      notes: `ERP subscription invoice ${billingMonth.slice(0, 7)} · tenant ${companyId.slice(0, 8)}`,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Payout ledger failed';
    return { created: false, skippedReason: message };
  }
}

export async function recordPartnerPayoutForForgeProductInvoice(
  invoiceId: string,
): Promise<PayoutLedgerRecordResult> {
  try {
    const supabase = createSupabaseServiceClient();
    const { data: invoice, error } = await supabase
      .from('forge_product_invoices')
      .select(
        'id, invoice_month, due_date, status, amount_lkr, purchase_id, forge_product_purchases(company_id, partner_id)',
      )
      .eq('id', invoiceId)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!invoice || invoice.status !== 'paid') {
      return { created: false, skippedReason: 'invoice_not_paid' };
    }

    const purchase = (invoice as Record<string, unknown>).forge_product_purchases as
      | Record<string, unknown>
      | null
      | undefined;

    const companyId = purchase?.company_id != null ? String(purchase.company_id) : null;
    const purchasePartnerId =
      purchase?.partner_id != null ? String(purchase.partner_id) : null;

    let partnerId = purchasePartnerId;
    let portfolioId: string | null = null;

    if (companyId) {
      const portfolio = await resolveActivePortfolioForCompany(companyId);
      if (portfolio) {
        partnerId = partnerId ?? portfolio.partnerId;
        portfolioId = portfolio.portfolioId;
      }
    }

    if (!partnerId) {
      return { created: false, skippedReason: 'no_partner_attribution' };
    }

    const rules = await fetchForgePayoutRules();
    const priorCount = portfolioId
      ? await countPriorPortfolioPayouts(portfolioId, 'forge_product')
      : 0;
    const shares = sharesForMonthIndex(rules, priorCount);
    const billingMonth = billingMonthFromDate(
      invoice.invoice_month != null
        ? String(invoice.invoice_month)
        : String(invoice.due_date ?? new Date().toISOString().slice(0, 10)),
    );

    return await insertPayoutLedgerEntry({
      partnerId,
      portfolioId,
      billingMonth,
      partnerShareLkr: shares.partnerShareLkr,
      pearzenShareLkr: shares.pearzenShareLkr,
      sourceType: 'forge_product',
      sourceInvoiceId: String(invoice.id),
      notes: `Commerce invoice ${billingMonth.slice(0, 7)}`,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Payout ledger failed';
    return { created: false, skippedReason: message };
  }
}

export function payoutLedgerCsv(rows: Array<Record<string, string | number>>): string {
  if (rows.length === 0) return 'billing_month,source_type,partner_share_lkr,pearzen_share_lkr,notes,created_at\n';

  const headers = Object.keys(rows[0]);
  const lines = [
    headers.join(','),
    ...rows.map((row) =>
      headers
        .map((header) => {
          const value = row[header];
          const text = value == null ? '' : String(value);
          return text.includes(',') || text.includes('"') ? `"${text.replace(/"/g, '""')}"` : text;
        })
        .join(','),
    ),
  ];
  return lines.join('\n');
}
