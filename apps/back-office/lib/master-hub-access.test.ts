import { describe, expect, it } from 'vitest';

import {
  CAFE_FRONT_PORTAL_ROUTE,
  GUARD_FIELD_PORTAL_ROUTE,
  SM_PORTAL_ROUTE,
} from './master-hub-pillars';
import {
  canSeeMasterHubModule,
  masterHubRoutePortalId,
} from './master-hub-access';
import { makeBlankPortalRbacRow } from '../../../packages/portal-rbac';

describe('masterHubRoutePortalId', () => {
  it('maps proxy tiles to sm_portal and checkin_app columns', () => {
    expect(masterHubRoutePortalId(SM_PORTAL_ROUTE)).toBe('sm_portal');
    expect(masterHubRoutePortalId(GUARD_FIELD_PORTAL_ROUTE)).toBe('checkin_app');
    expect(masterHubRoutePortalId('/hq/guard-proxy')).toBe('checkin_app');
  });

  it('maps back-office module routes to RBAC portal ids', () => {
    expect(masterHubRoutePortalId('/hr')).toBe('hr_desk');
    expect(masterHubRoutePortalId('/hr/vacancies')).toBe('vacancies');
    expect(masterHubRoutePortalId('/fm')).toBe('finance');
    expect(masterHubRoutePortalId(CAFE_FRONT_PORTAL_ROUTE)).toBe('cafe');
  });
});

describe('canSeeMasterHubModule rbacGated', () => {
  it('shows only matrix-allowed tiles for rbacGated staff', () => {
    const row = {
      ...makeBlankPortalRbacRow(),
      hr_desk: 'FULL' as const,
      vacancies: 'FULL' as const,
    };

    expect(
      canSeeMasterHubModule('/hr', 'STAFF', { rbacGated: true, portalRbac: row }),
    ).toBe(true);
    expect(
      canSeeMasterHubModule('/hr/vacancies', 'STAFF', {
        rbacGated: true,
        portalRbac: row,
      }),
    ).toBe(true);
    expect(
      canSeeMasterHubModule('/fm', 'STAFF', { rbacGated: true, portalRbac: row }),
    ).toBe(false);
  });

  it('hides sm_portal and checkin_app proxy links without FULL or READ', () => {
    const row = {
      ...makeBlankPortalRbacRow(),
      hr_desk: 'FULL' as const,
    };

    expect(
      canSeeMasterHubModule(SM_PORTAL_ROUTE, 'STAFF', {
        rbacGated: true,
        portalRbac: row,
      }),
    ).toBe(false);
    expect(
      canSeeMasterHubModule(GUARD_FIELD_PORTAL_ROUTE, 'STAFF', {
        rbacGated: true,
        portalRbac: row,
      }),
    ).toBe(false);
  });

  it('shows proxy links when sm_portal or checkin_app is READ', () => {
    const smRow = { ...makeBlankPortalRbacRow(), sm_portal: 'READ' as const };
    const checkInRow = {
      ...makeBlankPortalRbacRow(),
      checkin_app: 'READ' as const,
    };

    expect(
      canSeeMasterHubModule(SM_PORTAL_ROUTE, 'STAFF', {
        rbacGated: true,
        portalRbac: smRow,
      }),
    ).toBe(true);
    expect(
      canSeeMasterHubModule(GUARD_FIELD_PORTAL_ROUTE, 'STAFF', {
        rbacGated: true,
        portalRbac: checkInRow,
      }),
    ).toBe(true);
  });

  it('keeps rank-based visibility for non-rbacGated HR staff', () => {
    expect(canSeeMasterHubModule('/hr', 'HR')).toBe(true);
    expect(canSeeMasterHubModule('/om', 'HR')).toBe(false);
    expect(canSeeMasterHubModule(SM_PORTAL_ROUTE, 'HR')).toBe(true);
  });
});
