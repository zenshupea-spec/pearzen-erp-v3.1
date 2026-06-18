import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '../../../../../../packages/supabase/server';
import AttendanceSubmitClient from './AttendanceSubmitClient';
import { getUpcomingSubmissions } from './actions';

export const dynamic = 'force-dynamic';

export default async function AttendanceSubmitPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) redirect('/login');
  const epf = session.user.email?.split('@')[0].toUpperCase() ?? '';

  const { data: sm } = await supabase
    .from('employees')
    .select('site')
    .eq('emp_number', epf)
    .single();

  const defaultSite = sm?.site ?? '';

  const existing = await getUpcomingSubmissions(epf);

  return <AttendanceSubmitClient defaultSite={defaultSite} existing={existing} />;
}
