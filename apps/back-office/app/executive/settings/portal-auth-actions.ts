'use server';

import { revalidatePath } from 'next/cache';

import {
  otpLifetimeMsForRank,
  canExecutiveResetTargetTwoFactor,
} from '../../../lib/executive-portal-auth-policy';
import {
  markHeadOfficePortalPasswordRotationRequired,
  normalizeWorkEmail,
  provisionHeadOfficePortalOtp,
  resetHeadOfficePortalAccess,
  adminResetHeadOfficeTotp,
  getHeadOfficePortalAuthByEmployeeId,
} from '../../../lib/head-office-portal-auth';
import { resolveHeadOfficeProvisionerLocationLabel } from '../../../lib/head-office-geofence';
import { createSupabaseServerClient } from '../../../../../packages/supabase/server';
import { auditStaffAction } from '../../../lib/staff-audit';
import { isExecutiveRank } from '../../../lib/portal-role-utils';
import { requiresExecutiveRecoveryEmail } from '../../../lib/head-office-portal-recovery-email';
import {
  canOdUnlockTargetRank,
  unlockPortalUsername,
} from '../../../lib/head-office-portal-lockout';
import { normalizePortalRole } from '../../../lib/portal-role-utils';
import { fetchBackOfficeUserProfile } from '../../../lib/hr-portal-access-server';
import { getMdSettingsDb, resolveExecutiveCompanyId } from './lib/executive-md-settings-db';
import { assertExecutivePortalSecurityGate } from '../../../lib/executive-portal-server-gate';

async function assertExecutiveActor() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Not signed in.' };

  const profile = await fetchBackOfficeUserProfile(supabase, user);
  if (!isExecutiveRank(profile.role)) {
    return { error: 'Only MD or OD can manage portal access.' };
  }

  const portalGate = await assertExecutivePortalSecurityGate();
  if (!portalGate.ok) return { error: portalGate.error };

  return { supabase, profile, user };
}

async function fetchHeadOfficeEmployee(employeeId: string) {
  const companyId = await resolveExecutiveCompanyId();
  const db = getMdSettingsDb();
  const { data, error } = await db
    .from('employees')
    .select('id, full_name, email, group, status, rank')
    .eq('company_id', companyId)
    .eq('id', employeeId)
    .maybeSingle();

  if (error || !data) return { error: 'Employee not found.' };
  if (String(data.group ?? '').trim().toUpperCase() !== 'HEAD_OFFICE') {
    return { error: 'Portal OTP applies to Head Office staff only.' };
  }
  if (String(data.status ?? '').trim().toUpperCase() !== 'ACTIVE') {
    return { error: 'Employee is not active.' };
  }

  const email = typeof data.email === 'string' ? data.email.trim() : '';
  if (!email) {
    return { error: 'Set a work email on the MNR record before provisioning access.' };
  }

  return {
    employee: {
      id: String(data.id),
      fullName: typeof data.full_name === 'string' ? data.full_name : 'Staff',
      email,
      rank: normalizePortalRole(data.rank as string | undefined),
    },
    companyId,
  };
}

export async function provisionHeadOfficePortalOtpAction(
  employeeId: string,
  actorLat?: number | null,
  actorLng?: number | null,
  recoveryEmail?: string | null,
) {
  const actor = await assertExecutiveActor();
  if ('error' in actor) return { error: actor.error };

  const employeeResult = await fetchHeadOfficeEmployee(employeeId);
  if ('error' in employeeResult) return { error: employeeResult.error };

  const { employee, companyId } = employeeResult;

  if (requiresExecutiveRecoveryEmail(employee.rank) && !recoveryEmail?.trim()) {
    const existing = await getHeadOfficePortalAuthByEmployeeId(employee.id);
    if (!existing?.recovery_email?.trim()) {
      return {
        error:
          'Recovery email is required for MD and OD before generating an OTP. Enter a personal inbox that is not the work email.',
      };
    }
  }

  const actorName =
    actor.profile.full_name?.trim() ||
    actor.user.email?.split('@')[0] ||
    'Executive';
  const locationLabel = await resolveHeadOfficeProvisionerLocationLabel(
    companyId,
    actorLat ?? null,
    actorLng ?? null,
    true,
  );

  const provision = await provisionHeadOfficePortalOtp(
    employee.id,
    normalizeWorkEmail(employee.email),
    {
      fullName: employee.fullName,
      recoveryEmail: recoveryEmail?.trim() || null,
      audit: {
        provisionedByEmployeeId: actor.profile.employeeId ?? null,
        provisionedByName: actorName,
        provisionedByRank: actor.profile.role,
        provisionedLat: actorLat ?? null,
        provisionedLng: actorLng ?? null,
        provisionedLocationLabel: locationLabel,
        subjectName: employee.fullName,
        subjectRank: employee.rank,
        companyId,
      },
    },
  );
  if (!provision.ok) {
    return { error: provision.error ?? 'Failed to generate OTP.' };
  }

  await auditStaffAction({
    supabase: actor.supabase,
    portal: 'hq',
    action: 'Provision Head Office Portal OTP',
    targetEntity: `${employee.fullName} (${employee.email})`,
    details: {
      provisionedBy: actorName,
      provisionedAt: locationLabel,
      emailed: Boolean(provision.emailed),
      delivery: provision.emailed
        ? 'email'
        : provision.displayOtp
          ? 'hr_screen'
          : 'email_failed',
      ...(provision.emailError ? { emailError: provision.emailError } : {}),
    },
  });

  revalidatePath('/executive/settings');

  const otpLifetimeMs = otpLifetimeMsForRank(employee.rank);

  return {
    success: true,
    emailed: Boolean(provision.emailed),
    emailWarning: provision.emailError,
    loginUsername: provision.loginUsername,
    email: employee.email,
    staffName: employee.fullName,
    expiresAt: Date.now() + otpLifetimeMs,
    otpLifetimeMs,
    provisionedBy: actorName,
    provisionedWhere: locationLabel,
    otp: provision.displayOtp,
  };
}

