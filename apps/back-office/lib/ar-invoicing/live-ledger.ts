import type { SupabaseClient } from '@supabase/supabase-js';
import {
  fetchMonthlySiteShiftRollup,
  type GuardEmpRow,
} from '../../app/hq/deductions/lib/monthly-site-shifts';
import { payrollMonthDateRange, payrollMonthFirstDay } from '../../app/hq/deductions/lib/payroll-month';
import type { InvoiceBillingClient } from '../invoice-desk/types';
import {
  buildRollingMonthKeys,
  getCurrentMonthKey,
  invoiceDueDate,
  monthKeyToLabel,
} from './month-window';
import {
  AR_BILLING_CYCLE_DEFAULTS,
  type ArBillingCycle,
} from './billing-cycle';
import {
  applyRolloverDebts as applyCollectionRolloverDebts,
  recomputeCellTotalAmount,
} from './collection-math';
import {
  fetchClientPenaltyDeductionsByClientMonth,
  mergeClientDeductions,
} from './client-penalty-deductions';
import {
  invoiceRateForRank,
  normalizeGuardRank,
  parseSiteRateMatrix,
  type GuardRankKey,
  type SiteRateMatrixEntry,
} from '../guard-site-pay';

export type ArRankKey = GuardRankKey;

export type ArRankShiftLine = {
  rank: ArRankKey;
  headcount: number;
  shiftsPerHead: number;
  ratePerShift: number;
  isEventBill?: boolean;
  eventLabel?: string;
};

export type ArPatrolVisit = {
  visitId: string;
  date: string;
  sm: string;
  charge: number;
};

export type ArInvoiceCell = {
  status: string;
  invoiceNo: string;
  totalAmount: number;
  rankLines: ArRankShiftLine[];
  patrols: ArPatrolVisit[];
  paidDate?: string;
  dueDate?: string;
  paymentProof?: string;
  pendingVerificationProof?: string;
  amountReceived?: number;
  clientDeductions?: unknown[];
  disputeRef?: string;
  disputeNote?: string;
  creditNotes?: unknown[];
  invoicePrintCount?: number;
  invoiceDownloadCount?: number;
  taxInvoiceNo?: string;
  taxInvoicePrintedAt?: string;
  rolloverDebt?: number;
  rolloverFromMonth?: string;
  auditEvents?: unknown[];
};

export type ArLedgerClientRecord = {
  clientId: string;
  clientName: string;
  sector: string;
  invoices: Record<string, ArInvoiceCell>;
};

import {
  buildGuardRosterFromEmployeeShifts,
  type ArEmployeeShiftRow,
  type ArGuardRosterEntry,
  type ArGuardRostersByClientMonth,
} from './guard-roster';
export {
  buildGuardRosterFromEmployeeShifts,
  guardRosterForCell,
  type ArEmployeeShiftRow,
  type ArGuardRosterEntry,
  type ArGuardRostersByClientMonth,
} from './guard-roster';

type RankRateEntry = SiteRateMatrixEntry;

type SiteRow = {
  id: string;
  site_name: string;
  client_name: string | null;
  parent_client: string | null;
  rate_matrix: unknown;
  per_visit_charge_lkr: number | null;
  assigned_sm_epf: string | null;
};

type EmployeeRow = {
  id: string;
  emp_number: string | null;
  full_name: string | null;
  rank: string | null;
  site: string | null;
  group?: string | null;
  epf_no?: string | null;
  epf_num?: string | number | null;
};

const DEMO_CLIENT_IDS = new Set(['C001', 'C002', 'C003', 'C004']);

function parseRateMatrix(value: unknown): Partial<Record<ArRankKey, RankRateEntry>> {
  return parseSiteRateMatrix(value);
}

function normalizeRank(rank: string | null | undefined): ArRankKey {
  return normalizeGuardRank(rank);
}

function siteKey(name: string): string {
  return name.trim().toLowerCase();
}

function makeInvoiceNo(monthKey: string, seq: number): string {
  const yy = monthKey.slice(2, 4);
  const mm = monthKey.slice(5, 7);
  return `INV-${yy}${mm}-${String(seq).padStart(3, '0')}`;
}

function cellHasBillableContent(cell: ArInvoiceCell | undefined): boolean {
  if (!cell) return false;
  return cell.rankLines.length > 0 || cell.patrols.length > 0 || cell.totalAmount > 0;
}

function isCollectionState(status: string | undefined): boolean {
  return (
    status === 'PAID' ||
    status === 'PARTIAL' ||
    status === 'PENDING' ||
    status === 'PENDING_MD_VERIFICATION' ||
    status === 'DISPUTED' ||
    status === 'SETTLED_FINED'
  );
}

