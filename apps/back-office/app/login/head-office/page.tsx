import { redirect } from "next/navigation";

import { getCompanyLogoUrl } from "../../../../../packages/supabase/company-branding";
import { createSupabaseServerClient } from "../../../../../packages/supabase/server";
import {
  getHeadOfficePortalAuthByEmail,
  hasValidPortalPinSessionForUser,
  requiresHeadOfficePortalPin,
} from "../../../lib/head-office-portal-auth";
import {
  authenticatedLandingPath,
  fetchBackOfficeUserProfile,
} from "../../../lib/hr-portal-access";
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
  not_provisioned:
    "Portal access is not provisioned yet. Ask your Managing Director to generate an OTP for you.",
  access_revoked:
    "Portal access has been revoked. Contact your Managing Director.",
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

  if (user?.email) {
    const profile = await fetchBackOfficeUserProfile(supabase, user);

    if (requiresHeadOfficePortalPin(profile, user.email)) {
      const authRecord = await getHeadOfficePortalAuthByEmail(user.email);
      if (!authRecord || !authRecord.is_active) {
        await supabase.auth.signOut();
      } else {
        const landing = authenticatedLandingPath(profile.role, profile);
        if (landing !== "/login/head-office") {
          if (authRecord.needs_pin_setup) {
            redirect("/login/verify-pin");
          }
          if (!(await hasValidPortalPinSessionForUser(profile.employeeId!, user.email))) {
            redirect("/login/verify-pin");
          }
          redirect(landing);
        }
      }
    } else {
      const landing = authenticatedLandingPath(profile.role, profile);
      if (landing !== "/login/head-office") {
        redirect(landing);
      }
    }
  }

  const tenant = await resolveTenantCompanyFromRequest();
  const logoUrl = await getCompanyLogoUrl(tenant?.id);

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
      authError={authError}
      authErrorDetail={authErrorDetail}
      oauthNext={oauthNext}
      signInDisabled={false}
    />
  );
}
