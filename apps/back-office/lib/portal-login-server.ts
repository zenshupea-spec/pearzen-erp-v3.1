import { redirect } from 'next/navigation';

import { getCompanyLogoUrl } from '../../../packages/supabase/company-branding';
import { createSupabaseServerClient } from '../../../packages/supabase/server';
import { buildHeadOfficePortalResetPath } from './head-office-portal-reset-path';
import {
  getHeadOfficePortalAuthByEmail,
  requiresHeadOfficePortalPin,
  resolveHeadOfficePortalEntryPath,
} from './head-office-portal-auth';
import {
  authenticatedLandingPath,
  fetchBackOfficeUserProfile,
  type BackOfficeUserProfile,
} from './hr-portal-access-server';
import {
  canSignInAtStaffPortal,
  loginPathForStaffPortal,
  portalHomePath,
  staffPortalIdForRole,
  type StaffPortalId,
} from './portal-isolation';
import { recordPortalLoginEvent } from './portal-login-events';
import {
  buildDailySignoutRedirectPath,
  isSignInBeforeLatestColomboMidnight,
} from './portal-sl-midnight';
import { resolveTenantCompanyFromRequest } from './tenant-context-server';
import type { SupabaseClient, User } from '@supabase/supabase-js';

const SHARED_LOGIN_ERRORS: Record<string, string> = {
  no_portal_rank:
    'Signed in, but no portal rank is set on your employee record. Ask HR to set your work email and rank.',
  not_provisioned:
    'Portal access is not provisioned yet. Ask OD or MD to generate an OTP for you.',
  access_revoked: 'Portal access has been revoked. Contact OD or MD.',
  wrong_portal:
    'This account belongs to a different portal. Use the correct sign-in link for your role.',
  geofence_denied:
    'Access denied — you must be at Head Office (within the HQ geofence) to use this portal.',
  oauth_failed: 'Google sign-in failed. Please try again.',
  google_disabled:
    'Google sign-in is not available for MD or OD. Use your work email with OTP or portal password at the MD Portal.',
  google_od_only: 'Google sign-in on staff portals is for Operations Director (OD) only.',
  daily_signout: 'Daily security reset — sign in again (midnight Sri Lanka time).',
  session_rejected: 'Sign-in was rejected on your other device.',
  signed_in_elsewhere:
    'Your session ended because your account was opened on another device.',
  tenant_suspended:
    'This tenant account is suspended. Contact Pearzen support to restore ERP access.',
};

export function portalLoginErrorMessage(
  code: string | undefined,
  extra: Record<string, string> = {},
): string | null {
  if (!code) return null;
  return extra[code] ?? SHARED_LOGIN_ERRORS[code] ?? null;
}

export async function enforceColomboDailySignOutIfStale(
  supabase: SupabaseClient,
  user: Pick<User, 'email' | 'last_sign_in_at' | 'user_metadata'>,
  profile: BackOfficeUserProfile,
  audit?: { ipAddress?: string | null; detail?: string | null },
): Promise<{ redirectPath: string } | null> {
  if (!isSignInBeforeLatestColomboMidnight(user.last_sign_in_at)) return null;

  const employeeId =
    profile.employeeId ??
    (typeof user.user_metadata?.employee_id === 'string'
      ? user.user_metadata.employee_id
      : null);

  await recordPortalLoginEvent({
    employeeId,
    portalAuthEmail: user.email ?? null,
    eventType: 'daily_signout',
    success: true,
    ipAddress: audit?.ipAddress ?? null,
    detail: audit?.detail ?? null,
  });
  return {
    redirectPath: buildHeadOfficePortalResetPath(buildDailySignoutRedirectPath(profile)),
  };
}

export async function resolvePortalLoginSession(
  portal: StaffPortalId,
  oauthNext?: string,
): Promise<
  | { kind: 'redirect'; path: string }
  | {
      kind: 'render';
      logoUrl: string | null;
      companyName: string | null;
      authError: string | null;
      authErrorDetail: string | null;
      oauthNext: string;
    }
> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const home = oauthNext?.startsWith('/') ? oauthNext : portalHomePath(portal);

  if (user?.email) {
    const profile = await fetchBackOfficeUserProfile(supabase, user);

    const dailySignOut = await enforceColomboDailySignOutIfStale(
      supabase,
      user,
      profile,
    );
    if (dailySignOut) {
      return { kind: 'redirect', path: dailySignOut.redirectPath };
    }

    if (!canSignInAtStaffPortal(profile.role, portal, profile)) {
      const correctPortal = staffPortalIdForRole(profile.role, profile);
      if (correctPortal && correctPortal !== portal) {
        return {
          kind: 'redirect',
          path: buildHeadOfficePortalResetPath(
            `${loginPathForStaffPortal(correctPortal)}?error=wrong_portal&role=${encodeURIComponent(profile.role ?? '')}`,
          ),
        };
      }
      return {
        kind: 'redirect',
        path: buildHeadOfficePortalResetPath(loginPathForStaffPortal(portal)),
      };
    } else if (requiresHeadOfficePortalPin(profile, user.email)) {
      const authRecord = await getHeadOfficePortalAuthByEmail(user.email);
      if (!authRecord || !authRecord.is_active) {
        return {
          kind: 'redirect',
          path: buildHeadOfficePortalResetPath(loginPathForStaffPortal(portal)),
        };
      }

      const entryPath = await resolveHeadOfficePortalEntryPath(
        profile,
        user.email,
        user.last_sign_in_at,
      );
      if (entryPath !== loginPathForStaffPortal(portal)) {
        return { kind: 'redirect', path: entryPath };
      }
    } else {
      const landing = authenticatedLandingPath(profile.role, profile);
      if (landing !== loginPathForStaffPortal(portal)) {
        return { kind: 'redirect', path: landing };
      }
    }
  }

  const tenant = await resolveTenantCompanyFromRequest();
  const logoUrl = await getCompanyLogoUrl(tenant?.id);

  return {
    kind: 'render',
    logoUrl,
    companyName: tenant?.name ?? null,
    authError: null,
    authErrorDetail: null,
    oauthNext: home,
  };
}

export async function renderPortalLoginPage(
  portal: StaffPortalId,
  searchParams: Promise<{ error?: string; next?: string; role?: string }>,
  extraErrors: Record<string, string> = {},
) {
  const params = await searchParams;
  const authError = portalLoginErrorMessage(params.error, extraErrors);
  const authErrorDetail =
    params.error === 'wrong_portal' && params.role
      ? `Your rank: ${params.role}`
      : null;

  const session = await resolvePortalLoginSession(
    portal,
    params.next?.startsWith('/') ? params.next : undefined,
  );

  if (session.kind === 'redirect') {
    redirect(session.path);
  }

  return {
    ...session,
    authError: authError ?? session.authError,
    authErrorDetail,
  };
}

export function assertPortalProfile(
  profile: BackOfficeUserProfile,
  portal: StaffPortalId,
): void {
  if (!canSignInAtStaffPortal(profile.role, portal, profile)) {
    redirect(`${loginPathForStaffPortal(portal)}?error=wrong_portal&role=${profile.role ?? 'unknown'}`);
  }
}
