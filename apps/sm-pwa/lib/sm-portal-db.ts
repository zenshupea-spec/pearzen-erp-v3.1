import { createSupabaseServiceClient } from '../../../packages/supabase/service';
import {
  parseSiteShiftRows,
  requiredGuardsForShift,
  type SiteShiftRequirementRow,
} from './site-shift-requirements';
import type { ShiftType } from './shift-timing';

export const GUARD_GROUPS = ['GUARD', 'GUARD_FIELD'] as const;

export function getSmPortalDb() {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
    throw new Error('SM portal requires SUPABASE_SERVICE_ROLE_KEY.');
  }
  return createSupabaseServiceClient();
}

export function normalizeSmEpf(value: unknown): string | null {
  if (value == null || value === '') return null;
  const s = String(value).trim();
  if (!s || s.toLowerCase() === 'null') return null;
  return s.toUpperCase();
}

function normalizeSiteKey(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

function collectEpfKeys(row: {
  emp_number?: string | null;
  epf_no?: string | null;
  epf_num?: string | number | null;
}): string[] {
  const keys = new Set<string>();
  for (const field of [row.emp_number, row.epf_no, row.epf_num != null ? String(row.epf_num) : '']) {
    const key = normalizeSmEpf(field);
    if (key) keys.add(key);
  }
  return [...keys];
}

/** All EPF aliases for a logged-in SM (emp_number, epf_no, epf_num). */
export async function resolveSmLookupKeys(loginEpf: string): Promise<string[]> {
  const db = getSmPortalDb();
  const seed = normalizeSmEpf(loginEpf);
  if (!seed) return [];

  const keys = new Set<string>([seed]);

  for (const column of ['emp_number', 'epf_no', 'epf_num'] as const) {
    let query = db
      .from('employees')
      .select('emp_number, epf_no, epf_num')
      .eq(column, seed)
      .eq('group', 'SECTOR_MANAGER')
      .eq('status', 'ACTIVE');

    const { data, error } = await query.maybeSingle();
    if (error) {
      console.error('[SM portal] resolveSmLookupKeys:', error.message);
      break;
    }
    if (data) {
      for (const key of collectEpfKeys(data)) keys.add(key);
      break;
    }
  }

  return [...keys];
}

/** Canonical SM EPF for writes (sm_guard_attendance, sm_epf columns). */
export async function resolveCanonicalSmEpf(loginEpf: string): Promise<string> {
  const keys = await resolveSmLookupKeys(loginEpf);
  return keys[0] ?? normalizeSmEpf(loginEpf) ?? loginEpf.trim().toUpperCase();
}

export function guardEpfKey(row: {
  id?: string;
  emp_number?: string | null;
  epf_no?: string | null;
  epf_num?: string | number | null;
}): string {
  const emp = row.emp_number != null ? String(row.emp_number).trim() : '';
  if (emp) return emp.toUpperCase();
  const epf =
    (row.epf_no != null ? String(row.epf_no).trim() : '') ||
    (row.epf_num != null ? String(row.epf_num).trim() : '');
  if (epf) return epf.toUpperCase();
  return String(row.id ?? '');
}

export function guardLabel(epf: string, fullName: string | null): string {
  const name = fullName?.trim();
  return name ? `${epf} — ${name}` : epf;
}

export function isBenchSite(site: string | null | undefined): boolean {
  if (!site) return true;
  const s = site.toLowerCase();
  return s.includes('unassigned') || s.includes('bench');
}

type GuardEmployeeRow = {
  id: string;
  emp_number: string | null;
  epf_no: string | null;
  epf_num: string | number | null;
  full_name: string | null;
  site: string | null;
  phone: string | null;
};

type SiteProfileRow = {
  site_name: string;
  required_guards: number | null;
  assigned_sm_epf: string | null;
  rate_matrix: unknown;
};

export type SmAssignedSite = {
  site_name: string;
  required_guards: number;
  shiftRows: SiteShiftRequirementRow[];
};

export type SmGuardOption = {
  epf: string;
  label: string;
  defaultSite: string | null;
  phone: string | null;
};

export type SmPortalAssignmentBundle = {
  canonicalSmEpf: string;
  sites: SmAssignedSite[];
  guards: SmGuardOption[];
};

function siteOwnedBySm(row: SiteProfileRow, smKeys: Set<string>): boolean {
  const assigned = normalizeSmEpf(row.assigned_sm_epf);
  return Boolean(assigned && smKeys.has(assigned));
}

async function fetchAllActiveSiteProfiles(
  db: ReturnType<typeof getSmPortalDb>,
): Promise<SiteProfileRow[]> {
  const { data, error } = await db
    .from('site_profiles')
    .select('site_name, required_guards, assigned_sm_epf, rate_matrix')
    .neq('site_status', 'ARCHIVED')
    .order('site_name', { ascending: true });

  if (error) {
    console.error('[SM portal] site_profiles:', error.message);
    return [];
  }

  return (data ?? []) as SiteProfileRow[];
}

async function findGuardsMatchingKeys(
  db: ReturnType<typeof getSmPortalDb>,
  keys: string[],
): Promise<GuardEmployeeRow[]> {
  const wanted = new Set(keys.map((key) => key.trim().toUpperCase()).filter(Boolean));
  if (!wanted.size) return [];

  const { data, error } = await db
    .from('employees')
    .select('id, emp_number, epf_no, epf_num, full_name, site, phone')
    .eq('status', 'ACTIVE')
    .in('group', [...GUARD_GROUPS]);

  if (error) {
    console.error('[SM portal] guard lookup:', error.message);
    return [];
  }

  return ((data ?? []) as GuardEmployeeRow[]).filter((row) =>
    wanted.has(guardEpfKey(row).toUpperCase()),
  );
}

async function fetchGuardsAtSites(
  db: ReturnType<typeof getSmPortalDb>,
  siteNames: string[],
): Promise<GuardEmployeeRow[]> {
  if (!siteNames.length) return [];

  const siteKeys = new Set(siteNames.map(normalizeSiteKey).filter(Boolean));
  const { data, error } = await db
    .from('employees')
    .select('id, emp_number, epf_no, epf_num, full_name, site, phone')
    .eq('status', 'ACTIVE')
    .in('group', [...GUARD_GROUPS])
    .order('full_name', { ascending: true });

  if (error) {
    console.error('[SM portal] guards by site:', error.message);
    return [];
  }

  return ((data ?? []) as GuardEmployeeRow[]).filter((row) => {
    const site = row.site?.trim();
    if (!site || isBenchSite(site)) return false;
    return siteKeys.has(normalizeSiteKey(site));
  });
}

function mapGuardRow(row: GuardEmployeeRow): SmGuardOption {
  const epf = guardEpfKey(row);
  return {
    epf,
    label: guardLabel(epf, row.full_name),
    defaultSite: row.site?.trim() || null,
    phone: row.phone ?? null,
  };
}

function mapSiteProfileRow(row: SiteProfileRow): SmAssignedSite {
  const shiftRows = parseSiteShiftRows(row.rate_matrix);
  return {
    site_name: String(row.site_name),
    required_guards: Math.max(1, Number(row.required_guards ?? 1) || 1),
    shiftRows,
  };
}

function mergeSites(
  primary: SmAssignedSite[],
  extraNames: string[],
  profileByKey: Map<string, SiteProfileRow>,
): SmAssignedSite[] {
  const byKey = new Map<string, SmAssignedSite>();
  for (const site of primary) {
    byKey.set(normalizeSiteKey(site.site_name), site);
  }
  for (const name of extraNames) {
    const trimmed = name.trim();
    if (!trimmed || isBenchSite(trimmed)) continue;
    const key = normalizeSiteKey(trimmed);
    if (byKey.has(key)) continue;
    const profile = profileByKey.get(key);
    byKey.set(key, profile ? mapSiteProfileRow(profile) : {
      site_name: trimmed,
      required_guards: 1,
      shiftRows: [],
    });
  }
  return [...byKey.values()].sort((a, b) => a.site_name.localeCompare(b.site_name));
}

function mergeGuardOptions(rows: SmGuardOption[]): SmGuardOption[] {
  const byEpf = new Map<string, SmGuardOption>();
  for (const row of rows) {
    byEpf.set(row.epf.toUpperCase(), row);
  }
  return [...byEpf.values()].sort((a, b) => a.label.localeCompare(b.label));
}

async function fetchExplicitGuardKeys(
  db: ReturnType<typeof getSmPortalDb>,
  smKeys: string[],
): Promise<string[]> {
  if (!smKeys.length) return [];

  const { data, error } = await db
    .from('sm_guard_assignments')
    .select('guard_epf, sm_epf')
    .in('sm_epf', smKeys);

  if (error) {
    console.error('[SM portal] sm_guard_assignments:', error.message);
    return [];
  }

  return (data ?? []).map((row) => String(row.guard_epf).trim().toUpperCase()).filter(Boolean);
}

export async function getSmPortalAssignmentBundle(
  loginEpf: string,
): Promise<SmPortalAssignmentBundle> {
  const db = getSmPortalDb();
  const smKeys = await resolveSmLookupKeys(loginEpf);
  const canonicalSmEpf = smKeys[0] ?? normalizeSmEpf(loginEpf) ?? loginEpf.trim().toUpperCase();
  const smKeySet = new Set(smKeys);

  const profiles = await fetchAllActiveSiteProfiles(db);
  const profileByKey = new Map(
    profiles.map((row) => [normalizeSiteKey(row.site_name), row] as const),
  );

  const ownedSites = profiles
    .filter((row) => siteOwnedBySm(row, smKeySet))
    .map(mapSiteProfileRow);

  const explicitGuardKeys = await fetchExplicitGuardKeys(db, smKeys);
  const explicitGuards = (await findGuardsMatchingKeys(db, explicitGuardKeys)).map(mapGuardRow);

  const guardSiteNames = explicitGuards
    .map((g) => g.defaultSite)
    .filter((site): site is string => Boolean(site?.trim()) && !isBenchSite(site));

  let sites = mergeSites(ownedSites, guardSiteNames, profileByKey);

  if (!sites.length) {
    for (const key of smKeys) {
      const { data: smRow } = await db
        .from('employees')
        .select('site')
        .eq('emp_number', key)
        .eq('group', 'SECTOR_MANAGER')
        .maybeSingle();
      const homeSite = smRow?.site?.trim();
      if (homeSite && !isBenchSite(homeSite)) {
        sites = mergeSites([], [homeSite], profileByKey);
        break;
      }
    }
  }

  const siteNames = sites.map((site) => site.site_name);
  const siteGuards = (await fetchGuardsAtSites(db, siteNames)).map(mapGuardRow);

  return {
    canonicalSmEpf,
    sites,
    guards: mergeGuardOptions([...explicitGuards, ...siteGuards]),
  };
}

export async function fetchSmAssignedSites(epf: string): Promise<SmAssignedSite[]> {
  const bundle = await getSmPortalAssignmentBundle(epf);
  return bundle.sites;
}

export function sitesForShiftType(
  sites: SmAssignedSite[],
  shiftType: ShiftType,
): SmAssignedSite[] {
  return sites
    .map((site) => {
      const required = requiredGuardsForShift(
        site.shiftRows,
        site.required_guards,
        shiftType,
      );
      if (site.shiftRows.length > 0 && required <= 0) return null;
      return {
        ...site,
        required_guards: Math.max(required, 1),
      };
    })
    .filter((site): site is SmAssignedSite => site !== null);
}

export async function fetchGuardsForSm(epf: string, siteNames: string[]): Promise<SmGuardOption[]> {
  const db = getSmPortalDb();
  const smKeys = await resolveSmLookupKeys(epf);
  if (!smKeys.length) return [];

  const explicitGuardKeys = await fetchExplicitGuardKeys(db, smKeys);
  const explicitGuards = (await findGuardsMatchingKeys(db, explicitGuardKeys)).map(mapGuardRow);
  const siteGuards = (await fetchGuardsAtSites(db, siteNames)).map(mapGuardRow);

  return mergeGuardOptions([...explicitGuards, ...siteGuards]);
}

export async function fetchSmAssignedSiteRows(epf: string): Promise<Record<string, unknown>[]> {
  const db = getSmPortalDb();
  const smKeys = await resolveSmLookupKeys(epf);
  if (!smKeys.length) return [];

  const smKeySet = new Set(smKeys);
  const { data, error } = await db.from('site_profiles').select('*').neq('site_status', 'ARCHIVED');

  if (error) {
    console.error('[SM portal] site_profiles rows:', error.message);
    return [];
  }

  return ((data ?? []) as Record<string, unknown>[]).filter((row) =>
    siteOwnedBySm(row as SiteProfileRow, smKeySet),
  );
}
