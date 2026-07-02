import { describe, expect, it } from 'vitest';

import {
  buildOmSectorScope,
  createEmptyOmSectorScope,
  filterGuardsForOmScope,
  filterSectorManagersForOmScope,
  filterSitesForOmScope,
  isOmSectorScopeEmpty,
  normalizeOmScopeSiteKey,
  omScopeIncludesSiteLabel,
  omSectorOwnsGuardEpf,
  omSectorOwnsSiteName,
  omSectorOwnsSmKey,
} from './om-sector-scope-build';

describe('om-sector-scope', () => {
  const managers = [
    {
      id: 'sm-1',
      emp_number: '144',
      full_name: 'DAVID',
      site: 'COLOMBO 1',
      group: 'HEAD_OFFICE',
      rank: 'SM',
      status: 'ACTIVE',
    },
    {
      id: 'sm-2',
      emp_number: '200',
      full_name: 'PERERA',
      site: 'KANDY',
      group: 'HEAD_OFFICE',
      rank: 'SM',
      status: 'ACTIVE',
    },
  ];

  const sites = [
    { site_name: 'Test Site 196', assigned_sm_epf: '144' },
    { site_name: 'Royal Site', assigned_sm_epf: '200' },
  ];

  const guards = [
    {
      id: 'g-1',
      emp_number: '007',
      full_name: 'DEAN',
      site: 'Test Site 196',
      group: 'GUARD',
      status: 'ACTIVE',
    },
    {
      id: 'g-2',
      emp_number: '990',
      full_name: 'HIHIHI',
      site: 'Bench',
      group: 'GUARD',
      status: 'ACTIVE',
    },
    {
      id: 'g-3',
      emp_number: '111',
      full_name: 'OTHER',
      site: 'Royal Site',
      group: 'GUARD',
      status: 'ACTIVE',
    },
  ];

  it('returns empty scope when OM has no sector assignments', () => {
    const scope = buildOmSectorScope({
      assignedSmEpfs: [],
      managers,
      sites,
      smGuardLinks: [],
      guards,
    });
    expect(isOmSectorScopeEmpty(scope)).toBe(true);
    expect(scope.guardEpfKeys.size).toBe(0);
  });

  it('includes site-home guards when no explicit SM links exist', () => {
    const scope = buildOmSectorScope({
      assignedSmEpfs: ['144'],
      managers,
      sites,
      smGuardLinks: [],
      guards,
    });

    expect(omSectorOwnsSmKey(scope, '144')).toBe(true);
    expect(omSectorOwnsSmKey(scope, '200')).toBe(false);
    expect(omSectorOwnsSiteName(scope, 'Test Site 196')).toBe(true);
    expect(omSectorOwnsSiteName(scope, 'Royal Site')).toBe(false);
    expect(omSectorOwnsGuardEpf(scope, '007')).toBe(true);
    expect(omSectorOwnsGuardEpf(scope, '111')).toBe(false);
    expect(scope.sectorNames.has('COLOMBO 1')).toBe(true);
    expect(scope.smEmployeeIds.has('sm-1')).toBe(true);
  });

  it('uses explicit sm_guard_assignments and allows bench guards when linked', () => {
    const scope = buildOmSectorScope({
      assignedSmEpfs: ['144'],
      managers,
      sites,
      smGuardLinks: [{ sm_epf: '144', guard_epf: '990' }],
      guards,
    });

    expect(omSectorOwnsGuardEpf(scope, '990')).toBe(true);
    expect(omSectorOwnsGuardEpf(scope, '007')).toBe(false);
  });

  it('normalizes site keys for ownership checks', () => {
    const scope = buildOmSectorScope({
      assignedSmEpfs: ['144'],
      managers,
      sites,
      smGuardLinks: [],
      guards,
    });

    expect(normalizeOmScopeSiteKey(' Test Site 196 ')).toBe('test site 196');
    expect(omSectorOwnsSiteName(scope, ' test site 196 ')).toBe(true);
  });

  it('createEmptyOmSectorScope returns zeroed sets', () => {
    const scope = createEmptyOmSectorScope();
    expect(scope.smEpfKeys.size).toBe(0);
    expect(scope.siteNames.size).toBe(0);
    expect(scope.guardEmployeeIds.size).toBe(0);
  });

  it('OM assigned to SM-144 cannot list guards from SM-200 portfolio', () => {
    const scope = buildOmSectorScope({
      assignedSmEpfs: ['144'],
      managers,
      sites,
      smGuardLinks: [],
      guards,
    });

    const visibleGuards = filterGuardsForOmScope(guards, scope);
    const visibleEpfs = visibleGuards.map((guard) => guard.emp_number);

    expect(visibleEpfs).toContain('007');
    expect(visibleEpfs).not.toContain('111');
    expect(visibleGuards).toHaveLength(1);
  });

  it('OM assigned to SM-144 cannot list SM-200 in manager picker', () => {
    const scope = buildOmSectorScope({
      assignedSmEpfs: ['144'],
      managers,
      sites,
      smGuardLinks: [],
      guards,
    });

    const managerOptions = filterSectorManagersForOmScope(
      [
        { emp_number: '144', full_name: 'DAVID' },
        { emp_number: '200', full_name: 'PERERA' },
      ],
      scope,
    );

    expect(managerOptions).toHaveLength(1);
    expect(managerOptions[0]?.emp_number).toBe('144');
  });

  it('OM assigned to SM-144 sees only that SM portfolio sites', () => {
    const scope = buildOmSectorScope({
      assignedSmEpfs: ['144'],
      managers,
      sites,
      smGuardLinks: [],
      guards,
    });

    const visibleSites = filterSitesForOmScope(sites, scope).map((site) => site.site_name);

    expect(visibleSites).toEqual(['Test Site 196']);
    expect(visibleSites).not.toContain('Royal Site');
  });

  it('unassigned OM gets fail-closed empty tactical scope', () => {
    const scope = buildOmSectorScope({
      assignedSmEpfs: [],
      managers,
      sites,
      smGuardLinks: [],
      guards,
    });

    expect(isOmSectorScopeEmpty(scope)).toBe(true);
    expect(filterGuardsForOmScope(guards, scope)).toHaveLength(0);
    expect(filterSectorManagersForOmScope(managers, scope)).toHaveLength(0);
    expect(filterSitesForOmScope(sites, scope)).toHaveLength(0);
    expect(omSectorOwnsSmKey(scope, '144')).toBe(false);
    expect(omSectorOwnsSmKey(scope, '200')).toBe(false);
  });

  it('filters applicant site labels to assigned sector sites', () => {
    const scope = buildOmSectorScope({
      assignedSmEpfs: ['144'],
      managers,
      sites,
      smGuardLinks: [],
      guards,
    });

    expect(omScopeIncludesSiteLabel(scope, 'Test Site 196')).toBe(true);
    expect(omScopeIncludesSiteLabel(scope, 'Royal Site')).toBe(false);
  });
});
