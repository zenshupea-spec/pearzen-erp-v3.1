'use server'

import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '../../../../../packages/supabase/server';
import { sectorManagerEpfKey } from '../../../../../packages/supabase/sm-epf';
import { isSectorManagerEmployee } from '../../../lib/hr-sectors';
import {
  hashSmPortalOtp,
  isSmPortalOtpActive,
} from '../../../../../packages/supabase/sm-portal-otp';
import { SM_PORTAL_OTP_LIFETIME_MS } from '../../../../../packages/supabase/portal-otp-lifetime';
import { clearPortalPasswordHistory } from '../../../../../packages/supabase/portal-password-rotation';
import { auditStaffAction } from '../../../lib/staff-audit';
import { resolveCompanyIdForSession } from '../../../lib/company-context-server';
import {
  assertHrPortalEditor,
  fetchBackOfficeUserProfile,
} from '../../../lib/hr-portal-access-server';
import { fetchActiveSectorManagersForCompany } from '../../../lib/sector-manager-roster';
import { markSmPortalPinRotationRequired } from '../../../../../packages/supabase/sm-portal-pin-rotation-admin';

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

function generateOTP(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

const PROVISION_FLASH_COOKIE = 'sm_portal_provision_flash';

const SM_EMPLOYEE_SELECT =
  'id, full_name, group, rank, status, company_id, emp_number, epf_no, epf_num';

async function findSectorManagerForProvision(
  admin: ReturnType<typeof getAdminClient>,
  epfInput: string,
) {
  const key = epfInput.trim();
  if (!key) return null;

  for (const column of ['emp_number', 'epf_no', 'epf_num'] as const) {
    const { data, error } = await admin
      .from('employees')
      .select(SM_EMPLOYEE_SELECT)
      .eq(column, key)
      .maybeSingle();

    if (error) {
      console.error('[SM Portal] employee lookup:', error.message);
      return null;
    }
    if (data) return data;
  }

  return null;
}

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
      error: err instanceof Error ? err.message : 'Only HR portal editors can manage SM access.',
    };
  }

  return { supabase, profile };
}

export async function clearProvisionFlashCookie() {
  const jar = await cookies();
  jar.set(PROVISION_FLASH_COOKIE, '', { maxAge: 0, path: '/' });
}

export async function provisionSMPortalAccess(epfNumber: string) {
  const gate = await requireHrEditor();
  if ('error' in gate) return { error: gate.error };

  const epf = epfNumber.toUpperCase().trim();
  if (!epf) return { error: 'EPF number required.' };

  const admin = getAdminClient();
  const employee = await findSectorManagerForProvision(admin, epf);

  if (!employee) return { error: `Employee ${epf} not found.` };
  if (!isSectorManagerEmployee(employee)) {
    return { error: `${epf} is not a Sector Manager.` };
  }
  if (employee.status !== 'ACTIVE') return { error: `${epf} is not active.` };
  if (!employee.company_id) return { error: `${epf} is missing company_id.` };

  const canonicalEpf = sectorManagerEpfKey(employee);
  if (!canonicalEpf) return { error: `${epf} has no EPF on file.` };

  const otp = generateOTP();
  const otpExpiresAt = new Date(Date.now() + SM_PORTAL_OTP_LIFETIME_MS).toISOString();
  const syntheticEmail = `${canonicalEpf.toLowerCase()}@pearzen.sm`;
  const authTenantMeta = {
    app_metadata: { company_id: employee.company_id as string },
    user_metadata: { employee_id: employee.id as string },
  };

  const { data: existingUser } = await admin.auth.admin.listUsers();
  const found = existingUser?.users?.find((u) => u.email === syntheticEmail);

  if (found) {
    const { error: updateErr } = await admin.auth.admin.updateUserById(found.id, {
      password: otp,
      email_confirm: true,
      ...authTenantMeta,
    });
    if (updateErr) return { error: `Auth update failed: ${updateErr.message}` };
  } else {
    const { error: createErr } = await admin.auth.admin.createUser({
      email: syntheticEmail,
      password: otp,
      email_confirm: true,
      ...authTenantMeta,
    });
    if (createErr) return { error: `Auth creation failed: ${createErr.message}` };
  }

  const { error: dbError } = await admin
    .from('sm_portal_auth')
    .upsert(
      {
        epf_number: canonicalEpf,
        current_otp: null,
        current_otp_hash: hashSmPortalOtp(otp, canonicalEpf),
        otp_expires_at: otpExpiresAt,
        needs_pin_setup: true,
        is_active: true,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'epf_number' },
    );

  if (dbError) {
    const msg = dbError.message ?? 'DB update failed.';
    if (msg.includes('current_otp_hash')) {
      return {
        error:
          'SM portal auth table is missing column current_otp_hash. Run: npm run db:apply-sm-portal-otp-hash',
      };
    }
    return { error: `DB update failed: ${msg}` };
  }

  const cleared = await clearPortalPasswordHistory(admin, employee.id as string, 'sm');
  if (!cleared.ok) {
    return { error: cleared.error ?? 'Could not clear PIN history.' };
  }

  await auditStaffAction({
    supabase: gate.supabase,
    portal: 'sm',
    action: 'Provision SM Portal Access',
    targetEntity: `${employee.full_name ?? canonicalEpf} (${canonicalEpf})`,
  });

  revalidatePath('/hr/sm-portal');
  revalidatePath('/hq/sm-proxy');

  return {
    success: true,
    otp,
    epf: canonicalEpf,
    smName: employee.full_name,
    otpExpiresAt,
  };
}

