'use server';

import { createSupabaseServerClient } from '../../../../packages/supabase/server';
import { resolveAuthUserCompanyId } from '../../../../packages/supabase/auth-tenant-metadata';
import { revalidatePath } from 'next/cache';
import {
  isOmSectorScopeEmpty,
  omScopeIncludesGuardEmployeeId,
  omScopeIncludesSite,
  resolveOmSectorScopeForSession,
} from '../../lib/om-sector-scope';

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
    
    let companyId = resolveAuthUserCompanyId(user);
    if (!companyId && user.email) {
      const { data: emp } = await supabase
        .from('employees')
        .select('company_id')
        .eq('email', user.email)
        .maybeSingle();
      if (emp?.company_id) companyId = emp.company_id as string;
    }
    if (!companyId) {
      throw new Error('Could not resolve tenant company for this session.');
    }

    const omScope = await resolveOmSectorScopeForSession();
    if (omScope !== null) {
      if (isOmSectorScopeEmpty(omScope)) {
        throw new Error('No assigned sectors — cannot create roster assignments.');
      }

      const { data: guard } = await supabase
        .from('employees')
        .select('id, site')
        .eq('id', params.employee_id)
        .eq('company_id', companyId)
        .maybeSingle();

      const { data: site } = await supabase
        .from('site_profiles')
        .select('id, site_name, assigned_sm_epf')
        .eq('id', params.site_id)
        .maybeSingle();

      if (
        !guard ||
        !omScopeIncludesGuardEmployeeId(omScope, guard.id) ||
        !site ||
        !omScopeIncludesSite(omScope, site)
      ) {
        throw new Error('This guard or site is outside your assigned sectors.');
      }
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
    const omScope = await resolveOmSectorScopeForSession();
    if (omScope !== null && isOmSectorScopeEmpty(omScope)) return [];

    const { data, error } = await supabase
      .from('time_rosters')
      .select(`
        id,
        shift_date,
        planned_start_time,
        planned_end_time,
        status,
        employee_id,
        employees ( emp_number, full_name ),
        site_profiles ( site_name, assigned_sm_epf )
      `)
      .order('shift_date', { ascending: false })
      .limit(50); 

    if (error) throw error;

    const rows = data ?? [];
    if (omScope === null) return rows;

    return rows.filter((row) => {
      const guardId = String(row.employee_id ?? '');
      if (guardId && omScopeIncludesGuardEmployeeId(omScope, guardId)) return true;
      const siteProfiles = row.site_profiles as
        | { site_name?: string; assigned_sm_epf?: string | null }
        | { site_name?: string; assigned_sm_epf?: string | null }[]
        | null;
      const site = Array.isArray(siteProfiles) ? siteProfiles[0] : siteProfiles;
      return site ? omScopeIncludesSite(omScope, site) : false;
    });
  } catch (error: any) {
    console.error('❌ SUPABASE ERROR (getLiveRosters):', error.message);
    return [];
  }
}