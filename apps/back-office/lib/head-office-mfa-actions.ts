'use server';

import { revalidatePath } from 'next/cache';

import {
  beginHeadOfficeTotpSetup,
  confirmHeadOfficeTotpSetup,
  disableHeadOfficeTotp,
  getHeadOfficePortalAuthByEmail,
  requiresHeadOfficePortalPin,
} from './head-office-portal-auth';
import { headOfficePortalDisplayEmail } from './head-office-portal-username';
import { fetchBackOfficeUserProfile } from './hr-portal-access-server';
import { normalizePortalRole } from './portal-role-utils';
import { createSupabaseServerClient } from '../../../packages/supabase/server';

export type HeadOfficeMfaEnrollmentState = {
  role: string;
  label: string;
  email: string;
  twoFactorEnabled: boolean;
  secret: string | null;
  uri: string | null;
};

const RANK_LABELS: Record<string, string> = {
  MD: 'Managing Director (MD)',
  OD: 'Operations Developer (OD)',
  FM: 'Finance Manager (FM)',
  HR: 'HR Operations (HR)',
  EA: 'Executive Assistant (EA)',
  OM: 'Operations Manager (OM)',
  TM: 'Territory Manager (TM)',
};

function rankLabel(role: string | null, fullName: string | null | undefined): string {
  if (role && RANK_LABELS[role]) return RANK_LABELS[role];
  if (role) return `${role} · Head Office`;
  return fullName ? `${fullName} · Head Office` : 'Head Office Staff';
}

async function assertHeadOfficeMfaActor() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return { error: 'Not signed in.' as const };

  const profile = await fetchBackOfficeUserProfile(supabase, user);
  if (!requiresHeadOfficePortalPin(profile, user.email)) {
    return { error: 'Portal MFA applies to Head Office work-email accounts only.' as const };
  }
  if (!profile.employeeId) {
    return { error: 'No employee record linked to this account.' as const };
  }

  const authRecord = await getHeadOfficePortalAuthByEmail(user.email);
  if (!authRecord || !authRecord.is_active) {
    return { error: 'Head Office portal access is not active for this account.' as const };
  }

  const role = normalizePortalRole(profile.role) ?? 'HO';

  return {
    supabase,
    profile,
    user,
    role,
    label: rankLabel(role, profile.full_name),
    authRecord,
  };
}

export async function loadHeadOfficeMfaEnrollmentAction(): Promise<
  { error: string } | HeadOfficeMfaEnrollmentState
> {
  const actor = await assertHeadOfficeMfaActor();
  if ('error' in actor) return { error: actor.error };

  const { role, label, authRecord } = actor;
  const displayEmail = headOfficePortalDisplayEmail(authRecord.work_email);

  if (authRecord.two_factor_enabled) {
    return {
      role,
      label,
      email: displayEmail,
      twoFactorEnabled: true,
      secret: null,
      uri: null,
    };
  }

  const setup = await beginHeadOfficeTotpSetup(
    actor.profile.employeeId!,
    displayEmail,
  );
  if (!setup.ok) {
    return { error: setup.error ?? 'Could not start MFA setup.' };
  }

  return {
    role,
    label,
    email: displayEmail,
    twoFactorEnabled: false,
    secret: setup.secret ?? null,
    uri: setup.uri ?? null,
  };
}

export async function confirmHeadOfficeMfaEnrollmentAction(code: string) {
  const actor = await assertHeadOfficeMfaActor();
  if ('error' in actor) return { error: actor.error };

  const { profile, user, authRecord } = actor;
  if (authRecord.two_factor_enabled) {
    return { success: true, alreadyEnabled: true };
  }

  const result = await confirmHeadOfficeTotpSetup(
    profile.employeeId!,
    user.email!,
    code,
  );
  if (!result.ok) {
    return { error: result.error ?? 'Invalid authenticator code.' };
  }

  revalidatePath('/executive/settings');
  revalidatePath('/account/security');
  return { success: true, backupCodes: result.backupCodes ?? [] };
}

export async function removeHeadOfficeMfaAction(code: string) {
  const actor = await assertHeadOfficeMfaActor();
  if ('error' in actor) return { error: actor.error };

  const result = await disableHeadOfficeTotp(
    actor.profile.employeeId!,
    actor.user.email!,
    code,
  );
  if (!result.ok) {
    return { error: result.error ?? 'Could not remove MFA.' };
  }

  revalidatePath('/executive/settings');
  revalidatePath('/account/security');
  return { success: true };
}

export async function replaceHeadOfficeMfaAction(currentCode: string) {
  const actor = await assertHeadOfficeMfaActor();
  if ('error' in actor) return { error: actor.error };

  const disable = await disableHeadOfficeTotp(
    actor.profile.employeeId!,
    actor.user.email!,
    currentCode,
  );
  if (!disable.ok) {
    return { error: disable.error ?? 'Invalid authenticator code.' };
  }

  const setup = await beginHeadOfficeTotpSetup(
    actor.profile.employeeId!,
    headOfficePortalDisplayEmail(actor.authRecord.work_email),
  );
  if (!setup.ok) {
    return { error: setup.error ?? 'Could not start new MFA setup.' };
  }

  revalidatePath('/executive/settings');
  revalidatePath('/account/security');

  return {
    success: true,
    secret: setup.secret ?? null,
    uri: setup.uri ?? null,
  };
}
