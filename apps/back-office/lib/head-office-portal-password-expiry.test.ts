import { describe, expect, it } from 'vitest';

import { resolveHeadOfficePasswordExpiryContext } from './head-office-portal-password-expiry';

describe('resolveHeadOfficePasswordExpiryContext', () => {
  it('flags forced change and past expiry', () => {
    const now = new Date('2026-07-02T12:00:00.000Z');

    expect(
      resolveHeadOfficePasswordExpiryContext(
        {
          password_expires_at: '2026-06-01T00:00:00.000Z',
          must_change_password: false,
        },
        now,
      ).isPasswordExpired,
    ).toBe(true);

    expect(
      resolveHeadOfficePasswordExpiryContext(
        {
          password_expires_at: '2026-08-01T00:00:00.000Z',
          must_change_password: true,
        },
        now,
      ).isPasswordExpired,
    ).toBe(true);
  });

  it('returns days until expiry for active credentials', () => {
    const now = new Date('2026-07-02T12:00:00.000Z');
    const context = resolveHeadOfficePasswordExpiryContext(
      {
        password_expires_at: '2026-07-12T00:00:00.000Z',
        must_change_password: false,
      },
      now,
    );

    expect(context.isPasswordExpired).toBe(false);
    expect(context.daysUntilExpiry).toBe(10);
  });
});
