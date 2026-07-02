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
  billingClientKeyForSite,
  buildLiveLedgerClients,
  filterOutDemoClients,
  type ArGuardRostersByClientMonth,
  type ArLedgerClientRecord,
} from '../../lib/ar-invoicing/live-ledger';
import {
  AR_BILLING_CYCLE_DEFAULTS,
  loadArBillingCycle,
  type ArBillingCycle,
} from '../../lib/ar-invoicing/billing-cycle';
import {
  applyRolloverDebts,
  assertLedgerCellTotals,
  normalizeLedgerCellTotals,
  stripComputedRollovers,
  validatePaymentCollectionAmounts,
} from '../../lib/ar-invoicing/collection-math';
import {
  arLedgerActorRole,
  collectPaymentStatusChanges,
  paymentVerifyAuditAction,
  proofRefFromProofUrl,
  stampPaymentAuditActors,
  validatePaymentStatusTransition,
} from '../../lib/ar-invoicing/payment-guards';
import {
  assignReservedTaxInvoiceNumbers,
  casReserveTaxSequences,
  globalTaxSeqFromState,
  mergeAuthoritativeTaxSeq,
  mergePreservedTaxInvoiceNumbers,
  syncTaxSequenceCounter,
} from '../../lib/ar-invoicing/tax-invoice-allocator';
import {
  countMissingTaxInvoiceNumbers,
  deriveTaxSeqFromClients,
} from '../../lib/invoice-desk/tax-invoice';
import {
  buildChronoMonthKeys,
  buildRollingMonthKeys,
  getCurrentMonthKey,
} from '../../lib/ar-invoicing/month-window';
import {
  loadCollectionWarningSnapshot,
  type CollectionWarningSnapshot,
} from '../../lib/ar-invoicing/collection-warning';
import type { InvoiceBillingClient } from '../../lib/invoice-desk/types';
import { auditStaffAction, resolveStaffAuditContext } from '../../lib/staff-audit';

export type { ArLedgerClientRecord };

export type ArLedgerPayload = {
  clients: ArLedgerClientRecord[];
  dispatched: string[];
  taxSeq: Record<string, number>;
  billingClients: InvoiceBillingClient[];
  guardRostersByClientMonth: ArGuardRostersByClientMonth;
  currentMonthKey: string;
  rollingMonthKeys: string[];
  billingCycle: ArBillingCycle;
  error?: string;
};

