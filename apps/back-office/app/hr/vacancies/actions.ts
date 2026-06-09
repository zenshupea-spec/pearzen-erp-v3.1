'use server';

import { createSupabaseServerClient } from '../../../../../packages/supabase/server';
import {
  fetchWithRosterCompanyFallback,
  resolveCompanyIdForSession,
} from '../../../lib/company-context';

export type GuardRankKey = 'CSO' | 'OIC' | 'SSO' | 'JSO' | 'LSO';

export type RankVacancy = {
  rank: GuardRankKey;
  needed: number;
};

export type SiteVacancyCard = {
  siteId: string;
  siteName: string;
  address: string;
  sectorManager: string | null;
  rankGaps: RankVacancy[];
  totalNeeded: number;
};

export type GuardVacanciesPayload = {
  sites: SiteVacancyCard[];
  totalGuardsNeeded: number;
  totalClientSites: number;
  error?: string;
};

const RANKS: GuardRankKey[] = ['CSO', 'OIC', 'SSO', 'JSO', 'LSO'];
const GUARD_GROUPS = ['GUARD', 'GUARD_FIELD'] as const;

type RateMatrixRow = { qty?: number };

function normalizeSiteKey(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

function normalizeRank(rank: string | null | undefined): GuardRankKey | null {
  const r = (rank ?? '').trim().toUpperCase();
  return RANKS.includes(r as GuardRankKey) ? (r as GuardRankKey) : null;
}

function parseRateMatrixQty(value: unknown): Partial<Record<GuardRankKey, number>> {
  if (!value || typeof value !== 'object') return {};
  const out: Partial<Record<GuardRankKey, number>> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!RANKS.includes(key as GuardRankKey) || !raw || typeof raw !== 'object') continue;
    const qty = Number((raw as RateMatrixRow).qty) || 0;
    if (qty > 0) out[key as GuardRankKey] = qty;
  }
  return out;
}

function defaultSlotRank(index: number, required: number): GuardRankKey {
  if (required >= 3 && index === required - 1) return 'OIC';
  if (required >= 2 && index < 2) return 'SSO';
  return 'JSO';
}

function requiredRanksForSite(
  rateMatrix: Partial<Record<GuardRankKey, number>>,
  requiredGuards: number,
): Partial<Record<GuardRankKey, number>> {
  const hasMatrix = Object.values(rateMatrix).some((qty) => (qty ?? 0) > 0);
  if (hasMatrix) return rateMatrix;

  const required: Partial<Record<GuardRankKey, number>> = {};
  const count = Math.max(1, requiredGuards);
  for (let i = 0; i < count; i++) {
    const rank = defaultSlotRank(i, count);
    required[rank] = (required[rank] ?? 0) + 1;
  }
  return required;
}

function rankGapsFromCounts(
  required: Partial<Record<GuardRankKey, number>>,
  assigned: Partial<Record<GuardRankKey, number>>,
): RankVacancy[] {
  const gaps: RankVacancy[] = [];
  for (const rank of RANKS) {
    const need = Math.max(0, (required[rank] ?? 0) - (assigned[rank] ?? 0));
    if (need > 0) gaps.push({ rank, needed: need });
  }
  return gaps;
}

async function fetchClientSites(companyId: string | null) {
  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from('site_profiles')
    .select(
      'id, site_name, address, required_guards, rate_matrix, assigned_sm_epf, site_status',
    )
    .gt('required_guards', 0)
    .order('site_name', { ascending: true });

  if (companyId) {
    query = query.eq('company_id', companyId);
  }

  const { data, error } = await query;
  if (error) {
    console.error('[HR vacancies] site_profiles:', error.message);
    return [];
  }
  return data ?? [];
}

async function fetchActiveGuards(companyId: string | null) {
  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from('employees')
    .select('site, rank, status, group')
    .eq('status', 'ACTIVE')
    .in('group', [...GUARD_GROUPS]);

  if (companyId) {
    query = query.eq('company_id', companyId);
  }

  const { data, error } = await query;
  if (error) {
    console.error('[HR vacancies] employees:', error.message);
    return [];
  }
  return data ?? [];
}

async function fetchSectorManagers(companyId: string | null) {
  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from('employees')
    .select('emp_number, full_name')
    .eq('group', 'SECTOR_MANAGER')
    .eq('status', 'ACTIVE');

  if (companyId) {
    query = query.eq('company_id', companyId);
  }

  const { data, error } = await query;
  if (error) return [];
  return data ?? [];
}

export async function getGuardVacanciesDesk(): Promise<GuardVacanciesPayload> {
  try {
    const supabase = await createSupabaseServerClient();
    const sessionCompanyId = await resolveCompanyIdForSession(supabase);

    const [sites, guards, managers] = await Promise.all([
      fetchWithRosterCompanyFallback(fetchClientSites, sessionCompanyId),
      fetchWithRosterCompanyFallback(fetchActiveGuards, sessionCompanyId),
      fetchWithRosterCompanyFallback(fetchSectorManagers, sessionCompanyId),
    ]);

    const smNameByEpf = new Map<string, string>();
    for (const row of managers) {
      smNameByEpf.set(
        String(row.emp_number),
        String(row.full_name ?? row.emp_number),
      );
    }

    const assignedBySite = new Map<string, Partial<Record<GuardRankKey, number>>>();
    for (const guard of guards) {
      const siteKey = normalizeSiteKey(guard.site as string | null);
      if (!siteKey) continue;
      const rank = normalizeRank(guard.rank as string | null) ?? 'JSO';
      const counts = assignedBySite.get(siteKey) ?? {};
      counts[rank] = (counts[rank] ?? 0) + 1;
      assignedBySite.set(siteKey, counts);
    }

    const vacancySites: SiteVacancyCard[] = [];

    for (const site of sites) {
      const siteKey = normalizeSiteKey(String(site.site_name));
      const requiredGuards = Math.max(1, Number(site.required_guards ?? 1));
      const rateMatrix = parseRateMatrixQty(site.rate_matrix);
      const required = requiredRanksForSite(rateMatrix, requiredGuards);
      const assigned = assignedBySite.get(siteKey) ?? {};
      const rankGaps = rankGapsFromCounts(required, assigned);
      const totalNeeded = rankGaps.reduce((sum, gap) => sum + gap.needed, 0);
      if (totalNeeded <= 0) continue;

      const smEpf = site.assigned_sm_epf ? String(site.assigned_sm_epf) : null;
      vacancySites.push({
        siteId: String(site.id),
        siteName: String(site.site_name),
        address: String(site.address ?? '').trim() || 'Address not on file',
        sectorManager: smEpf ? smNameByEpf.get(smEpf) ?? smEpf : null,
        rankGaps,
        totalNeeded,
      });
    }

    vacancySites.sort((a, b) => b.totalNeeded - a.totalNeeded || a.siteName.localeCompare(b.siteName));

    const totalGuardsNeeded = vacancySites.reduce((sum, site) => sum + site.totalNeeded, 0);

    return {
      sites: vacancySites,
      totalGuardsNeeded,
      totalClientSites: sites.length,
    };
  } catch {
    return {
      sites: [],
      totalGuardsNeeded: 0,
      totalClientSites: 0,
      error: 'Failed to load guard vacancies.',
    };
  }
}
