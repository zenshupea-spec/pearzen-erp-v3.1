const MS_PER_DAY = 24 * 60 * 60 * 1000;

function parseTimestamp(value: string | Date): Date | null {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** True when `must_change_*` is set or `expires_at` is in the past. */
export function isPasswordExpired(
  expiresAt: string | Date | null | undefined,
  mustChange = false,
  now: Date = new Date(),
): boolean {
  if (mustChange) return true;
  if (!expiresAt) return false;
  const expires = parseTimestamp(expiresAt);
  if (!expires) return false;
  return now.getTime() >= expires.getTime();
}

export function getDaysUntilExpiry(
  expiresAt: string | Date | null | undefined,
  now: Date = new Date(),
): number | null {
  if (!expiresAt) return null;
  const expires = parseTimestamp(expiresAt);
  if (!expires) return null;
  return Math.ceil((expires.getTime() - now.getTime()) / MS_PER_DAY);
}
