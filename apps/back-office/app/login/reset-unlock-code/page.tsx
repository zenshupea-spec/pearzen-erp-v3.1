import { redirect } from 'next/navigation';

import { createSupabaseServerClient } from '../../../../../packages/supabase/server';
import ResetUnlockCodeForm from './ResetUnlockCodeForm';

export default async function ResetUnlockCodePage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login/hq');

  return <ResetUnlockCodeForm />;
}
