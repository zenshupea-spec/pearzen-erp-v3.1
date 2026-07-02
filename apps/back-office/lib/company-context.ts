import type { SupabaseClient } from '@supabase/supabase-js';

import {
  CLASSIC_VENTURE_COMPANY_ID,
  CVS_COMPANY_ID,
  CVS_TENANT_SLUG,
} from './company-ids';
import { resolveTenantCompany } from './tenant-context';

export {
  CLASSIC_VENTURE_COMPANY_ID,
  CVS_COMPANY_ID,
  CVS_TENANT_SLUG,
} from './company-ids';

const HQ_MASTER_COMPANY_ID = '00000000-0000-0000-0000-000000000000';

export type ResolveCompanyIdOptions = {
  /** Forge operators on /forge may scope via slug without employee membership. */
  forgeOperatorSlugBypass?: boolean;
};

/** Signed-in user's tenant from employees / users / JWT metadata (no slug). */
export async function resolveUserMembershipCompanyId(
  supabase: SupabaseClient,
): Promise<string | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const appCompanyId = user.app_metadata?.company_id;
  if (typeof appCompanyId === 'string' && appCompanyId.length > 0) {
    return appCompanyId;
  }

  const metaCompanyId = user.user_metadata?.company_id;
  if (typeof metaCompanyId === 'string' && metaCompanyId.length > 0) {
    return metaCompanyId;
  }

  if (user.email) {
    const { data: emp } = await supabase
      .from('employees')
      .select('company_id')
      .eq('email', user.email)
      .maybeSingle();
    if (emp?.company_id) return emp.company_id as string;
  }

  if (user.email) {
    const { data: usr } = await supabase
      .from('users')
      .select('company_id')
      .ilike('email', user.email)
      .maybeSingle();
    if (usr?.company_id) return usr.company_id as string;
  }

  return null;
}

/** Company scope for roster / field ops — session tenant only (no platform default). */
export function rosterCompanyId(sessionCompanyId: string | null): string | null {
  if (!sessionCompanyId || sessionCompanyId === HQ_MASTER_COMPANY_ID) {
    return null;
  }
  return sessionCompanyId;
}

/**
 * Load tenant-scoped rows: session company first, then unscoped fetcher(null) if empty.
 */
export async function fetchWithRosterCompanyFallback<T>(
  fetcher: (companyId: string | null) => Promise<T[]>,
  sessionCompanyId: string | null,
): Promise<T[]> {
  const preferred = rosterCompanyId(sessionCompanyId);
  if (preferred) {
    const rows = await fetcher(preferred);
    if (rows.length) return rows;
  }
  return fetcher(null);
}

/**
 * Resolve the active company for the signed-in back-office user.
 * Tenant slug (hostname / server cookie / header) must match employee membership
 * when both are present — no slug-first override on platform / dev hosts.
 */
export async function resolveCompanyIdForSession(
  supabase: SupabaseClient,
  tenantSlug?: string | null,
  options?: ResolveCompanyIdOptions,
): Promise<string | null> {
  const membershipId = await resolveUserMembershipCompanyId(supabase);

  let slugCompanyId: string | null = null;
  if (tenantSlug) {
    const tenant = await resolveTenantCompany(tenantSlug);
    slugCompanyId = tenant?.id ?? null;
  }

  if (options?.forgeOperatorSlugBypass && slugCompanyId) {
    return slugCompanyId;
  }

  if (membershipId && slugCompanyId) {
    return membershipId === slugCompanyId ? membershipId : null;
  }

  if (membershipId) return membershipId;
  if (slugCompanyId) return slugCompanyId;

  return null;
}
