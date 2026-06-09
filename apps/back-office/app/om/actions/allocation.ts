'use server';

import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '../../../../../packages/supabase/server';
import {
  fetchWithRosterCompanyFallback,
  resolveCompanyIdForSession,
  rosterCompanyId,
} from '../../../lib/company-context';
import { auditStaffAction } from '../../../lib/staff-audit';
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

const RANK_KEYS: OmRankKey[] = ['CSO', 'OIC', 'SSO', 'JSO', 'LSO'];
const GUARD_GROUPS = new Set(['GUARD', 'GUARD_FIELD']);

type EmployeeRow = {
  id: string;
  emp_number: string;
  full_name: string | null;
  rank: string | null;
  group: string | null;
  status: string | null;
  site: string | null;
  mod_expiry: string | null;
  police_expiry: string | null;
  phone: string | null;
  home_address: string | null;
  base_salary: number | null;
  basic_salary: number | null;
};

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
  modExpiry: string | null | undefined,
  policeExpiry: string | null | undefined,
): OmClearanceState {
  const today = todayIso();
  const expired = (d?: string | null) => Boolean(d && d.slice(0, 10) < today);
  if (expired(modExpiry) || expired(policeExpiry)) return 'expired';
  return 'valid';
}

function normalizeSiteKey(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase();
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
      currentEmpNo: emp ? String(emp.emp_number) : null,
    };
  });
}

function mapAssignableGuard(emp: EmployeeRow): OmAssignableGuard {
  const rankKey = normalizeRankKey(emp.rank);
  return {
    empNo: String(emp.emp_number),
    name: String(emp.full_name ?? emp.emp_number),
    rank: rankKey,
    rankKey,
    clearance: vettingClearance(emp.mod_expiry, emp.police_expiry),
  };
}

function mapGuardProfile(emp: EmployeeRow): OmGuardProfile {
  const salary = Number(emp.base_salary ?? emp.basic_salary ?? 0);
  return {
    empNo: String(emp.emp_number),
    name: String(emp.full_name ?? emp.emp_number),
    rank: normalizeRankKey(emp.rank),
    basicSalary: Number.isFinite(salary) ? salary : 0,
    unpaidShiftsLastMonth: 22,
  };
}

function mapNearbyBench(emp: EmployeeRow): Omit<OmNearbyGuard, 'distanceKm'> {
  return {
    guardId: String(emp.emp_number),
    name: String(emp.full_name ?? emp.emp_number),
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

function buildAllocationSites(
  sites: SiteRow[],
  guards: EmployeeRow[],
  companyName: string | null,
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
  const supabase = await createSupabaseServerClient();

  let query = supabase
    .from('employees')
    .select(
      'id, emp_number, full_name, rank, group, status, site, mod_expiry, police_expiry, phone, home_address, base_salary, basic_salary',
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
  const supabase = await createSupabaseServerClient();

  let query = supabase
    .from('site_profiles')
    .select(
      'id, site_name, address, required_guards, assigned_sm_epf, latitude, longitude',
    )
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
): Promise<{ emp_number: string; full_name: string | null }[]> {
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
  if (error) {
    console.error('[OM allocation] sector managers:', error.message);
    return [];
  }
  return (data ?? []) as { emp_number: string; full_name: string | null }[];
}

function smRowsToNameMap(
  rows: { emp_number: string; full_name: string | null }[],
): Map<string, string> {
  const map = new Map<string, string>();
  for (const row of rows) {
    map.set(String(row.emp_number), String(row.full_name ?? row.emp_number));
  }
  return map;
}

export async function getOmSiteAllocationData(): Promise<OmSiteAllocationPayload> {
  const supabase = await createSupabaseServerClient();
  const sessionCompanyId = await resolveCompanyIdForSession(supabase);

  const [guards, sites, companyName, smRows] = await Promise.all([
    fetchWithRosterCompanyFallback(fetchGuardEmployees, sessionCompanyId),
    fetchWithRosterCompanyFallback(fetchSiteProfiles, sessionCompanyId),
    fetchCompanyName(rosterCompanyId(sessionCompanyId)),
    fetchWithRosterCompanyFallback(fetchSmManagers, sessionCompanyId),
  ]);
  const smNames = smRowsToNameMap(smRows);

  const guardPoolLive = guards.map(mapAssignableGuard);
  const { unassignedSites: unassignedLive, allocatedSites: allocatedLive } =
    buildAllocationSites(sites, guards, companyName);

  const tacticalLive = sites
    .map((site) => {
      const deployed = guards.filter(
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

  const benchLive = guards
    .filter((g) => !normalizeSiteKey(g.site))
    .map(mapNearbyBench);

  const guardRosterLive = guards.map(mapGuardProfile);

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
    const supabase = await createSupabaseServerClient();
    const companyId = await resolveCompanyIdForSession(supabase);

    const toAssign = input.assignments.filter((a) => a.empNo);
    const toClear = input.assignments
      .filter((a) => a.previousEmpNo && a.previousEmpNo !== a.empNo)
      .map((a) => a.previousEmpNo as string);

    const patchSite = async (empNo: string, site: string | null) => {
      let query = supabase.from('employees').update({ site }).eq('emp_number', empNo);
      if (companyId) {
        query = query.eq('company_id', companyId);
      }
      const { error } = await query;
      if (error) throw error;
    };

    for (const empNo of toClear) {
      await patchSite(empNo, null);
    }
    for (const row of toAssign) {
      await patchSite(row.empNo, siteName);
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
    revalidatePath('/hr/mnr');
    return { success: true };
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : 'Failed to save guard assignments.';
    console.error('[OM allocation] save:', message);
    return { success: false, error: message };
  }
}
