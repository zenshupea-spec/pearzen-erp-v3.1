import { describe, expect, it } from 'vitest';

import {
  isCafeFrontPath,
  isShalomFrontPath,
  isShalomFieldStaffRank,
  canSignInAtStaffPortal,
  fieldStaffLoginPath,
  fieldStaffPortalHomePath,
  isHeadOfficeProtectedPath,
  loginPathForRequestPath,
  loginPathForRole,
  portalHomePath,
  portalPathForRole,
  resolveFieldStaffBoundaryRedirect,
  roleMatchesStaffPortal,
  staffPortalIdForRole,
  staffPortalSignInError,
  type StaffPortalId,
} from './portal-isolation';
import { EXECUTIVE_DESK_PATH, HQ_HUB_PATH } from './hq-hub';
import {
  buildOmSectorScope,
  filterGuardsForOmScope,
  isOmSectorScopeEmpty,
  omSectorOwnsSmKey,
} from './om-sector-scope-build';
import { canManageSectorOmAssignments } from './om-sector-assignment-spec';

describe('portal-isolation cafe-front', () => {
  it('routes café front daily signout to /login/cafe-front', () => {
    expect(isCafeFrontPath('/cafe-front')).toBe(true);
    expect(isCafeFrontPath('/cafe-front/orders')).toBe(true);
    expect(isCafeFrontPath('/login/cafe-front')).toBe(true);
    expect(loginPathForRequestPath('/cafe-front/tasks')).toBe('/login/cafe-front');
    expect(loginPathForRequestPath('/cafe-front')).toBe('/login/cafe-front');
  });

  it('keeps staff portal login paths unchanged', () => {
    expect(loginPathForRequestPath('/hr')).toBe('/login/hq');
    expect(loginPathForRequestPath('/om')).toBe('/login/om');
  });
});

describe('portal-isolation shalom-front', () => {
  it('routes shalom front paths to /login/shalom-front', () => {
    expect(isShalomFrontPath('/shalom-front')).toBe(true);
    expect(isShalomFrontPath('/shalom-front/set-pin')).toBe(true);
    expect(isShalomFrontPath('/login/shalom-front')).toBe(true);
    expect(loginPathForRequestPath('/shalom-front')).toBe('/login/shalom-front');
  });

  it('keeps caretaker ranks off HQ staff portals', () => {
    expect(staffPortalIdForRole('SHALOM_CARETAKER')).toBeNull();
    expect(staffPortalIdForRole('CARETAKER')).toBeNull();
    expect(loginPathForRole('SHALOM_CARETAKER')).toBe('/login/shalom-front');
    expect(portalPathForRole('SHALOM_CARETAKER')).toBe('/shalom-front');
    expect(fieldStaffLoginPath('epf001@shalom.pearzen.local')).toBe('/login/shalom-front');
    expect(fieldStaffPortalHomePath('epf001@shalom.pearzen.local')).toBe('/shalom-front');
  });

  it('blocks cross-portal navigation for field staff sessions', () => {
    expect(
      resolveFieldStaffBoundaryRedirect(
        '/dashboard',
        'epf001@shalom.pearzen.local',
        'SHALOM_CARETAKER',
      ),
    ).toBe('/shalom-front');
    expect(
      resolveFieldStaffBoundaryRedirect(
        '/shalom-front',
        '15@pearzen.cafe',
        'CAFE_STAFF',
      ),
    ).toBe('/cafe-front');
    expect(
      resolveFieldStaffBoundaryRedirect(
        '/shalom-front',
        'epf001@shalom.pearzen.local',
        'SHALOM_CARETAKER',
      ),
    ).toBeNull();
    expect(isHeadOfficeProtectedPath('/dashboard')).toBe(true);
    expect(isHeadOfficeProtectedPath('/shalom-front')).toBe(false);
  });
});

describe('staffPortalIdForRole', () => {
  it('maps checklist ranks to isolated portal ids', () => {
    expect(staffPortalIdForRole('MD')).toBe('md');
    expect(staffPortalIdForRole('OD')).toBe('md');
    expect(staffPortalIdForRole('OM')).toBe('om');
    expect(staffPortalIdForRole('TM')).toBe('tm');
    expect(staffPortalIdForRole('HR')).toBe('hq');
    expect(staffPortalIdForRole('FM')).toBe('hq');
    expect(staffPortalIdForRole('EA')).toBe('hq');
    expect(staffPortalIdForRole('STAFF', { rbacGated: true })).toBe('hq');
  });

  it('returns null for field ranks without a staff portal', () => {
    expect(staffPortalIdForRole('CSO')).toBeNull();
    expect(staffPortalIdForRole('JSO')).toBeNull();
    expect(staffPortalIdForRole('SM')).toBeNull();
    expect(staffPortalIdForRole('BA')).toBeNull();
    expect(staffPortalIdForRole(null)).toBeNull();
  });

  it('routes unmapped ranks to the gateway login', () => {
    expect(loginPathForRole('CSO')).toBe('/login');
    expect(loginPathForRole('OM')).toBe('/login/om');
  });
});

