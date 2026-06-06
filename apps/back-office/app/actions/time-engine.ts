'use server';

import { createSupabaseServerClient } from '../../../../packages/supabase/server';
import { revalidatePath } from 'next/cache';

export interface CreateRosterParams {
  employee_id: string;
  site_id: string;
  shift_date: string;
  planned_start_time: string;
  planned_end_time: string;
}

export async function createRoster(params: CreateRosterParams) {
  try {
    const supabase = await createSupabaseServerClient();
    
    // 1. Authenticate & Get Company ID
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) throw new Error('Unauthorized');
    
    let companyId = user.user_metadata?.company_id;
    if (!companyId) {
      const { data: fallbackData } = await supabase.from('employees').select('company_id').limit(1).single();
      if (fallbackData?.company_id) companyId = fallbackData.company_id;
      else throw new Error('Database is empty. Cannot attach Company ID.');
    }

    // 🚨 2. TEMPORAL OVERLAP CHECK: Prevent Double-Booking 🚨
    const { data: overlappingShifts, error: overlapError } = await supabase
      .from('time_rosters')
      .select('id, planned_start_time, planned_end_time, site_profiles ( site_name )')
      .eq('employee_id', params.employee_id)
      .eq('status', 'ACTIVE')
      .lt('planned_start_time', params.planned_end_time) // Existing shift starts before new shift ends
      .gt('planned_end_time', params.planned_start_time); // Existing shift ends after new shift starts

    if (overlapError) throw new Error('Failed to verify guard schedule availability.');

    if (overlappingShifts && overlappingShifts.length > 0) {
      const conflict = overlappingShifts[0] as {
        planned_start_time: string;
        planned_end_time: string;
        site_profiles?: { site_name: string } | { site_name: string }[] | null;
      };
      const sp = conflict.site_profiles;
      const conflictSite =
        (Array.isArray(sp) ? sp[0]?.site_name : sp?.site_name) || 'ANOTHER SITE';
      
      const formatTime = (iso: string) => new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
      const conflictStart = formatTime(conflict.planned_start_time);
      const conflictEnd = formatTime(conflict.planned_end_time);

      throw new Error(`GUARD ALREADY BOOKED AT ${conflictSite} (${conflictStart} - ${conflictEnd}).`);
    }

    // 3. Insert Roster
    const { error: insertError } = await supabase
      .from('time_rosters')
      .insert({
        company_id: companyId,
        employee_id: params.employee_id,
        site_id: params.site_id,
        shift_date: params.shift_date,
        planned_start_time: params.planned_start_time,
        planned_end_time: params.planned_end_time,
        status: 'ACTIVE'
      });

    if (insertError) throw insertError;

    revalidatePath('/om/roster');
    return { success: true };
  } catch (error: any) {
    console.error('❌ SUPABASE ERROR (createRoster):', error.message);
    throw new Error(error.message || 'Failed to create roster assignment');
  }
}

// ==========================================
// FETCH LIVE ROSTER DATA
// ==========================================
export async function getLiveRosters() {
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from('time_rosters')
      .select(`
        id,
        shift_date,
        planned_start_time,
        planned_end_time,
        status,
        employees ( emp_number, full_name ),
        site_profiles ( site_name )
      `)
      .order('shift_date', { ascending: false })
      .limit(50); 

    if (error) throw error;
    return data || [];
  } catch (error: any) {
    console.error('❌ SUPABASE ERROR (getLiveRosters):', error.message);
    return [];
  }
}