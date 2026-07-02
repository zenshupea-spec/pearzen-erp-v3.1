import { describe, expect, it } from 'vitest';

import {
  assertNotReusedPassword,
  computePasswordExpiresAt,
  getDaysUntilExpiry,
  hashPortalCredential,
  isPasswordExpired,
  isPasswordExpiryWarning,
  isRepeatedPin,
  isSequentialPin,
  validateSmPortalPin,
} from './portal-password-rotation';

describe('portal-password-rotation', () => {
  it('detects expired and forced-change credentials', () => {
    const past = new Date(Date.now() - MS_PER_DAY).toISOString();
    const future = new Date(Date.now() + MS_PER_DAY).toISOString();

    expect(isPasswordExpired(past)).toBe(true);
    expect(isPasswordExpired(future)).toBe(false);
    expect(isPasswordExpired(future, true)).toBe(true);
    expect(isPasswordExpired(null)).toBe(false);
  });

  it('computes expiry 60 days after change', () => {
    const changedAt = new Date('2026-01-01T00:00:00.000Z');
    const expiresAt = computePasswordExpiresAt(changedAt);
    expect(expiresAt.toISOString()).toBe('2026-03-02T00:00:00.000Z');
  });

  it('warns within 14 days of expiry', () => {
    const expiresAt = new Date(Date.now() + 10 * MS_PER_DAY).toISOString();
    const days = getDaysUntilExpiry(expiresAt);
    expect(days).toBe(10);
    expect(isPasswordExpiryWarning(days)).toBe(true);
    expect(isPasswordExpiryWarning(20)).toBe(false);
  });

  it('rejects weak SM PIN patterns', () => {
    expect(validateSmPortalPin('123456')).toEqual({
      ok: false,
      error: 'PIN cannot be a sequential number.',
    });
    expect(validateSmPortalPin('111111')).toEqual({
      ok: false,
      error: 'PIN cannot be six identical digits.',
    });
    expect(validateSmPortalPin('482910')).toEqual({ ok: true });
    expect(isSequentialPin('654321')).toBe(true);
    expect(isRepeatedPin('000000')).toBe(true);
  });

  it('rejects reuse of current and historic credentials', () => {
    const current = 'CurrentPassw0rd!';
    const previous = 'PreviousPassw0rd!';
    const currentHash = hashPortalCredential(current);
    const previousHash = hashPortalCredential(previous);

    expect(
      assertNotReusedPassword(current, {
        currentHash,
        historyHashes: [previousHash],
      }),
    ).toEqual({
      ok: false,
      error: 'New password cannot match your current password.',
    });

    expect(
      assertNotReusedPassword(previous, {
        currentHash: hashPortalCredential('BrandNewPassw0rd!'),
        historyHashes: [previousHash],
      }),
    ).toEqual({
      ok: false,
      error: 'You cannot reuse a recent password. Choose one you have not used before.',
    });

    expect(
      assertNotReusedPassword('TotallyNewPassw0rd!', {
        currentHash,
        historyHashes: [previousHash],
      }),
    ).toEqual({ ok: true });
  });
});

const MS_PER_DAY = 24 * 60 * 60 * 1000;
