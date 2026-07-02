'use server';

import { revalidatePath } from 'next/cache';

import {
  CAFE_FRONT_PIN_LENGTH,
  cafeEmployeeEpfKey,
  resolveCafeEmployeeForUser,
} from '../../../lib/cafe-front-auth';
import { resolveCompanyIdForSession } from '../../../lib/company-context-server';
import { auditStaffAction } from '../../../lib/staff-audit';
import { createSupabaseServerClient } from '../../../../../packages/supabase/server';
import { createSupabaseServiceClient } from '../../../../../packages/supabase/service';

export async function setCafeFrontPinAction(newPin: string) {
  if (!new RegExp(`^\\d{${CAFE_FRONT_PIN_LENGTH}}$`).test(newPin)) {
    return { error: `PIN must be exactly ${CAFE_FRONT_PIN_LENGTH} digits.` };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.user) {
    return { error: 'Session expired. Please log in again.' };
  }

  const employee = await resolveCafeEmployeeForUser(session.user);
  if (!employee) {
    return { error: 'Café staff session not found.' };
  }

  const epf = cafeEmployeeEpfKey(employee);
  if (!epf) {
    return { error: 'Employee EPF not on file. Contact HR.' };
  }

  const admin = createSupabaseServiceClient();
  const { error: updateError } = await admin.auth.admin.updateUserById(session.user.id, {
    password: newPin,
  });

  if (updateError) {
    console.error('[Cafe SetPin] Auth update failed:', updateError.message);
    if (updateError.message.toLowerCase().includes('6 characters')) {
      return { error: `PIN must be exactly ${CAFE_FRONT_PIN_LENGTH} digits.` };
    }
    return { error: updateError.message || 'Failed to set PIN. Please try again.' };
  }

  const { error: dbError } = await admin
    .from('cafe_portal_auth')
    .update({
      needs_pin_setup: false,
      current_otp: null,
      otp_expires_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq('epf_number', epf);

  if (dbError) {
    console.error('[Cafe SetPin] DB update failed:', dbError.message);
    return { error: 'PIN set but state not saved. Contact HR if issues persist.' };
  }

  const companyId = await resolveCompanyIdForSession(supabase);
  if (companyId) {
    await auditStaffAction({
      portal: 'cafe-front',
      action: 'Set Portal PIN',
      targetEntity: employee.full_name ?? epf,
      companyId,
      profileId: employee.id,
      actorName: employee.full_name ?? epf,
      actorRole: employee.rank ?? 'Barista',
    });
  }

  revalidatePath('/cafe-front');
  return { success: true };
}
