'use server';

import { revalidatePath } from 'next/cache';

import { isForgeOperatorEmail } from '../../../lib/forge-access';
import {
  DEFAULT_FORGE_PAYOUT_RULES,
  type ForgePayoutRules,
  type ForgePayoutSourceType,
  payoutSourceTypeLabel,
} from '../../../lib/forge-partners';
import { createSupabaseServerClient } from '../../../../../packages/supabase/server';
import { createSupabaseServiceClient } from '../../../../../packages/supabase/service';
import {
  fetchWebsitePartnerClients,
  type WebsitePartnerClientRow,
} from '../clients/actions';
import type { WebsitePartnerRow } from '../clients/actions';

function assertServiceRoleConfigured() {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY is missing on the server. Add it in Vercel → Project → Environment Variables, then redeploy.',
    );
  }
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

export type ForgePartnerHubRow = WebsitePartnerRow & {
  erpClientCount: number;
  wfmClientCount: number;
  customClientCount: number;
};

export type ForgePartnersHubSummary = {
  partnerCount: number;
  activePartnerCount: number;
  websiteClientCount: number;
  totalActivePortfolios: number;
  totalBilledLkr: number;
  totalPaidToPartnerLkr: number;
  totalPearzenShareLkr: number;
  payoutRules: ForgePayoutRules;
};

