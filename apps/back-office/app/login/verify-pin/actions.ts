'use server';

import { redirect } from 'next/navigation';

import { signOutHeadOfficePortalAction } from '../../../app/actions/portal-session-actions';
import { isHeadOfficeGeofenceExempt } from '../../../lib/head-office-geofence-exempt';
import {
  verifyHeadOfficeGeofenceForCompany,
} from '../../../lib/head-office-geofence';
import {
  getHeadOfficePortalAuthByEmail,
  setHeadOfficeGeofenceSessionCookies,
  setOtpSetupSessionCookies,
  setPortalPinSessionCookies,
  verifyHeadOfficePortalCode,
} from '../../../lib/head-office-portal-auth';
import { getAuthenticatedPortalSession } from '../../../lib/head-office-portal-session';
import { resolveTenantCompanyFromRequest } from '../../../lib/tenant-context-server';

export async function verifyHeadOfficePinAction(
  code: string,
  lat: number,
  lng: number,
) {
  const session = await getAuthenticatedPortalSession();
  if ('error' in session) return { error: session.error };

  if (!isHeadOfficeGeofenceExempt(session.profile.role)) {
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return { error: 'Location is required. Enable GPS and try again.' };
    }
    const tenant = await resolveTenantCompanyFromRequest();
    const withinGeofence = await verifyHeadOfficeGeofenceForCompany(
      tenant?.id,
      lat,
      lng,
    );
    if (!withinGeofence) {
      return {
        error: 'Verification is only allowed within the Head Office geofence.',
      };
    }
    await setHeadOfficeGeofenceSessionCookies(
      session.profile.employeeId!,
      session.user.email,
    );
  }

  const result = await verifyHeadOfficePortalCode(session.user.email, code);
  if (!result.ok) return { error: result.error ?? 'Verification failed.' };

  if (result.needsPinSetup) {
    await setOtpSetupSessionCookies(
      session.profile.employeeId!,
      session.user.email,
    );
    redirect('/login/set-pin');
  }

  await setPortalPinSessionCookies(
    session.profile.employeeId!,
    session.user.email,
  );

  const authRecord = await getHeadOfficePortalAuthByEmail(session.user.email);
  if (!authRecord?.two_factor_enabled) {
    redirect('/login/setup-2fa');
  }
  redirect('/login/verify-2fa');
}

export async function signOutPortalSessionAction(redirectPath: string) {
  await signOutHeadOfficePortalAction(redirectPath);
}
