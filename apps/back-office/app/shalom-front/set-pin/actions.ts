'use server';

import { revalidatePath } from 'next/cache';

import { createSupabaseServerClient } from '../../../../../packages/supabase/server';
import { createSupabaseServiceClient } from '../../../../../packages/supabase/service';
import { SHALOM_FRONT_PIN_LENGTH } from '../../../lib/shalom-front-auth-shared';
import {
  resolveShalomEmployeeForUser,
  shalomEmployeeEpfKey,
} from '../../../lib/shalom-front-auth';
import { resolveCompanyIdForSession } from '../../../lib/company-context-server';
import { auditStaffAction } from '../../../lib/staff-audit';

export async function setShalomFrontPinAction(newPin: string) {
  if (!new RegExp(`^\\d{${SHALOM_FRONT_PIN_LENGTH}}$`).test(newPin)) {
    return { error: `PIN must be exactly ${SHALOM_FRONT_PIN_LENGTH} digits.` };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.user) {
    return { error: 'Session expired. Please log in again.' };
  }

  const employee = await resolveShalomEmployeeForUser(session.user);
  if (!employee) {
    return { error: 'Shalom caretaker session not found.' };
  }

  const epf = shalomEmployeeEpfKey(employee);
  if (!epf) {
    return { error: 'Employee EPF not on file. Contact HR.' };
  }

  const admin = createSupabaseServiceClient();
  const { error: updateError } = await admin.auth.admin.updateUserById(session.user.id, {
    password: newPin,
  });

  if (updateError) {
    console.error('[Shalom SetPin] Auth update failed:', updateError.message);
    return { error: updateError.message || 'Failed to set PIN. Please try again.' };
  }

  const { error: dbError } = await admin
    .from('shalom_portal_auth')
    .update({
      needs_pin_setup: false,
      current_otp_hash: null,
      otp_expires_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq('epf_number', epf);

  if (dbError) {
    console.error('[Shalom SetPin] DB update failed:', dbError.message);
    return { error: 'PIN set but state not saved. Contact HR if issues persist.' };
  }

  const companyId = await resolveCompanyIdForSession(supabase);
  if (companyId) {
    await auditStaffAction({
      portal: 'shalom-front',
      action: 'Set Portal PIN',
      targetEntity: employee.full_name ?? epf,
      companyId,
      profileId: employee.id,
      actorName: employee.full_name ?? epf,
      actorRole: employee.rank ?? 'Caretaker',
    });
  }

  revalidatePath('/shalom-front');
  return { success: true };
}
