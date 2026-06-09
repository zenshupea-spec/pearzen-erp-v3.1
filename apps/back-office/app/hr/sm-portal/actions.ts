'use server'

import { createClient } from '@supabase/supabase-js';
import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '../../../../../packages/supabase/server';
import { auditStaffAction } from '../../../lib/staff-audit';

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

export async function provisionSMPortalAccess(epfNumber: string) {
  const epf = epfNumber.toUpperCase().trim();
  if (!epf) return { error: 'EPF number required.' };

  const admin = getAdminClient();

  // Verify employee exists and is a Sector Manager
  const { data: employee, error: empError } = await admin
    .from('employees')
    .select('id, full_name, "group", status')
    .eq('emp_number', epf)
    .single();

  if (empError || !employee) return { error: `Employee ${epf} not found.` };
  if (employee.group !== 'SECTOR_MANAGER') return { error: `${epf} is not a Sector Manager.` };
  if (employee.status !== 'ACTIVE') return { error: `${epf} is not active.` };

  const otp = generateOTP();
  const syntheticEmail = `${epf.toLowerCase()}@pearzen.sm`;

  // Try to update existing user, otherwise create new one
  const { data: existingUser } = await admin.auth.admin.listUsers();
  const found = existingUser?.users?.find(u => u.email === syntheticEmail);

  if (found) {
    const { error: updateErr } = await admin.auth.admin.updateUserById(found.id, {
      password: otp,
      email_confirm: true,
    });
    if (updateErr) return { error: `Auth update failed: ${updateErr.message}` };
  } else {
    const { error: createErr } = await admin.auth.admin.createUser({
      email: syntheticEmail,
      password: otp,
      email_confirm: true,
    });
    if (createErr) return { error: `Auth creation failed: ${createErr.message}` };
  }

  // Upsert sm_portal_auth record
  const { error: dbError } = await admin
    .from('sm_portal_auth')
    .upsert({
      epf_number: epf,
      current_otp: otp,
      needs_pin_setup: true,
      is_active: true,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'epf_number' });

  if (dbError) return { error: `DB update failed: ${dbError.message}` };

  const supabase = await createSupabaseServerClient();
  await auditStaffAction({
    supabase,
    portal: 'sm',
    action: 'Provision SM Portal Access',
    targetEntity: `${employee.full_name ?? epf} (${epf})`,
  });

  revalidatePath('/hr/sm-portal');
  revalidatePath('/hq/sm-proxy');

  return {
    success: true,
    otp,
    epf,
    smName: employee.full_name,
  };
}

export async function getActiveSectorManagers() {
  const admin = getAdminClient();

  const { data: employees, error } = await admin
    .from('employees')
    .select('emp_number, full_name, site')
    .eq('group', 'SECTOR_MANAGER')
    .eq('status', 'ACTIVE')
    .order('full_name', { ascending: true });

  if (error || !employees) return [];

  return employees.map((e) => ({
    epf_number: String(e.emp_number),
    full_name: String(e.full_name ?? e.emp_number),
    site: String(e.site ?? '—'),
  }));
}

export async function deactivateSMAccess(epfNumber: string) {
  const epf = epfNumber.toUpperCase().trim();
  const admin = getAdminClient();

  const { error } = await admin
    .from('sm_portal_auth')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('epf_number', epf);

  if (error) return { error: error.message };

  const supabase = await createSupabaseServerClient();
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