export async function getActiveSectorManagers() {
  const gate = await requireHrEditor();
  if ('error' in gate) return [];

  const companyId = await resolveCompanyIdForSession(gate.supabase);
  const admin = getAdminClient();

  const [{ data: authRecords }, managers] = await Promise.all([
    admin
      .from('sm_portal_auth')
      .select('epf_number, otp_expires_at, needs_pin_setup, current_otp_hash')
      .eq('is_active', true)
      .eq('needs_pin_setup', true)
      .not('current_otp_hash', 'is', null),
    fetchActiveSectorManagersForCompany(admin, companyId),
  ]);

  const pendingOtpByEpf = new Map<string, { active: boolean; expiresAt: string | null }>(
    (authRecords ?? []).map((row) => [
      String(row.epf_number).toUpperCase().trim(),
      {
        active: isSmPortalOtpActive(row.otp_expires_at),
        expiresAt:
          typeof row.otp_expires_at === 'string' ? row.otp_expires_at : null,
      },
    ]),
  );

  return managers.map((sm) => {
    const pending = pendingOtpByEpf.get(sm.epf_number.toUpperCase().trim());
    return {
      epf_number: sm.epf_number,
      full_name: sm.full_name,
      site: sm.site,
      has_pending_otp: pending?.active ?? false,
      otp_expires_at: pending?.active ? pending.expiresAt : null,
    };
  });
}

export async function deactivateSMAccess(epfNumber: string) {
  const gate = await requireHrEditor();
  if ('error' in gate) return { error: gate.error };

  const epf = epfNumber.toUpperCase().trim();
  const admin = getAdminClient();

  const { error } = await admin
    .from('sm_portal_auth')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('epf_number', epf);

  if (error) return { error: error.message };

  const supabase = gate.supabase;
  await auditStaffAction({
    supabase,
    portal: 'sm',
    action: 'Deactivate SM Portal Access',
    targetEntity: epf,
  });

  revalidatePath('/hr/sm-portal');
  revalidatePath('/hq/sm-proxy');
  return { success: true };
}

export async function hrForceSmPinRotationAction(epfNumber: string) {
  const gate = await requireHrEditor();
  if ('error' in gate) return { error: gate.error };

  const epf = epfNumber.toUpperCase().trim();
  if (!epf) return { error: 'EPF number required.' };

  const admin = getAdminClient();
  const employee = await findSectorManagerForProvision(admin, epf);
  if (!employee) return { error: `Employee ${epf} not found.` };

  const canonicalEpf = sectorManagerEpfKey(employee);
  if (!canonicalEpf) return { error: `${epf} has no EPF on file.` };

  const rotation = await markSmPortalPinRotationRequired(canonicalEpf);
  if (!rotation.ok) return { error: rotation.error };

  await auditStaffAction({
    supabase: gate.supabase,
    portal: 'sm',
    action: 'Require SM Portal PIN Change',
    targetEntity: epf,
    details: {
      policy: 'Clears PIN history and sets must_change_pin for next sign-in.',
    },
  });

  revalidatePath('/hr/sm-portal');
  revalidatePath('/hq/sm-proxy');

  return { success: true as const };
}
