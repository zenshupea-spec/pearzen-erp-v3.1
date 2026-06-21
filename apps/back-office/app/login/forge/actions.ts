'use server';

import {
  assertForgeOperatorCanSignIn,
  ensureForgePortalAuthRecord,
  hasValidForgeGoogleSessionForUser,
  setForgePasswordSessionCookies,
  syncForgeSupabaseAuthPassword,
} from '../../../lib/forge-portal-auth';
import { continueForgeLoginAfterAuth } from '../../../lib/forge-login-continue';
import { isForgeOperatorEmail } from '../../../lib/forge-access';
import { createSupabaseServerClient } from '../../../../../packages/supabase/server';

export async function authenticateForgeOperator(input: {
  email: string;
  password: string;
}): Promise<{ error?: string }> {
  const email = input.email.trim().toLowerCase();
  const password = input.password;

  if (!email || !password) {
    return { error: 'Email and password are required.' };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) {
    return { error: 'Complete Google sign-in first.' };
  }

  if (user.email.trim().toLowerCase() !== email) {
    return { error: 'Operator email must match your Google account.' };
  }

  if (!(await isForgeOperatorEmail(email))) {
    return { error: 'This account is not authorised for SaaS Forge.' };
  }

  if (
    !(await hasValidForgeGoogleSessionForUser(
      email,
      user.last_sign_in_at ?? null,
    ))
  ) {
    return { error: 'Complete Google sign-in first.' };
  }

  const gate = await assertForgeOperatorCanSignIn(email);
  if (!gate.ok) {
    return { error: gate.error };
  }

  let { error } = await supabase.auth.signInWithPassword({ email, password });

  const record = await ensureForgePortalAuthRecord(email);
  if (error && record.needs_pin_setup && password.length === 30 && /^\d+$/.test(password)) {
    const sync = await syncForgeSupabaseAuthPassword(email, password);
    if (sync.ok) {
      ({ error } = await supabase.auth.signInWithPassword({ email, password }));
    }
  }

  if (error) {
    return { error: 'Invalid email or password.' };
  }

  await setForgePasswordSessionCookies(email, user.last_sign_in_at ?? null);
  await continueForgeLoginAfterAuth(email);
}
