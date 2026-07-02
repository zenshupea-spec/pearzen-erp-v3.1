import 'server-only';

import type { User } from '@supabase/supabase-js';

/** Tenant scope from JWT app_metadata (preferred) or legacy user_metadata. */
export function resolveAuthUserCompanyId(
  user: User | null | undefined,
): string | null {
  if (!user) return null;

  const appCompanyId = user.app_metadata?.company_id;
  if (typeof appCompanyId === 'string' && appCompanyId.trim().length > 0) {
    return appCompanyId.trim();
  }

  const userCompanyId = user.user_metadata?.company_id;
  if (typeof userCompanyId === 'string' && userCompanyId.trim().length > 0) {
    return userCompanyId.trim();
  }

  return null;
}

export function buildAuthTenantAppMetadata(
  companyId: string,
): { company_id: string } {
  return { company_id: companyId.trim() };
}
