"use server";

import { revalidatePath } from 'next/cache';

import { createSupabaseServerClient } from '../../../../../packages/supabase/server';
import {
  resolveCompanyIdForSession,
  rosterCompanyId,
} from '../../../lib/company-context-server';
import {
  assertHrPortalEditor,
  fetchBackOfficeUserProfile,
} from '../../../lib/hr-portal-access-server';

async function requireHrEditor() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { session },
    error: authError,
  } = await supabase.auth.getSession();

  if (authError || !session?.user) {
    return { success: false as const, error: 'UNAUTHORIZED: PLEASE RE-LOGIN' };
  }

  const profile = await fetchBackOfficeUserProfile(supabase, session.user);
  try {
    assertHrPortalEditor(profile.role);
  } catch (err) {
    return {
      success: false as const,
      error: err instanceof Error ? err.message : 'Forbidden.',
    };
  }

  const sessionCompanyId = await resolveCompanyIdForSession(supabase);
  const companyId = rosterCompanyId(sessionCompanyId);
  if (!companyId) {
    return { success: false as const, error: 'UNAUTHORIZED: INVALID COMPANY ACCESS' };
  }

  return { success: true as const, supabase, companyId };
}

export async function commitShift(formData: {
  employee_id: string;
  site_id: string;
  shift_date: string;
  start_time: string;
  end_time: string;
}) {
  try {
    const gate = await requireHrEditor();
    if (!gate.success) {
      return { success: false, error: gate.error };
    }

    const { supabase, companyId } = gate;

    const { error } = await supabase.from('time_rosters').insert([
      {
        employee_id: formData.employee_id,
        site_id: formData.site_id,
        shift_date: formData.shift_date,
        planned_start_time: formData.start_time,
        planned_end_time: formData.end_time,
        company_id: companyId,
        status: 'ACTIVE',
      },
    ]);

    if (error) throw error;

    revalidatePath('/hr/roster');
    return { success: true };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('❌ ROSTER ENGINE CRASH:', message);
    return { success: false, error: message };
  }
}
