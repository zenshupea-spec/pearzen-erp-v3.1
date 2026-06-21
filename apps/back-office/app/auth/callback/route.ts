import { NextRequest, NextResponse } from "next/server";

import { createSupabaseRouteClient } from "../../../../../packages/supabase/route";
import { maybeCreateSessionChallengeAfterLogin } from "../../actions/portal-session-actions";
import {
  clearPortal2faSessionCookies,
} from "../../../lib/head-office-portal-auth";
import { isForgeOperatorEmail } from "../../../lib/forge-access";
import { assertForgeOperatorCanSignIn } from "../../../lib/forge-portal-auth";
import {
  assertPartnerCanSignIn,
  ensurePartnerUserLink,
  partnerLoginErrorCode,
  resolvePartnerPortalEntryPath,
} from "../../../lib/partner-portal-auth";
import { isOdRank } from "../../../lib/head-office-portal-lockout";
import { fetchBackOfficeUserProfile } from "../../../lib/hr-portal-access-server";
import { recordPortalLoginEvent } from "../../../lib/portal-login-events";

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
  const nextParam = requestUrl.searchParams.get("next") ?? "/";

  // Ensure `next` is a safe, local path.
  const nextPath = nextParam.startsWith("/") ? nextParam : "/";
  const oauthErrorPath = nextPath.startsWith("/partners")
    ? "/login/partners"
    : nextPath.startsWith("/forge")
    ? "/login/forge"
    : "/login/head-office";

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

      if (nextPath.startsWith("/forge")) {
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

          let pendingChallengeId: string | null = null;
          if (sessionId && user.id) {
            pendingChallengeId = await maybeCreateForgeSessionChallengeAfterLogin(
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

          if (pendingChallengeId) {
            const challengeUrl = new URL(
              "/login/forge/await-session",
              requestUrl.origin,
            );
            challengeUrl.searchParams.set("pending", pendingChallengeId);
            const challengeResponse = NextResponse.redirect(challengeUrl);
            await attachForgeLoginCookies(challengeResponse);
            return challengeResponse;
          }

          const loginResponse = NextResponse.redirect(
            `${requestUrl.origin}/login/forge`,
          );
          await attachForgeLoginCookies(loginResponse);
          return loginResponse;
        }
      } else {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        const profile = user
          ? await fetchBackOfficeUserProfile(supabase, user)
          : { role: null, full_name: null, id_photo_url: null };

        if (!isOdRank(profile.role)) {
          await supabase.auth.signOut();
          return NextResponse.redirect(
            `${requestUrl.origin}${oauthErrorPath}?error=google_od_only`,
          );
        }

        const {
          data: { session },
        } = await supabase.auth.getSession();
        const sessionId = session?.access_token
          ? decodeAccessTokenSessionId(session.access_token)
          : null;
        const employeeId = profile.employeeId ?? null;

        await recordPortalLoginEvent({
          employeeId,
          portalAuthEmail: user?.email ?? null,
          eventType: "google_login_success",
          success: true,
        });

        let pendingChallengeId: string | null = null;
        if (sessionId && user?.id && employeeId) {
          pendingChallengeId = await maybeCreateSessionChallengeAfterLogin(
            employeeId,
            user.id,
            sessionId,
          );
        }

        if (pendingChallengeId) {
          const challengeUrl = new URL("/login/await-session", requestUrl.origin);
          challengeUrl.searchParams.set("pending", pendingChallengeId);
          challengeUrl.searchParams.set("next", nextPath);
          return NextResponse.redirect(challengeUrl);
        }

        clearPortal2faSessionCookies(response);
      }

      return response;
    }
  }

  return NextResponse.redirect(
    `${requestUrl.origin}${oauthErrorPath}?error=oauth_failed`,
  );
}