export async function unlockHeadOfficePortalUsernameAction(employeeId: string) {
  const actor = await assertExecutiveActor();
  if ('error' in actor) return { error: actor.error };

  const employeeResult = await fetchHeadOfficeEmployee(employeeId);
  if ('error' in employeeResult) return { error: employeeResult.error };

  const { employee } = employeeResult;
  const actorRank = normalizePortalRole(actor.profile.role);

  if (actorRank === 'MD') {
    return { error: 'MD cannot unlock portal usernames. Ask OD.' };
  }

  if (!canOdUnlockTargetRank(employee.rank)) {
    return { error: 'OD can only unlock MD and HR portal usernames here.' };
  }

  const unlock = await unlockPortalUsername(employee.id);
  if (!unlock.ok) return { error: unlock.error ?? 'Failed to unlock user.' };

  await auditStaffAction({
    supabase: actor.supabase,
    portal: 'hq',
    action: 'Unlock Head Office Portal Username',
    targetEntity: `${employee.fullName} (${employee.email})`,
  });

  revalidatePath('/executive/settings');
  revalidatePath('/executive/access');

  return { success: true };
}

export async function resetHeadOfficePortalAccessAction(employeeId: string) {
  const actor = await assertExecutiveActor();
  if ('error' in actor) return { error: actor.error };

  const employeeResult = await fetchHeadOfficeEmployee(employeeId);
  if ('error' in employeeResult) return { error: employeeResult.error };

  const { employee } = employeeResult;
  const reset = await resetHeadOfficePortalAccess(employee.id);
  if (!reset.ok) return { error: reset.error ?? 'Failed to reset access.' };

  await auditStaffAction({
    supabase: actor.supabase,
    portal: 'hq',
    action: 'Reset Head Office Portal Access',
    targetEntity: `${employee.fullName} (${employee.email})`,
  });

  revalidatePath('/executive/settings');

  return { success: true };
}

export async function resetHeadOfficeTwoFactorAction(employeeId: string) {
  const actor = await assertExecutiveActor();
  if ('error' in actor) return { error: actor.error };

  const employeeResult = await fetchHeadOfficeEmployee(employeeId);
  if ('error' in employeeResult) return { error: employeeResult.error };

  const { employee } = employeeResult;
  const actorRank = normalizePortalRole(actor.profile.role);

  if (!canExecutiveResetTargetTwoFactor(actorRank, employee.rank)) {
    return { error: 'OD cannot reset MD two-factor authentication. Ask MD or Pearzen SaaS Forge.' };
  }

  const reset = await adminResetHeadOfficeTotp(employee.id);
  if (!reset.ok) return { error: reset.error ?? 'Failed to reset 2FA.' };

  await auditStaffAction({
    supabase: actor.supabase,
    portal: 'hq',
    action: 'Reset Head Office Portal 2FA',
    targetEntity: `${employee.fullName} (${employee.email})`,
  });

  revalidatePath('/executive/settings');
  revalidatePath('/account/security');

  return { success: true };
}

export async function forceHeadOfficePasswordRotationAction(employeeId: string) {
  const actor = await assertExecutiveActor();
  if ('error' in actor) return { error: actor.error };

  const employeeResult = await fetchHeadOfficeEmployee(employeeId);
  if ('error' in employeeResult) return { error: employeeResult.error };

  const { employee } = employeeResult;
  const rotation = await markHeadOfficePortalPasswordRotationRequired(employee.id);
  if (!rotation.ok) {
    return { error: rotation.error ?? 'Could not require password change.' };
  }

  await auditStaffAction({
    supabase: actor.supabase,
    portal: 'hq',
    action: 'Require Head Office Portal Password Change',
    targetEntity: `${employee.fullName} (${employee.email})`,
    details: {
      policy: 'Clears password history and sets must_change_password for next sign-in.',
    },
  });

  revalidatePath('/executive/settings');
  revalidatePath('/executive/access');

  return { success: true as const };
}
