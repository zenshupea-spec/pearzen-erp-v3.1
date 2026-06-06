'use server';

import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '../../../../packages/supabase/server';

/**
 * 1. CLONE YESTERDAY'S ROSTER
 * Duplicates the exact shift matrix from 24 hours ago for a specific site.
 */
export async function cloneYesterdayRoster(siteId: string, targetDate: string) {
  const supabase = await createSupabaseServerClient();

  const target = new Date(targetDate);
  target.setDate(target.getDate() - 1);
  const yesterdayString = target.toISOString().split('T')[0];

  const { data: yesterdayShifts, error: fetchError } = await supabase
    .from('sector_manager_forms')
    .select('*')
    .eq('site_id', siteId)
    .eq('shift_date', yesterdayString);

  if (fetchError) throw new Error("Failed to fetch yesterday's roster.");
  if (!yesterdayShifts || yesterdayShifts.length === 0) {
    return { success: false as const, message: 'No roster found for yesterday.' };
  }

  const newShifts = yesterdayShifts.map((shift) => {
    const { id, created_at, ...rest } = shift as Record<string, unknown> & {
      id: string;
      created_at?: string;
    };
    return {
      ...rest,
      shift_date: targetDate,
      status: 'DRAFT',
    };
  });

  const { error: insertError } = await supabase
    .from('sector_manager_forms')
    .insert(newShifts);

  if (insertError) throw new Error('Failed to clone roster.');

  revalidatePath('/roster');
  return { success: true as const, message: 'Roster cloned successfully.' };
}

/**
 * 2. REQUEST EMERGENCY GUARD
 * Fires a flag to the Head Office OM Dashboard requesting backup.
 */
export async function requestEmergencyGuard(
  sectorId: string,
  siteId: string,
  requestedRank: string
) {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthorized');

  const { error } = await supabase.from('om_action_queue').insert({
    company_id: user.user_metadata?.company_id,
    requested_by: user.id,
    sector_id: sectorId,
    site_id: siteId,
    action_type: 'EMERGENCY_GUARD_REQUEST',
    details: `Urgent request for 1x ${requestedRank}`,
    status: 'PENDING',
  });

  if (error) throw new Error('Failed to send emergency request.');

  return { success: true as const, message: 'Request sent to Operations Manager.' };
}
