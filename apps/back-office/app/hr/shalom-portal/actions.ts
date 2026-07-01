'use server';

import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';

import { createSupabaseServerClient } from '../../../../../packages/supabase/server';
import { resolveCompanyIdForSession } from '../../../lib/company-context-server';
import { auditStaffAction } from '../../../lib/staff-audit';
import {
  assertHrPortalEditor,
  fetchBackOfficeUserProfile,
} from '../../../lib/hr-portal-access-server';
import {
  findShalomEmployeeByEpf,
  isShalomEmployeeActive,
  loadAssignedShalomCaretakerEpfs,
  normalizeShalomEpfNo,
} from '../../../lib/shalom-front-auth';
import { provisionShalomPortalOtp, revokeShalomPortalOtpCredentials } from '../../../lib/shalom-front-auth-server';
import { SHALOM_PORTAL_OTP_LIFETIME_MS } from '../../../lib/shalom-front-auth-shared';

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

function generateOTP(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

const PROVISION_FLASH_COOKIE = 'shalom_portal_provision_flash';

async function requireHrEditor() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Not signed in.' as const };

  const profile = await fetchBackOfficeUserProfile(supabase, user);
  try {
    assertHrPortalEditor(profile.role);
  } catch (err) {
    return {
      error:
        err instanceof Error ? err.message : 'Only HR portal editors can manage Shalom access.',
    };
  }

  return { supabase, profile };
}

export async function clearProvisionFlashCookie() {
  const jar = await cookies();
  jar.set(PROVISION_FLASH_COOKIE, '', { maxAge: 0, path: '/' });
}

export async function provisionShalomPortalAccess(epfInput: string) {
  const gate = await requireHrEditor();
  if ('error' in gate) return { error: gate.error };

  const epf = normalizeShalomEpfNo(epfInput);
  if (!epf) return { error: 'EPF number required.' };

  const admin = getAdminClient();
  const supabase = gate.supabase;
  const companyId = await resolveCompanyIdForSession(supabase);
  if (!companyId) return { error: 'No company context.' };

  const assignedEpfs = await loadAssignedShalomCaretakerEpfs(admin, companyId);
  if (!assignedEpfs.has(epf)) {
    return {
      error: `${epf} is not assigned to a Shalom property. Ask MD to assign on the portfolio calendar first.`,
    };
  }

  const employee = await findShalomEmployeeByEpf(admin, epf, companyId);

  if (!employee) return { error: `Employee with EPF ${epf} not found.` };
  if (!isShalomEmployeeActive(employee)) return { error: `${epf} is not active.` };

  const otp = generateOTP();
  const provision = await provisionShalomPortalOtp(admin, employee, otp);
  if (!provision.ok) return { error: provision.error ?? 'Provisioning failed.' };

  await auditStaffAction({
    supabase,
    portal: 'hr',
    action: 'Provision Shalom Front Portal Access',
    targetEntity: `${employee.full_name ?? epf} (${epf})`,
  });

  revalidatePath('/hr/shalom-portal');

  const otpExpiresAt = new Date(Date.now() + SHALOM_PORTAL_OTP_LIFETIME_MS).toISOString();

  return {
    success: true,
    otp,
    epf,
    staffName: employee.full_name ?? epf,
    otpExpiresAt,
  };
}

export async function getActiveShalomStaff() {
  const gate = await requireHrEditor();
  if ('error' in gate) return [];

  const admin = getAdminClient();
  const supabase = gate.supabase;
  const companyId = await resolveCompanyIdForSession(supabase);
  if (!companyId) return [];

  const assignedEpfs = await loadAssignedShalomCaretakerEpfs(admin, companyId);
  if (assignedEpfs.size === 0) return [];

  const staff: Array<{ epf_number: string; full_name: string; site: string }> = [];

  for (const epf of assignedEpfs) {
    const employee = await findShalomEmployeeByEpf(admin, epf, companyId);
    if (!employee || !isShalomEmployeeActive(employee)) {
      staff.push({ epf_number: epf, full_name: epf, site: '—' });
      continue;
    }
    staff.push({
      epf_number: epf,
      full_name: String(employee.full_name ?? epf),
      site: String(employee.site ?? '—'),
    });
  }

  return staff.sort((a, b) =>
    a.full_name.localeCompare(b.full_name, undefined, { sensitivity: 'base' }),
  );
}

export async function deactivateShalomPortalAccess(epfInput: string) {
  const gate = await requireHrEditor();
  if ('error' in gate) return { error: gate.error };

  const epf = normalizeShalomEpfNo(epfInput);
  const admin = getAdminClient();

  const { error } = await admin
    .from('shalom_portal_auth')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('epf_number', epf);

  if (error) return { error: error.message };

  await auditStaffAction({
    supabase: gate.supabase,
    portal: 'hr',
    action: 'Deactivate Shalom Front Portal Access',
    targetEntity: epf,
  });

  revalidatePath('/hr/shalom-portal');
  return { success: true };
}
