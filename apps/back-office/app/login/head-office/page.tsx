import { redirect } from "next/navigation";

import { getCompanyLogoUrl } from "../../../../../packages/supabase/company-branding";
import { createSupabaseServerClient } from "../../../../../packages/supabase/server";
import { EXECUTIVE_DESK_PATH } from "../../../lib/hq-hub";
import {
  authenticatedLandingPath,
  fetchBackOfficeUserProfile,
} from "../../../lib/hr-portal-access";
import { isExecutiveRank } from "../../../lib/portal-role-utils";
import { resolveTenantCompanyFromRequest } from "../../../lib/tenant-context";

import LoginShell from "../LoginShell";

const LOGIN_ERRORS: Record<string, string> = {
  executive_denied:
    "Executive Desk requires MD or OD rank on your MNR record. Ask the Managing Director to set your work email and rank.",
  hr_denied:
    "HR portal requires HR, FM, or OM rank on your MNR record (MD/OD also have access).",
  geofence_denied: "Access denied — you must be on the office network for this portal.",
  no_portal_rank:
    "Signed in, but no portal rank is set on your employee record. Ask HR to set your work email and rank.",
  oauth_failed: "Google sign-in failed. Please try again.",
  tenant_suspended:
    "This tenant account is suspended. Contact Pearzen support or your account manager.",
};

function safeNextPath(raw: string | null | undefined): string {
  if (!raw?.startsWith("/") || raw.startsWith("//")) return "/";
  return raw;
}

export default async function HeadOfficeLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; role?: string; next?: string }>;
}) {
  const params = await searchParams;
  const authError = params.error ? LOGIN_ERRORS[params.error] ?? null : null;
  const authErrorRole = params.role ?? null;
  const oauthNext = safeNextPath(params.next);

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const profile = await fetchBackOfficeUserProfile(supabase, user);
    const landing = authenticatedLandingPath(profile.role);
    if (landing !== "/login/head-office") {
      const next = safeNextPath(params.next);
      if (
        isExecutiveRank(profile.role) &&
        (next === EXECUTIVE_DESK_PATH || next.startsWith("/executive/"))
      ) {
        redirect(next);
      }
      redirect(landing);
    }
  }

  const tenant = await resolveTenantCompanyFromRequest();
  const logoUrl = await getCompanyLogoUrl(tenant?.id);
  const resolvedAuthError = authError;

  const authErrorDetail =
    params.error === "executive_denied" && authErrorRole
      ? `Your current MNR rank: ${authErrorRole}`
      : params.error === "no_portal_rank" && user?.email
        ? `Signed in as ${user.email}`
        : null;

  return (
    <LoginShell
      variant="head-office"
      logoUrl={logoUrl}
      companyName={tenant?.name ?? null}
      authError={resolvedAuthError}
      authErrorDetail={authErrorDetail}
      oauthNext={oauthNext}
      signInDisabled={false}
    />
  );
}
