import { describe, expect, it } from 'vitest';

import {
  EXECUTIVE_PORTAL_ACCESS_CODE_SUCCESS_MESSAGE,
  headOfficeForgotPasswordOtpResetFields,
  isEligibleExecutivePortalSelfServiceTarget,
} from './executive-portal-auth-policy';

describe('requestExecutivePortalAccessCode messaging', () => {
  it('uses a single generic success message (no enumeration)', () => {
    expect(EXECUTIVE_PORTAL_ACCESS_CODE_SUCCESS_MESSAGE).toMatch(/work email/i);
    expect(EXECUTIVE_PORTAL_ACCESS_CODE_SUCCESS_MESSAGE).not.toMatch(/support@pearzen\.tech/);
    expect(EXECUTIVE_PORTAL_ACCESS_CODE_SUCCESS_MESSAGE).not.toMatch(/not found/i);
    expect(EXECUTIVE_PORTAL_ACCESS_CODE_SUCCESS_MESSAGE).not.toMatch(/\bMD\b|\bOD\b/);
  });
});

describe('isEligibleExecutivePortalSelfServiceTarget', () => {
  it('allows active MD and OD accounts', () => {
    expect(
      isEligibleExecutivePortalSelfServiceTarget({
        employeeId: 'emp-1',
        rank: 'MD',
        authActive: true,
      }),
    ).toBe(true);
    expect(
      isEligibleExecutivePortalSelfServiceTarget({
        employeeId: 'emp-2',
        rank: 'OD',
        authActive: true,
      }),
    ).toBe(true);
  });

  it('rejects HQ staff ranks even when portal auth is active', () => {
    for (const rank of ['HR', 'FM', 'EA']) {
      expect(
        isEligibleExecutivePortalSelfServiceTarget({
          employeeId: 'emp-hq',
          rank,
          authActive: true,
        }),
      ).toBe(false);
    }
  });

  it('rejects inactive or missing employee records', () => {
    expect(
      isEligibleExecutivePortalSelfServiceTarget({
        employeeId: null,
        rank: 'MD',
        authActive: true,
      }),
    ).toBe(false);
    expect(
      isEligibleExecutivePortalSelfServiceTarget({
        employeeId: 'emp-1',
        rank: 'MD',
        authActive: false,
      }),
    ).toBe(false);
  });
});

describe('headOfficeForgotPasswordOtpResetFields', () => {
  it('clears portal password and 2FA when resetting an established account', () => {
    expect(
      headOfficeForgotPasswordOtpResetFields({
        needs_pin_setup: false,
        pin_hash: 'hashed-pin',
      }),
    ).toEqual({
      pin_hash: null,
      unlock_code_hash: null,
      needs_pin_setup: true,
      totp_secret: null,
      two_factor_enabled: false,
      totp_backup_code_hashes: [],
      failed_2fa_attempts: 0,
    });
  });

  it('does not reset credentials during first-time OTP setup', () => {
    expect(
      headOfficeForgotPasswordOtpResetFields({
        needs_pin_setup: true,
        pin_hash: null,
      }),
    ).toEqual({});
  });
});
