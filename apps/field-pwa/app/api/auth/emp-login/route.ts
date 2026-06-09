import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseRouteClient } from "../../../../../../packages/supabase/route";
import {
  authLocalPartsForEmployee,
  canonicalEpfFromEmployee,
  epfAuthLocalPart,
  fieldPwaAuthEmail,
  fieldPwaAuthPassword,
  findEmployeeByEpf,
  isEmployeeActive,
  normalizeEpfNo,
  provisionGuardPortalAuth,
} from "../../../../lib/guard-auth";

type EmpLoginBody = {
  epfNo?: string;
  /** @deprecated Use epfNo */
  empNumber?: string;
};

export async function POST(request: Request) {
  const nextRequest = request as NextRequest;
  const body = (await nextRequest.json().catch(() => ({}))) as EmpLoginBody;
  const epfInput = normalizeEpfNo(
    String(body.epfNo ?? body.empNumber ?? ""),
  );

  if (!epfInput) {
    return NextResponse.json({ error: "EPF_NO_REQUIRED" }, { status: 400 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY_MISSING" }, { status: 500 });
  }

  const lookupClient = createClient(supabaseUrl, serviceRoleKey);
  const employee = await findEmployeeByEpf(lookupClient, epfInput);

  if (!employee) {
    return NextResponse.json({ error: "EPF_NOT_FOUND" }, { status: 404 });
  }

  if (!isEmployeeActive(employee)) {
    return NextResponse.json({ error: "EMP_NOT_ACTIVE" }, { status: 403 });
  }

  const canonicalEpf = canonicalEpfFromEmployee(employee) || epfInput;
  const provision = await provisionGuardPortalAuth(lookupClient, employee);
  if (!provision.ok) {
    return NextResponse.json({ error: provision.error }, { status: 500 });
  }

  const authParts = authLocalPartsForEmployee(employee);

  const response = NextResponse.json({ ok: true });
  const supabase = createSupabaseRouteClient(nextRequest, response);
  const serviceRoleAuthClient = createClient(supabaseUrl, serviceRoleKey);

  let lastError: string | null = null;
  for (const localPart of authParts) {
    const email = fieldPwaAuthEmail(
      localPart === epfAuthLocalPart(canonicalEpf) ? canonicalEpf : localPart,
    );
    const passwordKey =
      localPart === epfAuthLocalPart(canonicalEpf)
        ? canonicalEpf
        : String(employee.emp_number ?? "").trim().toUpperCase();
    const password = fieldPwaAuthPassword(passwordKey);

    const { data: signInData, error: signInError } =
      await serviceRoleAuthClient.auth.signInWithPassword({
        email,
        password,
      });

    if (!signInError && signInData?.session) {
      const { error: setSessionError } = await supabase.auth.setSession({
        access_token: signInData.session.access_token,
        refresh_token: signInData.session.refresh_token,
      });

      if (setSessionError) {
        console.error("SESSION WRITE ERROR:", setSessionError);
        return NextResponse.json({ error: setSessionError.message }, { status: 500 });
      }

      return response;
    }
    lastError = signInError?.message ?? "SUPABASE_SIGN_IN_FAILED";
  }

  console.error("AUTH SIGN IN ERROR:", lastError);
  return NextResponse.json(
    { error: lastError ?? "SUPABASE_SIGN_IN_FAILED" },
    { status: 401 },
  );
}
