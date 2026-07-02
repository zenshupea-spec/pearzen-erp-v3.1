import type { SupabaseClient } from '@supabase/supabase-js';
import { loadArBillingCycle } from './billing-cycle';
import { applyRolloverDebts, normalizeLedgerCellTotals } from './collection-math';
import {
  sumLiveArMonthRevenue,
  type LiveArMonthRevenue,
} from './finance-revenue-math';
import {
  billingClientKeyForSite,
  buildLiveLedgerClients,
  filterOutDemoClients,
  type ArLedgerClientRecord,
} from './live-ledger';
import { buildChronoMonthKeys } from './month-window';
import type { InvoiceBillingClient } from '../invoice-desk/types';

export type { LiveArMonthRevenue } from './finance-revenue-math';
export { estimateSiteMonthlyTarget, sumLiveArMonthRevenue } from './finance-revenue-math';

function slugClientId(name: string, index: number): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 32);
  return base ? `client-${base}` : `client-${index + 1}`;
}

async function fetchBillingClients(
  supabase: SupabaseClient,
  companyId: string,
  sites: Awaited<ReturnType<typeof fetchSiteProfiles>>,
): Promise<InvoiceBillingClient[]> {
  const { data, error } = await supabase
    .from('billing_clients')
    .select(
      'client_code, client_name, sector, address, purchaser_tin, invoice_contact_name, invoice_contact_phone',
    )
    .eq('company_id', companyId)
    .order('client_name', { ascending: true });

  if (error || !data?.length) {
    const seen = new Set<string>();
    const rows: InvoiceBillingClient[] = [];
    sites.forEach((site, index) => {
      const clientName = billingClientKeyForSite({
        site_name: site.site_name,
        client_name: site.client_name as string | null,
        parent_client: site.parent_client as string | null,
      });
      if (!clientName || seen.has(clientName)) return;
      seen.add(clientName);
      rows.push({
        clientId: slugClientId(clientName, index),
        clientName,
        sector: site.site_name,
        address:
          (site.client_billing_address as string | null)?.trim() ||
          (site.address as string | null)?.trim() ||
          '',
        purchaserTin: '',
        invoiceContactName: '',
        invoiceContactPhone: '',
      });
    });
    return rows;
  }

  return data.map((row) => ({
    clientId: row.client_code,
    clientName: row.client_name,
    sector: row.sector ?? '',
    address: row.address ?? '',
    purchaserTin: row.purchaser_tin ?? '',
    invoiceContactName: row.invoice_contact_name ?? '',
    invoiceContactPhone: row.invoice_contact_phone ?? '',
  }));
}

async function fetchSiteProfiles(supabase: SupabaseClient, companyId: string) {
  const { data, error } = await supabase
    .from('site_profiles')
    .select(
      'id, site_name, client_name, parent_client, address, client_billing_address, assigned_sm_epf, rate_matrix, per_visit_charge_lkr, site_status',
    )
    .eq('company_id', companyId)
    .neq('site_status', 'ARCHIVED')
    .order('client_name', { ascending: true });

  if (error) {
    console.error('❌ SUPABASE ERROR (finance-revenue fetchSiteProfiles):', error.message);
    return [];
  }
  return data ?? [];
}

async function fetchEmployees(supabase: SupabaseClient, companyId: string) {
  const { data, error } = await supabase
    .from('employees')
    .select('id, emp_number, full_name, rank, site, group, epf_no, epf_num, status')
    .eq('company_id', companyId)
    .ilike('status', 'active')
    .order('full_name', { ascending: true });

  if (error) {
    console.error('❌ SUPABASE ERROR (finance-revenue fetchEmployees):', error.message);
    return [];
  }
  return data ?? [];
}

/** Live Invoice Desk ledger clients for billing months (shift lines + collection snapshot). */
export async function loadArLedgerClientsForMonths(
  supabase: SupabaseClient,
  companyId: string,
  monthKeys: string[],
): Promise<ArLedgerClientRecord[]> {
  if (!monthKeys.length) return [];

  const [sites, employees, billingCycle, snapshotResult] = await Promise.all([
    fetchSiteProfiles(supabase, companyId),
    fetchEmployees(supabase, companyId),
    loadArBillingCycle(companyId),
    supabase
      .from('ar_ledger_snapshots')
      .select('clients')
      .eq('company_id', companyId)
      .maybeSingle(),
  ]);

  const billingClients = await fetchBillingClients(supabase, companyId, sites);
  const persistedClients = filterOutDemoClients(
    ((snapshotResult.data?.clients as ArLedgerClientRecord[]) ?? []).map((client) => ({
      ...client,
      invoices: client.invoices ?? {},
    })),
  );

  const { clients: liveClients } = await buildLiveLedgerClients(
    supabase,
    companyId,
    billingClients,
    sites as Parameters<typeof buildLiveLedgerClients>[3],
    employees as Parameters<typeof buildLiveLedgerClients>[4],
    persistedClients,
    monthKeys,
    billingCycle,
  );

  const chronoKeys = buildChronoMonthKeys(new Date().getFullYear() - 5, new Date().getFullYear() + 1);
  return normalizeLedgerCellTotals(applyRolloverDebts(liveClients, chronoKeys));
}

/** Live Invoice Desk ledger clients for one billing month (shift lines + collection snapshot). */
export async function loadArLedgerClientsForMonth(
  supabase: SupabaseClient,
  companyId: string,
  monthKey: string,
): Promise<ArLedgerClientRecord[]> {
  return loadArLedgerClientsForMonths(supabase, companyId, [monthKey]);
}

/** Live Invoice Desk revenue for one billing month — shift rollup + SM patrols − deductions. */
export async function loadLiveArMonthRevenue(
  supabase: SupabaseClient,
  companyId: string,
  monthKey: string,
): Promise<LiveArMonthRevenue> {
  const clients = await loadArLedgerClientsForMonth(supabase, companyId, monthKey);
  return sumLiveArMonthRevenue(clients, monthKey);
}
