'use server';

import { revalidatePath } from 'next/cache';

import {
  normalizeWorkEmail,
  provisionHeadOfficePortalOtp,
  resetHeadOfficePortalAccess,
  adminResetHeadOfficeTotp,
  HO_PORTAL_OTP_LIFETIME_MS,
} from '../../../lib/head-office-portal-auth';
import { resolveHeadOfficeProvisionerLocationLabel } from '../../../lib/head-office-geofence';
import { createSupabaseServerClient } from '../../../../../packages/supabase/server';
import { auditStaffAction } from '../../../lib/staff-audit';
import { isExecutiveRank } from '../../../lib/portal-role-utils';
import { fetchBackOfficeUserProfile } from '../../../lib/hr-portal-access-server';
import { getMdSettingsDb, resolveExecutiveCompanyId } from './lib/executive-md-settings-db';

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

  return { supabase, profile, user };
}

async function fetchHeadOfficeEmployee(employeeId: string) {
  const companyId = await resolveExecutiveCompanyId();
  const db = getMdSettingsDb();
  const { data, error } = await db
    .from('employees')
    .select('id, full_name, email, group, status')
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
    },
  };
}

export async function provisionHeadOfficePortalOtpAction(
  employeeId: string,
  actorLat?: number | null,
  actorLng?: number | null,
) {
  const actor = await assertExecutiveActor();
  if ('error' in actor) return { error: actor.error };

  const employeeResult = await fetchHeadOfficeEmployee(employeeId);
  if ('error' in employeeResult) return { error: employeeResult.error };

  const companyId = await resolveExecutiveCompanyId();
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

  const { employee } = employeeResult;
  const provision = await provisionHeadOfficePortalOtp(
    employee.id,
    normalizeWorkEmail(employee.email),
    {
      fullName: employee.fullName,
      audit: {
        provisionedByEmployeeId: actor.profile.employeeId ?? null,
        provisionedByName: actorName,
        provisionedLat: actorLat ?? null,
        provisionedLng: actorLng ?? null,
        provisionedLocationLabel: locationLabel,
      },
    },
  );
  if (!provision.ok || !provision.otp) {
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
    },
  });

  revalidatePath('/executive/settings');

  return {
    success: true,
    otp: provision.otp,
    email: employee.email,
    staffName: employee.fullName,
    expiresAt: Date.now() + HO_PORTAL_OTP_LIFETIME_MS,
    provisionedBy: actorName,
    provisionedWhere: locationLabel,
  };
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
