"use server";

import { createSupabaseServerClient } from '../../../../../packages/supabase/server';
import { revalidatePath } from 'next/cache';

export async function commitShift(formData: {
  employee_id: string;
  site_id: string;
  shift_date: string;
  start_time: string;
  end_time: string;
}) {
  try {
    const supabase = await createSupabaseServerClient();

    // 1. Get the Admin's session to retrieve company_id (Mandatory per SOP)
    const { data: { session }, error: authError } = await supabase.auth.getSession();
    
    // If no session, this is why you see "UNAUTHORIZED"
    if (authError || !session) {
        console.error("❌ AUTH ERROR: No active session found.");
        return { success: false, error: "UNAUTHORIZED: PLEASE RE-LOGIN" };
    }

    // 2. Fetch the company_id for the current admin from their profile
    const { data: adminProfile, error: profileError } = await supabase
      .from('profiles')
      .select('company_id')
      .eq('id', session.user.id)
      .single();

    if (profileError || !adminProfile?.company_id) {
        console.error("❌ PROFILE ERROR: Admin has no company_id assigned.");
        return { success: false, error: "UNAUTHORIZED: INVALID COMPANY ACCESS" };
    }

    // 3. Insert into time_rosters (ALL CAPS enforced per SOP)
    const { error } = await supabase
      .from('time_rosters')
      .insert([{
        employee_id: formData.employee_id,
        site_id: formData.site_id,
        shift_date: formData.shift_date,
        planned_start_time: formData.start_time,
        planned_end_time: formData.end_time,
        company_id: adminProfile.company_id,
        status: 'ACTIVE'
      }]);

    if (error) throw error;

    revalidatePath('/hr/roster');
    return { success: true };

  } catch (error: any) {
    console.error("❌ ROSTER ENGINE CRASH:", error.message);
    return { success: false, error: error.message };
  }
}
