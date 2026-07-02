import { isPasswordExpiryWarning } from '../../../packages/supabase/portal-password-rotation';
import { isHeadOfficePasswordChangePath } from './head-office-portal-gate-paths';
import type { HeadOfficePasswordExpiryContext } from './head-office-portal-password-expiry';

export function shouldShowHeadOfficePasswordExpiryBanner(
  expiry: HeadOfficePasswordExpiryContext | null | undefined,
  pathname: string,
): boolean {
  if (!expiry) return false;
  if (expiry.isPasswordExpired || expiry.mustChangePassword) return false;
  if (isHeadOfficePasswordChangePath(pathname)) return false;
  return isPasswordExpiryWarning(expiry.daysUntilExpiry);
}

export function headOfficePasswordExpiryBannerMessage(
  daysUntilExpiry: number | null,
): string {
  if (daysUntilExpiry === null) {
    return 'Your portal password expires soon. Change it now to avoid interruption.';
  }
  if (daysUntilExpiry <= 0) {
    return 'Your portal password has expired.';
  }
  const dayLabel = daysUntilExpiry === 1 ? 'day' : 'days';
  return `Your portal password expires in ${daysUntilExpiry} ${dayLabel}. Change it now to avoid interruption.`;
}
