'use server';

import type { SupabaseClient } from '@supabase/supabase-js';

import {
  createSupabaseServerClient,
  createSupabaseServiceClient,
} from '../../../../../packages/supabase/server';
import {
  fetchWithRosterCompanyFallback,
  resolveCompanyIdForSession,
} from '../../../lib/company-context-server';
import { formatSiteLocalityLabel, resolveSiteLocalityFromCoords } from '../../../lib/site-locality';
import type { CareersSiteLabels, SecurityWebsiteLocale } from '../../../lib/security-website-i18n';

export type GuardRankKey = 'CSO' | 'OIC' | 'SSO' | 'JSO' | 'LSO';

export type RankVacancy = {
  rank: GuardRankKey;
  needed: number;
};

export type SiteVacancyCard = {
  siteId: string;
  siteName: string;
  address: string;
  lat: number | null;
  lng: number | null;
  city?: string | null;
  district?: string | null;
  area?: string | null;
  siteLabels?: CareersSiteLabels;
  needsOmGpsCapture: boolean;
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
const CAREERS_LOCALES: SecurityWebsiteLocale[] = ['en', 'si', 'ta'];
const CAREERS_LOCATION_PENDING: Record<SecurityWebsiteLocale, string> = {
  en: 'Location pending',
  si: 'ස්ථානය තහවුරු කරමින්',
  ta: 'இடம் உறுதிப்படுத்தப்படுகிறது',
};
const GUARD_GROUPS = ['GUARD', 'GUARD_FIELD'] as const;

type RateMatrixRow = { qty?: number };

type SiteProfileRow = {
  id: string;
  site_name: string;
  site_code: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  needs_om_gps_capture: boolean | null;
  required_guards: number | null;
  rate_matrix: unknown;
  assigned_sm_epf: string | null;
  site_status: string | null;
};

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

function matrixHeadcount(rateMatrix: Partial<Record<GuardRankKey, number>>): number {
  return Object.values(rateMatrix).reduce((sum, qty) => sum + (qty ?? 0), 0);
}

function isRecruitableClientSite(siteName: string, siteStatus: string | null | undefined): boolean {
  if (String(siteStatus ?? '').toUpperCase() === 'ARCHIVED') return false;
  const name = siteName.trim();
  if (!name || name === 'Head Office') return false;
  if (/^caf[eé]\s*[—–-]/i.test(name)) return false;
  return true;
}

function siteStaffingRequirement(site: SiteProfileRow): number {
  const matrixTotal = matrixHeadcount(parseRateMatrixQty(site.rate_matrix));
  return Math.max(Number(site.required_guards ?? 0), matrixTotal);
}

/** Service-role DB — site_profiles reads match Master Site Directory (RLS-safe). */
function getVacanciesDb() {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
    return null;
  }
  return createSupabaseServiceClient();
}

function registerSiteAlias(map: Map<string, string>, siteId: string, raw: string) {
  const key = normalizeSiteKey(raw);
  if (!key || key.startsWith('unassigned')) return;
  map.set(key, siteId);
}

function buildSiteAliasIndex(sites: SiteProfileRow[]): Map<string, string> {
  const aliases = new Map<string, string>();
  for (const site of sites) {
    const siteId = String(site.id);
    registerSiteAlias(aliases, siteId, String(site.site_name));
    if (site.site_code) registerSiteAlias(aliases, siteId, String(site.site_code));
    for (const part of String(site.site_name).split(/\s*[—–-]\s*/)) {
      registerSiteAlias(aliases, siteId, part);
    }
  }
  return aliases;
}

function isSectorManagerRow(row: { emp_number?: string | null; rank?: string | null }) {
  const epf = String(row.emp_number ?? '').toUpperCase();
  const rank = String(row.rank ?? '').toUpperCase();
  return epf.startsWith('SM-') || ['SM', 'OIC', 'SSO', 'CSO'].includes(rank);
}

async function fetchClientSites(companyId: string | null): Promise<SiteProfileRow[]> {
  const db = getVacanciesDb() ?? (await createSupabaseServerClient());
  let query = db
    .from('site_profiles')
    .select(
      'id, site_name, site_code, address, latitude, longitude, needs_om_gps_capture, required_guards, rate_matrix, assigned_sm_epf, site_status',
    )
    .order('site_name', { ascending: true });

  if (companyId) {
    query = query.eq('company_id', companyId);
  }

  const { data, error } = await query;
  if (error) {
    console.error('[HR vacancies] site_profiles:', error.message);
    return [];
  }

  return (data ?? []).filter((row) => {
    const site = row as SiteProfileRow;
    if (!isRecruitableClientSite(String(site.site_name), site.site_status)) return false;
    return siteStaffingRequirement(site) > 0;
  }) as SiteProfileRow[];
}

