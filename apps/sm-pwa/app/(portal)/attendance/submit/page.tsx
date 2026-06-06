import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '../../../../../../packages/supabase/server';
import AttendanceSubmitClient from './AttendanceSubmitClient';
import { getUpcomingSubmissions } from './actions';

export const dynamic = 'force-dynamic';

export default async function AttendanceSubmitPage() {
  const cookieStore = await cookies();
  const isDemo = cookieStore.get('sm_demo_session')?.value === 'SM-001';

  let epf: string;
  let defaultSite: string;

  if (isDemo) {
    epf = 'SM-001';
    defaultSite = 'Lanka Hospitals';
  } else {
    const supabase = await createSupabaseServerClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) redirect('/login');
    epf = session.user.email?.split('@')[0].toUpperCase() ?? '';

    const { data: sm } = await supabase
      .from('employees')
      .select('site')
      .eq('emp_number', epf)
      .single();

    defaultSite = sm?.site ?? '';
  }

  const existing = await getUpcomingSubmissions(epf);

  return <AttendanceSubmitClient defaultSite={defaultSite} existing={existing} />;
}
