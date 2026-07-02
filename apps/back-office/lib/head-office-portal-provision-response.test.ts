import { describe, expect, it } from 'vitest';

import { receivesWorkEmailOtpOnProvision } from './executive-portal-auth-policy';

/** Mirrors provisionHeadOfficePortalOtp API response rule. */
function provisionOtpForProvisioner(
  rank: string,
  otp: string,
): { emailed: boolean; displayOtp?: string } {
  const emailed = receivesWorkEmailOtpOnProvision(rank);
  return {
    emailed,
    displayOtp: emailed ? undefined : otp,
  };
}

describe('provision OTP provisioner response', () => {
  it('never returns OTP to client when emailed (MD/OD/HR)', () => {
    expect(provisionOtpForProvisioner('MD', '123456')).toEqual({ emailed: true });
    expect(provisionOtpForProvisioner('HR', '123456')).toEqual({ emailed: true });
  });

  it('returns OTP on HR desk for FM, EA, OM, TM', () => {
    expect(provisionOtpForProvisioner('FM', '654321')).toEqual({
      emailed: false,
      displayOtp: '654321',
    });
    expect(provisionOtpForProvisioner('OM', '111222')).toEqual({
      emailed: false,
      displayOtp: '111222',
    });
  });
});