/** Merge live shift-derived lines with persisted payment/collection metadata. */
function mergeInvoiceCell(
  live: ArInvoiceCell | null,
  persisted: ArInvoiceCell | undefined,
): ArInvoiceCell | undefined {
  if (!live && !persisted) return undefined;

  if (!live && persisted) {
    if (!isCollectionState(persisted.status)) return undefined;
    const hasCollectionActivity =
      Boolean(persisted.paymentProof) ||
      Boolean(persisted.pendingVerificationProof) ||
      Boolean(persisted.paidDate) ||
      (persisted.auditEvents?.length ?? 0) > 0 ||
      (persisted.creditNotes?.length ?? 0) > 0;
    return hasCollectionActivity ? persisted : undefined;
  }

  if (!persisted) return live!;

  const useLiveLines = cellHasBillableContent(live!);
  const merged: ArInvoiceCell = {
    ...live!,
    status: persisted.status !== 'NONE' ? persisted.status : live!.status,
    invoiceNo: persisted.invoiceNo || live!.invoiceNo,
    paidDate: persisted.paidDate,
    dueDate: live!.dueDate ?? persisted.dueDate,
    paymentProof: persisted.paymentProof,
    pendingVerificationProof: persisted.pendingVerificationProof,
    amountReceived: persisted.amountReceived,
    clientDeductions: mergeClientDeductions(live!.clientDeductions, persisted.clientDeductions),
    disputeRef: persisted.disputeRef,
    disputeNote: persisted.disputeNote,
    creditNotes: persisted.creditNotes,
    invoicePrintCount: persisted.invoicePrintCount,
    invoiceDownloadCount: persisted.invoiceDownloadCount,
    taxInvoiceNo: persisted.taxInvoiceNo,
    taxInvoicePrintedAt: persisted.taxInvoicePrintedAt,
    rolloverDebt: persisted.rolloverDebt,
    rolloverFromMonth: persisted.rolloverFromMonth,
    auditEvents: persisted.auditEvents,
  };

  if (!useLiveLines && isCollectionState(persisted.status)) {
    merged.rankLines = persisted.rankLines ?? [];
    merged.patrols = persisted.patrols ?? [];
    if (cellHasBillableContent(merged)) {
      merged.totalAmount = recomputeCellTotalAmount(merged);
    } else {
      merged.totalAmount = persisted.totalAmount;
    }
  } else if (useLiveLines) {
    merged.totalAmount = recomputeCellTotalAmount(merged);
  }

  if (!cellHasBillableContent(merged) && !isCollectionState(merged.status)) {
    return undefined;
  }

  return merged;
}

function buildRankLines(
  employeeShifts: {
    employeeId: string;
    rank: ArRankKey;
    rate: number;
    shifts: number;
    isEventBill?: boolean;
    eventLabel?: string;
  }[],
): ArRankShiftLine[] {
  const groups = new Map<
    string,
    {
      rank: ArRankKey;
      rate: number;
      isEventBill?: boolean;
      eventLabel?: string;
      employees: Map<string, number>;
    }
  >();

  for (const row of employeeShifts) {
    if (row.shifts <= 0 || row.rate <= 0) continue;
    const key = `${row.rank}|${row.rate}|${row.isEventBill ? '1' : '0'}|${row.eventLabel ?? ''}`;
    let group = groups.get(key);
    if (!group) {
      group = {
        rank: row.rank,
        rate: row.rate,
        isEventBill: row.isEventBill,
        eventLabel: row.eventLabel,
        employees: new Map(),
      };
      groups.set(key, group);
    }
    group.employees.set(row.employeeId, (group.employees.get(row.employeeId) ?? 0) + row.shifts);
  }

  const lines: ArRankShiftLine[] = [];
  for (const group of groups.values()) {
    const headcount = group.employees.size;
    if (!headcount) continue;
    const totalShifts = [...group.employees.values()].reduce((s, n) => s + n, 0);
    lines.push({
      rank: group.rank,
      headcount,
      shiftsPerHead: Math.round(totalShifts / headcount),
      ratePerShift: group.rate,
      isEventBill: group.isEventBill,
      eventLabel: group.eventLabel,
    });
  }

  return lines.sort((a, b) => a.rank.localeCompare(b.rank));
}

