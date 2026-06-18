import type { SupabaseClient } from '@supabase/supabase-js';

import {
  CLASSIC_VENTURE_COMPANY_ID,
  resolveCompanyIdForSession,
} from '../../../../lib/company-context-server';
import { resolveTenantCompany } from '../../../../lib/tenant-context';
import { getTenantSlugFromRequest } from '../../../../lib/tenant-context-server';
import {
  createSupabaseServerClient,
  createSupabaseServiceClient,
} from '../../../../../../packages/supabase/server';

/**
 * Resolve md_settings company scope for executive routes.
 * Prefer the active tenant (hostname / cookie) so vault PIN and policy stay aligned
 * with the portal the user is on, even when the employee record points elsewhere.
 */
export async function resolveExecutiveCompanyId(
  sessionClient?: SupabaseClient,
): Promise<string> {
  const tenantSlug = await getTenantSlugFromRequest();
  if (tenantSlug) {
    const tenant = await resolveTenantCompany(tenantSlug);
    if (tenant?.id) return tenant.id;
  }

  const supabase = sessionClient ?? (await createSupabaseServerClient());
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const companyId = await resolveCompanyIdForSession(supabase, tenantSlug);
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
