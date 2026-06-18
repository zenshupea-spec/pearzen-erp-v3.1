import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '../../../../packages/supabase/server';
import { fetchBackOfficeUserProfile } from '../../lib/hr-portal-access-server';

export const dynamic = 'force-dynamic';

export default async function PayrollProtectionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login/head-office');

  const profile = await fetchBackOfficeUserProfile(supabase, user);
  const role = profile.role;

  if (role !== 'MD' && role !== 'OD' && role !== 'FM' && role !== 'HR') {
    console.error(
      'SECURITY VIOLATION: Unauthorized access attempt to Financial Engine.'
    );
    redirect('/dashboard?error=unauthorized_clearance');
  }

  return <>{children}</>;
}