describe('roleMatchesStaffPortal', () => {
  it('accepts OM only on the OM portal login', () => {
    expect(roleMatchesStaffPortal('OM', 'om')).toBe(true);
    expect(roleMatchesStaffPortal('OM', 'hq')).toBe(false);
    expect(roleMatchesStaffPortal('OM', 'md')).toBe(false);
  });

  it('accepts executives only on the MD portal login', () => {
    expect(roleMatchesStaffPortal('MD', 'md')).toBe(true);
    expect(roleMatchesStaffPortal('OD', 'md')).toBe(true);
    expect(roleMatchesStaffPortal('HR', 'md')).toBe(false);
  });
});

describe('canSignInAtStaffPortal', () => {
  it('restricts MD portal to MD and OD only', () => {
    expect(canSignInAtStaffPortal('MD', 'md')).toBe(true);
    expect(canSignInAtStaffPortal('OD', 'md')).toBe(true);
    expect(canSignInAtStaffPortal('HR', 'md')).toBe(false);
    expect(canSignInAtStaffPortal('FM', 'md')).toBe(false);
    expect(canSignInAtStaffPortal('EA', 'md')).toBe(false);
  });

  it('still allows executives to sign in at HQ portal', () => {
    expect(canSignInAtStaffPortal('MD', 'hq')).toBe(true);
    expect(canSignInAtStaffPortal('OD', 'hq')).toBe(true);
    expect(canSignInAtStaffPortal('HR', 'hq')).toBe(true);
    expect(canSignInAtStaffPortal('OM', 'hq')).toBe(false);
  });

  it('returns MD-specific sign-in error copy', () => {
    expect(staffPortalSignInError('md')).toMatch(/Managing Director and Operations Director only/i);
  });

  it('routes OD through the same MD portal login and executive desk as MD', () => {
    expect(loginPathForRole('OD')).toBe('/login/md');
    expect(loginPathForRole('MD')).toBe('/login/md');
    expect(portalPathForRole('OD')).toBe(EXECUTIVE_DESK_PATH);
    expect(portalPathForRole('MD')).toBe(EXECUTIVE_DESK_PATH);
  });
});

describe('portalPathForRole', () => {
  it('aligns module landing paths with staffPortalIdForRole', () => {
    expect(portalPathForRole('OM')).toBe(portalHomePath('om'));
    expect(portalPathForRole('HR')).toBe(HQ_HUB_PATH);
    expect(portalPathForRole('EA')).toBe(HQ_HUB_PATH);
    expect(portalPathForRole('MD')).toBe(EXECUTIVE_DESK_PATH);
    expect(portalPathForRole('CSO')).toBeNull();
  });
});

