import { describe, expect, it } from 'vitest';

import type { BackOfficeUserProfile } from '../../../lib/hr-portal-access';
import {
  canPerformFmPortfolioRead,
  canPerformFmPortfolioWrite,
} from './fm-portfolio-access';

function profile(
  role: string,
  overrides: Partial<BackOfficeUserProfile> = {},
): BackOfficeUserProfile {
  return {
    role,
    full_name: null,
    id_photo_url: null,
    rbacGated: false,
    portalRbac: null,
    ...overrides,
  };
}

describe('FM portfolio access', () => {
  it('allows FM, MD, and OD to read and write portfolio data', () => {
    for (const role of ['FM', 'MD', 'OD'] as const) {
      const p = profile(role);
      expect(canPerformFmPortfolioRead(p)).toBe(true);
      expect(canPerformFmPortfolioWrite(p)).toBe(true);
    }
  });

  it('rejects TM and OM from portfolio reads and writes', () => {
    for (const role of ['TM', 'OM', 'CSO', 'HR'] as const) {
      const p = profile(role);
      expect(canPerformFmPortfolioRead(p)).toBe(false);
      expect(canPerformFmPortfolioWrite(p)).toBe(false);
    }
  });

  it('allows rbac-gated FM write when portal matrix grants finance write', () => {
    const p = profile('HEAD_OFFICE', {
      rbacGated: true,
      portalRbac: { finance: 'FULL' },
    });
    expect(canPerformFmPortfolioRead(p)).toBe(true);
    expect(canPerformFmPortfolioWrite(p)).toBe(true);
  });

  it('allows rbac-gated read-only finance access without write', () => {
    const p = profile('HEAD_OFFICE', {
      rbacGated: true,
      portalRbac: { finance: 'READ' },
    });
    expect(canPerformFmPortfolioRead(p)).toBe(true);
    expect(canPerformFmPortfolioWrite(p)).toBe(false);
  });
});
