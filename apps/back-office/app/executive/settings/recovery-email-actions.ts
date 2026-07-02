'use server';

import { revalidatePath } from 'next/cache';

import { assertExecutivePortalSecurityGate } from '../../../lib/executive-portal-server-gate';
import { fetchBackOfficeUserProfile } from '../../../lib/hr-portal-access-server';
import {
  confirmExecutiveRecoveryEmailChange,
  getExecutiveRecoveryEmailProfile,
  requestExecutiveRecoveryEmailChange,
} from '../../../lib/head-office-portal-recovery-email-change';
import { getHeadOfficePortalAuthByEmail } from '../../../lib/head-office-portal-auth';
import { isExecutiveRank, normalizePortalRole } from '../../../lib/portal-role-utils';
import { createSupabaseServerClient } from '../../../../../packages/supabase/server';
import { revalidateMdSettingsConsumers } from './lib/revalidate-md-settings-consumers';

async function assertExecutiveRecoveryEmailActor() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return { error: 'Not signed in.' as const };

  const profile = await fetchBackOfficeUserProfile(supabase, user);
  if (!isExecutiveRank(profile.role)) {
    return { error: 'Recovery email changes are limited to MD and OD accounts.' as const };
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

  return {
    profile,
    user,
    authRecord,
    role: normalizePortalRole(profile.role) ?? 'MD',
  };
}

export async function loadExecutiveRecoveryEmailProfileAction() {
  const actor = await assertExecutiveRecoveryEmailActor();
  if ('error' in actor) return { error: actor.error };

  const profile = await getExecutiveRecoveryEmailProfile(actor.profile.employeeId!);
  if (!profile.ok) return { error: profile.error };

  return {
    workEmail: profile.workEmail,
    recoveryEmail: profile.recoveryEmail,
    recoveryEmailVerifiedAt: profile.recoveryEmailVerifiedAt,
    twoFactorEnabled: profile.twoFactorEnabled,
    role: actor.role,
  };
}

export async function requestExecutiveRecoveryEmailChangeAction(input: {
  newRecoveryEmail: string;
  totpCode: string;
}) {
  const actor = await assertExecutiveRecoveryEmailActor();
  if ('error' in actor) return { error: actor.error };

  const result = await requestExecutiveRecoveryEmailChange({
    employeeId: actor.profile.employeeId!,
    workEmail: actor.authRecord.work_email,
    staffName: actor.profile.full_name ?? actor.role,
    newRecoveryEmail: input.newRecoveryEmail,
    totpCode: input.totpCode,
  });

  if (!result.ok) return { error: result.error };

  return {
    success: true as const,
  };
}

export async function confirmExecutiveRecoveryEmailChangeAction(input: {
  newRecoveryEmail: string;
  verificationCode: string;
}) {
  const actor = await assertExecutiveRecoveryEmailActor();
  if ('error' in actor) return { error: actor.error };

  const result = await confirmExecutiveRecoveryEmailChange({
    employeeId: actor.profile.employeeId!,
    workEmail: actor.authRecord.work_email,
    newRecoveryEmail: input.newRecoveryEmail,
    verificationCode: input.verificationCode,
  });

  if (!result.ok) return { error: result.error };

  revalidatePath('/executive/access');
  revalidateMdSettingsConsumers();

  return { success: true as const };
}
