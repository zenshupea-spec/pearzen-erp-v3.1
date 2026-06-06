'use server';

import { createSupabaseServerClient } from '../../../../../packages/supabase/server';
import { revalidatePath } from 'next/cache';

export async function executeRosterMerge(tempEmpId: string, permEmpId: string) {
  const supabase = await createSupabaseServerClient();

  const { error } = await supabase.rpc('merge_shadow_roster_profile', {
    p_temp_emp_id: tempEmpId,
    p_perm_emp_id: permEmpId,
  });

  if (error) {
    console.error('\n[SHADOW ROSTER] MERGE FAILED:', error.message, '\n');
    throw new Error('Failed to merge shadow roster profile.');
  }

  // Refresh the UI to show the Temp Slot as empty
  revalidatePath('/hr/temp-roster');
}
