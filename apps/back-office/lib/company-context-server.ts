import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  fetchWithRosterCompanyFallback,
  resolveCompanyIdForSession as resolveCompanyIdWithSlug,
  rosterCompanyId,
} from "./company-context";
import { getTenantSlugFromRequest } from "./tenant-context-server";

export {
  CLASSIC_VENTURE_COMPANY_ID,
  CVS_COMPANY_ID,
  CVS_TENANT_SLUG,
} from "./company-ids";
export { fetchWithRosterCompanyFallback, rosterCompanyId };

export async function resolveCompanyIdForSession(
  supabase: SupabaseClient,
): Promise<string | null> {
  return resolveCompanyIdWithSlug(supabase, await getTenantSlugFromRequest());
}
