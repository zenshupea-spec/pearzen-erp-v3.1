'use server'

import { createSupabaseServerClient } from '../../../../../packages/supabase/server';
import { createClient } from '@supabase/supabase-js';

export async function setPinAction(newPin: string) {
  if (!/^\d{6}$/.test(newPin)) {
    return { error: 'PIN must be exactly 6 digits.' };
  }

  const supabase = await createSupabaseServerClient();
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) {
    return { error: 'Session expired. Please log in again.' };
  }

  const epf = session.user.email?.split('@')[0].toUpperCase() ?? '';

  // Use service role to update the Supabase Auth password for this user
  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const { error: updateError } = await adminClient.auth.admin.updateUserById(
    session.user.id,
    { password: newPin }
  );

  if (updateError) {
    console.error('[SM SetPin] Auth update failed:', updateError.message);
    return { error: 'Failed to set PIN. Please try again.' };
  }

  // Mark pin setup complete and clear OTP
  const { error: dbError } = await adminClient
    .from('sm_portal_auth')
    .update({
      needs_pin_setup: false,
      current_otp: null,
      updated_at: new Date().toISOString(),
    })
    .eq('epf_number', epf);

  if (dbError) {
    console.error('[SM SetPin] DB update failed:', dbError.message);
    return { error: 'PIN set but state not saved. Contact HR if issues persist.' };
  }

  return { success: true };
}
