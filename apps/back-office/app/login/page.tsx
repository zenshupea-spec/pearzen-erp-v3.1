import { redirect } from "next/navigation";

import { getCompanyLogoUrl } from "../../../../packages/supabase/company-branding";
import { createSupabaseServerClient } from "../../../../packages/supabase/server";
import {
  authenticatedLandingPath,
  fetchBackOfficeUserProfile,
} from "../../lib/hr-portal-access";

import PortalGateway from "./PortalGateway";

export default async function LoginPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const profile = await fetchBackOfficeUserProfile(supabase, user);
    const landing = authenticatedLandingPath(profile.role);
    if (landing !== "/login/head-office") redirect(landing);
  }

  const logoUrl = await getCompanyLogoUrl();

  return <PortalGateway logoUrl={logoUrl} />;
}
