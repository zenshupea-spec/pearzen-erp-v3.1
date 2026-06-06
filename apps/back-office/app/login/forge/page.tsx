import { redirect } from "next/navigation";

import { getCompanyLogoUrl } from "../../../../../packages/supabase/company-branding";
import { createSupabaseServerClient } from "../../../../../packages/supabase/server";
import { isForgeOperatorEmail } from "../../../lib/forge-access";

import LoginShell from "../LoginShell";

const LOGIN_ERRORS: Record<string, string> = {
  oauth_failed: "Google sign-in failed. Please try again.",
  forge_denied:
    "This Google account is not authorised for SaaS Forge. Contact the platform operator.",
};

export default async function ForgeLoginPage({
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

  if (user && (await isForgeOperatorEmail(user.email))) {
    redirect("/forge");
  }

  const logoUrl = await getCompanyLogoUrl();

  return (
    <LoginShell
      variant="forge"
      logoUrl={logoUrl}
      authError={authError}
      oauthNext="/forge"
    />
  );
}
