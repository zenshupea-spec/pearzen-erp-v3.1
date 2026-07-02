import { describe, expect, it } from 'vitest';

import {
  filterAndSortStaffForCommandCenter,
  filterStaffForCommandCenter,
  isMdPortalCommandCenterRank,
  isSectorAssignmentRoleCode,
  portalSecurityPolicyForRank,
  sectorAssignmentRoleLabel,
  commandCenterRankLabel,
  sortStaffForCommandCenter,
  formatOtpChannelLabel,
  formatPasswordPolicyLabel,
} from './md-portal-staff-command-center-spec';

describe('md-portal-staff-command-center-spec', () => {
  describe('isMdPortalCommandCenterRank', () => {
    it('accepts column ranks case-insensitively', () => {
      expect(isMdPortalCommandCenterRank('md')).toBe(true);
      expect(isMdPortalCommandCenterRank(' OM ')).toBe(true);
      expect(isMdPortalCommandCenterRank('sc')).toBe(true);
    });

    it('rejects non-column ranks', () => {
      expect(isMdPortalCommandCenterRank('GAD')).toBe(false);
      expect(isMdPortalCommandCenterRank('TM')).toBe(false);
      expect(isMdPortalCommandCenterRank(null)).toBe(false);
      expect(isMdPortalCommandCenterRank('')).toBe(false);
    });
  });

  describe('isSectorAssignmentRoleCode', () => {
    it('includes sector board ranks from CVS MNR matrix', () => {
      expect(isSectorAssignmentRoleCode('TM')).toBe(true);
      expect(isSectorAssignmentRoleCode('OM')).toBe(true);
      expect(isSectorAssignmentRoleCode('HR')).toBe(true);
      expect(isSectorAssignmentRoleCode('MD')).toBe(false);
    });
  });

  describe('rank display labels', () => {
    it('matches CVS MNR titles for sector board and command center', () => {
      expect(sectorAssignmentRoleLabel('EA')).toBe('Executive Admin');
      expect(sectorAssignmentRoleLabel('HR')).toBe('Human Resources');
      expect(sectorAssignmentRoleLabel('TM')).toBe('Training Manager');
      expect(commandCenterRankLabel('AD')).toBe('Admin');
      expect(commandCenterRankLabel('EA')).toBe('Executive Admin');
    });
  });

  describe('filterStaffForCommandCenter', () => {
    it('keeps only portal column ranks', () => {
      const rows = filterStaffForCommandCenter([
        { id: '1', fullName: 'Alice', rank: 'MD' },
        { id: '2', fullName: 'Bob', rank: 'GAD' },
        { id: '3', fullName: 'Carol', rank: 'OM' },
        { id: '4', fullName: 'Dan', rank: null },
      ]);
      expect(rows.map((r) => r.id)).toEqual(['1', '3']);
    });

    it('includes all eight column ranks and excludes TM (sector board only)', () => {
      const rows = filterStaffForCommandCenter([
        { id: 'md', fullName: 'MD', rank: 'MD' },
        { id: 'od', fullName: 'OD', rank: 'OD' },
        { id: 'fm', fullName: 'FM', rank: 'FM' },
        { id: 'om', fullName: 'OM', rank: 'OM' },
        { id: 'hr', fullName: 'HR', rank: 'HR' },
        { id: 'ea', fullName: 'EA', rank: 'EA' },
        { id: 'ad', fullName: 'AD', rank: 'AD' },
        { id: 'sc', fullName: 'SC', rank: 'SC' },
        { id: 'tm', fullName: 'TM', rank: 'TM' },
        { id: 'ac', fullName: 'AC', rank: 'AC' },
      ]);
      expect(rows.map((r) => r.id)).toEqual([
        'md',
        'od',
        'fm',
        'om',
        'hr',
        'ea',
        'ad',
        'sc',
      ]);
    });
  });

  describe('sortStaffForCommandCenter', () => {
    it('sorts by rank order then name', () => {
      const sorted = sortStaffForCommandCenter([
        { id: '1', fullName: 'Zara OM', rank: 'OM' },
        { id: '2', fullName: 'Amy OD', rank: 'OD' },
        { id: '3', fullName: 'Ben MD', rank: 'MD' },
        { id: '4', fullName: 'Al OM', rank: 'OM' },
      ]);
      expect(sorted.map((r) => r.fullName)).toEqual([
        'Ben MD',
        'Amy OD',
        'Al OM',
        'Zara OM',
      ]);
    });
  });

  describe('filterAndSortStaffForCommandCenter', () => {
    it('filters then sorts', () => {
      const rows = filterAndSortStaffForCommandCenter([
        { id: '1', fullName: 'Zara', rank: 'HR' },
        { id: '2', fullName: 'Bob', rank: 'AC' },
        { id: '3', fullName: 'Amy', rank: 'FM' },
      ]);
      expect(rows.map((r) => r.fullName)).toEqual(['Amy', 'Zara']);
    });
  });

  describe('portalSecurityPolicyForRank', () => {
    it('MD/OD → email OTP 5m, recovery required, md login', () => {
      for (const rank of ['MD', 'OD'] as const) {
        const policy = portalSecurityPolicyForRank(rank);
        expect(policy.loginPortal).toBe('md');
        expect(policy.passwordMinLength).toBe(30);
        expect(policy.otpDigits).toBe(6);
        expect(policy.otpChannel).toBe('email');
        expect(policy.otpLifetimeMinutes).toBe(5);
        expect(policy.recoveryEmailRequired).toBe(true);
        expect(policy.twoFactorRequired).toBe(true);
        expect(policy.selfServiceMdRequestCode).toBe(true);
        expect(formatPasswordPolicyLabel(policy)).toBe('30+ chars');
        expect(formatOtpChannelLabel(policy)).toBe('Email · 5m');
      }
    });

    it('HR → email OTP 10m, hq login, no recovery', () => {
      const policy = portalSecurityPolicyForRank('HR');
      expect(policy.loginPortal).toBe('hq');
      expect(policy.otpChannel).toBe('email');
      expect(policy.otpLifetimeMinutes).toBe(10);
      expect(policy.recoveryEmailRequired).toBe(false);
      expect(formatOtpChannelLabel(policy)).toBe('Email · 10m');
    });

    it('FM / OM / EA → HR desk OTP 10m', () => {
      for (const rank of ['FM', 'OM', 'EA'] as const) {
        const policy = portalSecurityPolicyForRank(rank);
        expect(policy.otpChannel).toBe('hr_desk');
        expect(policy.otpLifetimeMinutes).toBe(10);
        expect(policy.recoveryEmailRequired).toBe(false);
        expect(formatOtpChannelLabel(policy)).toBe('HR desk · 10m');
      }
      expect(portalSecurityPolicyForRank('FM').loginPortal).toBe('hq');
      expect(portalSecurityPolicyForRank('OM').loginPortal).toBe('om');
    });

    it('AD / SC → HQ portal, HR desk OTP 10m, 30 char password (Step 01 lock)', () => {
      for (const rank of ['AD', 'SC'] as const) {
        const policy = portalSecurityPolicyForRank(rank);
        expect(policy.loginPortal).toBe('hq');
        expect(policy.passwordMinLength).toBe(30);
        expect(policy.otpChannel).toBe('hr_desk');
        expect(policy.otpLifetimeMinutes).toBe(10);
        expect(policy.recoveryEmailRequired).toBe(false);
      }
    });

    it('TM sector rank → tm portal, HR desk OTP 10m', () => {
      const policy = portalSecurityPolicyForRank('TM');
      expect(policy.loginPortal).toBe('tm');
      expect(policy.otpChannel).toBe('hr_desk');
      expect(policy.otpLifetimeMinutes).toBe(10);
    });
  });
});
