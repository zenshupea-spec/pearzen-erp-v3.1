import { describe, expect, it } from 'vitest';

import {
  headOfficePasswordExpiryBannerMessage,
  shouldShowHeadOfficePasswordExpiryBanner,
} from './portal-password-expiry-banner';

describe('portal-password-expiry-banner', () => {
  it('shows banner when expiry is within warning window', () => {
    expect(
      shouldShowHeadOfficePasswordExpiryBanner(
        {
          passwordExpiresAt: '2026-07-12T00:00:00.000Z',
          daysUntilExpiry: 10,
          mustChangePassword: false,
          isPasswordExpired: false,
        },
        '/om',
      ),
    ).toBe(true);
  });

  it('hides banner on change-password page and when already expired', () => {
    const expired = {
      passwordExpiresAt: '2026-06-01T00:00:00.000Z',
      daysUntilExpiry: -1,
      mustChangePassword: false,
      isPasswordExpired: true,
    };
    expect(shouldShowHeadOfficePasswordExpiryBanner(expired, '/om')).toBe(false);
    expect(
      shouldShowHeadOfficePasswordExpiryBanner(
        {
          passwordExpiresAt: '2026-07-12T00:00:00.000Z',
          daysUntilExpiry: 10,
          mustChangePassword: false,
          isPasswordExpired: false,
        },
        '/account/change-password',
      ),
    ).toBe(false);
  });

  it('formats banner copy', () => {
    expect(headOfficePasswordExpiryBannerMessage(1)).toContain('1 day');
    expect(headOfficePasswordExpiryBannerMessage(5)).toContain('5 days');
  });
});
