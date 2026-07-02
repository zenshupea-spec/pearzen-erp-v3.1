import 'server-only';

import { createSupabaseServerClient } from '../../../packages/supabase/server';
import { isForgeOperatorEmail } from './forge-access';

/** Throws when the signed-in user is not a SaaS Forge platform operator. */
export async function assertForgeOperator(): Promise<string> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email || !(await isForgeOperatorEmail(user.email))) {
    throw new Error('Forbidden');
  }

  return user.email.trim().toLowerCase();
}
