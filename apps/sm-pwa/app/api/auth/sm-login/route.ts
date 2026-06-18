import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createSupabaseServiceClient } from '../../../../../../packages/supabase/service';

export async function POST(req: NextRequest) {
  const { epfNumber, password } = await req.json() as { epfNumber: string; password: string };

  if (!epfNumber || !password) {
    return NextResponse.json({ error: 'EPF and password required.' }, { status: 400 });
  }

  const epf = epfNumber.toUpperCase().trim();

  // Collect cookies to forward to the response
  const pendingCookies: Array<{ name: string; value: string; options: Record<string, unknown> }> = [];

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return req.cookies.getAll(); },
        setAll(cookiesToSet) {
          pendingCookies.push(...cookiesToSet.map(c => ({ name: c.name, value: c.value, options: c.options as Record<string, unknown> })));
        },
      },
    }
  );

  // Verify employee is an active Sector Manager
  const { data: employee, error: empError } = await supabase
    .from('employees')
    .select('id, full_name, "group", status')
    .eq('emp_number', epf)
    .single();

  if (empError || !employee) {
    return NextResponse.json({ error: 'Invalid credentials.' }, { status: 401 });
  }

  if (employee.group !== 'SECTOR_MANAGER' || employee.status !== 'ACTIVE') {
    return NextResponse.json({ error: 'Access denied. Not an active Sector Manager.' }, { status: 403 });
  }

  // sm_portal_auth is service-role only until login; anon RLS would hide the row.
  const admin = createSupabaseServiceClient();
  const { data: authRecord } = await admin
    .from('sm_portal_auth')
    .select('needs_pin_setup, is_active, current_otp, otp_expires_at')
    .eq('epf_number', epf)
    .single();

  if (!authRecord || !authRecord.is_active) {
    return NextResponse.json(
      { error: 'Portal access not provisioned. Contact HR.' },
      { status: 403 }
    );
  }

  if (authRecord.needs_pin_setup) {
    if (
      !authRecord.current_otp ||
      password !== authRecord.current_otp ||
      !authRecord.otp_expires_at ||
      Date.now() >= new Date(String(authRecord.otp_expires_at)).getTime()
    ) {
      return NextResponse.json(
        { error: 'Invalid or expired OTP. Ask HR for a new one.' },
        { status: 401 },
      );
    }
  }

  // Attempt Supabase Auth sign-in
  const syntheticEmail = `${epf.toLowerCase()}@pearzen.sm`;
  const { error: authError } = await supabase.auth.signInWithPassword({
    email: syntheticEmail,
    password,
  });

  if (authError) {
    return NextResponse.json({ error: 'Invalid credentials.' }, { status: 401 });
  }

  // Update last_login_at
  await admin
    .from('sm_portal_auth')
    .update({ last_login_at: new Date().toISOString() })
    .eq('epf_number', epf);

  // Build response and attach auth cookies
  const json = NextResponse.json({
    success: true,
    needsPinSetup: authRecord.needs_pin_setup,
    smName: employee.full_name,
  });

  pendingCookies.forEach(({ name, value, options }) => {
    json.cookies.set(name, value, options as Parameters<typeof json.cookies.set>[2]);
  });

  return json;
}
