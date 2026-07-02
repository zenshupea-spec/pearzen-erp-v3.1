'use server';

import { redirect } from 'next/navigation';

import { createSupabaseServerClient } from '../../../../../packages/supabase/server';
import { isHeadOfficeGeofenceExempt } from '../../../lib/head-office-geofence-exempt';
import {
  parseHeadOfficeCoordinates,
  verifyHeadOfficeGeofenceForCompany,
} from '../../../lib/head-office-geofence';
import {
  clearPortal2faSessionCookiesStore,
  getHeadOfficePortalAuthByIdentifier,
  isHeadOfficeOtpValid,
  isHeadOfficeOtpCode,
  requiresHeadOfficePortalPin,
  resolvePortalAuthEmail,
  setHeadOfficeGeofenceSessionCookies,
  setOtpSetupSessionCookies,
  setPortalPinSessionCookies,
  syncHeadOfficeSupabaseAuthPassword,
} from '../../../lib/head-office-portal-auth';
import {
  assertPortalLoginNotLocked,
  clearPortalLoginFailures,
  recordPortalPasswordFailure,
} from '../../../lib/head-office-portal-lockout';
import { verifyPortalPin } from '../../../lib/head-office-portal-pin';
import {
  otpExpiresMinutesForRank,
  validateHeadOfficePortalPasswordForRank,
} from '../../../lib/executive-portal-auth-policy';
import { parsePortalLoginIdentifier } from '../../../lib/head-office-portal-username';
import {
  authenticatedLandingPath,
  fetchEmployeePortalProfileByEmployeeId,
} from '../../../lib/hr-portal-access-server';
import { recordPortalLoginEvent } from '../../../lib/portal-login-events';
import {
  notifyExecutivePortalLoginAttempt,
  readPortalLoginRequestMetadata,
  finalizePortalLoginNotifications,
} from '../../../lib/head-office-portal-login-notification';
import { resolveTenantCompanyFromRequest } from '../../../lib/tenant-context-server';
import {
  resolveEmployeeCompanyId,
  setVerifiedTenantSlugCookieForCompany,
} from '../../../lib/tenant-cookie-server';
import type { StaffPortalId } from '../../../lib/portal-isolation';
import {
  canSignInAtStaffPortal,
  staffPortalSignInError,
  staffPortalIdForRole,
} from '../../../lib/portal-isolation';
import { maybeCreateSessionChallengeAfterLogin } from '../../actions/portal-session-actions';

function safeNextPath(raw: string | null | undefined): string {
  if (!raw?.startsWith('/') || raw.startsWith('//')) return '/';
  return raw;
}

export async function headOfficeLoginRequiresGeolocation(
  employeeId: string,
): Promise<boolean> {
  const tenant = await resolveTenantCompanyFromRequest();
  const profile = await fetchEmployeePortalProfileByEmployeeId(
    employeeId,
    tenant?.id,
  );
  if (!profile?.role) return true;
  return !isHeadOfficeGeofenceExempt(profile.role);
}

export async function headOfficeLoginIdentifierRequiresGeolocation(
  identifier: string,
  staffPortal?: StaffPortalId | null,
): Promise<boolean> {
  if (staffPortal === 'md') return false;

  const parsed = parsePortalLoginIdentifier(identifier);
  if (!parsed) return true;

  const authRecord = await getHeadOfficePortalAuthByIdentifier(identifier);
  if (!authRecord) return true;
  return headOfficeLoginRequiresGeolocation(authRecord.employee_id);
}

/** @deprecated Use headOfficeLoginIdentifierRequiresGeolocation */
export async function headOfficeNicRequiresGeolocation(
  identifier: string,
  staffPortal?: StaffPortalId | null,
): Promise<boolean> {
  return headOfficeLoginIdentifierRequiresGeolocation(identifier, staffPortal);
}

function decodeAccessTokenSessionId(accessToken: string): string | null {
  try {
    const payload = JSON.parse(
      Buffer.from(accessToken.split('.')[1], 'base64url').toString('utf8'),
    ) as { session_id?: unknown };
    return typeof payload.session_id === 'string' ? payload.session_id : null;
  } catch {
    return null;
  }
}

