import { describe, expect, it } from 'vitest';

import { assertMnrEditAllowed } from './executive-rank-guard';
import { HR_PORTAL_EDITOR_ROLES, normalizePortalRole } from './portal-role-utils';

function isHrPortalEditor(role: string | null | undefined): boolean {
  const normalized = normalizePortalRole(role);
  return (
    normalized !== null &&
    (HR_PORTAL_EDITOR_ROLES as readonly string[]).includes(normalized)
  );
}

describe('HR editor guards', () => {
  it('allows HR, FM, MD, OD, and EA as portal editors', () => {
    for (const role of ['HR', 'FM', 'MD', 'OD', 'EA'] as const) {
      expect(isHrPortalEditor(role)).toBe(true);
    }
  });

  it('rejects TM and OM from HR editor mutations', () => {
    for (const role of ['TM', 'OM', 'CSO'] as const) {
      expect(isHrPortalEditor(role)).toBe(false);
    }
  });

  it('blocks FM from editing MD employee records', () => {
    expect(() =>
      assertMnrEditAllowed({ editorRole: 'FM', employeeRank: 'MD' }),
    ).toThrow(/MD and OD records/);
  });
});
