import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { headers } from "next/headers";

import {
  fetchWithRosterCompanyFallback,
  resolveCompanyIdForSession as resolveCompanyIdWithSlug,
  rosterCompanyId,
} from "./company-context";
import { isForgeOperatorEmail } from "./forge-access";
import { getTenantSlugFromRequest } from "./tenant-context-server";

export {
  CLASSIC_VENTURE_COMPANY_ID,
  CVS_COMPANY_ID,
  CVS_TENANT_SLUG,
} from "./company-ids";
export {
  fetchWithRosterCompanyFallback,
  resolveUserMembershipCompanyId,
  rosterCompanyId,
} from "./company-context";
export type { ResolveCompanyIdOptions } from "./company-context";

async function resolveForgeOperatorSlugBypass(
  supabase: SupabaseClient,
): Promise<boolean> {
  const hdrs = await headers();
  const pathname = hdrs.get("x-pathname") ?? "";
  if (!pathname.startsWith("/forge")) return false;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return false;

  return isForgeOperatorEmail(user.email);
}

export async function resolveCompanyIdForSession(
  supabase: SupabaseClient,
): Promise<string | null> {
  const forgeOperatorSlugBypass = await resolveForgeOperatorSlugBypass(supabase);
  return resolveCompanyIdWithSlug(supabase, await getTenantSlugFromRequest(), {
    forgeOperatorSlugBypass,
  });
}

/** Session tenant for roster / field ops (MNR fallback chain). */
export async function resolveSessionRosterCompanyId(): Promise<string | null> {
  const { createSupabaseServerClient } = await import(
    "../../../packages/supabase/server"
  );
  const supabase = await createSupabaseServerClient();
  return rosterCompanyId(await resolveCompanyIdForSession(supabase));
}

/**
 * Validates a client-supplied `companyId` against the signed-in session tenant.
 *
 * **Do not use on Forge or Partner actions** — those scopes are intentional cross-tenant:
 * - Forge: `assertForgeOperator()` + target `companyId` for platform operators.
 * - Partner: `requirePartnerSession()` + `assertPartnerPortfolioLink(companyId)`.
 *
 * @throws Error('Forbidden') when the client id does not match the session tenant.
 */
export async function assertSessionCompanyId(clientCompanyId: string): Promise<string> {
  const sessionId = await resolveSessionRosterCompanyId();
  const clientId = clientCompanyId?.trim();
  if (!sessionId || !clientId || clientId !== sessionId) {
    throw new Error("Forbidden");
  }
  return sessionId;
}
