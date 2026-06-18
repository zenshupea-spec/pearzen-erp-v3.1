'use server';

import { unstable_noStore as noStore } from 'next/cache';
import { createSupabaseServerClient } from '../../../../packages/supabase/server';
import { createSupabaseServiceClient } from '../../../../packages/supabase/service';
import {
  fetchWithRosterCompanyFallback,
  resolveCompanyIdForSession,
  rosterCompanyId,
} from '../../lib/company-context-server';
import {
  applyRolloverDebts,
  buildGuardRostersByClient,
  buildLiveLedgerClients,
  filterOutDemoClients,
  type ArGuardRosterEntry,
  type ArLedgerClientRecord,
} from '../../lib/ar-invoicing/live-ledger';
import {
  buildChronoMonthKeys,
  buildRollingMonthKeys,
  getCurrentMonthKey,
} from '../../lib/ar-invoicing/month-window';
import type { InvoiceBillingClient } from '../../lib/invoice-desk/types';
import { auditStaffAction } from '../../lib/staff-audit';

export type { ArLedgerClientRecord };

export type ArLedgerPayload = {
  clients: ArLedgerClientRecord[];
  dispatched: string[];
  taxSeq: Record<string, number>;
  billingClients: InvoiceBillingClient[];
  guardRostersByClient: Record<string, ArGuardRosterEntry[]>;
  currentMonthKey: string;
  rollingMonthKeys: string[];
  error?: string;
};

const EMPTY: ArLedgerPayload = {
  clients: [],
  dispatched: [],
  taxSeq: {},
  billingClients: [],
  guardRostersByClient: {},
  currentMonthKey: getCurrentMonthKey(),
  rollingMonthKeys: buildRollingMonthKeys(getCurrentMonthKey(), 12),
};

function slugClientId(name: string, index: number): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 32);
  return base ? `client-${base}` : `client-${index + 1}`;
}

async function resolveCompanyId(): Promise<string | null> {
  const supabase = await createSupabaseServerClient();
  const sessionCompanyId = await resolveCompanyIdForSession(supabase);
  return rosterCompanyId(sessionCompanyId);
}

async function fetchSiteProfiles(companyId: string | null) {
  const supabase = createSupabaseServiceClient();
  let query = supabase
    .from('site_profiles')
    .select(
      'id, site_name, client_name, parent_client, address, client_billing_address, assigned_sm_epf, rate_matrix, per_visit_charge_lkr',
    )
    .order('client_name', { ascending: true });

  if (companyId) query = query.eq('company_id', companyId);

  const { data, error } = await query;
  if (error) {
    console.error('❌ SUPABASE ERROR (fetchSiteProfiles):', error.message);
    return [];
  }
  return data ?? [];
}

async function fetchEmployees(companyId: string | null) {
  const supabase = createSupabaseServiceClient();
  let query = supabase
    .from('employees')
    .select('id, emp_number, full_name, rank, site, group, epf_no, epf_num, status')
    .ilike('status', 'active')
    .order('full_name', { ascending: true });
  if (companyId) query = query.eq('company_id', companyId);
  const { data, error } = await query;
  if (error) {
    console.error('❌ SUPABASE ERROR (fetchEmployees):', error.message);
    return [];
  }
  return data ?? [];
}

