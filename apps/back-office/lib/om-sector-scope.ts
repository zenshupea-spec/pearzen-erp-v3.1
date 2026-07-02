import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import { createSupabaseServerClient } from '../../../packages/supabase/server';
import { resolveCompanyIdForSession } from './company-context-server';
import { fetchBackOfficeUserProfile } from './hr-portal-access-server';
import { getOmServiceDb } from './om-service-db';
import {
  isOmRankEmployee,
  normalizeSectorOmAssignmentSmEpf,
} from './om-sector-assignment-spec';
import { SECTOR_ROLE_ASSIGNMENTS_TABLE } from './sector-role-assignment-spec';
import {
  buildOmSectorScope,
  collectOmScopeGuardAliasKeys,
  createEmptyOmSectorScope,
  OM_SCOPE_ACTIVE_GUARD_GROUPS,
  type OmSectorScope,
  type OmSectorScopeGuardRow,
  type OmSectorScopeSiteRow,
  type OmSectorScopeSmGuardLink,
} from './om-sector-scope-build';
import { fetchActiveSectorManagerRecordsForCompany } from './sector-manager-roster';

export type {
  OmSectorScope,
  OmSectorScopeBuildInput,
  OmSectorScopeGuardRow,
  OmSectorScopeSiteRow,
  OmSectorScopeSmGuardLink,
} from './om-sector-scope-build';

export {
  buildOmSectorScope,
  createEmptyOmSectorScope,
  filterGuardsForOmScope,
  filterSectorManagersForOmScope,
  filterSitesForOmScope,
  isOmSectorScopeEmpty,
  normalizeOmScopeSiteKey,
  omScopeIncludesGuard,
  omScopeIncludesGuardEmployeeId,
  omScopeIncludesSite,
  omScopeIncludesSiteLabel,
  omScopeIncludesSmEpf,
  omSectorOwnsGuardEpf,
  omSectorOwnsSiteName,
  omSectorOwnsSmKey,
} from './om-sector-scope-build';

async function fetchAssignedSmEpfsForOmEmployee(
  db: SupabaseClient,
  companyId: string,
  omEmployeeId: string,
): Promise<string[]> {
  const { data, error } = await db
    .from(SECTOR_ROLE_ASSIGNMENTS_TABLE)
    .select('sm_epf')
    .eq('company_id', companyId)
    .eq('role_code', 'OM')
    .eq('employee_id', omEmployeeId);

  if (error) {
    console.error('[om-sector-scope] assignment fetch:', error.message);
    return [];
  }

  return (data ?? [])
    .map((row) => normalizeSectorOmAssignmentSmEpf(String(row.sm_epf ?? '')))
    .filter((smEpf): smEpf is string => Boolean(smEpf));
}

async function loadOmSectorScopeGraph(companyId: string, omEmployeeId: string) {
  const db = getOmServiceDb();
  const activeGuardGroups = [...OM_SCOPE_ACTIVE_GUARD_GROUPS];
  const [assignedSmEpfs, managers, sitesResult, guardsResult, linksResult] = await Promise.all([
    fetchAssignedSmEpfsForOmEmployee(db, companyId, omEmployeeId),
    fetchActiveSectorManagerRecordsForCompany(db, companyId),
    db
      .from('site_profiles')
      .select('site_name, assigned_sm_epf')
      .eq('company_id', companyId)
      .neq('site_status', 'ARCHIVED'),
    db
      .from('employees')
      .select('id, emp_number, epf_no, epf_num, site, group, status')
      .eq('company_id', companyId)
      .eq('status', 'ACTIVE')
      .in('group', activeGuardGroups),
    db.from('sm_guard_assignments').select('sm_epf, guard_epf'),
  ]);

  const guardAliasSet = new Set<string>();
  for (const guard of guardsResult.data ?? []) {
    for (const alias of collectOmScopeGuardAliasKeys(guard as OmSectorScopeGuardRow)) {
      guardAliasSet.add(alias);
    }
  }

  const smGuardLinks = (linksResult.data ?? []).filter((row) => {
    const guardEpf = String(row.guard_epf).trim().toUpperCase();
    return guardEpf && guardAliasSet.has(guardEpf);
  }) as OmSectorScopeSmGuardLink[];

  return buildOmSectorScope({
    assignedSmEpfs,
    managers,
    sites: (sitesResult.data ?? []) as OmSectorScopeSiteRow[],
    smGuardLinks,
    guards: (guardsResult.data ?? []) as OmSectorScopeGuardRow[],
  });
}

export async function resolveOmSectorScopeForOmEmployee(
  companyId: string,
  omEmployeeId: string,
): Promise<OmSectorScope> {
  if (!companyId || !omEmployeeId) return createEmptyOmSectorScope();
  return loadOmSectorScopeGraph(companyId, omEmployeeId);
}

/**
 * OM session scope for server-side filtering.
 * · `null` — not rank OM (MD/OD/etc.): callers must not filter.
 * · empty sets — rank OM with zero assignments: fail closed (no field data).
 */
export async function resolveOmSectorScopeForSession(): Promise<OmSectorScope | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return createEmptyOmSectorScope();

  const profile = await fetchBackOfficeUserProfile(supabase, user);
  if (!isOmRankEmployee(profile.role)) return null;

  const companyId = await resolveCompanyIdForSession(supabase);
  const omEmployeeId = profile.employeeId?.trim();
  if (!companyId || !omEmployeeId) return createEmptyOmSectorScope();

  return resolveOmSectorScopeForOmEmployee(companyId, omEmployeeId);
}
