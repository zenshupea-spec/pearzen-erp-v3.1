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

/** Company scope for roster / field ops (matches MNR `getEmployees`). */
export function rosterCompanyId(sessionCompanyId: string | null): string | null {
  if (!sessionCompanyId || sessionCompanyId === HQ_MASTER_COMPANY_ID) {
    return CLASSIC_VENTURE_COMPANY_ID;
  }
  return sessionCompanyId;
}

/**
 * Load tenant-scoped rows with the same fallback chain as Master Nominal Roll:
 * session company → Classic Venture → unscoped.
 */
export async function fetchWithRosterCompanyFallback<T>(
  fetcher: (companyId: string | null) => Promise<T[]>,
  sessionCompanyId: string | null,
): Promise<T[]> {
  const preferred = rosterCompanyId(sessionCompanyId);
  let rows = await fetcher(preferred);
  if (!rows.length && preferred !== CLASSIC_VENTURE_COMPANY_ID) {
    rows = await fetcher(CLASSIC_VENTURE_COMPANY_ID);
  }
  if (!rows.length) {
    rows = await fetcher(null);
  }
  return rows;
}

/**
 * Resolve the active company for the signed-in back-office user.
 * Avoids `companies.limit(1)` (HQ_MASTER) when `users.company_id` is absent.
 */
export async function resolveCompanyIdForSession(
  supabase: SupabaseClient,
  tenantSlug?: string | null,
): Promise<string | null> {
  if (tenantSlug) {
    const tenant = await resolveTenantCompany(tenantSlug);
    if (tenant?.id) return tenant.id;
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

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

  const { data: cvs } = await supabase
    .from('companies')
    .select('id')
    .eq('slug', CVS_TENANT_SLUG)
    .maybeSingle();
  if (cvs?.id) return cvs.id as string;

  return CVS_COMPANY_ID;
}
