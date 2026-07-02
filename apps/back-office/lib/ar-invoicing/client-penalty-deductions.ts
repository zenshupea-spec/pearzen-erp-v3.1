import type { SupabaseClient } from '@supabase/supabase-js';

import {
  DEFAULT_PENALTY_CATALOG,
  parsePenaltyCatalog,
} from '../../../../packages/penalty-catalog';
import { resolveSmPenaltyCatalogLabel } from '../../app/fm/lib/fm-sm-penalties';
import { billingClientKeyForSite } from './live-ledger';
import type { ArClientDeduction } from './collection-math';

type SiteRow = {
  site_name: string;
  client_name: string | null;
  parent_client: string | null;
};

function siteKey(name: string): string {
  return name.trim().toLowerCase();
}

function monthKeyFromDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return trimmed.slice(0, 7);
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return null;
  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}`;
}

function resolveClientNameForPenalty(
  siteName: string | null | undefined,
  sites: SiteRow[],
): string | null {
  const raw = String(siteName ?? '').trim();
  if (!raw) return null;
  const key = siteKey(raw);
  const site =
    sites.find((row) => siteKey(row.site_name) === key) ??
    sites.find((row) => siteKey(row.client_name ?? '') === key) ??
    sites.find((row) => siteKey(row.parent_client ?? '') === key);
  if (site) return billingClientKeyForSite(site);
  return raw;
}

function mergeDeductionRows(
  live: ArClientDeduction[] | undefined,
  persisted: ArClientDeduction[] | undefined,
): ArClientDeduction[] | undefined {
  const liveRows = live ?? [];
  const persistedRows = persisted ?? [];
  if (!liveRows.length) return persistedRows.length ? persistedRows : undefined;
  const persistedById = new Map(persistedRows.map((row) => [row.penaltyId, row]));
  return liveRows.map((row) => {
    const saved = persistedById.get(row.penaltyId);
    return {
      ...row,
      ...saved,
      liabilityType: saved?.liabilityType ?? row.liabilityType ?? 'PASS_TO_GUARD',
    };
  });
}

export function mergeClientDeductions(
  live: unknown[] | undefined,
  persisted: unknown[] | undefined,
): unknown[] | undefined {
  return mergeDeductionRows(
    live as ArClientDeduction[] | undefined,
    persisted as ArClientDeduction[] | undefined,
  );
}

export async function fetchClientPenaltyDeductionsByClientMonth(
  supabase: SupabaseClient,
  companyId: string,
  monthKeys: string[],
  sites: SiteRow[],
): Promise<Map<string, Map<string, ArClientDeduction[]>>> {
  const monthSet = new Set(monthKeys);
  const result = new Map<string, Map<string, ArClientDeduction[]>>();

  const { data: settings } = await supabase
    .from('md_settings')
    .select('penalty_catalog')
    .eq('company_id', companyId)
    .maybeSingle();
  const catalog = parsePenaltyCatalog(
    (settings as { penalty_catalog?: unknown } | null)?.penalty_catalog,
  );

  const { data: penalties, error } = await supabase
    .from('sm_guard_penalties')
    .select(
      'id, guard_epf, guard_name, penalty_type, penalty_catalog_id, deduction_amount, site_name, reason, shift_date, status, created_at',
    )
    .in('status', ['APPROVED', 'APPLIED']);

  if (error) {
    if (/does not exist|42P01/i.test(error.message)) return result;
    console.error('fetchClientPenaltyDeductionsByClientMonth:', error.message);
    return result;
  }

  for (const row of penalties ?? []) {
    const monthKey =
      monthKeyFromDate(row.shift_date as string | null) ??
      monthKeyFromDate(row.created_at as string | null);
    if (!monthKey || !monthSet.has(monthKey)) continue;

    const clientName = resolveClientNameForPenalty(row.site_name as string | null, sites);
    if (!clientName) continue;

    const amountLkr = Math.max(0, Math.round(Number(row.deduction_amount ?? 0)));
    if (amountLkr <= 0) continue;

    const catalogLabel = resolveSmPenaltyCatalogLabel(
      row.penalty_type as string | null,
      row.penalty_catalog_id as string | null,
      catalog.length ? catalog : DEFAULT_PENALTY_CATALOG,
    );
    const guardEpf = String(row.guard_epf ?? '').trim();
    const guardName = String(row.guard_name ?? '').trim() || guardEpf || 'Guard';
    const deduction: ArClientDeduction = {
      penaltyId: String(row.id),
      incidentRef: String(row.reason ?? catalogLabel).slice(0, 120),
      totalClientLoss: amountLkr,
      deductionThisMonth: amountLkr,
      responsibleGuards: guardEpf ? [{ empNo: guardEpf, name: guardName }] : [],
      monthlyDeductionPerGuard: amountLkr,
      durationMonths: 1,
      monthsCompleted: 0,
      recoveredToDate: 0,
      omNote: catalogLabel,
      liabilityType: 'PASS_TO_GUARD',
    };

    const byMonth = result.get(clientName) ?? new Map<string, ArClientDeduction[]>();
    const rows = byMonth.get(monthKey) ?? [];
    rows.push(deduction);
    byMonth.set(monthKey, rows);
    result.set(clientName, byMonth);
  }

  return result;
}