async function fetchActiveGuards(companyId: string | null, db?: SupabaseClient) {
  const supabase = db ?? (await createSupabaseServerClient());
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

async function fetchSectorManagers(companyId: string | null, db?: SupabaseClient) {
  const supabase = db ?? (await createSupabaseServerClient());
  let query = supabase
    .from('employees')
    .select('emp_number, full_name, rank, status')
    .eq('status', 'ACTIVE');

  if (companyId) {
    query = query.eq('company_id', companyId);
  }

  const { data, error } = await query;
  if (error) return [];
  return (data ?? []).filter((row) => isSectorManagerRow(row));
}

function assembleGuardVacanciesPayload(
  sites: SiteProfileRow[],
  guards: Array<{ site: string | null; rank: string | null }>,
  managers: Array<{ emp_number: string | null; full_name: string | null }>,
): GuardVacanciesPayload {
  const smNameByEpf = new Map<string, string>();
  for (const row of managers) {
    smNameByEpf.set(String(row.emp_number), String(row.full_name ?? row.emp_number));
  }

  const siteAliasIndex = buildSiteAliasIndex(sites);
  const assignedBySiteId = new Map<string, Partial<Record<GuardRankKey, number>>>();
  for (const guard of guards) {
    const siteId = siteAliasIndex.get(normalizeSiteKey(guard.site));
    if (!siteId) continue;
    const rank = normalizeRank(guard.rank) ?? 'JSO';
    const counts = assignedBySiteId.get(siteId) ?? {};
    counts[rank] = (counts[rank] ?? 0) + 1;
    assignedBySiteId.set(siteId, counts);
  }

  const vacancySites: SiteVacancyCard[] = [];

  for (const site of sites) {
    const siteId = String(site.id);
    const requiredGuards = siteStaffingRequirement(site);
    const rateMatrix = parseRateMatrixQty(site.rate_matrix);
    const required = requiredRanksForSite(rateMatrix, requiredGuards);
    const assigned = assignedBySiteId.get(siteId) ?? {};
    const rankGaps = rankGapsFromCounts(required, assigned);
    const totalNeeded = rankGaps.reduce((sum, gap) => sum + gap.needed, 0);
    if (totalNeeded <= 0) continue;

    const smEpf = site.assigned_sm_epf ? String(site.assigned_sm_epf) : null;
    const lat = site.latitude != null ? Number(site.latitude) : null;
    const lng = site.longitude != null ? Number(site.longitude) : null;
    vacancySites.push({
      siteId,
      siteName: String(site.site_name),
      address: String(site.address ?? '').trim() || 'Address not on file',
      lat: lat != null && Number.isFinite(lat) ? lat : null,
      lng: lng != null && Number.isFinite(lng) ? lng : null,
      needsOmGpsCapture: Boolean(site.needs_om_gps_capture),
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
}

async function enrichPublicVacancySiteLabels(site: SiteVacancyCard): Promise<SiteVacancyCard> {
  if (site.lat == null || site.lng == null) {
    return { ...site, area: null, city: null, district: null, siteLabels: {} };
  }

  const siteLabels: CareersSiteLabels = {};
  let englishLocality = { area: null as string | null, city: null as string | null, district: null as string | null };

  for (const locale of CAREERS_LOCALES) {
    const locality = await resolveSiteLocalityFromCoords(site.lat, site.lng, locale);
    siteLabels[locale] = formatSiteLocalityLabel(locality, CAREERS_LOCATION_PENDING[locale]);
    if (locale === 'en') englishLocality = locality;
  }

  return {
    ...site,
    area: englishLocality.area,
    city: englishLocality.city,
    district: englishLocality.district,
    siteLabels,
  };
}

export async function getPublicGuardVacancies(companyId: string): Promise<GuardVacanciesPayload> {
  try {
    const db = getVacanciesDb();
    if (!db) {
      return {
        sites: [],
        totalGuardsNeeded: 0,
        totalClientSites: 0,
        error: 'Open vacancies are temporarily unavailable.',
      };
    }

    const [sites, guards, managers] = await Promise.all([
      fetchClientSites(companyId),
      fetchActiveGuards(companyId, db),
      fetchSectorManagers(companyId, db),
    ]);

    const payload = assembleGuardVacanciesPayload(sites, guards, managers);
    const sitesWithLocality = await Promise.all(payload.sites.map(enrichPublicVacancySiteLabels));
    return { ...payload, sites: sitesWithLocality };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load guard vacancies.';
    console.error('[HR vacancies] getPublicGuardVacancies:', message);
    return {
      sites: [],
      totalGuardsNeeded: 0,
      totalClientSites: 0,
      error: 'Failed to load open vacancies.',
    };
  }
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

    return assembleGuardVacanciesPayload(sites, guards, managers);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load guard vacancies.';
    console.error('[HR vacancies] getGuardVacanciesDesk:', message);
    return {
      sites: [],
      totalGuardsNeeded: 0,
      totalClientSites: 0,
      error: 'Failed to load guard vacancies.',
    };
  }
}