function sitesToBillingClients(
  sites: Awaited<ReturnType<typeof fetchSiteProfiles>>,
): InvoiceBillingClient[] {
  const seen = new Set<string>();
  const rows: InvoiceBillingClient[] = [];
  sites.forEach((site, index) => {
    const clientName =
      (site.client_name as string | null)?.trim() ||
      (site.parent_client as string | null)?.trim() ||
      site.site_name;
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

async function fetchBillingClients(companyId: string): Promise<InvoiceBillingClient[]> {
  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase
    .from('billing_clients')
    .select(
      'client_code, client_name, sector, address, purchaser_tin, invoice_contact_name, invoice_contact_phone',
    )
    .eq('company_id', companyId)
    .order('client_name', { ascending: true });

  if (error || !data?.length) return [];

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

async function upsertBillingClients(
  companyId: string,
  clients: InvoiceBillingClient[],
): Promise<void> {
  if (!clients.length) return;
  const supabase = createSupabaseServiceClient();
  const rows = clients.map((c) => ({
    company_id: companyId,
    client_code: c.clientId,
    client_name: c.clientName,
    sector: c.sector,
    address: c.address,
    purchaser_tin: c.purchaserTin,
    invoice_contact_name: c.invoiceContactName,
    invoice_contact_phone: c.invoiceContactPhone,
    updated_at: new Date().toISOString(),
  }));

  const { error } = await supabase.from('billing_clients').upsert(rows, {
    onConflict: 'company_id,client_code',
  });
  if (error) console.error('❌ SUPABASE ERROR (upsertBillingClients):', error.message);
}

/** Load AR ledger — invoice lines computed from live shifts; collection state from snapshot. */
export async function getArLedger(): Promise<ArLedgerPayload> {
  noStore();
  const companyId = await resolveCompanyId();
  const currentMonthKey = getCurrentMonthKey();
  const rollingMonthKeys = buildRollingMonthKeys(currentMonthKey, 12);

  if (!companyId) {
    return { ...EMPTY, currentMonthKey, rollingMonthKeys, error: 'No company context' };
  }

  const supabase = createSupabaseServiceClient();
  const { data: snapshot, error } = await supabase
    .from('ar_ledger_snapshots')
    .select('clients, dispatched, tax_seq')
    .eq('company_id', companyId)
    .maybeSingle();

  if (error) {
    console.error('❌ SUPABASE ERROR (getArLedger):', error.message);
    return { ...EMPTY, currentMonthKey, rollingMonthKeys, error: error.message };
  }

  const [sites, employees] = await Promise.all([
    fetchWithRosterCompanyFallback(fetchSiteProfiles, companyId),
    fetchWithRosterCompanyFallback(fetchEmployees, companyId),
  ]);

  let billingClients = await fetchBillingClients(companyId);
  if (!billingClients.length) {
    billingClients = sitesToBillingClients(sites);
    if (billingClients.length) {
      await upsertBillingClients(companyId, billingClients);
    }
  }

  const persistedClients = filterOutDemoClients(
    ((snapshot?.clients as ArLedgerClientRecord[]) ?? []).map((c) => ({
      ...c,
      invoices: c.invoices ?? {},
    })),
  );

  const liveClients = await buildLiveLedgerClients(
    supabase,
    companyId,
    billingClients,
    sites as Parameters<typeof buildLiveLedgerClients>[3],
    employees as Parameters<typeof buildLiveLedgerClients>[4],
    persistedClients,
    rollingMonthKeys,
  );

  const chronoKeys = buildChronoMonthKeys(
    new Date().getFullYear() - 5,
    new Date().getFullYear() + 1,
  );
  const clients = applyRolloverDebts(liveClients, chronoKeys);

  const sitesByClient = new Map<string, typeof sites>();
  for (const site of sites) {
    const name =
      (site.client_name as string | null)?.trim() ||
      (site.parent_client as string | null)?.trim() ||
      site.site_name;
    const list = sitesByClient.get(name) ?? [];
    list.push(site);
    sitesByClient.set(name, list);
  }

  const guardRostersByClient = buildGuardRostersByClient(
    clients,
    employees as Parameters<typeof buildGuardRostersByClient>[1],
    sitesByClient as Parameters<typeof buildGuardRostersByClient>[2],
  );

  return {
    clients,
    dispatched: (snapshot?.dispatched as string[]) ?? [],
    taxSeq: (snapshot?.tax_seq as Record<string, number>) ?? {},
    billingClients,
    guardRostersByClient,
    currentMonthKey,
    rollingMonthKeys,
  };
}

/** Persist AR ledger collection state and billing client directory. */
export async function saveArLedger(payload: {
  clients: ArLedgerClientRecord[];
  dispatched: string[];
  taxSeq: Record<string, number>;
  billingClients?: InvoiceBillingClient[];
}): Promise<{ ok: boolean; error?: string }> {
  noStore();
  const companyId = await resolveCompanyId();
  if (!companyId) return { ok: false, error: 'No company context' };

  const supabase = createSupabaseServiceClient();
  const { error } = await supabase.from('ar_ledger_snapshots').upsert(
    {
      company_id: companyId,
      clients: filterOutDemoClients(payload.clients),
      dispatched: payload.dispatched,
      tax_seq: payload.taxSeq,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'company_id' },
  );

  if (error) {
    console.error('❌ SUPABASE ERROR (saveArLedger):', error.message);
    return { ok: false, error: error.message };
  }

  if (payload.billingClients?.length) {
    await upsertBillingClients(companyId, payload.billingClients);
  }

  const authSupabase = await createSupabaseServerClient();
  await auditStaffAction({
    supabase: authSupabase,
    portal: 'invoice',
    action: 'Save AR Ledger',
    targetEntity: `${payload.clients.length} client(s)`,
    details: {
      clientCount: payload.clients.length,
      dispatchedCount: payload.dispatched.length,
    },
  });

  return { ok: true };
}
