import { redirect } from "next/navigation";

import { getCompanyLogoUrl } from "../../../../../packages/supabase/company-branding";
import { createSupabaseServerClient } from "../../../../../packages/supabase/server";
import { isForgeOperatorEmail } from "../../../lib/forge-access";
import { isForgeLocalDevRequest } from "../../../lib/forge-local-dev";
import {
  hasValidForgeGoogleSessionForUser,
  hasValidForgePasswordSessionForUser,
  resolveForgePortalEntryPath,
} from "../../../lib/forge-portal-auth";

import LoginShell from "../LoginShell";
import ForgeLoginForm from "./ForgeLoginForm";

const LOGIN_ERRORS: Record<string, string> = {
  oauth_failed: "Google sign-in failed. Please try again.",
  forge_denied:
    "This Google account is not authorised for SaaS Forge. Contact the platform operator.",
  forge_locked:
    "Forge sign-in is temporarily locked after too many failed attempts. Try again later.",
  daily_signout:
    "Your Forge session ended at midnight (Sri Lanka time). Sign in again to continue.",
  session_rejected:
    "Sign-in was rejected on your other device. Your password was reset — use Forgot password for a new temporary password.",
  signed_in_elsewhere:
    "You were signed out because your account was opened on another device.",
};

const LOGIN_MESSAGES: Record<string, string> = {
  sign_in_email_updated:
    "Sign-in email updated. Sign in with your new Google account.",
};

export default async function ForgeLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string }>;
}) {
  const params = await searchParams;
  const authError = params.error ? LOGIN_ERRORS[params.error] ?? null : null;
  const authMessage = params.message ? LOGIN_MESSAGES[params.message] ?? null : null;

  const localDevBypass = await isForgeLocalDevRequest();

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let googleVerified = localDevBypass;
  let operatorEmail: string | null = null;

  if (user?.email && (await isForgeOperatorEmail(user.email))) {
    operatorEmail = user.email;
    if (!localDevBypass) {
      googleVerified = await hasValidForgeGoogleSessionForUser(
        user.email,
        user.last_sign_in_at ?? null,
      );
    }

    const passwordVerified = await hasValidForgePasswordSessionForUser(
      user.email,
      user.last_sign_in_at ?? null,
    );

    const credentialsReady = localDevBypass
      ? passwordVerified
      : googleVerified && passwordVerified;

    if (credentialsReady) {
      redirect(
        localDevBypass
          ? "/forge"
          : await resolveForgePortalEntryPath(
              user.email,
              user.last_sign_in_at ?? null,
            ),
      );
    }
  }

  const logoUrl = await getCompanyLogoUrl();

  return (
    <>
      {authMessage ? (
        <div className="fixed inset-x-0 top-0 z-[100] border-b border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-center text-sm font-semibold text-emerald-800">
          {authMessage}
        </div>
      ) : null}
      <LoginShell
        variant="forge"
        logoUrl={logoUrl}
        authError={authError}
        oauthNext="/forge"
        forgeDevBypass={localDevBypass}
        forgeGoogleVerified={googleVerified}
        forgeOperatorEmail={operatorEmail}
        forgeEmailForm={
          <ForgeLoginForm
            disabled={!googleVerified && !localDevBypass}
            email={operatorEmail ?? ""}
            emailReadOnly={googleVerified && !localDevBypass}
          />
        }
      />
    </>
  );
}
