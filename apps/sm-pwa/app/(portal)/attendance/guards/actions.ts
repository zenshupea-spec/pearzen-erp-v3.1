'use server'

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '../../../../../../packages/supabase/server';

export type ExistingAttendanceEntry = {
  site_name: string;
  guard_epf: string;
  status: string;
};

async function resolveEpf(): Promise<string> {
  const cookieStore = await cookies();
  const demo = cookieStore.get('sm_demo_session')?.value;
  if (demo) return demo.toUpperCase();

  const supabase = await createSupabaseServerClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) redirect('/login');
  return session.user.email?.split('@')[0].toUpperCase() ?? '';
}

export async function getAttendanceForDate(
  shiftDate: string,
  shiftType: 'DAY' | 'NIGHT',
): Promise<ExistingAttendanceEntry[]> {
  const epf = await resolveEpf();
  const supabase = await createSupabaseServerClient();

  const { data } = await supabase
    .from('sm_guard_attendance')
    .select('site_name, guard_epf, status')
    .eq('sm_epf', epf)
    .eq('shift_date', shiftDate)
    .eq('shift_type', shiftType);

  return data ?? [];
}

export async function submitGuardAttendanceAction(
  entries: { siteName: string; guardEpf: string }[],
  shiftDate: string,
  shiftType: 'DAY' | 'NIGHT',
): Promise<{ success?: boolean; error?: string }> {
  const epf = await resolveEpf();
  const supabase = await createSupabaseServerClient();

  // Validate date range
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const selected = new Date(shiftDate);
  selected.setHours(0, 0, 0, 0);
  const diffDays = Math.round(
    (selected.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
  );
  if (diffDays < 0) return { error: 'Cannot submit for past dates.' };
  if (diffDays > 3) return { error: 'Can only submit up to 3 days in advance.' };

  // Guard uniqueness check within the same shift
  const guardEpfs = entries.map(e => e.guardEpf);
  if (new Set(guardEpfs).size !== guardEpfs.length) {
    return { error: 'A guard cannot be assigned to multiple sites.' };
  }

  // Replace: delete existing for this SM + date + shift type, then insert
  const { error: deleteError } = await supabase
    .from('sm_guard_attendance')
    .delete()
    .eq('sm_epf', epf)
    .eq('shift_date', shiftDate)
    .eq('shift_type', shiftType);

  if (deleteError) {
    console.error('[Guard Attendance] Delete error:', deleteError.message);
    return { error: 'Failed to save. Please try again.' };
  }

  if (entries.length === 0) return { success: true };

  const { error: insertError } = await supabase
    .from('sm_guard_attendance')
    .insert(
      entries.map(e => ({
        sm_epf: epf,
        shift_date: shiftDate,
        shift_type: shiftType,
        site_name: e.siteName,
        guard_epf: e.guardEpf,
        status: 'SUBMITTED',
      })),
    );

  if (insertError) {
    console.error('[Guard Attendance] Insert error:', insertError.message);
    return { error: 'Failed to save. Please try again.' };
  }

  return { success: true };
}
