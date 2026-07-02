import {
  collectSmEpfAliasKeys,
  normalizeSmEpf,
  sectorManagerEpfKey,
} from '../../../packages/supabase/sm-epf';
import { resolveGuardRosterKey } from './employee-epf';
import { normalizeSectorOmAssignmentSmEpf } from './om-sector-assignment-spec';
import type { SectorManagerEmployeeRecord } from './sector-manager-roster';

export type OmSectorScope = {
  smEpfKeys: Set<string>;
  smEmployeeIds: Set<string>;
  siteNames: Set<string>;
  siteKeys: Set<string>;
  sectorNames: Set<string>;
  guardEpfKeys: Set<string>;
  guardEmployeeIds: Set<string>;
};

export type OmSectorScopeSiteRow = {
  site_name: string;
  assigned_sm_epf: string | null;
};

export type OmSectorScopeGuardRow = {
  id: string;
  emp_number?: string | null;
  epf_no?: string | null;
  epf_num?: string | number | null;
  site?: string | null;
  group?: string | null;
  status?: string | null;
};

export type OmSectorScopeSmGuardLink = {
  sm_epf: string;
  guard_epf: string;
};

export type OmSectorScopeBuildInput = {
  assignedSmEpfs: readonly string[];
  managers: readonly SectorManagerEmployeeRecord[];
  sites: readonly OmSectorScopeSiteRow[];
  smGuardLinks: readonly OmSectorScopeSmGuardLink[];
  guards: readonly OmSectorScopeGuardRow[];
};

const ACTIVE_GUARD_GROUPS = new Set(['GUARD', 'GUARD_FIELD']);

