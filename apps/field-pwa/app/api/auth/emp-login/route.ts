import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

import { createSupabaseRouteClient } from "../../../../../../packages/supabase/route";

type EmpLoginBody = {
  empNumber?: string;
};

function templateValue(template: string, empNumber: string) {
  return template.replaceAll("{{empNumber}}", empNumber);
}

export async function POST(request: Request) {
  const nextRequest = request as NextRequest;
  const body = (await nextRequest.json().catch(() => ({}))) as EmpLoginBody;
  const empNumber = String(body.empNumber ?? "").trim().toUpperCase();

  if (!empNumber) {
    return NextResponse.json(
      { error: "EMP_NUMBER_REQUIRED" },
      { status: 400 }
    );
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    return NextResponse.json(
      { error: "SUPABASE_SERVICE_ROLE_KEY_MISSING" },
      { status: 500 }
    );
  }

  // Build a response object up front so Supabase can write session cookies.
  const response = NextResponse.json({ ok: true });
  const supabase = createSupabaseRouteClient(nextRequest, response);

  // 1) Validate EMP number exists in your `users` table and is ACTIVE.
  const lookupClient = createClient(supabaseUrl, serviceRoleKey);

  const { data: userRow, error: lookupError } = await lookupClient
    .from("users")
    .select("status")
    .eq("emp_number", empNumber)
    .maybeSingle();

  if (lookupError) {
    return NextResponse.json(
      { error: "EMP_LOOKUP_FAILED" },
      { status: 500 }
    );
  }

  if (!userRow) {
    return NextResponse.json({ error: "EMP_NOT_FOUND" }, { status: 404 });
  }

  const status = (userRow as { status?: unknown } | null)?.status;
  if (status !== "ACTIVE") {
    return NextResponse.json({ error: "EMP_NOT_ACTIVE" }, { status: 403 });
  }

  // 2) Derive Supabase Auth credentials.
  // Guard provides only EMP number; we derive the dummy email server-side.
  const derivedEmail = `${empNumber}@pearzen.local`;

  // Password is derived using server-managed env config.
  const derivedPassword =
    process.env.FIELD_PWA_AUTH_PASSWORD ??
    (process.env.FIELD_PWA_AUTH_PASSWORD_TEMPLATE
      ? templateValue(process.env.FIELD_PWA_AUTH_PASSWORD_TEMPLATE, empNumber)
      : null);

  if (!derivedPassword) {
    return NextResponse.json(
      { error: "FIELD_PWA_AUTH_PASSWORD_NOT_CONFIGURED" },
      { status: 500 }
    );
  }

  // 3) Sign in to Supabase Auth using the service-role key.
  // We then copy the session into the cookie-writing client so the browser
  // receives an authenticated session.
  const serviceRoleAuthClient = createClient(supabaseUrl, serviceRoleKey);
  const { data: signInData, error: signInError } =
    await serviceRoleAuthClient.auth.signInWithPassword({
      email: derivedEmail,
      password: derivedPassword,
    });

  if (signInError || !signInData?.session) {
    return NextResponse.json(
      { error: signInError?.message ?? "SUPABASE_SIGN_IN_FAILED" },
      { status: 401 }
    );
  }

  const { error: setSessionError } = await supabase.auth.setSession({
    access_token: signInData.session.access_token,
    refresh_token: signInData.session.refresh_token,
  });

  if (setSessionError) {
    return NextResponse.json(
      { error: setSessionError.message },
      { status: 500 }
    );
  }

  return response;
}