async function fetchSmPatrols(
  supabase: SupabaseClient,
  companyId: string,
  monthKey: string,
  siteNames: Set<string>,
  siteChargeByName: Map<string, number>,
  smNames: Map<string, string>,
): Promise<ArPatrolVisit[]> {
  const { start, end } = payrollMonthDateRange(monthKey);
  const { data, error } = await supabase
    .from('sm_visit_logs')
    .select('id, sm_epf, site_name, visit_date, created_at, verification_status')
    .eq('company_id', companyId)
    .eq('visit_type', 'VISIT')
    .gte('visit_date', start)
    .lte('visit_date', end);

  if (error) {
    console.error('❌ AR live-ledger (sm_visit_logs):', error.message);
    return [];
  }

  const patrols: ArPatrolVisit[] = [];
  for (const row of data ?? []) {
    const siteName = String(row.site_name ?? '').trim();
    if (!siteName || !siteNames.has(siteKey(siteName))) continue;
    const charge = siteChargeByName.get(siteKey(siteName)) ?? 0;
    if (charge <= 0) continue;
    const visitDate =
      (row.visit_date as string | null) ??
      (row.created_at ? String(row.created_at).slice(0, 10) : '');
    patrols.push({
      visitId: String(row.id),
      date: visitDate,
      sm: smNames.get(String(row.sm_epf ?? '')) ?? String(row.sm_epf ?? 'SM'),
      charge,
    });
  }
  return patrols;
}

function resolveAdjustmentSiteKey(
  raw: string,
  siteIdToNameKey: Map<string, string>,
): string {
  return siteIdToNameKey.get(raw) ?? siteKey(raw);
}

async function fetchShiftAdjustments(
  supabase: SupabaseClient,
  companyId: string,
  monthKey: string,
  siteIdToNameKey: Map<string, string>,
): Promise<Map<string, number>> {
  const payrollMonth = payrollMonthFirstDay(monthKey);
  const { data } = await supabase
    .from('fm_shift_adjustments')
    .select('employee_id, site_key, delta_shifts')
    .eq('company_id', companyId)
    .eq('payroll_month', payrollMonth);

  const deltas = new Map<string, number>();
  for (const row of data ?? []) {
    const sk = resolveAdjustmentSiteKey(String(row.site_key ?? ''), siteIdToNameKey);
    const key = `${row.employee_id}:${sk}`;
    deltas.set(key, (deltas.get(key) ?? 0) + Number(row.delta_shifts ?? 0));
  }
  return deltas;
}

/** Invoice / AR client key — parent cluster wins over per-site client_name. */
export function billingClientKeyForSite(site: {
  site_name: string;
  client_name?: string | null;
  parent_client?: string | null;
}): string {
  return (site.parent_client?.trim() || site.client_name?.trim() || site.site_name).trim();
}

function clientNameForSite(site: SiteRow): string {
  return billingClientKeyForSite(site);
}

export function filterOutDemoClients(clients: ArLedgerClientRecord[]): ArLedgerClientRecord[] {
  return clients.filter((c) => !DEMO_CLIENT_IDS.has(c.clientId));
}

