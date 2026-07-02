import 'server-only';

import { createSupabaseServiceClient } from '../../../packages/supabase/server';

/** Service-role DB for OM field ops — bypasses site_profiles RLS (see site directory). */
export function getOmServiceDb() {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
    throw new Error('OM service data is not configured (missing SUPABASE_SERVICE_ROLE_KEY).');
  }
  return createSupabaseServiceClient();
}
