import { createSupabaseServerClient } from '../../../packages/supabase/server';
import { isForgeOperatorEmail } from './forge-access';
import {
  ensureForgePortalAuthRecord,
  getForgePortalAuthRecord,
} from './forge-portal-auth';

export async function getAuthenticatedForgeSession(): Promise<
  | {
      user: { email: string };
      landing: string;
    }
  | { error: string }
> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) {
    return { error: 'Session expired. Sign in again.' };
  }

  if (!(await isForgeOperatorEmail(user.email))) {
    return { error: 'This account is not authorised for SaaS Forge.' };
  }

  await ensureForgePortalAuthRecord(user.email);
  const record = await getForgePortalAuthRecord(user.email);
  if (record && record.is_locked && record.locked_until) {
    if (new Date(record.locked_until).getTime() > Date.now()) {
      return { error: 'Forge account is temporarily locked.' };
    }
  }

  return {
    user: { email: user.email },
    landing: '/forge',
  };
}
