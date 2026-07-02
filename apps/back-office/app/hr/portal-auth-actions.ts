'use server';

import { revalidatePath } from 'next/cache';

import { createSupabaseServiceClient } from '../../../../packages/supabase/service';
import { otpLifetimeMsForRank } from '../../lib/executive-portal-auth-policy';
import {
  markHeadOfficePortalPasswordRotationRequired,
  normalizeWorkEmail,
  provisionHeadOfficePortalOtp,
} from '../../lib/head-office-portal-auth';
import {
  canHrProvisionTargetRank,
  canHrUnlockTargetRank,
  hrProvisionTargetRankError,
  unlockPortalUsername,
} from '../../lib/head-office-portal-lockout';
import { normalizePortalRole } from '../../lib/portal-role-utils';
import { createSupabaseServerClient } from '../../../../packages/supabase/server';
import { auditStaffAction } from '../../lib/staff-audit';
import {
  assertHrPortalEditor,
  fetchBackOfficeUserProfile,
} from '../../lib/hr-portal-access-server';
import { resolveCompanyIdForSession } from '../../lib/company-context-server';

async function fetchHeadOfficeEmployeeForHr(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  employeeId: string,
) {
  const companyId = await resolveCompanyIdForSession(supabase);
  const service = createSupabaseServiceClient();
  let query = service
    .from('employees')
    .select('id, full_name, email, group, status, rank')
    .eq('id', employeeId);
  if (companyId) query = query.eq('company_id', companyId);

  const { data, error } = await query.maybeSingle();
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

export async function hrProvisionHeadOfficePortalOtpAction(employeeId: string) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Not signed in.' };

  const profile = await fetchBackOfficeUserProfile(supabase, user);
  assertHrPortalEditor(profile.role);

  const employeeResult = await fetchHeadOfficeEmployeeForHr(supabase, employeeId);
  if ('error' in employeeResult) return { error: employeeResult.error };

  const { employee, companyId } = employeeResult;
  if (!canHrProvisionTargetRank(profile.role, employee.rank)) {
    return {
      error: hrProvisionTargetRankError(profile.role, employee.rank),
    };
  }

  const actorName =
    profile.full_name?.trim() || user.email?.split('@')[0] || 'HR';

  const provision = await provisionHeadOfficePortalOtp(
    employee.id,
    normalizeWorkEmail(employee.email),
    {
      fullName: employee.fullName,
      audit: {
        provisionedByEmployeeId: profile.employeeId ?? null,
        provisionedByName: actorName,
        provisionedByRank: profile.role,
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
    supabase,
    portal: 'hr',
    action: 'Provision Head Office Portal OTP',
    targetEntity: `${employee.fullName} (EPF ${provision.loginUsername ?? '—'})`,
    details: {
      provisionedBy: actorName,
      emailed: Boolean(provision.emailed),
      delivery: provision.emailed
        ? 'email'
        : provision.displayOtp
          ? 'hr_screen'
          : 'email_failed',
    },
  });

  revalidatePath('/hr/mnr');
  revalidatePath('/hr/head-office-portal');
  revalidatePath('/executive/access');

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
    otp: provision.displayOtp,
  };
}

export async function hrUnlockHeadOfficePortalUsernameAction(employeeId: string) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Not signed in.' };

  const profile = await fetchBackOfficeUserProfile(supabase, user);
  if (normalizePortalRole(profile.role) !== 'HR') {
    return { error: 'Only HR can unlock portal usernames from the HR desk.' };
  }

  const employeeResult = await fetchHeadOfficeEmployeeForHr(supabase, employeeId);
  if ('error' in employeeResult) return { error: employeeResult.error };

  const { employee } = employeeResult;
  if (!canHrUnlockTargetRank(employee.rank)) {
    return { error: 'MD portal accounts must be unlocked by OD from Security & Access.' };
  }

  const unlock = await unlockPortalUsername(employee.id);
  if (!unlock.ok) return { error: unlock.error ?? 'Failed to unlock user.' };

  await auditStaffAction({
    supabase,
    portal: 'hr',
    action: 'Unlock Head Office Portal Username',
    targetEntity: employee.fullName,
  });

  revalidatePath('/hr/mnr');
  revalidatePath('/hr/head-office-portal');
  revalidatePath('/executive/access');

  return { success: true };
}

export async function hrGetPortalAuthStatusAction(employeeId: string) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Not signed in.' };

  const profile = await fetchBackOfficeUserProfile(supabase, user);
  if (normalizePortalRole(profile.role) !== 'HR') {
    return { error: 'HR only.' };
  }

  const { getHeadOfficePortalAuthByEmployeeId } = await import(
    '../../lib/head-office-portal-auth'
  );
  const auth = await getHeadOfficePortalAuthByEmployeeId(employeeId);
  if (!auth) {
    return {
      isProvisioned: false,
      isUsernameLocked: false,
      loginUsername: null as string | null,
    };
  }

  return {
    isProvisioned: true,
    isUsernameLocked: auth.is_username_locked,
    loginUsername: auth.login_username,
    isActive: auth.is_active,
    needsPinSetup: auth.needs_pin_setup,
  };
}

export async function hrForceHeadOfficePasswordRotationAction(employeeId: string) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Not signed in.' };

  const profile = await fetchBackOfficeUserProfile(supabase, user);
  assertHrPortalEditor(profile.role);

  const employeeResult = await fetchHeadOfficeEmployeeForHr(supabase, employeeId);
  if ('error' in employeeResult) return { error: employeeResult.error };

  const { employee } = employeeResult;
  if (!canHrProvisionTargetRank(profile.role, employee.rank)) {
    return {
      error: hrProvisionTargetRankError(profile.role, employee.rank),
    };
  }

  const rotation = await markHeadOfficePortalPasswordRotationRequired(employee.id);
  if (!rotation.ok) return { error: rotation.error ?? 'Could not require password change.' };

  await auditStaffAction({
    supabase,
    portal: 'hr',
    action: 'Require Head Office Portal Password Change',
    targetEntity: employee.fullName,
    details: {
      policy: 'Clears password history and sets must_change_password for next sign-in.',
    },
  });

  revalidatePath('/hr/mnr');
  revalidatePath('/hr/head-office-portal');

  return { success: true as const };
}
