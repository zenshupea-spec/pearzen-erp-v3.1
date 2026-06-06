import { createSupabaseServerClient } from '../../../../packages/supabase/server';
import { redirect } from 'next/navigation';

export default async function Root() {
  const supabase = await createSupabaseServerClient();
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) {
    redirect('/login');
  }

  const epf = session.user.email?.split('@')[0].toUpperCase() ?? '';

  // Check if PIN still needs to be set
  const { data: authRecord } = await supabase
    .from('sm_portal_auth')
    .select('needs_pin_setup')
    .eq('epf_number', epf)
    .single();

  if (authRecord?.needs_pin_setup) {
    redirect('/set-pin');
  }

  redirect('/dashboard');
}
