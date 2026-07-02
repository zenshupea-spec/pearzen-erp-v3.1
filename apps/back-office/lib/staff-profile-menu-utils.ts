import { isPasswordExpiryWarning } from '../../../packages/supabase/portal-password-rotation';

export function profileInitials(
  fullName: string | null | undefined,
  rank: string | null | undefined,
): string {
  const trimmed = fullName?.trim();
  if (trimmed) {
    const parts = trimmed.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return `${parts[0]![0] ?? ''}${parts[parts.length - 1]![0] ?? ''}`.toUpperCase();
    }
    return trimmed.slice(0, 2).toUpperCase();
  }
  const rankLabel = rank?.trim();
  return rankLabel ? rankLabel.slice(0, 2).toUpperCase() : '?';
}

export function profileFirstName(fullName: string | null | undefined): string | null {
  const trimmed = fullName?.trim();
  if (!trimmed) return null;
  return trimmed.split(/\s+/)[0] ?? null;
}

export function profileExpiryWarningActive(
  daysUntilExpiry: number | null | undefined,
): boolean {
  return isPasswordExpiryWarning(
    typeof daysUntilExpiry === 'number' ? daysUntilExpiry : null,
  );
}

export function profileExpiryTooltip(
  daysUntilExpiry: number | null | undefined,
): string | null {
  if (!profileExpiryWarningActive(daysUntilExpiry)) return null;
  if (daysUntilExpiry === null || daysUntilExpiry === undefined) return null;
  if (daysUntilExpiry <= 0) return 'Password expired';
  const dayLabel = daysUntilExpiry === 1 ? 'day' : 'days';
  return `Password expires in ${daysUntilExpiry} ${dayLabel}`;
}
