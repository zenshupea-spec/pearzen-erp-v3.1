'use server';

import { redirect } from 'next/navigation';

import {
  canRequestHeadOffice2faRecovery,
  resetHeadOfficeTwoFactor,
} from '../../../lib/head-office-portal-lockout';
import { getAuthenticatedPortalSession } from '../../../lib/head-office-portal-session';

export async function requestHeadOffice2faRecoveryAction() {
  const session = await getAuthenticatedPortalSession();
  if ('error' in session) return { error: session.error };

  const employeeId = session.profile.employeeId;
  if (!employeeId) return { error: 'Employee record not found.' };

  const cooldown = await canRequestHeadOffice2faRecovery(employeeId);
  if (!cooldown.ok) {
    return { error: cooldown.error };
  }

  const reset = await resetHeadOfficeTwoFactor(employeeId);
  if (!reset.ok) return { error: reset.error ?? 'Could not reset 2FA.' };

  redirect('/login/setup-2fa');
}
