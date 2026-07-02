import { describe, expect, it } from 'vitest';

import {
  filterAndSortStaffForCommandCenter,
  portalSecurityPolicyForRank,
} from './md-portal-staff-command-center-spec';

describe('staff command center payload shaping', () => {
  it('filters and sorts column ranks only', () => {
    const rows = filterAndSortStaffForCommandCenter([
      { id: '1', fullName: 'Zara HR', rank: 'HR', email: 'z@cvs.lk', status: 'ACTIVE' },
      { id: '2', fullName: 'Bob GAD', rank: 'GAD', email: null, status: 'ACTIVE' },
      { id: '3', fullName: 'Amy MD', rank: 'MD', email: 'a@cvs.lk', status: 'ACTIVE' },
    ]);

    expect(rows.map((r) => r.fullName)).toEqual(['Amy MD', 'Zara HR']);
  });

  it('attaches security policy per rank for column strip', () => {
    const mdPolicy = portalSecurityPolicyForRank('MD');
    expect(mdPolicy.recoveryEmailRequired).toBe(true);
    expect(mdPolicy.otpChannel).toBe('email');

    const omPolicy = portalSecurityPolicyForRank('OM');
    expect(omPolicy.otpChannel).toBe('hr_desk');
    expect(omPolicy.loginPortal).toBe('om');
  });
});
