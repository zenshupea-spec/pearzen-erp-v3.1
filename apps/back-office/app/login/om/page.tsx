import { redirect } from "next/navigation";

import { getCompanyLogoUrl } from "../../../../../packages/supabase/company-branding";
import { createSupabaseServerClient } from "../../../../../packages/supabase/server";

import LoginShell from "../LoginShell";

const LOGIN_ERRORS: Record<string, string> = {
  geofence_denied: "Access denied — you must be on the office network for this portal.",
  oauth_failed: "Google sign-in failed. Please try again.",
};

export default async function OmLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  const authError = params.error ? LOGIN_ERRORS[params.error] ?? null : null;

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect("/om");
  }

  const logoUrl = await getCompanyLogoUrl();

  return (
    <LoginShell
      variant="om"
      logoUrl={logoUrl}
      authError={authError}
      oauthNext="/om"
    />
  );
}