async function fetchForgePayoutRules(): Promise<ForgePayoutRules> {
  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase
    .from('forge_payout_rules')
    .select(
      'month_one_client_lkr, month_one_partner_lkr, month_one_pearzen_lkr, month_two_plus_client_lkr, month_two_plus_partner_lkr, month_two_plus_pearzen_lkr',
    )
    .eq('singleton', true)
    .maybeSingle();

  if (error || !data) {
    return { ...DEFAULT_FORGE_PAYOUT_RULES };
  }

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

export async function fetchForgePartnersHub() {
  try {
    assertServiceRoleConfigured();
    await assertForgeOperator();

    const supabase = createSupabaseServiceClient();

    const [
      { data: partners, error: partnersError },
      { data: portfolios, error: portfoliosError },
      { data: ledgerRows, error: ledgerError },
      { data: websitePurchases, error: purchasesError },
      payoutRules,
    ] = await Promise.all([
      supabase
        .from('forge_service_partners')
        .select('id, display_name, email, referral_code, is_active, created_at')
        .order('display_name', { ascending: true }),
      supabase
        .from('forge_partner_portfolios')
        .select('partner_id, deal_type, status')
        .eq('status', 'active'),
      supabase
        .from('forge_payout_ledger')
        .select('partner_id, partner_share_lkr, pearzen_share_lkr'),
      supabase
        .from('forge_product_purchases')
        .select('id, partner_id, forge_product_catalog!inner(code)')
        .eq('forge_product_catalog.code', 'website_build')
        .not('partner_id', 'is', null),
      fetchForgePayoutRules(),
    ]);

    if (partnersError) throw new Error(partnersError.message);
    if (portfoliosError) throw new Error(portfoliosError.message);
    if (ledgerError) throw new Error(ledgerError.message);
    if (purchasesError) throw new Error(purchasesError.message);

    type DealCounts = {
      website: number;
      erp: number;
      wfm: number;
      custom: number;
      total: number;
    };

    const countsByPartner = new Map<string, DealCounts>();

    for (const row of portfolios ?? []) {
      const partnerId = String(row.partner_id);
      const current = countsByPartner.get(partnerId) ?? {
        website: 0,
        erp: 0,
        wfm: 0,
        custom: 0,
        total: 0,
      };
      current.total += 1;
      switch (row.deal_type) {
        case 'website_build':
          current.website += 1;
          break;
        case 'saas_erp':
          current.erp += 1;
          break;
        case 'wfm_tool':
          current.wfm += 1;
          break;
        case 'custom_software':
          current.custom += 1;
          break;
        default:
          break;
      }
      countsByPartner.set(partnerId, current);
    }

    const paidToPartnerByPartner = new Map<string, number>();
    const pearzenShareByPartner = new Map<string, number>();

    for (const row of ledgerRows ?? []) {
      const partnerId = String(row.partner_id);
      paidToPartnerByPartner.set(
        partnerId,
        (paidToPartnerByPartner.get(partnerId) ?? 0) + Number(row.partner_share_lkr ?? 0),
      );
      pearzenShareByPartner.set(
        partnerId,
        (pearzenShareByPartner.get(partnerId) ?? 0) + Number(row.pearzen_share_lkr ?? 0),
      );
    }

    const purchaseIds: string[] = [];
    const purchasePartnerById = new Map<string, string>();

    for (const row of websitePurchases ?? []) {
      const purchaseId = String(row.id);
      const partnerId = row.partner_id != null ? String(row.partner_id) : null;
      if (!partnerId) continue;
      purchaseIds.push(purchaseId);
      purchasePartnerById.set(purchaseId, partnerId);
    }

    const billedByPartner = new Map<string, number>();

    if (purchaseIds.length > 0) {
      const { data: invoices, error: invoicesError } = await supabase
        .from('forge_product_invoices')
        .select('purchase_id, amount_lkr')
        .in('purchase_id', purchaseIds);

      if (invoicesError) throw new Error(invoicesError.message);

      for (const invoice of invoices ?? []) {
        const purchaseId = String(invoice.purchase_id);
        const partnerId = purchasePartnerById.get(purchaseId);
        if (!partnerId) continue;
        billedByPartner.set(
          partnerId,
          (billedByPartner.get(partnerId) ?? 0) + Number(invoice.amount_lkr ?? 0),
        );
      }
    }

    const partnersList: ForgePartnerHubRow[] = (partners ?? []).map((row) => {
      const partnerId = String(row.id);
      const counts = countsByPartner.get(partnerId) ?? {
        website: 0,
        erp: 0,
        wfm: 0,
        custom: 0,
        total: 0,
      };

      return {
        id: partnerId,
        displayName: String(row.display_name ?? 'Partner'),
        email: String(row.email ?? ''),
        referralCode: String(row.referral_code ?? ''),
        isActive: row.is_active !== false,
        websiteClientCount: counts.website,
        activePortfolioCount: counts.total,
        erpClientCount: counts.erp,
        wfmClientCount: counts.wfm,
        customClientCount: counts.custom,
        totalBilledLkr: billedByPartner.get(partnerId) ?? 0,
        totalPaidToPartnerLkr: paidToPartnerByPartner.get(partnerId) ?? 0,
        totalPearzenShareLkr: pearzenShareByPartner.get(partnerId) ?? 0,
        createdAt: String(row.created_at ?? ''),
      };
    });

    partnersList.sort((a, b) => {
      if (b.websiteClientCount !== a.websiteClientCount) {
        return b.websiteClientCount - a.websiteClientCount;
      }
      if (b.totalPaidToPartnerLkr !== a.totalPaidToPartnerLkr) {
        return b.totalPaidToPartnerLkr - a.totalPaidToPartnerLkr;
      }
      return a.displayName.localeCompare(b.displayName);
    });

    const summary: ForgePartnersHubSummary = {
      partnerCount: partnersList.length,
      activePartnerCount: partnersList.filter((row) => row.isActive).length,
      websiteClientCount: partnersList.reduce((sum, row) => sum + row.websiteClientCount, 0),
      totalActivePortfolios: partnersList.reduce((sum, row) => sum + row.activePortfolioCount, 0),
      totalBilledLkr: partnersList.reduce((sum, row) => sum + row.totalBilledLkr, 0),
      totalPaidToPartnerLkr: partnersList.reduce((sum, row) => sum + row.totalPaidToPartnerLkr, 0),
      totalPearzenShareLkr: partnersList.reduce((sum, row) => sum + row.totalPearzenShareLkr, 0),
      payoutRules,
    };

    return { success: true as const, partners: partnersList, summary };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load partners hub';
    return {
      success: false as const,
      error: message,
      partners: [] as ForgePartnerHubRow[],
      summary: {
        partnerCount: 0,
        activePartnerCount: 0,
        websiteClientCount: 0,
        totalActivePortfolios: 0,
        totalBilledLkr: 0,
        totalPaidToPartnerLkr: 0,
        totalPearzenShareLkr: 0,
        payoutRules: { ...DEFAULT_FORGE_PAYOUT_RULES },
      } satisfies ForgePartnersHubSummary,
    };
  }
}

export type ForgePartnerPaymentRow = {
  id: string;
  billingMonth: string;
  partnerShareLkr: number;
  pearzenShareLkr: number;
  sourceType: ForgePayoutSourceType;
  companyName: string | null;
  notes: string | null;
  createdAt: string;
};

export type ForgePartnerDisbursementRow = {
  id: string;
  amountLkr: number;
  paidOn: string;
  paymentMethod: string | null;
  reference: string | null;
  notes: string | null;
  recordedBy: string | null;
  createdAt: string;
};

export type ForgePartnerDetailPayload = {
  partner: ForgePartnerHubRow;
  clients: WebsitePartnerClientRow[];
  payments: ForgePartnerPaymentRow[];
  disbursements: ForgePartnerDisbursementRow[];
  totalDisbursedLkr: number;
  balanceOwedLkr: number;
};

async function buildForgePartnerHubRow(partnerId: string): Promise<ForgePartnerHubRow | null> {
  const hub = await fetchForgePartnersHub();
  if (!hub.success) return null;
  return hub.partners.find((row) => row.id === partnerId) ?? null;
}

export async function fetchForgePartnerDetail(partnerId: string) {
  try {
    assertServiceRoleConfigured();
    await assertForgeOperator();

    const scopedPartnerId = partnerId?.trim();
    if (!scopedPartnerId) {
      return {
        success: false as const,
        error: 'Partner id is required',
        detail: null,
      };
    }

    const supabase = createSupabaseServiceClient();

    const [partner, clientsResult, paymentsResult, disbursementsResult] = await Promise.all([
      buildForgePartnerHubRow(scopedPartnerId),
      fetchWebsitePartnerClients(scopedPartnerId),
      supabase
        .from('forge_payout_ledger')
        .select('*, forge_partner_portfolios(companies(name))')
        .eq('partner_id', scopedPartnerId)
        .order('billing_month', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(120),
      supabase
        .from('forge_partner_disbursements')
        .select('*')
        .eq('partner_id', scopedPartnerId)
        .order('paid_on', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(120),
    ]);

    if (!partner) {
      return { success: false as const, error: 'Partner not found', detail: null };
    }

    if (!clientsResult.success) {
      throw new Error(clientsResult.error ?? 'Failed to load clients');
    }

    if (paymentsResult.error) {
      throw new Error(paymentsResult.error.message);
    }

    if (disbursementsResult.error && disbursementsResult.error.code !== '42P01') {
      throw new Error(disbursementsResult.error.message);
    }

    const payments: ForgePartnerPaymentRow[] = (paymentsResult.data ?? []).map((row) => {
      const portfolio = (row as Record<string, unknown>).forge_partner_portfolios as
        | Record<string, unknown>
        | null;
      const company = portfolio?.companies as Record<string, unknown> | null;

      return {
        id: String(row.id),
        billingMonth: String(row.billing_month ?? ''),
        partnerShareLkr: Number(row.partner_share_lkr ?? 0),
        pearzenShareLkr: Number(row.pearzen_share_lkr ?? 0),
        sourceType: String(row.source_type) as ForgePayoutSourceType,
        companyName: company?.name != null ? String(company.name) : null,
        notes: row.notes != null ? String(row.notes) : null,
        createdAt: String(row.created_at ?? ''),
      };
    });

    const disbursements: ForgePartnerDisbursementRow[] = (disbursementsResult.data ?? []).map(
      (row) => ({
        id: String(row.id),
        amountLkr: Number(row.amount_lkr ?? 0),
        paidOn: String(row.paid_on ?? ''),
        paymentMethod: row.payment_method != null ? String(row.payment_method) : null,
        reference: row.reference != null ? String(row.reference) : null,
        notes: row.notes != null ? String(row.notes) : null,
        recordedBy: row.recorded_by != null ? String(row.recorded_by) : null,
        createdAt: String(row.created_at ?? ''),
      }),
    );

    const totalDisbursedLkr = disbursements.reduce((sum, row) => sum + row.amountLkr, 0);
    const balanceOwedLkr = Math.max(0, partner.totalPaidToPartnerLkr - totalDisbursedLkr);

    return {
      success: true as const,
      detail: {
        partner,
        clients: clientsResult.clients,
        payments,
        disbursements,
        totalDisbursedLkr,
        balanceOwedLkr,
      } satisfies ForgePartnerDetailPayload,
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load partner detail';
    return { success: false as const, error: message, detail: null };
  }
}

export type RecordForgePartnerDisbursementInput = {
  partnerId: string;
  amountLkr: number;
  paidOn: string;
  paymentMethod?: string | null;
  reference?: string | null;
  notes?: string | null;
};

export async function recordForgePartnerDisbursement(input: RecordForgePartnerDisbursementInput) {
  try {
    assertServiceRoleConfigured();
    const operatorEmail = await assertForgeOperator();

    const partnerId = input.partnerId?.trim();
    if (!partnerId) throw new Error('Partner id is required');

    const amountLkr = Number(input.amountLkr);
    if (!Number.isFinite(amountLkr) || amountLkr <= 0) {
      throw new Error('Enter a valid payment amount greater than zero');
    }

    const paidOn = input.paidOn?.trim();
    if (!paidOn || !/^\d{4}-\d{2}-\d{2}$/.test(paidOn)) {
      throw new Error('Payment date is required (YYYY-MM-DD)');
    }

    const supabase = createSupabaseServiceClient();

    const { data: partnerRow, error: partnerError } = await supabase
      .from('forge_service_partners')
      .select('id')
      .eq('id', partnerId)
      .maybeSingle();

    if (partnerError) throw new Error(partnerError.message);
    if (!partnerRow) throw new Error('Partner not found');

    const { data, error } = await supabase
      .from('forge_partner_disbursements')
      .insert({
        partner_id: partnerId,
        amount_lkr: amountLkr,
        paid_on: paidOn,
        payment_method: input.paymentMethod?.trim() || null,
        reference: input.reference?.trim() || null,
        notes: input.notes?.trim() || null,
        recorded_by: operatorEmail,
      })
      .select('*')
      .single();

    if (error) {
      if (error.code === '42P01') {
        throw new Error(
          'Disbursements table not migrated yet. Apply 20260624160000_forge_partner_disbursements.sql.',
        );
      }
      throw new Error(error.message);
    }

    revalidatePath('/forge/partners');
    revalidatePath(`/forge/partners/${partnerId}`);

    return {
      success: true as const,
      disbursement: {
        id: String(data.id),
        amountLkr: Number(data.amount_lkr ?? 0),
        paidOn: String(data.paid_on ?? ''),
        paymentMethod: data.payment_method != null ? String(data.payment_method) : null,
        reference: data.reference != null ? String(data.reference) : null,
        notes: data.notes != null ? String(data.notes) : null,
        recordedBy: data.recorded_by != null ? String(data.recorded_by) : null,
        createdAt: String(data.created_at ?? ''),
      } satisfies ForgePartnerDisbursementRow,
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to record payment';
    return { success: false as const, error: message };
  }
}

export { payoutSourceTypeLabel };