const EMPTY: ArLedgerPayload = {
  clients: [],
  dispatched: [],
  taxSeq: {},
  billingClients: [],
  guardRostersByClientMonth: {},
  currentMonthKey: getCurrentMonthKey(),
  rollingMonthKeys: buildRollingMonthKeys(getCurrentMonthKey(), 12),
  billingCycle: AR_BILLING_CYCLE_DEFAULTS,
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
    .neq('site_status', 'ARCHIVED')
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

  const [sites, employees, billingCycle] = await Promise.all([
    fetchWithRosterCompanyFallback(fetchSiteProfiles, companyId),
    fetchWithRosterCompanyFallback(fetchEmployees, companyId),
    loadArBillingCycle(companyId),
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

  const { clients: liveClients, guardRostersByClientMonth } = await buildLiveLedgerClients(
    supabase,
    companyId,
    billingClients,
    sites as Parameters<typeof buildLiveLedgerClients>[3],
    employees as Parameters<typeof buildLiveLedgerClients>[4],
    persistedClients,
    rollingMonthKeys,
    billingCycle,
  );

  const chronoKeys = buildChronoMonthKeys(
    new Date().getFullYear() - 5,
    new Date().getFullYear() + 1,
  );
  const clients = normalizeLedgerCellTotals(applyRolloverDebts(liveClients, chronoKeys));
  assertLedgerCellTotals(clients);
  const taxSeq = await mergeAuthoritativeTaxSeq(
    supabase,
    companyId,
    (snapshot?.tax_seq as Record<string, number>) ?? {},
    clients,
  );

  return {
    clients,
    dispatched: (snapshot?.dispatched as string[]) ?? [],
    taxSeq,
    billingClients,
    guardRostersByClientMonth,
    currentMonthKey,
    rollingMonthKeys,
    billingCycle,
  };
}

export type AllocateArTaxInvoiceNumbersResult = {
  ok: boolean;
  clients?: ArLedgerClientRecord[];
  taxSeq?: Record<string, number>;
  changed?: boolean;
  error?: string;
};

/** Atomically assign missing tax invoice numbers — authoritative over desk localStorage. */
export async function allocateArTaxInvoiceNumbers(): Promise<AllocateArTaxInvoiceNumbersResult> {
  noStore();
  const authSupabase = await createSupabaseServerClient();
  const auditCtx = await resolveStaffAuditContext(authSupabase);
  if (!auditCtx) return { ok: false, error: 'Unauthorized' };

  const companyId = auditCtx.companyId;
  const db = createSupabaseServiceClient();

  try {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const ledger = await getArLedger();
      if (ledger.error) return { ok: false, error: ledger.error };

      const missing = countMissingTaxInvoiceNumbers(ledger.clients);
      if (missing === 0) {
        return { ok: true, clients: ledger.clients, taxSeq: ledger.taxSeq, changed: false };
      }

      const startFrom = Math.max(
        globalTaxSeqFromState(ledger.taxSeq),
        globalTaxSeqFromState(deriveTaxSeqFromClients(ledger.clients)),
      );
      const reserved = await casReserveTaxSequences(db, companyId, startFrom, missing);
      if (!reserved) continue;

      const { clients: assigned, taxSeq, changed } = assignReservedTaxInvoiceNumbers(
        ledger.clients,
        startFrom,
      );

      const { data: existingSnapshot } = await db
        .from('ar_ledger_snapshots')
        .select('clients, dispatched')
        .eq('company_id', companyId)
        .maybeSingle();

      const { error } = await db.from('ar_ledger_snapshots').upsert(
        {
          company_id: companyId,
          clients: assigned,
          dispatched: (existingSnapshot?.dispatched as string[]) ?? ledger.dispatched,
          tax_seq: taxSeq,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'company_id' },
      );

      if (error) {
        console.error('❌ SUPABASE ERROR (allocateArTaxInvoiceNumbers):', error.message);
        return { ok: false, error: error.message };
      }

      await syncTaxSequenceCounter(db, companyId, globalTaxSeqFromState(taxSeq));

      return { ok: true, clients: assigned, taxSeq, changed };
    }

    return { ok: false, error: 'Could not reserve tax invoice sequence — concurrent desk conflict' };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Tax invoice allocation failed';
    return { ok: false, error: message };
  }
}

/** Persist AR ledger collection state and billing client directory. */
export async function saveArLedger(payload: {
  clients: ArLedgerClientRecord[];
  dispatched: string[];
  taxSeq: Record<string, number>;
  billingClients?: InvoiceBillingClient[];
}): Promise<{ ok: boolean; error?: string }> {
  noStore();
  const authSupabase = await createSupabaseServerClient();
  const auditCtx = await resolveStaffAuditContext(authSupabase);
  if (!auditCtx) return { ok: false, error: 'Unauthorized' };

  const companyId = auditCtx.companyId;
  const actorRole = arLedgerActorRole(auditCtx.actorRole);
  const {
    data: { user },
  } = await authSupabase.auth.getUser();
  const actorLabel = user?.email ?? auditCtx.actorName;

  const db = createSupabaseServiceClient();
  const { data: existingSnapshot } = await db
    .from('ar_ledger_snapshots')
    .select('clients')
    .eq('company_id', companyId)
    .maybeSingle();

  const beforeClients = filterOutDemoClients(
    ((existingSnapshot?.clients as ArLedgerClientRecord[]) ?? []).map((client) => ({
      ...client,
      invoices: client.invoices ?? {},
    })),
  );
  const incomingClients = filterOutDemoClients(payload.clients);
  const paymentChanges = collectPaymentStatusChanges(beforeClients, incomingClients);

  for (const change of paymentChanges) {
    const result = validatePaymentStatusTransition(actorRole, change);
    if (!result.ok) {
      return {
        ok: false,
        error: `${change.clientName} ${change.monthKey}: ${result.error}`,
      };
    }
  }

  const chronoKeys = buildChronoMonthKeys(new Date().getFullYear() - 5, new Date().getFullYear() + 1);

  for (const change of paymentChanges) {
    const client = incomingClients.find((row) => row.clientId === change.clientId);
    const priorKeyIndex = chronoKeys.indexOf(change.monthKey) - 1;
    const priorKey = priorKeyIndex >= 0 ? chronoKeys[priorKeyIndex] : undefined;
    const priorPartialCell =
      priorKey && client?.invoices[priorKey]?.status === 'PARTIAL'
        ? client.invoices[priorKey]
        : undefined;
    const amountResult = validatePaymentCollectionAmounts(change, priorPartialCell);
    if (!amountResult.ok) {
      return { ok: false, error: amountResult.error };
    }
  }

  let clientsToSave = applyRolloverDebts(
    stripComputedRollovers(
      stampPaymentAuditActors(incomingClients, paymentChanges, actorLabel),
    ),
    chronoKeys,
  );

  clientsToSave = normalizeLedgerCellTotals(
    mergePreservedTaxInvoiceNumbers(beforeClients, clientsToSave),
  );
  const taxSeq = deriveTaxSeqFromClients(clientsToSave);

  const { error } = await db.from('ar_ledger_snapshots').upsert(
    {
      company_id: companyId,
      clients: clientsToSave,
      dispatched: payload.dispatched,
      tax_seq: taxSeq,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'company_id' },
  );

  if (error) {
    console.error('❌ SUPABASE ERROR (saveArLedger):', error.message);
    return { ok: false, error: error.message };
  }

  await syncTaxSequenceCounter(db, companyId, globalTaxSeqFromState(taxSeq));

  if (payload.billingClients?.length) {
    await upsertBillingClients(companyId, payload.billingClients);
  }

  for (const change of paymentChanges) {
    const verifyAction = paymentVerifyAuditAction(change.toStatus);
    if (!verifyAction) continue;

    const afterCell = change.after;
    const proofRef = proofRefFromProofUrl(
      afterCell.paymentProof ?? afterCell.pendingVerificationProof ?? change.before.pendingVerificationProof,
    );
    const verifiedAmount =
      change.toStatus === 'PARTIAL' || change.toStatus === 'SETTLED_FINED'
        ? afterCell.amountReceived ?? change.before.amountReceived
        : afterCell.totalAmount;

    await auditStaffAction({
      supabase: authSupabase,
      companyId: auditCtx.companyId,
      profileId: auditCtx.profileId,
      actorName: actorLabel,
      actorRole: auditCtx.actorRole,
      ipAddress: auditCtx.ipAddress,
      portal: 'invoice',
      action: verifyAction,
      targetEntity:
        afterCell.taxInvoiceNo ??
        afterCell.invoiceNo ??
        `${change.clientName} · ${change.monthKey}`,
      details: {
        checkerEmail: actorLabel,
        clientId: change.clientId,
        clientName: change.clientName,
        monthKey: change.monthKey,
        invoiceNo: afterCell.invoiceNo,
        taxInvoiceNo: afterCell.taxInvoiceNo,
        proofRef,
        verifiedAmountLkr: verifiedAmount,
        statusAfter: change.toStatus,
      },
    });
  }

  if (paymentChanges.length === 0) {
    await auditStaffAction({
      supabase: authSupabase,
      portal: 'invoice',
      action: 'Save AR Ledger',
      targetEntity: `${clientsToSave.length} client(s)`,
      details: {
        clientCount: clientsToSave.length,
        dispatchedCount: payload.dispatched.length,
      },
    });
  }

  return { ok: true };
}

export type { CollectionWarningSnapshot };

const EMPTY_COLLECTION_WARNING: CollectionWarningSnapshot = {
  active: false,
  shortfallLkr: 0,
  gapTargetLkr: 0,
  cashReceivedLkr: 0,
  collectionWarningDay: 6,
  silencedByDisputes: false,
  warningDayReached: false,
  serviceMonthKey: '',
};

/** Collection warning for MD Cash Buffer + EA AR Collections banner (R-FIN-03). */
export async function fetchCollectionWarningStatus(
  serviceMonthKey: string,
): Promise<CollectionWarningSnapshot> {
  noStore();
  const authSupabase = await createSupabaseServerClient();
  const auditCtx = await resolveStaffAuditContext(authSupabase);
  if (!auditCtx) return { ...EMPTY_COLLECTION_WARNING, serviceMonthKey };

  const db = createSupabaseServiceClient();
  return loadCollectionWarningSnapshot(db, auditCtx.companyId, serviceMonthKey);
}
