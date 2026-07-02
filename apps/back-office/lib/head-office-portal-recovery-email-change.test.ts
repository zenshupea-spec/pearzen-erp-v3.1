import { pbkdf2Sync } from 'crypto';
import { describe, expect, it } from 'vitest';

import { EXECUTIVE_PORTAL_OTP_LIFETIME_MS } from './executive-portal-auth-policy';
import { canExecutiveResetTargetTwoFactor } from './executive-portal-auth-policy';
import {
  buildExecutiveRecoveryEmailVerificationEmailBody,
  buildExecutiveWorkEmailChangeOtpEmailBody,
  EXECUTIVE_RECOVERY_EMAIL_OTP_TTL_MS,
  verifyRecoveryEmailChangeCodeHash,
} from './head-office-portal-recovery-email-change-utils';

describe('head-office-portal-recovery-email-change', () => {
  it('uses the executive 5-minute OTP TTL', () => {
    expect(EXECUTIVE_RECOVERY_EMAIL_OTP_TTL_MS).toBe(EXECUTIVE_PORTAL_OTP_LIFETIME_MS);
    expect(EXECUTIVE_RECOVERY_EMAIL_OTP_TTL_MS).toBe(5 * 60 * 1000);
  });

  it('builds verification email copy for the new recovery inbox', () => {
    const { subject, text } = buildExecutiveRecoveryEmailVerificationEmailBody({
      staffName: 'Jane Perera',
      workEmail: 'md@company.com',
      otp: '482910',
      expiresMinutes: 5,
    });

    expect(subject).toMatch(/recovery email/i);
    expect(text).toContain('482910');
    expect(text).toContain('md@company.com');
    expect(text).toContain('5 minutes');
  });

  it('verifies stored recovery-email change code hashes', () => {
    const code = '482910';
    const salt = 'a1b2c3d4';
    const hash = pbkdf2Sync(code, salt, 100_000, 32, 'sha256').toString('hex');
    const stored = `${salt}:${hash}`;

    expect(verifyRecoveryEmailChangeCodeHash(code, stored)).toBe(true);
    expect(verifyRecoveryEmailChangeCodeHash('000000', stored)).toBe(false);
  });
  it('builds work email change OTP copy for recovery inbox path', () => {
    const { subject, text } = buildExecutiveWorkEmailChangeOtpEmailBody({
      staffName: 'Jane Perera',
      currentWorkEmail: 'md@company.com',
      newWorkEmail: 'md.new@company.com',
      otp: '482910',
      expiresMinutes: 5,
      sendOtpTo: 'recovery',
    });

    expect(subject).toMatch(/work email/i);
    expect(text).toContain('recovery email inbox');
    expect(text).toContain('482910');
    expect(text).toContain('md.new@company.com');
  });
});

describe('recovery email change actor policy', () => {
  it('allows MD to manage staff 2FA including OD', () => {
    expect(canExecutiveResetTargetTwoFactor('MD', 'OD')).toBe(true);
  });
});
