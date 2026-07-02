'use server';

import { unstable_noStore as noStore } from 'next/cache';

import { createSupabaseServiceClient } from '../../../../../packages/supabase/service';
import { payrollMonthFromFmPeriod } from '../../../lib/deduction-month-lock-storage';
import { loadArLedgerClientsForMonth } from '../../../lib/ar-invoicing/finance-revenue';
import { requireFmPortfolioRead } from './fm-portfolio-auth-server';
import {
  mapArCollectionsToSites,
  type FmClientBillingCollection,
  type FmSiteBillingInput,
} from './fm-client-billing-collections';
import type { PayrollPeriod } from './payroll-period';

export type FmClientBillingCollectionsPayload = {
  collections: Record<string, FmClientBillingCollection>;
  error?: string;
};

/** Live AR collection lines for FM Client Billing report (Invoice Desk snapshot + shift rollup). */
export async function getFmClientBillingCollections(
  payrollPeriod: PayrollPeriod,
  sites: FmSiteBillingInput[],
): Promise<FmClientBillingCollectionsPayload> {
  noStore();
  if (!sites.length) {
    return { collections: {} };
  }

  let companyId: string;
  try {
    ({ companyId } = await requireFmPortfolioRead());
  } catch (err) {
    const message = err instanceof Error ? err.message : 'FM portfolio access denied';
    return { collections: {}, error: message };
  }

  const monthKey = payrollMonthFromFmPeriod(payrollPeriod).slice(0, 7);
  const supabase = createSupabaseServiceClient();
  const siteIds = sites.map((site) => site.id);

  const [{ data: siteRows, error: siteError }, clients] = await Promise.all([
    supabase
      .from('site_profiles')
      .select('id, client_name, parent_client')
      .eq('company_id', companyId)
      .in('id', siteIds),
    loadArLedgerClientsForMonth(supabase, companyId, monthKey),
  ]);

  if (siteError) {
    console.error('❌ SUPABASE ERROR (getFmClientBillingCollections):', siteError.message);
    return { collections: {}, error: siteError.message };
  }

  const siteMetaById: Record<string, { client_name?: string | null; parent_client?: string | null }> =
    {};
  for (const row of siteRows ?? []) {
    siteMetaById[String(row.id)] = {
      client_name: row.client_name as string | null,
      parent_client: row.parent_client as string | null,
    };
  }

  return {
    collections: mapArCollectionsToSites(sites, clients, monthKey, siteMetaById),
  };
}
