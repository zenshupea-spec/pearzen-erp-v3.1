import { describe, expect, it } from 'vitest';

import {
  EXECUTIVE_PORTAL_PASSWORD_MIN_LENGTH,
  HQ_PORTAL_PASSWORD_MIN_LENGTH,
  isHqStaffPortalRank,
  passwordMinLengthForRank,
  receivesWorkEmailOtpOnProvision,
  usesHrDeskOtpOnProvision,
  validateHeadOfficePortalPasswordForRank,
} from './executive-portal-auth-policy';
import { HO_PORTAL_PASSWORD_MIN_LENGTH } from './head-office-portal-password';

describe('passwordMinLengthForRank', () => {
  it('requires 30 characters for MD and OD', () => {
    expect(passwordMinLengthForRank('MD')).toBe(EXECUTIVE_PORTAL_PASSWORD_MIN_LENGTH);
    expect(passwordMinLengthForRank('OD')).toBe(EXECUTIVE_PORTAL_PASSWORD_MIN_LENGTH);
  });

  it('requires 30 characters for HQ staff ranks', () => {
    expect(passwordMinLengthForRank('HR')).toBe(HQ_PORTAL_PASSWORD_MIN_LENGTH);
    expect(passwordMinLengthForRank('FM')).toBe(HQ_PORTAL_PASSWORD_MIN_LENGTH);
    expect(passwordMinLengthForRank('EA')).toBe(HQ_PORTAL_PASSWORD_MIN_LENGTH);
    expect(isHqStaffPortalRank('FM')).toBe(true);
  });

  it('requires 30 characters for RBAC-gated HQ portal staff', () => {
    expect(passwordMinLengthForRank('STAFF', { rbacGated: true })).toBe(
      HQ_PORTAL_PASSWORD_MIN_LENGTH,
    );
  });

  it('requires 30 characters for OM and TM staff portals', () => {
    expect(passwordMinLengthForRank('OM')).toBe(EXECUTIVE_PORTAL_PASSWORD_MIN_LENGTH);
    expect(passwordMinLengthForRank('TM')).toBe(EXECUTIVE_PORTAL_PASSWORD_MIN_LENGTH);
  });
});

describe('receivesWorkEmailOtpOnProvision', () => {
  it('emails MD, OD, and HR only', () => {
    expect(receivesWorkEmailOtpOnProvision('MD')).toBe(true);
    expect(receivesWorkEmailOtpOnProvision('OD')).toBe(true);
    expect(receivesWorkEmailOtpOnProvision('HR')).toBe(true);
  });

  it('uses HR desk OTP for FM, EA, OM, and TM', () => {
    expect(receivesWorkEmailOtpOnProvision('FM')).toBe(false);
    expect(receivesWorkEmailOtpOnProvision('EA')).toBe(false);
    expect(receivesWorkEmailOtpOnProvision('OM')).toBe(false);
    expect(receivesWorkEmailOtpOnProvision('TM')).toBe(false);
    expect(usesHrDeskOtpOnProvision('FM')).toBe(true);
    expect(usesHrDeskOtpOnProvision('OM')).toBe(true);
  });
});

describe('validateHeadOfficePortalPasswordForRank', () => {
  const valid30 =
    'ClassicVenture-HQ-Portal-Pass-2026!';

  it('rejects HQ FM password shorter than 30 characters', () => {
    const result = validateHeadOfficePortalPasswordForRank('Short1!pass', 'FM');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/30 characters/);
    }
  });

  it('accepts HQ FM password with 30+ characters and complexity', () => {
    expect(validateHeadOfficePortalPasswordForRank(valid30, 'FM').ok).toBe(true);
  });

  it('rejects OM password shorter than 30 characters', () => {
    const omPassword = 'OmPortalPass1!xx';
    expect(omPassword.length).toBeGreaterThanOrEqual(15);
    expect(omPassword.length).toBeLessThan(30);
    expect(validateHeadOfficePortalPasswordForRank(omPassword, 'OM').ok).toBe(false);
  });

  it('accepts OM password with 30+ characters and complexity', () => {
    expect(validateHeadOfficePortalPasswordForRank(valid30, 'OM').ok).toBe(true);
  });

  it('rejects MD and OD passwords shorter than 30 characters', () => {
    const short = 'ShortExec1!';
    expect(short.length).toBeLessThan(30);
    expect(validateHeadOfficePortalPasswordForRank(short, 'MD').ok).toBe(false);
    expect(validateHeadOfficePortalPasswordForRank(short, 'OD').ok).toBe(false);
    if (!validateHeadOfficePortalPasswordForRank(short, 'MD').ok) {
      expect(validateHeadOfficePortalPasswordForRank(short, 'MD').error).toMatch(
        /30 characters/,
      );
    }
  });
});
