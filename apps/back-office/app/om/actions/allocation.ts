'use server';

import { revalidatePath } from 'next/cache';
import {
  createSupabaseServerClient,
} from '../../../../../packages/supabase/server';
import {
  fetchWithRosterCompanyFallback,
  resolveCompanyIdForSession,
  rosterCompanyId,
} from '../../../lib/company-context-server';
import { getOmServiceDb } from '../../../lib/om-service-db';
import { fetchActiveSectorManagerRecordsForCompany } from '../../../lib/sector-manager-roster';
import { normalizeSmEpf } from '../../../../../packages/supabase/sm-epf';
import { employeeStoredEpfNo, resolveGuardRosterKey } from '../../../lib/employee-epf';
import type {
  OmAllocationSite,
  OmAssignableGuard,
  OmClearanceState,
  OmGuardProfile,
  OmNearbyGuard,
  OmRankKey,
  OmSiteAllocationPayload,
  OmTacticalShort,
} from '../lib/field-operations-types';
import { CVS_GUARD_OPS_ENABLED } from '../../../lib/cvs-workforce-phase';
import {
  isOmSectorScopeEmpty,
  omSectorOwnsGuardEpf,
  omSectorOwnsSiteName,
  omSectorOwnsSmKey,
  resolveOmSectorScopeForSession,
  type OmSectorScope,
} from '../../../lib/om-sector-scope';
import { auditStaffAction } from '../../../lib/staff-audit';

const RANK_KEYS: OmRankKey[] = ['CSO', 'OIC', 'SSO', 'JSO', 'LSO'];
const GUARD_GROUPS = new Set(['GUARD', 'GUARD_FIELD']);

/** Service-role DB — OM sessions fail site_profiles RLS (same as executive site directory). */
function getOmAllocationDb() {
  return getOmServiceDb();
}

type EmployeeRow = {
  id: string;
  emp_number: string | null;
  epf_no: string | null;
  epf_num: string | number | null;
  full_name: string | null;
  rank: string | null;
  group: string | null;
  status: string | null;
  site: string | null;
  mod_expiry: string | null;
  grama_niladari_expiry: string | null;
  phone: string | null;
  home_address: string | null;
  base_salary: number | null;
  basic_salary: number | null;
};

function guardEpfKey(row: Pick<EmployeeRow, 'id' | 'emp_number' | 'epf_no' | 'epf_num'>): string {
  const emp = row.emp_number != null ? String(row.emp_number).trim() : '';
  if (emp) return emp;
  const epf =
    (row.epf_no != null ? String(row.epf_no).trim() : '') ||
    (row.epf_num != null ? String(row.epf_num).trim() : '');
  if (epf) return epf;
  return row.id;
}

function guardEpfDisplay(row: Pick<EmployeeRow, 'emp_number' | 'epf_no' | 'epf_num'>): string {
  const epf =
    (row.epf_no != null ? String(row.epf_no).trim() : '') ||
    (row.epf_num != null ? String(row.epf_num).trim() : '') ||
    (row.emp_number != null ? String(row.emp_number).trim() : '');
  return epf || '—';
}

type SiteRow = {
  id: string;
  site_name: string;
  address: string | null;
  required_guards: number | null;
  assigned_sm_epf: string | null;
  latitude: number | null;
  longitude: number | null;
};

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function normalizeRankKey(rank: string | null | undefined): OmRankKey {
  const r = (rank ?? '').trim().toUpperCase();
  return RANK_KEYS.includes(r as OmRankKey) ? (r as OmRankKey) : 'JSO';
}

function vettingClearance(
  gramaNiladariExpiry: string | null | undefined,
): OmClearanceState {
  const today = todayIso();
  const expired = (d?: string | null) => Boolean(d && d.slice(0, 10) < today);
  if (expired(gramaNiladariExpiry)) return 'expired';
  return 'valid';
}