export function normalizeOmScopeSiteKey(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

export function createEmptyOmSectorScope(): OmSectorScope {
  return {
    smEpfKeys: new Set(),
    smEmployeeIds: new Set(),
    siteNames: new Set(),
    siteKeys: new Set(),
    sectorNames: new Set(),
    guardEpfKeys: new Set(),
    guardEmployeeIds: new Set(),
  };
}

export function isOmSectorScopeEmpty(scope: OmSectorScope): boolean {
  return scope.smEpfKeys.size === 0;
}

function isActiveGuardRow(row: OmSectorScopeGuardRow): boolean {
  const status = String(row.status ?? 'ACTIVE').trim().toUpperCase();
  if (status === 'RESIGNED' || status === 'TERMINATED') return false;
  const group = String(row.group ?? '').trim().toUpperCase();
  return ACTIVE_GUARD_GROUPS.has(group);
}

function guardAliasKeys(row: OmSectorScopeGuardRow): Set<string> {
  const keys = new Set<string>();
  const rosterKey = resolveGuardRosterKey(row).trim().toUpperCase();
  if (rosterKey) keys.add(rosterKey);
  for (const field of [row.emp_number, row.epf_no, row.epf_num != null ? String(row.epf_num) : '']) {
    const key = String(field ?? '').trim().toUpperCase();
    if (key) keys.add(key);
  }
  if (row.id) keys.add(String(row.id).trim().toUpperCase());
  return keys;
}

function registerGuardInScope(scope: OmSectorScope, guard: OmSectorScopeGuardRow) {
  if (!isActiveGuardRow(guard)) return;
  const rosterKey = resolveGuardRosterKey(guard).trim().toUpperCase();
  if (rosterKey) scope.guardEpfKeys.add(rosterKey);
  scope.guardEmployeeIds.add(String(guard.id));
}

function resolveGuardByEpf(
  guardEpf: string,
  guardsByAlias: Map<string, OmSectorScopeGuardRow>,
): OmSectorScopeGuardRow | undefined {
  const key = guardEpf.trim().toUpperCase();
  return guardsByAlias.get(key);
}

function managerAliasKeys(manager: SectorManagerEmployeeRecord): Set<string> {
  const keys = new Set<string>();
  const canonical = sectorManagerEpfKey(manager);
  if (canonical) keys.add(canonical);
  for (const alias of collectSmEpfAliasKeys(manager)) {
    keys.add(alias);
  }
  return keys;
}

function managerMatchesAssignment(
  manager: SectorManagerEmployeeRecord,
  assignedSmEpfs: Set<string>,
): boolean {
  return [...managerAliasKeys(manager)].some((key) => assignedSmEpfs.has(key));
}

/** Pure scope builder — unit-tested with fixture graphs. */
export function buildOmSectorScope(input: OmSectorScopeBuildInput): OmSectorScope {
  const scope = createEmptyOmSectorScope();
  const assignedSmEpfs = new Set(
    input.assignedSmEpfs
      .map((smEpf) => normalizeSectorOmAssignmentSmEpf(smEpf))
      .filter((smEpf): smEpf is string => Boolean(smEpf)),
  );
  if (assignedSmEpfs.size === 0) return scope;

  const activeGuards = input.guards.filter(isActiveGuardRow);
  const guardsByAlias = new Map<string, OmSectorScopeGuardRow>();
  for (const guard of activeGuards) {
    for (const alias of guardAliasKeys(guard)) {
      guardsByAlias.set(alias, guard);
    }
  }

  const matchedManagers = input.managers.filter((manager) =>
    managerMatchesAssignment(manager, assignedSmEpfs),
  );

  for (const manager of matchedManagers) {
    const aliases = managerAliasKeys(manager);
    for (const alias of aliases) {
      scope.smEpfKeys.add(alias);
      if (assignedSmEpfs.has(alias)) {
        const canonical = sectorManagerEpfKey(manager);
        if (canonical) scope.smEpfKeys.add(canonical);
      }
    }
    if (manager.id) scope.smEmployeeIds.add(String(manager.id));
    const sectorLabel = String(manager.site ?? '').trim();
    if (sectorLabel) scope.sectorNames.add(sectorLabel);
  }

  const sitesForScope = input.sites.filter((site) => {
    const smEpf = normalizeSmEpf(site.assigned_sm_epf);
    return smEpf != null && scope.smEpfKeys.has(smEpf);
  });

  for (const site of sitesForScope) {
    const siteName = String(site.site_name ?? '').trim();
    if (!siteName) continue;
    scope.siteNames.add(siteName);
    scope.siteKeys.add(normalizeOmScopeSiteKey(siteName));
  }

  for (const manager of matchedManagers) {
    const aliases = managerAliasKeys(manager);
    const smSites = input.sites.filter((site) => {
      const smEpf = normalizeSmEpf(site.assigned_sm_epf);
      return smEpf != null && aliases.has(smEpf);
    });
    const smSiteKeys = new Set(
      smSites.map((site) => normalizeOmScopeSiteKey(site.site_name)).filter(Boolean),
    );

    const explicitLinks = input.smGuardLinks.filter((link) => {
      const smEpf = normalizeSmEpf(link.sm_epf);
      return smEpf != null && aliases.has(smEpf);
    });

    if (explicitLinks.length > 0) {
      for (const link of explicitLinks) {
        const guard = resolveGuardByEpf(link.guard_epf, guardsByAlias);
        if (guard) {
          registerGuardInScope(scope, guard);
          continue;
        }
        const guardEpf = String(link.guard_epf).trim().toUpperCase();
        if (guardEpf) scope.guardEpfKeys.add(guardEpf);
      }
      continue;
    }

    for (const guard of activeGuards) {
      const siteKey = normalizeOmScopeSiteKey(guard.site);
      if (!siteKey || !smSiteKeys.has(siteKey)) continue;
      registerGuardInScope(scope, guard);
    }
  }

  return scope;
}

export function omSectorOwnsSmKey(scope: OmSectorScope, smKey: string): boolean {
  const normalized = normalizeSmEpf(smKey);
  return normalized != null && scope.smEpfKeys.has(normalized);
}

export function omSectorOwnsSiteName(scope: OmSectorScope, siteName: string | null | undefined): boolean {
  const key = normalizeOmScopeSiteKey(siteName);
  return Boolean(key) && scope.siteKeys.has(key);
}

export function omSectorOwnsGuardEpf(scope: OmSectorScope, guardEpf: string | null | undefined): boolean {
  const key = String(guardEpf ?? '').trim().toUpperCase();
  return Boolean(key) && scope.guardEpfKeys.has(key);
}

export type OmScopeGuardLike = {
  id: string;
  emp_number?: string | null;
  epf_no?: string | null;
  epf_num?: string | number | null;
  site?: string | null;
};

export function omScopeIncludesGuard(
  omScope: OmSectorScope | null,
  guard: OmScopeGuardLike,
): boolean {
  if (omScope === null) return true;
  if (isOmSectorScopeEmpty(omScope)) return false;
  const rosterKey = resolveGuardRosterKey(guard).trim().toUpperCase();
  if (rosterKey && omSectorOwnsGuardEpf(omScope, rosterKey)) return true;
  if (omScope.guardEmployeeIds.has(String(guard.id))) return true;
  return omSectorOwnsSiteName(omScope, guard.site);
}

export function filterGuardsForOmScope<T extends OmScopeGuardLike>(
  guards: readonly T[],
  omScope: OmSectorScope | null,
): T[] {
  if (omScope === null) return [...guards];
  if (isOmSectorScopeEmpty(omScope)) return [];
  return guards.filter((guard) => omScopeIncludesGuard(omScope, guard));
}

export function omScopeIncludesSmEpf(
  omScope: OmSectorScope | null,
  smEpf: string | null | undefined,
): boolean {
  if (omScope === null) return true;
  if (isOmSectorScopeEmpty(omScope)) return false;
  return omSectorOwnsSmKey(omScope, String(smEpf ?? ''));
}

export function filterSectorManagersForOmScope<
  T extends { emp_number: string },
>(managers: readonly T[], omScope: OmSectorScope | null): T[] {
  if (omScope === null) return [...managers];
  if (isOmSectorScopeEmpty(omScope)) return [];
  return managers.filter((manager) => omScopeIncludesSmEpf(omScope, manager.emp_number));
}

export type OmScopeSiteLike = {
  site_name: string;
  assigned_sm_epf?: string | null;
};

export function omScopeIncludesSite(
  omScope: OmSectorScope | null,
  site: OmScopeSiteLike,
): boolean {
  if (omScope === null) return true;
  if (isOmSectorScopeEmpty(omScope)) return false;
  const smEpf = normalizeSmEpf(site.assigned_sm_epf);
  if (smEpf && omSectorOwnsSmKey(omScope, smEpf)) return true;
  return omSectorOwnsSiteName(omScope, site.site_name);
}

export function filterSitesForOmScope<T extends OmScopeSiteLike>(
  sites: readonly T[],
  omScope: OmSectorScope | null,
): T[] {
  if (omScope === null) return [...sites];
  if (isOmSectorScopeEmpty(omScope)) return [];
  return sites.filter((site) => omScopeIncludesSite(omScope, site));
}

export function omScopeIncludesSiteLabel(
  omScope: OmSectorScope | null,
  siteLabel: string | null | undefined,
): boolean {
  if (omScope === null) return true;
  if (isOmSectorScopeEmpty(omScope)) return false;
  const key = normalizeOmScopeSiteKey(siteLabel);
  if (!key) return false;
  if (omScope.siteKeys.has(key)) return true;
  for (const name of omScope.siteNames) {
    if (normalizeOmScopeSiteKey(name) === key) return true;
  }
  for (const sector of omScope.sectorNames) {
    if (normalizeOmScopeSiteKey(sector) === key) return true;
  }
  return false;
}

export function omScopeIncludesGuardEmployeeId(
  omScope: OmSectorScope | null,
  employeeId: string | null | undefined,
): boolean {
  if (omScope === null) return true;
  if (isOmSectorScopeEmpty(omScope)) return false;
  const id = String(employeeId ?? '').trim();
  return Boolean(id) && omScope.guardEmployeeIds.has(id);
}

export function collectOmScopeGuardAliasKeys(row: OmSectorScopeGuardRow): Set<string> {
  return guardAliasKeys(row);
}

export const OM_SCOPE_ACTIVE_GUARD_GROUPS = ACTIVE_GUARD_GROUPS;
