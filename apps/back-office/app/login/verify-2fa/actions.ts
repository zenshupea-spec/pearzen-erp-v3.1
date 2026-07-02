'use server';

import { redirect } from 'next/navigation';

import {
  setPortalPinSessionCookies,
  verifyHeadOfficeTotpLogin,
  getHeadOfficePortalAuthByEmployeeId,
} from '../../../lib/head-office-portal-auth';
import { grantExecutiveVaultUnlockOnPortalLogin } from '../../../lib/executive-vault-session';
import { getAuthenticatedPortalSession } from '../../../lib/head-office-portal-session';
import {
  finalizePortalLoginNotifications,
  readPortalLoginRequestMetadata,
} from '../../../lib/head-office-portal-login-notification';
import { resolveEmployeeCompanyId } from '../../../lib/tenant-cookie-server';
import { staffPortalIdForRole } from '../../../lib/portal-isolation';

export async function verifyHeadOfficeTotpAction(code: string) {
  const session = await getAuthenticatedPortalSession();
  if ('error' in session) return { error: session.error };

  const result = await verifyHeadOfficeTotpLogin(
    session.profile.employeeId!,
    session.user.email,
    code,
    session.profile.role,
  );
  if (!result.ok) return { error: result.error ?? 'Invalid code.' };

  if (result.requires2faSetup) {
    redirect('/login/setup-2fa');
  }

  await setPortalPinSessionCookies(
    session.profile.employeeId!,
    session.user.email,
  );
  await grantExecutiveVaultUnlockOnPortalLogin(
    session.profile.employeeId!,
    session.user.email,
    session.profile.role,
  );

  const authRecord = await getHeadOfficePortalAuthByEmployeeId(session.profile.employeeId!);
  const requestMeta = await readPortalLoginRequestMetadata();
  await finalizePortalLoginNotifications({
    employeeId: session.profile.employeeId!,
    workEmail: authRecord?.work_email ?? session.user.email,
    recoveryEmail: authRecord?.recovery_email,
    portalAuthEmail: session.user.email,
    rank: session.profile.role,
    employeeName: session.profile.full_name,
    companyId: await resolveEmployeeCompanyId(session.profile.employeeId!),
    staffPortal: staffPortalIdForRole(session.profile.role, session.profile),
    ipAddress: requestMeta.ipAddress,
    deviceLabel: requestMeta.deviceLabel,
  });

  redirect(session.landing);
}