function normalizeSiteKey(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

function filterSitesForOmScope(sites: SiteRow[], omScope: OmSectorScope | null): SiteRow[] {
  if (omScope === null) return sites;
  if (isOmSectorScopeEmpty(omScope)) return [];
  return sites.filter((site) => {
    const smEpf = normalizeSmEpf(site.assigned_sm_epf);
    if (smEpf && omSectorOwnsSmKey(omScope, smEpf)) return true;
    return omSectorOwnsSiteName(omScope, site.site_name);
  });
}

function filterGuardsForOmScope(guards: EmployeeRow[], omScope: OmSectorScope | null): EmployeeRow[] {
  if (omScope === null) return guards;
  if (isOmSectorScopeEmpty(omScope)) return [];
  return guards.filter((guard) => {
    const rosterKey = guardEpfKey(guard).trim().toUpperCase();
    if (omSectorOwnsGuardEpf(omScope, rosterKey)) return true;
    if (omScope.guardEmployeeIds.has(String(guard.id))) return true;
    return omSectorOwnsSiteName(omScope, guard.site);
  });
}

function omScopeAllowsSiteWrite(
  omScope: OmSectorScope | null,
  site: Pick<SiteRow, 'site_name' | 'assigned_sm_epf'>,
): boolean {
  if (omScope === null) return true;
  if (isOmSectorScopeEmpty(omScope)) return false;
  const smEpf = normalizeSmEpf(site.assigned_sm_epf);
  if (smEpf && omSectorOwnsSmKey(omScope, smEpf)) return true;
  return omSectorOwnsSiteName(omScope, site.site_name);
}

function omScopeAllowsGuardWrite(omScope: OmSectorScope | null, guard: EmployeeRow): boolean {
  if (omScope === null) return true;
  if (isOmSectorScopeEmpty(omScope)) return false;
  const rosterKey = guardEpfKey(guard).trim().toUpperCase();
  if (omSectorOwnsGuardEpf(omScope, rosterKey)) return true;
  if (omScope.guardEmployeeIds.has(String(guard.id))) return true;
  return omSectorOwnsSiteName(omScope, guard.site);
}

function clientNameFromSite(siteName: string, companyName: string | null): string {
  if (companyName?.trim()) return companyName.trim();
  const parts = siteName.split(/\s*[—–-]\s+/);
  return (parts[0] ?? siteName).trim();
}

function defaultSlotRank(index: number, required: number): OmRankKey {
  if (required >= 3 && index === required - 1) return 'OIC';
  if (required >= 2 && index < 2) return 'SSO';
  return 'JSO';
}

function slotShiftType(index: number, required: number): 'day' | 'night' | 'both' {
  if (required <= 1) return 'both';
  if (index === 0) return 'day';
  if (index === 1) return 'night';
  return index % 2 === 0 ? 'day' : 'night';
}

function buildSlotsForSite(
  siteId: string,
  required: number,
  assigned: EmployeeRow[],
): OmAllocationSite['slots'] {
  const count = Math.max(1, required);
  return Array.from({ length: count }, (_, index) => {
    const emp = assigned[index];
    return {
      slotId: `${siteId}-slot-${index}`,
      rank: emp ? normalizeRankKey(emp.rank) : defaultSlotRank(index, count),
      shiftType: slotShiftType(index, count),
      label: emp?.full_name?.trim() || `Open slot ${index + 1}`,
      currentEmpNo: emp ? guardEpfKey(emp) : null,
    };
  });
}

function mapAssignableGuard(emp: EmployeeRow): OmAssignableGuard {
  const rankKey = normalizeRankKey(emp.rank);
  return {
    empNo: guardEpfKey(emp),
    epfNo: guardEpfDisplay(emp),
    name: String(emp.full_name ?? guardEpfDisplay(emp)),
    rank: rankKey,
    rankKey,
    clearance: vettingClearance(emp.grama_niladari_expiry),
  };
}

function mapGuardProfile(emp: EmployeeRow): OmGuardProfile {
  const salary = Number(emp.base_salary ?? emp.basic_salary ?? 0);
  return {
    empNo: guardEpfKey(emp),
    name: String(emp.full_name ?? guardEpfDisplay(emp)),
    rank: normalizeRankKey(emp.rank),
    basicSalary: Number.isFinite(salary) ? salary : 0,
    unpaidShiftsLastMonth: 22,
  };
}

function mapNearbyBench(emp: EmployeeRow): Omit<OmNearbyGuard, 'distanceKm'> {
  return {
    guardId: guardEpfKey(emp),
    name: String(emp.full_name ?? guardEpfDisplay(emp)),
    rank: normalizeRankKey(emp.rank),
    contact: emp.phone?.trim() || '—',
    homeAddress: emp.home_address?.trim() || 'Address not on file',
    homeLat: 6.9271,
    homeLng: 79.8612,
  };
}

function buildTacticalShort(
  site: SiteRow,
  deployed: number,
  clientName: string,
  smNameByEpf: Map<string, string>,
): OmTacticalShort {
  const required = Math.max(1, site.required_guards ?? 1);
  const smName = site.assigned_sm_epf
    ? smNameByEpf.get(site.assigned_sm_epf) ?? site.assigned_sm_epf
    : 'Unassigned SM';
  const gap = required - deployed;
  return {
    shortId: site.id,
    site: site.site_name,
    client: clientName,
    sector: site.assigned_sm_epf ? 'Assigned sector' : 'Pending SM',
    required,
    deployed,
    smName,
    shiftTime: '06:00 – 18:00',
    loanerStatus: gap >= 2 ? 'SEARCHING' : gap === 1 ? 'IDLE' : 'FOUND',
    siteLat: site.latitude ?? 6.9271,
    siteLng: site.longitude ?? 79.8612,
  };
}

function resolveAssignedSm(
  smEpf: string | null | undefined,
  smNameByEpf: Map<string, string>,
): { assignedSmEpf: string | null; assignedSmName: string | null } {
  const epf = normalizeSmEpf(smEpf);
  if (!epf) return { assignedSmEpf: null, assignedSmName: null };
  return {
    assignedSmEpf: epf,
    assignedSmName: smNameByEpf.get(epf) ?? epf,
  };
}

function buildAllocationSites(
  sites: SiteRow[],
  guards: EmployeeRow[],
  companyName: string | null,
  smNameByEpf: Map<string, string>,
): { unassignedSites: OmAllocationSite[]; allocatedSites: OmAllocationSite[] } {
  const guardsBySite = new Map<string, EmployeeRow[]>();
  for (const guard of guards) {
    const key = normalizeSiteKey(guard.site);
    if (!key) continue;
    const list = guardsBySite.get(key) ?? [];
    list.push(guard);
    guardsBySite.set(key, list);
  }

  const unassignedSites: OmAllocationSite[] = [];
  const allocatedSites: OmAllocationSite[] = [];

  for (const site of sites) {
    const siteKey = normalizeSiteKey(site.site_name);
    const assigned = (guardsBySite.get(siteKey) ?? []).sort((a, b) =>
      String(a.full_name ?? '').localeCompare(String(b.full_name ?? '')),
    );
    const required = Math.max(1, site.required_guards ?? 1);
    const payload: OmAllocationSite = {
      siteId: site.id,
      clientName: clientNameFromSite(site.site_name, companyName),
      siteName: site.site_name,
      location: site.address?.trim() || 'Address not on file',
      slots: buildSlotsForSite(site.id, required, assigned),
      ...resolveAssignedSm(site.assigned_sm_epf, smNameByEpf),
    };

    if (assigned.length === 0) {
      unassignedSites.push(payload);
    } else {
      allocatedSites.push(payload);
    }
  }

  unassignedSites.sort((a, b) => a.siteName.localeCompare(b.siteName));
  allocatedSites.sort((a, b) => a.siteName.localeCompare(b.siteName));

  return { unassignedSites, allocatedSites };
}

async function fetchGuardEmployees(companyId: string | null): Promise<EmployeeRow[]> {
  const supabase = getOmAllocationDb();

  let query = supabase
    .from('employees')
    .select(
      'id, emp_number, epf_no, epf_num, full_name, rank, group, status, site, mod_expiry, grama_niladari_expiry, phone, home_address, base_salary, basic_salary',
    )
    .eq('status', 'ACTIVE')
    .in('group', [...GUARD_GROUPS])
    .order('full_name', { ascending: true });

  if (companyId) {
    query = query.eq('company_id', companyId);
  }

  const { data, error } = await query;
  if (error) {
    console.error('[OM allocation] employees:', error.message);
    return [];
  }

  const { decryptEmployeePiiRecord } = await import('../../../lib/employee-pii');
  return (data ?? []).map((row) => decryptEmployeePiiRecord(row)) as EmployeeRow[];
}

async function fetchSiteProfiles(companyId: string | null): Promise<SiteRow[]> {
  const supabase = getOmAllocationDb();

  let query = supabase
    .from('site_profiles')
    .select(
      'id, site_name, address, required_guards, assigned_sm_epf, latitude, longitude',
    )
    .neq('site_status', 'ARCHIVED')
    .order('site_name', { ascending: true });

  if (companyId) {
    query = query.eq('company_id', companyId);
  }

  const { data, error } = await query;
  if (error) {
    console.error('[OM allocation] site_profiles:', error.message);
    return [];
  }

  return (data ?? []) as SiteRow[];
}

async function fetchCompanyName(companyId: string | null): Promise<string | null> {
  if (!companyId) return null;
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from('companies')
    .select('name')
    .eq('id', companyId)
    .maybeSingle();
  return (data?.name as string | null) ?? null;
}

async function fetchSmManagers(
  companyId: string | null,
): Promise<
  {
    emp_number: string;
    full_name: string | null;
    epf_no: string | null;
    epf_num: string | number | null;
  }[]
> {
  const supabase = getOmAllocationDb();
  const managers = await fetchActiveSectorManagerRecordsForCompany(
    supabase,
    companyId,
    'emp_number, epf_no, epf_num, full_name',
  );
  return managers.map((row) => ({
    emp_number: String(row.emp_number ?? ''),
    full_name: row.full_name != null ? String(row.full_name) : null,
    epf_no: row.epf_no != null ? String(row.epf_no) : null,
    epf_num: row.epf_num ?? null,
  }));
}

function smRowsToNameMap(
  rows: {
    emp_number: string;
    full_name: string | null;
    epf_no: string | null;
    epf_num: string | number | null;
  }[],
): Map<string, string> {
  const map = new Map<string, string>();
  for (const row of rows) {
    const name = String(row.full_name ?? row.emp_number);
    const keys = [
      row.emp_number,
      row.epf_no,
      row.epf_num != null ? String(row.epf_num) : '',
    ]
      .map((key) => String(key).trim().toUpperCase())
      .filter(Boolean);
    for (const key of keys) {
      map.set(key, name);
    }
  }
  return map;
}

const EMPTY_OM_SITE_ALLOCATION: OmSiteAllocationPayload = {
  guardPool: [],
  unassignedSites: [],
  allocatedSites: [],
  tacticalShorts: [],
  nearbyGuardBench: [],
  guardRoster: [],
  isDemo: false,
};

export async function getOmSiteAllocationData(): Promise<OmSiteAllocationPayload> {
  if (!CVS_GUARD_OPS_ENABLED) {
    return EMPTY_OM_SITE_ALLOCATION;
  }

  const supabase = await createSupabaseServerClient();
  const sessionCompanyId = await resolveCompanyIdForSession(supabase);

  const [guards, sites, companyName, smRows, omScope] = await Promise.all([
    fetchWithRosterCompanyFallback(fetchGuardEmployees, sessionCompanyId),
    fetchWithRosterCompanyFallback(fetchSiteProfiles, sessionCompanyId),
    fetchCompanyName(rosterCompanyId(sessionCompanyId)),
    fetchWithRosterCompanyFallback(fetchSmManagers, sessionCompanyId),
    resolveOmSectorScopeForSession(),
  ]);
  const smNames = smRowsToNameMap(smRows);

  const scopedSites = filterSitesForOmScope(sites, omScope);
  const scopedGuards = filterGuardsForOmScope(guards, omScope);

  const guardPoolLive = scopedGuards.map(mapAssignableGuard);
  const { unassignedSites: unassignedLive, allocatedSites: allocatedLive } =
    buildAllocationSites(scopedSites, scopedGuards, companyName, smNames);

  const tacticalLive = scopedSites
    .map((site) => {
      const deployed = scopedGuards.filter(
        (g) => normalizeSiteKey(g.site) === normalizeSiteKey(site.site_name),
      ).length;
      if (deployed >= Math.max(1, site.required_guards ?? 1)) return null;
      return buildTacticalShort(
        site,
        deployed,
        clientNameFromSite(site.site_name, companyName),
        smNames,
      );
    })
    .filter((row): row is OmTacticalShort => row !== null);

  const benchLive = scopedGuards
    .filter((g) => !normalizeSiteKey(g.site))
    .map(mapNearbyBench);

  const guardRosterLive = scopedGuards.map(mapGuardProfile);

  return {
    guardPool: guardPoolLive,
    unassignedSites: unassignedLive,
    allocatedSites: allocatedLive,
    tacticalShorts: tacticalLive,
    nearbyGuardBench: benchLive,
    guardRoster: guardRosterLive,
    isDemo: false,
    error: !sessionCompanyId ? 'No company context for this session.' : undefined,
  };
}

function smLinkAliases(
  row: Pick<EmployeeRow, 'id' | 'emp_number' | 'epf_no' | 'epf_num'>,
): string[] {
  const keys = new Set<string>();
  const canonical = resolveGuardRosterKey(row);
  if (canonical) keys.add(canonical);
  const roster = guardEpfKey(row);
  if (roster) keys.add(roster.toUpperCase());
  const stored = employeeStoredEpfNo(row);
  if (stored) keys.add(stored.toUpperCase());
  if (row.emp_number) keys.add(String(row.emp_number).trim().toUpperCase());
  if (row.id) keys.add(String(row.id).trim().toUpperCase());
  return [...keys].filter(Boolean);
}

async function findActiveGuardByRosterKey(
  supabase: ReturnType<typeof getOmAllocationDb>,
  companyId: string | null,
  rosterKey: string,
): Promise<EmployeeRow | null> {
  const key = rosterKey.trim();
  if (!key) return null;

  const matchColumns: ('emp_number' | 'epf_no' | 'epf_num' | 'id')[] = [
    'emp_number',
    'epf_no',
    'epf_num',
    'id',
  ];

  for (const column of matchColumns) {
    let query = supabase
      .from('employees')
      .select(
        'id, emp_number, epf_no, epf_num, full_name, rank, group, status, site, mod_expiry, grama_niladari_expiry, phone, home_address, base_salary, basic_salary',
      )
      .eq(column, key)
      .eq('status', 'ACTIVE')
      .in('group', [...GUARD_GROUPS]);
    if (companyId) query = query.eq('company_id', companyId);
    const { data, error } = await query.maybeSingle();
    if (error) throw error;
    if (data) return data as EmployeeRow;
  }

  return null;
}

async function deleteSmGuardLinks(
  supabase: ReturnType<typeof getOmAllocationDb>,
  smEpf: string,
  rosterKey: string,
  companyId: string | null,
) {
  const guard = await findActiveGuardByRosterKey(supabase, companyId, rosterKey);
  const aliases = guard ? smLinkAliases(guard) : [rosterKey.trim().toUpperCase()];
  for (const alias of aliases) {
    for (const key of [alias, alias.toLowerCase()]) {
      const { error } = await supabase
        .from('sm_guard_assignments')
        .delete()
        .eq('sm_epf', smEpf)
        .eq('guard_epf', key);
      if (error) throw error;
    }
  }
}

async function assertOmAllocationWriteAllowed(input: {
  siteId: string;
  siteName: string;
  guardKeys: string[];
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const omScope = await resolveOmSectorScopeForSession();
  if (omScope === null) return { ok: true };

  const supabase = getOmAllocationDb();
  const session = await createSupabaseServerClient();
  const companyId = await resolveCompanyIdForSession(session);

  const { data: siteRow, error: siteError } = await supabase
    .from('site_profiles')
    .select('id, site_name, assigned_sm_epf')
    .eq('id', input.siteId)
    .maybeSingle();

  if (siteError || !siteRow) {
    return { ok: false, error: 'Site not found.' };
  }

  const siteRecord = siteRow as SiteRow;
  if (!omScopeAllowsSiteWrite(omScope, siteRecord)) {
    return { ok: false, error: 'This site is outside your assigned sectors.' };
  }

  for (const key of input.guardKeys) {
    const rosterKey = key.trim();
    if (!rosterKey) continue;
    const guard = await findActiveGuardByRosterKey(supabase, companyId, rosterKey);
    if (!guard) {
      return { ok: false, error: `Guard not found for EPF/key "${rosterKey}".` };
    }
    if (!omScopeAllowsGuardWrite(omScope, guard)) {
      return {
        ok: false,
        error: `Guard ${rosterKey} is outside your assigned sectors.`,
      };
    }
  }

  return { ok: true };
}

export async function saveOmSiteSlotAssignments(input: {
  siteId: string;
  siteName: string;
  assignments: { empNo: string; previousEmpNo: string | null }[];
  changeReason?: string;
}): Promise<{ success: true } | { success: false; error: string }> {
  if (input.siteId.startsWith('ua-') || input.siteId.startsWith('al-') || input.siteId.startsWith('demo-')) {
    return {
      success: false,
      error: 'Preview sites cannot be saved. Seed live site_profiles in Supabase first.',
    };
  }

  const siteName = input.siteName.trim();
  if (!siteName) {
    return { success: false, error: 'Site name is required.' };
  }

  try {
    const session = await createSupabaseServerClient();
    const companyId = await resolveCompanyIdForSession(session);
    const supabase = getOmAllocationDb();

    const toAssign = input.assignments.filter((a) => a.empNo);
    const toClear = input.assignments
      .filter((a) => a.previousEmpNo && a.previousEmpNo !== a.empNo)
      .map((a) => a.previousEmpNo as string);

    const scopeGate = await assertOmAllocationWriteAllowed({
      siteId: input.siteId,
      siteName,
      guardKeys: [
        ...toAssign.map((row) => row.empNo),
        ...toClear,
      ],
    });
    if (!scopeGate.ok) {
      return { success: false, error: scopeGate.error };
    }

    const patchSite = async (epfKey: string, site: string | null) => {
      const key = epfKey.trim();
      if (!key) return;

      const matchColumns: ('emp_number' | 'epf_no' | 'epf_num' | 'id')[] = [
        'emp_number',
        'epf_no',
        'epf_num',
        'id',
      ];

      for (const column of matchColumns) {
        let query = supabase.from('employees').update({ site }).eq(column, key);
        if (companyId) {
          query = query.eq('company_id', companyId);
        }
        const { data, error } = await query.select('id').maybeSingle();
        if (error) throw error;
        if (data?.id) return;
      }

      throw new Error(`Guard not found for EPF/key "${key}".`);
    };

    for (const empNo of toClear) {
      await patchSite(empNo, null);
    }
    for (const row of toAssign) {
      await patchSite(row.empNo, siteName);
    }

    const { data: siteRow } = await supabase
      .from('site_profiles')
      .select('assigned_sm_epf')
      .eq('id', input.siteId)
      .maybeSingle();
    const smEpf = normalizeSmEpf(siteRow?.assigned_sm_epf);

    if (smEpf) {
      for (const clearedEpf of toClear) {
        await deleteSmGuardLinks(supabase, smEpf, clearedEpf, companyId);
      }
      for (const row of toAssign) {
        const rosterKey = row.empNo.trim();
        if (!rosterKey) continue;
        const guard = await findActiveGuardByRosterKey(supabase, companyId, rosterKey);
        const guardEpf = guard ? resolveGuardRosterKey(guard) : rosterKey.toUpperCase();
        await supabase.from('sm_guard_assignments').upsert(
          { sm_epf: smEpf, guard_epf: guardEpf },
          { onConflict: 'sm_epf,guard_epf' },
        );
      }
    }

    await auditStaffAction({
      supabase,
      portal: 'om',
      action: 'Save Site Guard Assignments',
      targetEntity: siteName,
      details: {
        siteId: input.siteId,
        assigned: toAssign.map((a) => a.empNo),
        cleared: toClear,
      },
    });

    revalidatePath('/om');
    revalidatePath('/om/sites/guards');
    revalidatePath('/om/guards/sm-assignments');
    revalidatePath('/hr/mnr');
    return { success: true };
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : 'Failed to save guard assignments.';
    console.error('[OM allocation] save:', message);
    return { success: false, error: message };
  }
}