export async function authenticateHeadOfficeStaff(formData: FormData) {
  const identifierRaw =
    (formData.get('email') as string) ??
    (formData.get('nic') as string) ??
    '';
  const loginIdentifier = parsePortalLoginIdentifier(identifierRaw);
  const password = ((formData.get('password') as string) ?? '').trim();
  const nextPath = safeNextPath((formData.get('next') as string) ?? '/');
  const staffPortalRaw = (formData.get('staffPortal') as string) ?? '';
  const staffPortal =
    staffPortalRaw === 'md' ||
    staffPortalRaw === 'om' ||
    staffPortalRaw === 'tm' ||
    staffPortalRaw === 'hq'
      ? staffPortalRaw
      : null;
  const coords = parseHeadOfficeCoordinates(
    formData.get('lat'),
    formData.get('lng'),
  );

  if (!loginIdentifier) {
    return { success: false, error: 'Work email is required.' };
  }
  if (!password) {
    return { success: false, error: 'OTP or portal PIN is required.' };
  }

  const authRecord = await getHeadOfficePortalAuthByIdentifier(identifierRaw);
  if (!authRecord || !authRecord.is_active) {
    return {
      success: false,
      error: !authRecord
        ? 'Portal access not provisioned. Ask HR or OD to generate an OTP.'
        : 'Portal access has been revoked. Contact HR or OD.',
    };
  }

  const tenant = await resolveTenantCompanyFromRequest();
  const profile = await fetchEmployeePortalProfileByEmployeeId(
    authRecord.employee_id,
    tenant?.id,
  );
  if (!profile?.role) {
    return {
      success: false,
      error: 'Employee record not found or no portal rank is set.',
    };
  }

  if (staffPortal && !canSignInAtStaffPortal(profile.role, staffPortal, profile)) {
    return { success: false, error: staffPortalSignInError(staffPortal) };
  }

  const lockCheck = await assertPortalLoginNotLocked(
    authRecord.employee_id,
    profile.role,
  );
  if (!lockCheck.ok) {
    return { success: false, error: lockCheck.error };
  }

  const portalAuthEmail = resolvePortalAuthEmail(authRecord);
  const requestMeta = await readPortalLoginRequestMetadata();
  const portalForNotify =
    staffPortal ?? staffPortalIdForRole(profile.role, profile);
  const geofenceExempt =
    staffPortal === 'md' || isHeadOfficeGeofenceExempt(profile.role);
  if (!geofenceExempt) {
    if (!coords) {
      return {
        success: false,
        error: 'Location is required. Enable GPS and allow location access, then try again.',
      };
    }
    const withinGeofence = await verifyHeadOfficeGeofenceForCompany(
      tenant?.id,
      coords.lat,
      coords.lng,
    );
    if (!withinGeofence) {
      return {
        success: false,
        error: 'Sign-in is only allowed within the Head Office geofence.',
      };
    }
  }

  const needsPortalAuth = requiresHeadOfficePortalPin(profile, portalAuthEmail);
  let portalCredentialVerified = false;

  if (needsPortalAuth) {
    if (authRecord.needs_pin_setup) {
      if (!isHeadOfficeOtpCode(password)) {
        return { success: false, error: 'Use the 6-digit OTP from HR or OD.' };
      }
      if (!authRecord.current_otp || password !== authRecord.current_otp) {
        const failure = await recordPortalPasswordFailure(
          authRecord.employee_id,
          profile.role,
        );
        await notifyExecutivePortalLoginAttempt({
          employeeId: authRecord.employee_id,
          workEmail: authRecord.work_email,
          recoveryEmail: authRecord.recovery_email,
          portalAuthEmail,
          rank: profile.role,
          success: false,
          ipAddress: requestMeta.ipAddress,
          deviceLabel: requestMeta.deviceLabel,
          staffPortal: portalForNotify,
        });
        return { success: false, error: failure.error };
      }
      if (!isHeadOfficeOtpValid(authRecord)) {
        const minutes = otpExpiresMinutesForRank(profile.role);
        await notifyExecutivePortalLoginAttempt({
          employeeId: authRecord.employee_id,
          workEmail: authRecord.work_email,
          recoveryEmail: authRecord.recovery_email,
          portalAuthEmail,
          rank: profile.role,
          success: false,
          ipAddress: requestMeta.ipAddress,
          deviceLabel: requestMeta.deviceLabel,
          staffPortal: portalForNotify,
        });
        return {
          success: false,
          error: `OTP expired (${minutes}-minute limit). Ask HR or OD for a new one.`,
        };
      }
      portalCredentialVerified = true;
    } else {
      const passwordCheck = validateHeadOfficePortalPasswordForRank(
        password,
        profile.role,
        { rbacGated: profile.rbacGated },
      );
      if (!passwordCheck.ok) {
        return { success: false, error: passwordCheck.error };
      }
      if (!authRecord.pin_hash || !verifyPortalPin(password, authRecord.pin_hash)) {
        const failure = await recordPortalPasswordFailure(
          authRecord.employee_id,
          profile.role,
        );
        await notifyExecutivePortalLoginAttempt({
          employeeId: authRecord.employee_id,
          workEmail: authRecord.work_email,
          recoveryEmail: authRecord.recovery_email,
          portalAuthEmail,
          rank: profile.role,
          success: false,
          ipAddress: requestMeta.ipAddress,
          deviceLabel: requestMeta.deviceLabel,
          staffPortal: portalForNotify,
        });
        return { success: false, error: failure.error };
      }
      portalCredentialVerified = true;
    }
  }

  const supabase = await createSupabaseServerClient();
  let { error } = await supabase.auth.signInWithPassword({
    email: portalAuthEmail,
    password,
  });

  if (error && portalCredentialVerified) {
    const sync = await syncHeadOfficeSupabaseAuthPassword(portalAuthEmail, password, {
      employeeId: profile.employeeId ?? authRecord.employee_id,
      fullName: profile.full_name,
    });
    if (sync.ok) {
      ({ error } = await supabase.auth.signInWithPassword({
        email: portalAuthEmail,
        password,
      }));
    }
  }

  if (error) {
    const failure = await recordPortalPasswordFailure(
      authRecord.employee_id,
      profile.role,
    );
    await recordPortalLoginEvent({
      employeeId: authRecord.employee_id,
      portalAuthEmail,
      eventType: 'password_login_failure',
      success: false,
      detail: failure.error,
      ipAddress: requestMeta.ipAddress,
      deviceLabel: requestMeta.deviceLabel,
    });
    await notifyExecutivePortalLoginAttempt({
      employeeId: authRecord.employee_id,
      workEmail: authRecord.work_email,
      recoveryEmail: authRecord.recovery_email,
      portalAuthEmail,
      rank: profile.role,
      success: false,
      ipAddress: requestMeta.ipAddress,
      deviceLabel: requestMeta.deviceLabel,
      staffPortal: portalForNotify,
    });
    return { success: false, error: failure.error };
  }

  await clearPortalLoginFailures(authRecord.employee_id);
  await recordPortalLoginEvent({
    employeeId: authRecord.employee_id,
    portalAuthEmail,
    eventType: 'password_login_success',
    success: true,
    ipAddress: requestMeta.ipAddress,
    deviceLabel: requestMeta.deviceLabel,
  });

  const companyId = await resolveEmployeeCompanyId(authRecord.employee_id);
  const employeeId = profile.employeeId ?? authRecord.employee_id;
  const resolvedStaffPortal =
    staffPortal ?? staffPortalIdForRole(profile.role, profile);
  const loginCompletesNow = !(needsPortalAuth && employeeId);

  if (loginCompletesNow) {
    await finalizePortalLoginNotifications({
      employeeId: authRecord.employee_id,
      workEmail: authRecord.work_email,
      recoveryEmail: authRecord.recovery_email,
      portalAuthEmail,
      rank: profile.role,
      employeeName: profile.full_name,
      companyId,
      staffPortal: resolvedStaffPortal,
      ipAddress: requestMeta.ipAddress,
      deviceLabel: requestMeta.deviceLabel,
    });
  }

  await setVerifiedTenantSlugCookieForCompany(companyId);

  const {
    data: { session: authSession },
  } = await supabase.auth.getSession();
  const sessionId = authSession?.access_token
    ? decodeAccessTokenSessionId(authSession.access_token)
    : null;
  const userId = authSession?.user?.id;

  const landing = authenticatedLandingPath(profile.role, profile);

  if (sessionId && userId && employeeId) {
    await maybeCreateSessionChallengeAfterLogin(
      employeeId,
      userId,
      sessionId,
    );
  }

  if (employeeId && !geofenceExempt) {
    await setHeadOfficeGeofenceSessionCookies(employeeId, portalAuthEmail);
  }

  if (needsPortalAuth && authRecord.needs_pin_setup && employeeId) {
    await clearPortal2faSessionCookiesStore();
    try {
      await setOtpSetupSessionCookies(employeeId, portalAuthEmail);
    } catch {
      return {
        success: false,
        error:
          'Could not start your setup session. Please try again. If this persists, contact Pearzen support.',
      };
    }
    redirect('/login/set-pin');
  }

  if (needsPortalAuth && employeeId) {
    await clearPortal2faSessionCookiesStore();
    await setPortalPinSessionCookies(employeeId, portalAuthEmail);
    if (!authRecord.two_factor_enabled) {
      redirect('/login/setup-2fa');
    }
    redirect('/login/verify-2fa');
  }

  redirect(nextPath !== '/' ? nextPath : landing);
}
