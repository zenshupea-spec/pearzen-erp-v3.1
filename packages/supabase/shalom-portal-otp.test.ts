import { describe, expect, it } from 'vitest';

import {
  SHALOM_PORTAL_OTP_LIFETIME_MS,
} from './portal-otp-lifetime';
import {
  hashShalomPortalOtp,
  isShalomPortalOtpActive,
  verifyShalomPortalOtp,
} from './shalom-portal-otp';

describe('shalom-portal-otp', () => {
  it('uses a five-minute HR provision window', () => {
    expect(SHALOM_PORTAL_OTP_LIFETIME_MS).toBe(5 * 60 * 1000);
  });
  it('hashes and verifies OTP for an EPF', () => {
    const hash = hashShalomPortalOtp('123456', 'EPF001');
    expect(verifyShalomPortalOtp('123456', 'EPF001', hash)).toBe(true);
    expect(verifyShalomPortalOtp('654321', 'EPF001', hash)).toBe(false);
  });

  it('detects active OTP expiry window', () => {
    const future = new Date(Date.now() + 30_000).toISOString();
    const past = new Date(Date.now() - 30_000).toISOString();
    expect(isShalomPortalOtpActive(future)).toBe(true);
    expect(isShalomPortalOtpActive(past)).toBe(false);
  });
});