export async function buildLiveLedgerClients(
  supabase: SupabaseClient,
  companyId: string,
  billingClients: InvoiceBillingClient[],
  sites: SiteRow[],
  employees: EmployeeRow[],
  persistedClients: ArLedgerClientRecord[],
  monthKeys: string[] = buildRollingMonthKeys(getCurrentMonthKey(), 12),
  billingCycle: ArBillingCycle = AR_BILLING_CYCLE_DEFAULTS,
): Promise<{
  clients: ArLedgerClientRecord[];
  guardRostersByClientMonth: ArGuardRostersByClientMonth;
}> {
  const guardEmployees = employees.filter(
    (e) => !['HEAD_OFFICE', 'SECTOR_MANAGER', 'CAFE'].includes(String(e.group ?? '')),
  );
  const guardRows: GuardEmpRow[] = guardEmployees.map((e) => ({
    id: e.id,
    emp_number: e.emp_number,
    epf_no: e.epf_no ?? null,
    epf_num: e.epf_num ?? null,
  }));

  const empById = new Map(guardEmployees.map((e) => [e.id, e]));
  const smNames = new Map<string, string>();
  employees.forEach((e) => {
    if (e.emp_number) smNames.set(e.emp_number, e.full_name?.trim() || e.emp_number);
  });

  const sitesByClient = new Map<string, SiteRow[]>();
  for (const site of sites) {
    const name = clientNameForSite(site);
    const list = sitesByClient.get(name) ?? [];
    list.push(site);
    sitesByClient.set(name, list);
  }

  const persistedById = new Map(
    filterOutDemoClients(persistedClients).map((c) => [c.clientId, c]),
  );

  const clientRows: ArLedgerClientRecord[] = billingClients
    .filter((b) => b.clientName.trim())
    .map((b) => {
      const persisted = persistedById.get(b.clientId);
      return {
        clientId: b.clientId,
        clientName: b.clientName,
        sector: b.sector || persisted?.sector || '',
        invoices: {},
      };
    });

  if (!clientRows.length) {
    for (const [clientName, clientSites] of sitesByClient) {
      const first = clientSites[0];
      clientRows.push({
        clientId: `client-${siteKey(clientName).slice(0, 24)}`,
        clientName,
        sector: first?.site_name ?? '',
        invoices: {},
      });
    }
  }

  const shiftRollups = new Map<string, Awaited<ReturnType<typeof fetchMonthlySiteShiftRollup>>>();
  for (const monthKey of monthKeys) {
    shiftRollups.set(
      monthKey,
      await fetchMonthlySiteShiftRollup(supabase, guardRows, `${monthKey}-01`, companyId),
    );
  }

  const penaltyDeductionsByClientMonth = await fetchClientPenaltyDeductionsByClientMonth(
    supabase,
    companyId,
    monthKeys,
    sites,
  );

  const siteIdToNameKey = new Map(sites.map((s) => [s.id, siteKey(s.site_name)]));
  const adjustmentCache = new Map<string, Map<string, number>>();

  let invoiceSeq = 0;
  const guardRostersByClientMonth: ArGuardRostersByClientMonth = {};

  for (const client of clientRows) {
    const clientSites = sitesByClient.get(client.clientName) ?? [];
    const siteNameKeys = new Set(clientSites.map((s) => siteKey(s.site_name)));
    const siteChargeByName = new Map(
      clientSites.map((s) => [siteKey(s.site_name), Number(s.per_visit_charge_lkr ?? 0)]),
    );
    const persisted = persistedById.get(client.clientId);

    for (const monthKey of monthKeys) {
      const rollup = shiftRollups.get(monthKey)!;
      let adjustments = adjustmentCache.get(monthKey);
      if (!adjustments) {
        adjustments = await fetchShiftAdjustments(
          supabase,
          companyId,
          monthKey,
          siteIdToNameKey,
        );
        adjustmentCache.set(monthKey, adjustments);
      }

      const employeeShifts: ArEmployeeShiftRow[] = [];

      for (const site of clientSites) {
        const sk = siteKey(site.site_name);
        const matrix = parseRateMatrix(site.rate_matrix);
        const byEmployee = rollup.shiftCountBySite.get(sk);
        if (!byEmployee) continue;

        for (const [employeeId, shiftCount] of byEmployee) {
          const emp = empById.get(employeeId);
          if (!emp) continue;
          const rank = normalizeRank(emp.rank);
          const entry = matrix[rank];
          const rate = invoiceRateForRank(matrix, rank);
          const adjKey = `${employeeId}:${sk}`;
          const adjusted = Math.max(0, shiftCount + (adjustments.get(adjKey) ?? 0));
          if (adjusted <= 0) continue;
          employeeShifts.push({
            employeeId,
            rank,
            rate,
            shifts: adjusted,
            isEventBill: entry?.isEventBill,
            eventLabel: entry?.eventLabel,
          });
        }
      }

      const rankLines = buildRankLines(employeeShifts);
      const roster = buildGuardRosterFromEmployeeShifts(employeeShifts, empById);
      if (!guardRostersByClientMonth[client.clientId]) {
        guardRostersByClientMonth[client.clientId] = {};
      }
      guardRostersByClientMonth[client.clientId]![monthKey] = roster;

      const patrols = await fetchSmPatrols(
        supabase,
        companyId,
        monthKey,
        siteNameKeys,
        siteChargeByName,
        smNames,
      );
      const penaltyRows =
        penaltyDeductionsByClientMonth.get(client.clientName)?.get(monthKey) ?? [];
      const draftCell = {
        rankLines,
        patrols,
        ...(penaltyRows.length ? { clientDeductions: penaltyRows } : {}),
      };
      const totalAmount = recomputeCellTotalAmount(draftCell);

      let live: ArInvoiceCell | null = null;
      if (totalAmount > 0 || rankLines.length > 0 || patrols.length > 0) {
        invoiceSeq += 1;
        live = {
          status: 'PENDING',
          invoiceNo: makeInvoiceNo(monthKey, invoiceSeq),
          totalAmount,
          rankLines,
          patrols,
          dueDate: invoiceDueDate(monthKey, {
            invoiceDispatchDay: billingCycle.invoiceDispatchDay,
            collectionWarningDay: billingCycle.collectionWarningDay,
          }),
          ...(penaltyRows.length ? { clientDeductions: penaltyRows } : {}),
        };
      }

      const merged = mergeInvoiceCell(live, persisted?.invoices[monthKey]);
      if (merged) {
        client.invoices[monthKey] = merged;
      }
    }
  }

  return { clients: clientRows, guardRostersByClientMonth };
}

export function applyRolloverDebts(
  clients: ArLedgerClientRecord[],
  chronoKeys: string[],
): ArLedgerClientRecord[] {
  return applyCollectionRolloverDebts(clients, chronoKeys);
}
