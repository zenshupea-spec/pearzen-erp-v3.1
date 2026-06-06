import { NextRequest, NextResponse } from "next/server";

import { createSupabaseRouteClient } from "../../../../../packages/supabase/route";
import { isForgeOperatorEmail } from "../../../lib/forge-access";

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);

  const code = requestUrl.searchParams.get("code");
  const nextParam = requestUrl.searchParams.get("next") ?? "/";

  // Ensure `next` is a safe, local path.
  const nextPath = nextParam.startsWith("/") ? nextParam : "/";
  const oauthErrorPath = nextPath.startsWith("/forge")
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
      if (nextPath.startsWith("/forge")) {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!(await isForgeOperatorEmail(user?.email))) {
          await supabase.auth.signOut();
          return NextResponse.redirect(
            `${requestUrl.origin}/login/forge?error=forge_denied`,
          );
        }
      }

      return response;
    }
  }

  return NextResponse.redirect(
    `${requestUrl.origin}${oauthErrorPath}?error=oauth_failed`,
  );
}

