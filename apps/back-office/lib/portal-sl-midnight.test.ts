import { describe, expect, it } from 'vitest';

import {
  buildDailySignoutRedirectPath,
  colomboMidnightUtcMs,
  isDailySignoutRedirectPath,
  isSignInBeforeLatestColomboMidnight,
  msUntilNextColomboMidnight,
} from './portal-sl-midnight';

describe('portal-sl-midnight', () => {
  it('computes Colombo midnight in UTC for a fixed instant', () => {
    // 2026-06-24 01:00 Asia/Colombo = 2026-06-23T19:30:00.000Z
    const now = new Date('2026-06-23T19:30:00.000Z').getTime();
    // Same calendar day in Colombo starts at 2026-06-23T18:30:00.000Z
    expect(colomboMidnightUtcMs(now)).toBe(
      new Date('2026-06-23T18:30:00.000Z').getTime(),
    );
  });

  it('treats sign-in before today Colombo midnight as stale', () => {
    const now = new Date('2026-06-23T19:30:00.000Z').getTime();
    const lastSignIn = '2026-06-23T10:00:00.000Z';
    expect(isSignInBeforeLatestColomboMidnight(lastSignIn, now)).toBe(true);
  });

  it('treats sign-in after today Colombo midnight as fresh', () => {
    const now = new Date('2026-06-23T19:30:00.000Z').getTime();
    const lastSignIn = '2026-06-23T19:00:00.000Z';
    expect(isSignInBeforeLatestColomboMidnight(lastSignIn, now)).toBe(false);
  });

  it('does not treat missing last_sign_in_at as stale', () => {
    expect(isSignInBeforeLatestColomboMidnight(null)).toBe(false);
    expect(isSignInBeforeLatestColomboMidnight(undefined)).toBe(false);
  });

  it('returns ms until the next Colombo midnight', () => {
    const now = new Date('2026-06-23T19:30:00.000Z').getTime();
    const untilNext = msUntilNextColomboMidnight(now);
    const nextMidnight = colomboMidnightUtcMs(now) + 24 * 60 * 60 * 1000;
    expect(untilNext).toBe(nextMidnight - now);
  });

  it('builds role-aware daily sign-out redirect paths', () => {
    expect(
      buildDailySignoutRedirectPath({ role: 'MD', rbacGated: false }),
    ).toBe('/login/md?error=daily_signout');
    expect(
      buildDailySignoutRedirectPath({ role: 'HR', rbacGated: false }),
    ).toBe('/login/hq?error=daily_signout');
    expect(isDailySignoutRedirectPath('/login/md?error=daily_signout')).toBe(
      true,
    );
  });
});
