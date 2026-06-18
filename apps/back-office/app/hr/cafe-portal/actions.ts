'use server';

import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';

import { createSupabaseServerClient } from '../../../../../packages/supabase/server';
import { auditStaffAction } from '../../../lib/staff-audit';
import {
  findCafeEmployeeByEpf,
  isCafeEmployee,
  isEmployeeActive,
  normalizeEpfNo,
  provisionCafePortalOtp,
} from '../../../lib/cafe-front-auth';

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

const PROVISION_FLASH_COOKIE = 'cafe_portal_provision_flash';

export async function clearProvisionFlashCookie() {
  const jar = await cookies();
  jar.set(PROVISION_FLASH_COOKIE, '', { maxAge: 0, path: '/' });
}

export async function provisionCafePortalAccess(epfInput: string) {
  const epf = normalizeEpfNo(epfInput);
  if (!epf) return { error: 'EPF number required.' };

  const admin = getAdminClient();
  const employee = await findCafeEmployeeByEpf(admin, epf);

  if (!employee) return { error: `Employee with EPF ${epf} not found.` };
  if (!isCafeEmployee(employee)) return { error: `${epf} is not café operations staff.` };
  if (!isEmployeeActive(employee)) return { error: `${epf} is not active.` };

  const otp = generateOTP();
  const provision = await provisionCafePortalOtp(admin, employee, otp);
  if (!provision.ok) return { error: provision.error ?? 'Provisioning failed.' };

  const supabase = await createSupabaseServerClient();
  await auditStaffAction({
    supabase,
    portal: 'hr',
    action: 'Provision Café Portal Access',
    targetEntity: `${employee.full_name ?? epf} (${epf})`,
  });

  revalidatePath('/hr/cafe-portal');

  return {
    success: true,
    otp,
    epf,
    staffName: employee.full_name ?? epf,
  };
}

export async function getActiveCafeStaff() {
  const admin = getAdminClient();

  const { data: employees, error } = await admin
    .from('employees')
    .select('epf_no, epf_num, full_name, site')
    .eq('group', 'CAFE')
    .eq('status', 'ACTIVE')
    .order('full_name', { ascending: true });

  if (error || !employees) return [];

  return employees
    .map((row) => {
      const epf =
        (row.epf_no != null ? String(row.epf_no).trim() : '') ||
        (row.epf_num != null ? String(row.epf_num).trim() : '');
      return {
        epf_number: normalizeEpfNo(epf),
        full_name: String(row.full_name ?? (epf || '—')),
        site: String(row.site ?? '—'),
      };
    })
    .filter((row) => row.epf_number.length > 0);
}

export async function deactivateCafePortalAccess(epfInput: string) {
  const epf = normalizeEpfNo(epfInput);
  const admin = getAdminClient();

  const { error } = await admin
    .from('cafe_portal_auth')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('epf_number', epf);

  if (error) return { error: error.message };

  const supabase = await createSupabaseServerClient();
  await auditStaffAction({
    supabase,
    portal: 'hr',
    action: 'Deactivate Café Portal Access',
    targetEntity: epf,
  });

  revalidatePath('/hr/cafe-portal');
  return { success: true };
}
