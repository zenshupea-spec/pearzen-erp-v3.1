import { describe, expect, it } from 'vitest';

import {
  SM_PORTAL_OTP_LIFETIME_MS,
} from './portal-otp-lifetime';
import {
  hashSmPortalOtp,
  isSmPortalOtpActive,
  verifySmPortalOtp,
} from './sm-portal-otp';

describe('sm-portal-otp', () => {
  it('uses a five-minute HR provision window', () => {
    expect(SM_PORTAL_OTP_LIFETIME_MS).toBe(5 * 60 * 1000);
  });

  it('hashes and verifies OTP for an EPF', () => {
    const hash = hashSmPortalOtp('123456', '446');
    expect(verifySmPortalOtp('123456', '446', hash)).toBe(true);
    expect(verifySmPortalOtp('654321', '446', hash)).toBe(false);
  });

  it('detects active OTP expiry window', () => {
    const future = new Date(Date.now() + 30_000).toISOString();
    const past = new Date(Date.now() - 30_000).toISOString();
    expect(isSmPortalOtpActive(future)).toBe(true);
    expect(isSmPortalOtpActive(past)).toBe(false);
  });
});
