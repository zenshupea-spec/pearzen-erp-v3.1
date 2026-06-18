'use server';

import { redirect } from 'next/navigation';

import { createSupabaseServerClient } from '../../../../../packages/supabase/server';
import { fetchEmployeePortalProfileByEmail } from '../../../lib/hr-portal-access';
import { isHeadOfficeGeofenceExempt } from '../../../lib/head-office-geofence-exempt';
import {
  parseHeadOfficeCoordinates,
  verifyHeadOfficeGeofenceForCompany,
} from '../../../lib/head-office-geofence';
import {
  clearPortal2faSessionCookiesStore,
  getHeadOfficePortalAuthByEmail,
  isHeadOfficeOtpValid,
  isHeadOfficeOtpCode,
  normalizeWorkEmail,
  requiresHeadOfficePortalPin,
  setHeadOfficeGeofenceSessionCookies,
  setOtpSetupSessionCookies,
  setPortalPinSessionCookies,
  syncHeadOfficeSupabaseAuthPassword,
} from '../../../lib/head-office-portal-auth';
import { verifyPortalPin } from '../../../lib/head-office-portal-pin';
import { validateHeadOfficePortalPassword } from '../../../lib/head-office-portal-password';
import { authenticatedLandingPath } from '../../../lib/hr-portal-access-server';
import { resolveTenantCompanyFromRequest } from '../../../lib/tenant-context-server';

function safeNextPath(raw: string | null | undefined): string {
  if (!raw?.startsWith('/') || raw.startsWith('//')) return '/';
  return raw;
}

/** MD/OD sign in from anywhere — only staff need GPS at login. */
export async function headOfficeLoginRequiresGeolocation(
  email: string,
): Promise<boolean> {
  const normalized = normalizeWorkEmail(email);
  if (!normalized) return true;

  const tenant = await resolveTenantCompanyFromRequest();
  const profile = await fetchEmployeePortalProfileByEmail(
    normalized,
    tenant?.id,
  );
  if (!profile?.role) return true;
  return !isHeadOfficeGeofenceExempt(profile.role);
}

export async function authenticateHeadOfficeStaff(formData: FormData) {
  const email = normalizeWorkEmail((formData.get('email') as string) ?? '');
  const password = ((formData.get('password') as string) ?? '').trim();
  const nextPath = safeNextPath((formData.get('next') as string) ?? '/');
  const coords = parseHeadOfficeCoordinates(
    formData.get('lat'),
    formData.get('lng'),
  );

  if (!email) {
    return { success: false, error: 'Work email is required.' };
  }
  if (!password) {
    return { success: false, error: 'OTP or password is required.' };
  }

  const tenant = await resolveTenantCompanyFromRequest();
  const profile = await fetchEmployeePortalProfileByEmail(email, tenant?.id);
  if (!profile?.role) {
    return {
      success: false,
      error: 'Email not found on the master nominal roll or no portal rank is set.',
    };
  }

  const geofenceExempt = isHeadOfficeGeofenceExempt(profile.role);
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

  const needsPortalAuth = requiresHeadOfficePortalPin(profile, email);
  const authRecord = await getHeadOfficePortalAuthByEmail(email);
  let portalCredentialVerified = false;

  if (needsPortalAuth) {
    if (!authRecord || !authRecord.is_active) {
      return {
        success: false,
        error: !authRecord
          ? 'Portal access not provisioned. Ask OD or MD to generate an OTP.'
          : 'Portal access has been revoked. Contact OD or MD.',
      };
    }

    if (authRecord.needs_pin_setup) {
      if (!isHeadOfficeOtpCode(password)) {
        return { success: false, error: 'Use the 6-digit OTP from OD or MD.' };
      }
      if (!authRecord.current_otp || password !== authRecord.current_otp) {
        return { success: false, error: 'Invalid OTP.' };
      }
      if (!isHeadOfficeOtpValid(authRecord)) {
        return {
          success: false,
          error: 'OTP expired. Ask OD or MD for a new one.',
        };
      }
      portalCredentialVerified = true;
    } else {
      const passwordCheck = validateHeadOfficePortalPassword(password);
      if (!passwordCheck.ok) {
        return { success: false, error: passwordCheck.error };
      }
      if (!authRecord.pin_hash || !verifyPortalPin(password, authRecord.pin_hash)) {
        return { success: false, error: 'Invalid credentials.' };
      }
      portalCredentialVerified = true;
    }
  }

  const supabase = await createSupabaseServerClient();
  let { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error && portalCredentialVerified) {
    const sync = await syncHeadOfficeSupabaseAuthPassword(email, password, {
      employeeId: profile.employeeId ?? authRecord?.employee_id ?? undefined,
      fullName: profile.full_name,
    });
    if (sync.ok) {
      ({ error } = await supabase.auth.signInWithPassword({ email, password }));
    }
  }

  if (error) {
    return { success: false, error: 'Invalid credentials.' };
  }

  const landing = authenticatedLandingPath(profile.role, profile);
  const employeeId = profile.employeeId ?? authRecord?.employee_id ?? null;

  if (employeeId && !geofenceExempt) {
    await setHeadOfficeGeofenceSessionCookies(employeeId, email);
  }

  if (needsPortalAuth && authRecord?.needs_pin_setup && employeeId) {
    await clearPortal2faSessionCookiesStore();
    await setOtpSetupSessionCookies(employeeId, email);
    redirect('/login/set-pin');
  }

  if (needsPortalAuth && employeeId) {
    await clearPortal2faSessionCookiesStore();
    await setPortalPinSessionCookies(employeeId, email);
    if (!authRecord?.two_factor_enabled) {
      redirect('/login/setup-2fa');
    }
    redirect('/login/verify-2fa');
  }

  redirect(nextPath !== '/' ? nextPath : landing);
}
