import { redirect } from 'next/navigation';

import { createSupabaseServerClient } from '../../../../../../packages/supabase/server';
import { fetchBackOfficeUserProfile } from '../../../../lib/hr-portal-access-server';

import BulkEditorClient from './BulkEditorClient';

export const metadata = {
  title: 'Bulk Roster Editor',
};

export default async function BulkEditorPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    redirect('/login/head-office');
  }

  const profile = await fetchBackOfficeUserProfile(supabase, user);
  if (profile.role !== 'MD' && profile.role !== 'OD') {
    redirect('/executive/settings');
  }

  return <BulkEditorClient />;
}
