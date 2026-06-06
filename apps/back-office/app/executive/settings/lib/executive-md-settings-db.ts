import type { SupabaseClient } from '@supabase/supabase-js';

import {
  CLASSIC_VENTURE_COMPANY_ID,
  resolveCompanyIdForSession,
} from '../../../../lib/company-context';
import {
  createSupabaseServerClient,
  createSupabaseServiceClient,
} from '../../../../../../packages/supabase/server';

/**
 * Executive /executive/* skips auth middleware cookie refresh, so server actions
 * often have no session. Resolve company from session when present, else Classic Venture.
 */
export async function resolveExecutiveCompanyId(
  sessionClient?: SupabaseClient,
): Promise<string> {
  const supabase = sessionClient ?? (await createSupabaseServerClient());
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const companyId = await resolveCompanyIdForSession(supabase);
    if (companyId) return companyId;
  }

  return CLASSIC_VENTURE_COMPANY_ID;
}

/** Service-role client for md_settings — avoids RLS / missing-session write failures. */
export function getMdSettingsDb() {
  return createSupabaseServiceClient();
}

export async function getExecutiveMdSettingsContext() {
  const session = await createSupabaseServerClient();
  const companyId = await resolveExecutiveCompanyId(session);
  const db = getMdSettingsDb();
  const {
    data: { user },
  } = await session.auth.getUser();
  return { session, db, companyId, user };
}
