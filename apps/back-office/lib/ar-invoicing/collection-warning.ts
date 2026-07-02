import type { SupabaseClient } from '@supabase/supabase-js';

import { loadArBillingCycle } from './billing-cycle';
import {
  asOfForCashflowGap,
  evaluateCollectionWarning,
  proratedInvoiceTargetForDispatchDay,
} from './cashflow-gap-math';
import { estimateSiteMonthlyTarget } from './finance-revenue-math';
import { loadLiveArMonthRevenue } from './finance-revenue';

export type CollectionWarningSnapshot = {
  active: boolean;
  shortfallLkr: number;
  gapTargetLkr: number;
  cashReceivedLkr: number;
  collectionWarningDay: number;
  silencedByDisputes: boolean;
  warningDayReached: boolean;
  serviceMonthKey: string;
};

export async function loadCollectionWarningSnapshot(
  supabase: SupabaseClient,
  companyId: string,
  serviceMonthKey: string,
  asOf: Date = new Date(),
): Promise<CollectionWarningSnapshot> {
  const billingCycle = await loadArBillingCycle(companyId);
  const liveAr = await loadLiveArMonthRevenue(supabase, companyId, serviceMonthKey);
  const asOfDate = asOfForCashflowGap(serviceMonthKey, asOf);

  const { data: sites } = await supabase
    .from('site_profiles')
    .select('rate_matrix, required_guards, site_status')
    .eq('company_id', companyId)
    .neq('site_status', 'ARCHIVED');

  const fullTarget = (sites ?? []).reduce(
    (sum, site) =>
      sum + estimateSiteMonthlyTarget(site.rate_matrix, Number(site.required_guards ?? 1)),
    0,
  );

  const proratedTarget = proratedInvoiceTargetForDispatchDay(
    fullTarget,
    serviceMonthKey,
    billingCycle.invoiceDispatchDay,
    asOfDate,
  );
  const gapTarget = proratedTarget > 0 ? proratedTarget : fullTarget;

  const evaluation = evaluateCollectionWarning({
    gapTarget,
    cashReceived: liveAr.cashReceived,
    serviceMonthKey,
    collectionWarningDay: billingCycle.collectionWarningDay,
    silencedByDisputes: liveAr.disputedInMonth,
    asOf: asOfDate,
  });

  return {
    active: evaluation.active,
    shortfallLkr: evaluation.shortfall,
    gapTargetLkr: evaluation.gapTarget,
    cashReceivedLkr: liveAr.cashReceived,
    collectionWarningDay: billingCycle.collectionWarningDay,
    silencedByDisputes: liveAr.disputedInMonth,
    warningDayReached: evaluation.warningDayReached,
    serviceMonthKey,
  };
}
