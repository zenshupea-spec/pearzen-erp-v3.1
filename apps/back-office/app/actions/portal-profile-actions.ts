'use server';

import {
  changeHeadOfficePortalPassword,
  getHeadOfficePortalAuthByEmail,
  requiresHeadOfficePortalPin,
  setPortalPinSessionCookies,
} from '../../lib/head-office-portal-auth';
import { resolveHeadOfficePasswordExpiryContext } from '../../lib/head-office-portal-password-expiry';
import { getAuthenticatedPortalSession } from '../../lib/head-office-portal-session';
import { normalizePortalRole } from '../../lib/portal-role-utils';

export type StaffProfileMenuData = {
  fullName: string | null;
  rank: string | null;
  idPhotoUrl: string | null;
  subtitleEmail: string | null;
  passwordExpiresAt: string | null;
  daysUntilExpiry: number | null;
  mustChangePassword: boolean;
  isPasswordExpired: boolean;
};

export type StaffProfileMenuContext = StaffProfileMenuData | { error: string };

export async function getStaffProfileMenuContextAction(): Promise<StaffProfileMenuContext> {
  const session = await getAuthenticatedPortalSession();
  if ('error' in session) {
    return { error: session.error };
  }

  if (
    !session.profile.employeeId ||
    !requiresHeadOfficePortalPin(session.profile, session.user.email)
  ) {
    return { error: 'Profile menu is not available for this account.' };
  }

  const authRecord = await getHeadOfficePortalAuthByEmail(session.user.email);
  if (!authRecord || !authRecord.is_active) {
    return { error: 'Portal access is not active.' };
  }

  const expiry = resolveHeadOfficePasswordExpiryContext(authRecord);

  return {
    fullName: session.profile.full_name,
    rank: normalizePortalRole(session.profile.role),
    idPhotoUrl: session.profile.id_photo_url,
    subtitleEmail: session.user.email,
    passwordExpiresAt: expiry.passwordExpiresAt,
    daysUntilExpiry: expiry.daysUntilExpiry,
    mustChangePassword: expiry.mustChangePassword,
    isPasswordExpired: expiry.isPasswordExpired,
  };
}

export async function changeHeadOfficePortalPasswordAction(
  currentPassword: string,
  newPassword: string,
  confirmPassword: string,
): Promise<{ success: true } | { error: string }> {
  const session = await getAuthenticatedPortalSession();
  if ('error' in session) {
    return { error: session.error };
  }

  if (!session.profile.employeeId) {
    return { error: 'Employee profile not found.' };
  }

  const trimmedNew = newPassword.trim();
  const trimmedConfirm = confirmPassword.trim();
  if (trimmedNew !== trimmedConfirm) {
    return { error: 'New password and confirmation do not match.' };
  }

  const result = await changeHeadOfficePortalPassword(
    session.profile.employeeId,
    session.user.email,
    currentPassword,
    trimmedNew,
  );

  if (!result.ok) {
    return { error: result.error ?? 'Could not change password.' };
  }

  await setPortalPinSessionCookies(
    session.profile.employeeId,
    session.user.email,
  );

  return { success: true };
}
