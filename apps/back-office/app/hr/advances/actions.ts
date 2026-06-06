'use server';

import { createSupabaseServerClient } from '../../../../../packages/supabase/server';
import { revalidatePath } from 'next/cache';

export async function processAdvanceApproval(
  advanceId: string,
  newStatus: 'APPROVED' | 'REJECTED'
) {
  try {
    if (!advanceId) throw new Error('Missing advance ID');

    const supabase = await createSupabaseServerClient();

    const { error } = await supabase
      .from('salary_advances')
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq('id', advanceId);

    if (error) throw new Error(error.message);

    // Force Next.js to purge the cache so the MD/HR dashboards update instantly
    revalidatePath('/hr/advances');

    return { success: true };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('❌ SUPABASE ERROR (Advance Approval):', message);
    return { success: false, error: message };
  }
}

export async function fetchPendingAdvances() {
  try {
    const supabase = await createSupabaseServerClient();

    // Fetching advances with basic employee info (Adjust column names if your schema differs)
    const { data, error } = await supabase
      .from('salary_advances')
      .select('*')
      .order('created_at', { ascending: false });

    if (error && error.code !== '42P01') throw new Error(error.message);

    return { success: true, data: data || [] };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('❌ SUPABASE ERROR (Fetch Advances):', message);
    return { success: false, data: [], error: message };
  }
}
