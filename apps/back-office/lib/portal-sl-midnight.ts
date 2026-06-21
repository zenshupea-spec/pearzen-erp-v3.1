const COLOMBO_TZ = 'Asia/Colombo';

/** Start of the current calendar day in Sri Lanka (as UTC ms). */
export function colomboMidnightUtcMs(at = Date.now()): number {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: COLOMBO_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(at));

  const year = parts.find((p) => p.type === 'year')?.value ?? '1970';
  const month = parts.find((p) => p.type === 'month')?.value ?? '01';
  const day = parts.find((p) => p.type === 'day')?.value ?? '01';

  return new Date(`${year}-${month}-${day}T00:00:00+05:30`).getTime();
}

/** True when the Supabase sign-in predates today's 12:00 AM Sri Lanka time. */
export function isSignInBeforeLatestColomboMidnight(
  lastSignInAt: string | null | undefined,
  now = Date.now(),
): boolean {
  if (!lastSignInAt) return false;
  const signInMs = new Date(lastSignInAt).getTime();
  if (Number.isNaN(signInMs)) return false;
  return signInMs < colomboMidnightUtcMs(now);
}

export function msUntilNextColomboMidnight(at = Date.now()): number {
  const next = colomboMidnightUtcMs(at) + 24 * 60 * 60 * 1000;
  return Math.max(0, next - at);
}