describe('auth isolation regression', () => {
  describe('staffPortalIdForRole', () => {
    it('maps each HO rank to exactly one staff portal id', () => {
      expect(staffPortalIdForRole('MD')).toBe('md');
      expect(staffPortalIdForRole('OD')).toBe('md');
      expect(staffPortalIdForRole('OM')).toBe('om');
      expect(staffPortalIdForRole('TM')).toBe('tm');
      expect(staffPortalIdForRole('HR')).toBe('hq');
      expect(staffPortalIdForRole('FM')).toBe('hq');
      expect(staffPortalIdForRole('EA')).toBe('hq');
      expect(staffPortalIdForRole('STAFF', { rbacGated: true })).toBe('hq');
      expect(staffPortalIdForRole('CARETAKER')).toBeNull();
      expect(staffPortalIdForRole('CSO')).toBeNull();
    });
  });

  describe('roleMatchesStaffPortal', () => {
    const cases: Array<[string, StaffPortalId, boolean]> = [
      ['HR', 'hq', true],
      ['HR', 'md', false],
      ['HR', 'om', false],
      ['HR', 'tm', false],
      ['FM', 'hq', true],
      ['FM', 'md', false],
      ['OM', 'om', true],
      ['OM', 'hq', false],
      ['TM', 'tm', true],
      ['TM', 'om', false],
      ['MD', 'md', true],
      ['OD', 'md', true],
      ['CARETAKER', 'hq', false],
      ['SHALOM_CARETAKER', 'md', false],
    ];

    it.each(cases)('rank %s on %s portal → %s', (rank, portal, expected) => {
      expect(roleMatchesStaffPortal(rank, portal)).toBe(expected);
    });
  });

  describe('Shalom caretaker role', () => {
    it('keeps caretaker ranks on shalom-front only', () => {
      for (const rank of ['CARETAKER', 'SHALOM_CARETAKER'] as const) {
        expect(isShalomFieldStaffRank(rank)).toBe(true);
        expect(staffPortalIdForRole(rank)).toBeNull();
        expect(canSignInAtStaffPortal(rank, 'hq')).toBe(false);
        expect(canSignInAtStaffPortal(rank, 'md')).toBe(false);
        expect(canSignInAtStaffPortal(rank, 'om')).toBe(false);
        expect(loginPathForRole(rank)).toBe('/login/shalom-front');
        expect(portalPathForRole(rank)).toBe('/shalom-front');
        expect(fieldStaffLoginPath(null, rank)).toBe('/login/shalom-front');
        expect(fieldStaffPortalHomePath(null, rank)).toBe('/shalom-front');
      }
    });

    it('redirects caretaker sessions away from HQ paths', () => {
      expect(
        resolveFieldStaffBoundaryRedirect('/hr', null, 'SHALOM_CARETAKER'),
      ).toBe('/shalom-front');
      expect(
        resolveFieldStaffBoundaryRedirect('/login/hq', null, 'CARETAKER'),
      ).toBe('/login/shalom-front?error=wrong_portal');
    });
  });

  describe('login path redirects', () => {
    it('routes module paths to the correct portal login', () => {
      expect(loginPathForRequestPath('/executive/settings')).toBe('/login/md');
      expect(loginPathForRequestPath('/om/roster')).toBe('/login/om');
      expect(loginPathForRequestPath('/tm')).toBe('/login/tm');
      expect(loginPathForRequestPath('/fm')).toBe('/login/hq');
      expect(loginPathForRequestPath('/hr/mnr')).toBe('/login/hq');
      expect(loginPathForRequestPath('/shalom-front')).toBe('/login/shalom-front');
      expect(loginPathForRequestPath('/cafe-front')).toBe('/login/cafe-front');
    });
  });
});

describe('OM sector assignment isolation (CVS MD portal security)', () => {
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
      id: 'g-3',
      emp_number: '111',
      full_name: 'OTHER',
      site: 'Royal Site',
      group: 'GUARD',
      status: 'ACTIVE',
    },
  ];

  const sectorTiles = [
    { id: '144', label: 'COLOMBO 1' },
    { id: '200', label: 'KANDY' },
  ];

  function visibleSectorTilesForOm(assignedSmEpfs: string[]) {
    const scope = buildOmSectorScope({
      assignedSmEpfs,
      managers,
      sites,
      smGuardLinks: [],
      guards,
    });
    return sectorTiles.filter((tile) => omSectorOwnsSmKey(scope, tile.id));
  }

  it('OM assigned to SM-144 cannot list guards from SM-200', () => {
    const scope = buildOmSectorScope({
      assignedSmEpfs: ['144'],
      managers,
      sites,
      smGuardLinks: [],
      guards,
    });

    const visible = filterGuardsForOmScope(guards, scope).map((guard) => guard.emp_number);
    expect(visible).toEqual(['007']);
    expect(visible).not.toContain('111');
  });

  it('unassigned OM gets empty tactical radar sector set', () => {
    expect(visibleSectorTilesForOm([])).toHaveLength(0);

    const emptyScope = buildOmSectorScope({
      assignedSmEpfs: [],
      managers,
      sites,
      smGuardLinks: [],
      guards,
    });
    expect(isOmSectorScopeEmpty(emptyScope)).toBe(true);
  });

  it('rejects OM and FM actors from sector OM assignment actions', () => {
    expect(canManageSectorOmAssignments('MD')).toBe(true);
    expect(canManageSectorOmAssignments('OD')).toBe(true);
    expect(canManageSectorOmAssignments('OM')).toBe(false);
    expect(canManageSectorOmAssignments('FM')).toBe(false);
  });

  it('OM-A and OM-B with different SM assignments see non-overlapping sector tiles', () => {
    const omA = visibleSectorTilesForOm(['144']);
    const omB = visibleSectorTilesForOm(['200']);

    expect(omA.map((tile) => tile.id)).toEqual(['144']);
    expect(omB.map((tile) => tile.id)).toEqual(['200']);
    expect(omA.some((tile) => omB.some((other) => other.id === tile.id))).toBe(false);
  });
});
