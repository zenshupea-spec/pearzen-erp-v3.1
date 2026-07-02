import { NextRequest, NextResponse } from "next/server";

import { createSupabaseRouteClient } from "../../../../../packages/supabase/route";
import { isForgeOperatorEmail } from "../../../lib/forge-access";
import { assertForgeOperatorCanSignIn } from "../../../lib/forge-portal-auth";
import {
  assertPartnerCanSignIn,
  ensurePartnerUserLink,
  partnerLoginErrorCode,
  resolvePartnerPortalEntryPath,
} from "../../../lib/partner-portal-auth";
import {
  assertPearsWebsiteClientCanSignIn,
  pearsLoginErrorCode,
  resolvePearsProfileEntryPath,
} from "../../../lib/pears-website-client-auth";
import { isExecutivePortalRank } from "../../../lib/executive-portal-auth-policy";
import { fetchBackOfficeUserProfile } from "../../../lib/hr-portal-access-server";
import {
  isStaffPortalId,
  oauthErrorPathForCallback,
  resolveStaffPortalOAuthNext,
  shouldUseForgeOAuthFlow,
} from "../../../lib/portal-oauth";

function decodeAccessTokenSessionId(accessToken: string): string | null {
  try {
    const payload = JSON.parse(
      Buffer.from(accessToken.split(".")[1], "base64url").toString("utf8"),
    ) as { session_id?: unknown };
    return typeof payload.session_id === "string" ? payload.session_id : null;
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);

  const code = requestUrl.searchParams.get("code");
  const portalParam = requestUrl.searchParams.get("portal");
  const staffPortal = isStaffPortalId(portalParam) ? portalParam : null;
  const nextPath = resolveStaffPortalOAuthNext(
    requestUrl.searchParams.get("next"),
    staffPortal,
  );
  const oauthErrorPath = oauthErrorPathForCallback(nextPath, staffPortal);

  if (code) {
    // Create the redirect response up front so cookie writes from Supabase
    // have a target response to attach to.
    const response = NextResponse.redirect(
      `${requestUrl.origin}${nextPath}`
    );

    const supabase = createSupabaseRouteClient(request, response);
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      if (nextPath.startsWith("/partners")) {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        const partnerGate = await assertPartnerCanSignIn(user?.email);
        if (!partnerGate.ok || !user?.id || !user.email) {
          await supabase.auth.signOut();
          const reason =
            !user?.email ? 'missing_email' : partnerGate.ok ? 'not_provisioned' : partnerGate.reason;
          return NextResponse.redirect(
            `${requestUrl.origin}/login/partners?error=${partnerLoginErrorCode(reason)}`,
          );
        }

        await ensurePartnerUserLink(user.email, user.id);

        const landing = await resolvePartnerPortalEntryPath(user.email);
        if (landing !== nextPath) {
          return NextResponse.redirect(`${requestUrl.origin}${landing}`);
        }

        return response;
      }

      if (nextPath.startsWith("/pears")) {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        const pearsGate = await assertPearsWebsiteClientCanSignIn(user?.email);
        if (!pearsGate.ok || !user?.email) {
          await supabase.auth.signOut();
          const reason = !user?.email ? 'missing_email' : pearsGate.reason;
          return NextResponse.redirect(
            `${requestUrl.origin}/login/pears?error=${pearsLoginErrorCode(reason)}`,
          );
        }

        const landing = await resolvePearsProfileEntryPath(user.email);
        if (landing !== nextPath) {
          return NextResponse.redirect(`${requestUrl.origin}${landing}`);
        }

        return response;
      }

      if (nextPath.startsWith("/forge") && shouldUseForgeOAuthFlow(nextPath, staffPortal)) {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        const forgeGate = await assertForgeOperatorCanSignIn(user?.email);
        if (!forgeGate.ok) {
          await supabase.auth.signOut();
          return NextResponse.redirect(
            `${requestUrl.origin}/login/forge?error=forge_denied`,
          );
        }

        if (!(await isForgeOperatorEmail(user?.email))) {
          await supabase.auth.signOut();
          return NextResponse.redirect(
            `${requestUrl.origin}/login/forge?error=forge_denied`,
          );
        }

        if (user?.email) {
          const {
            ensureForgePortalAuthRecord,
            clearForgePortalSessionCookiesOnResponse,
            attachForgeSetupSessionCookie,
            attachForgeGoogleSessionCookie,
            getForgePortalAuthRecord,
          } = await import("../../../lib/forge-portal-auth");
          const { maybeCreateForgeSessionChallengeAfterLogin } = await import(
            "../../../lib/forge-login-continue"
          );
          await ensureForgePortalAuthRecord(user.email);
          const record = await getForgePortalAuthRecord(user.email);
          const isFirstTimeSetup =
            record?.needs_pin_setup || !record?.pin_hash;

          const {
            data: { session },
          } = await supabase.auth.getSession();
          const sessionId = session?.access_token
            ? decodeAccessTokenSessionId(session.access_token)
            : null;

          if (sessionId && user.id) {
            await maybeCreateForgeSessionChallengeAfterLogin(
              user.email,
              user.id,
              sessionId,
            );
          }

          const attachForgeLoginCookies = async (
            target: NextResponse,
          ): Promise<void> => {
            clearForgePortalSessionCookiesOnResponse(target);
            await attachForgeGoogleSessionCookie(
              target,
              user.email!,
              user.last_sign_in_at ?? null,
            );
            if (isFirstTimeSetup) {
              await attachForgeSetupSessionCookie(target, user.email!);
            }
          };

          const loginResponse = NextResponse.redirect(
            `${requestUrl.origin}/login/forge`,
          );
          await attachForgeLoginCookies(loginResponse);
          return loginResponse;
        }
      } else {
        if (staffPortal === "md") {
          await supabase.auth.signOut();
          return NextResponse.redirect(
            `${requestUrl.origin}/login/md?error=google_disabled`,
          );
        }

        const {
          data: { user },
        } = await supabase.auth.getUser();

        const profile = user
          ? await fetchBackOfficeUserProfile(supabase, user)
          : { role: null, full_name: null, id_photo_url: null, employeeId: null };

        if (isExecutivePortalRank(profile.role)) {
          await supabase.auth.signOut();
          return NextResponse.redirect(
            `${requestUrl.origin}/login/md?error=google_disabled`,
          );
        }

        await supabase.auth.signOut();
        return NextResponse.redirect(
          `${requestUrl.origin}${oauthErrorPath}?error=google_disabled`,
        );
      }

      return response;
    }
  }

  return NextResponse.redirect(
    `${requestUrl.origin}${oauthErrorPath}?error=oauth_failed`,
  );
}
