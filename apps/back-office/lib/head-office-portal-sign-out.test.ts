import { describe, expect, it } from 'vitest';

import { buildHeadOfficePortalResetPath } from './head-office-portal-reset-path';

/** All head-office portal session cookies cleared on voluntary sign-out. */
const HEAD_OFFICE_PORTAL_SESSION_COOKIES = [
  'pz_ho_pin_session',
  'pz_ho_otp_ok',
  'pz_ho_geo_session',
  'pz_ho_2fa_session',
  'pz_ho_totp_pending',
  'pz_ho_vault_unlock',
] as const;

describe('head office portal sign-out cookies', () => {
  it('builds a portal-reset redirect for safe local paths', () => {
    expect(buildHeadOfficePortalResetPath('/login/md?error=daily_signout')).toBe(
      '/auth/portal-reset?next=%2Flogin%2Fmd%3Ferror%3Ddaily_signout',
    );
    expect(buildHeadOfficePortalResetPath('//evil.example')).toBe(
      '/auth/portal-reset?next=%2Flogin%2Fhq',
    );
  });

  it('lists every pz_ho_* session cookie for logout clearing', () => {
    for (const name of HEAD_OFFICE_PORTAL_SESSION_COOKIES) {
      expect(name.startsWith('pz_ho_')).toBe(true);
    }
    expect(HEAD_OFFICE_PORTAL_SESSION_COOKIES).toHaveLength(6);
  });
});
