'use server';

import { revalidatePath } from 'next/cache';

import { assertExecutivePortalSecurityGate } from '../../../lib/executive-portal-server-gate';
import { resolveExecutiveCompanyId } from './lib/executive-md-settings-db';
import { fetchBackOfficeUserProfile } from '../../../lib/hr-portal-access-server';
import { getHeadOfficePortalAuthByEmail } from '../../../lib/head-office-portal-auth';
import type { HeadOfficeWorkEmailOtpDestination } from '../../../lib/head-office-portal-work-email-change';
import {
  confirmHeadOfficeWorkEmailChange,
  requestHeadOfficeWorkEmailChangeOtp,
} from '../../../lib/head-office-portal-work-email-change';
import { isExecutiveRank, normalizePortalRole } from '../../../lib/portal-role-utils';
import { createSupabaseServerClient } from '../../../../../packages/supabase/server';
import { revalidateMdSettingsConsumers } from './lib/revalidate-md-settings-consumers';

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

async function assertExecutiveWorkEmailActor() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const user = session?.user;
  if (!user?.email) return { error: 'Not signed in.' as const };

  const profile = await fetchBackOfficeUserProfile(supabase, user);
  if (!isExecutiveRank(profile.role)) {
    return { error: 'Work email changes are limited to MD and OD accounts.' as const };
  }
  if (!profile.employeeId) {
    return { error: 'No employee record linked to this account.' as const };
  }

  const portalGate = await assertExecutivePortalSecurityGate();
  if (!portalGate.ok) return { error: portalGate.error };

  const authRecord = await getHeadOfficePortalAuthByEmail(user.email);
  if (!authRecord || !authRecord.is_active) {
    return { error: 'Head Office portal access is not active for this account.' as const };
  }

  const companyId = await resolveExecutiveCompanyId(supabase);
  const currentSessionId = session?.access_token
    ? decodeAccessTokenSessionId(session.access_token)
    : null;

  return {
    profile,
    user,
    authRecord,
    companyId,
    currentSessionId,
    role: normalizePortalRole(profile.role) ?? 'MD',
  };
}

export async function loadExecutiveWorkEmailProfileAction() {
  const actor = await assertExecutiveWorkEmailActor();
  if ('error' in actor) return { error: actor.error };

  return {
    workEmail: actor.authRecord.work_email,
    recoveryEmail: actor.authRecord.recovery_email,
    twoFactorEnabled: actor.authRecord.two_factor_enabled,
    role: actor.role,
  };
}

export async function requestExecutiveWorkEmailChangeAction(input: {
  newWorkEmail: string;
  sendOtpTo: HeadOfficeWorkEmailOtpDestination;
  totpCode: string;
}) {
  const actor = await assertExecutiveWorkEmailActor();
  if ('error' in actor) return { error: actor.error };

  const result = await requestHeadOfficeWorkEmailChangeOtp({
    employeeId: actor.profile.employeeId!,
    companyId: actor.companyId,
    currentWorkEmail: actor.authRecord.work_email,
    recoveryEmail: actor.authRecord.recovery_email,
    staffName: actor.profile.full_name ?? actor.role,
    newWorkEmail: input.newWorkEmail,
    sendOtpTo: input.sendOtpTo,
    totpCode: input.totpCode,
  });

  if (!result.ok) return { error: result.error };

  return {
    success: true as const,
    otpSentTo: result.otpSentTo,
  };
}

export async function confirmExecutiveWorkEmailChangeAction(input: {
  newWorkEmail: string;
  verificationCode: string;
}) {
  const actor = await assertExecutiveWorkEmailActor();
  if ('error' in actor) return { error: actor.error };

  const result = await confirmHeadOfficeWorkEmailChange({
    employeeId: actor.profile.employeeId!,
    companyId: actor.companyId,
    currentWorkEmail: actor.authRecord.work_email,
    recoveryEmail: actor.authRecord.recovery_email,
    newWorkEmail: input.newWorkEmail,
    verificationCode: input.verificationCode,
    currentSessionId: actor.currentSessionId,
  });

  if (!result.ok) return { error: result.error };

  revalidatePath('/executive/access');
  revalidateMdSettingsConsumers();

  return { success: true as const };
}
