'use server'

import { cookies } from 'next/headers';
import { createSupabaseServerClient } from '../../../../../../packages/supabase/server';
import { redirect } from 'next/navigation';

async function resolveEpf(): Promise<string> {
  const cookieStore = await cookies();
  const demo = cookieStore.get('sm_demo_session')?.value;
  if (demo) return demo.toUpperCase();

  const supabase = await createSupabaseServerClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) redirect('/login');
  return session.user.email?.split('@')[0].toUpperCase() ?? '';
}

export async function submitAttendanceAction(formData: FormData) {
  const epf = await resolveEpf();
  const supabase = await createSupabaseServerClient();

  const shiftDate = formData.get('shift_date') as string;
  const shiftType = formData.get('shift_type') as string;
  const siteName = (formData.get('site_name') as string)?.trim();
  const notes = (formData.get('notes') as string)?.trim();

  if (!shiftDate) return { error: 'Shift date is required.' };
  if (!shiftType) return { error: 'Shift type is required.' };

  // Validate date: must be today or within next 3 days
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const selected = new Date(shiftDate);
  selected.setHours(0, 0, 0, 0);
  const diffDays = Math.round((selected.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays < 0) return { error: 'Cannot submit attendance for past dates.' };
  if (diffDays > 3) return { error: 'Attendance can only be submitted up to 3 days in advance.' };

  const { error } = await supabase
    .from('sm_attendance_submissions')
    .upsert({
      sm_epf: epf,
      shift_date: shiftDate,
      shift_type: shiftType,
      site_name: siteName || null,
      notes: notes || null,
      status: 'SUBMITTED',
      confirmed_at: null,
    }, { onConflict: 'sm_epf,shift_date' });

  if (error) {
    console.error('[SM Attendance Submit] Error:', error.message);
    return { error: 'Failed to submit attendance. Please try again.' };
  }

  return { success: true };
}

export async function getUpcomingSubmissions(epf: string) {
  const supabase = await createSupabaseServerClient();
  const today = new Date().toISOString().split('T')[0];

  const { data } = await supabase
    .from('sm_attendance_submissions')
    .select('*')
    .eq('sm_epf', epf)
    .gte('shift_date', today)
    .order('shift_date', { ascending: true });

  return data ?? [];
}
