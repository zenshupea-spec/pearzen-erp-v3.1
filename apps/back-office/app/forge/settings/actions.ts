'use server';

import { revalidatePath } from 'next/cache';

import { createSupabaseServerClient } from '../../../../../packages/supabase/server';
import { createSupabaseServiceClient } from '../../../../../packages/supabase/service';
import {
  getForgeOperatorEmails,
  isForgeOperatorEmail,
  normalizeForgeOperatorEmails,
} from '../../../lib/forge-access';
import { assertForgeOperator } from '../../../lib/forge-operator-server';
import {
  verifyForgePortalPin,
  verifyForgeTotpStepUp,
} from '../../../lib/forge-portal-auth';

export async function fetchForgeOperatorEmails(): Promise<string[]> {
  await assertForgeOperator();
  return getForgeOperatorEmails();
}

export async function updateForgeOperatorEmails(
  email1: string,
  email2: string,
  password: string,
  totpCode: string,
): Promise<{ success: true; emails: string[] } | { success: false; error: string }> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email || !(await isForgeOperatorEmail(user.email))) {
    return { success: false, error: 'You are not authorised to change Forge operator emails.' };
  }

  if (!password.trim()) {
    return { success: false, error: 'Enter your login password.' };
  }
  if (!/^\d{6}$/.test(totpCode.trim())) {
    return { success: false, error: 'Enter the 6-digit code from your authenticator.' };
  }

  const pin = await verifyForgePortalPin(user.email, password);
  if (!pin.ok) {
    return { success: false, error: pin.error ?? 'Invalid password.' };
  }

  const totp = await verifyForgeTotpStepUp(user.email, totpCode.trim());
  if (!totp.ok) {
    return { success: false, error: totp.error ?? 'Invalid authenticator code.' };
  }

  const emails = normalizeForgeOperatorEmails([email1, email2]);
  if (emails.length !== 2) {
    return { success: false, error: 'Enter exactly two valid operator email addresses.' };
  }

  const db = createSupabaseServiceClient();
  const { error } = await db.from('forge_settings').upsert(
    {
      singleton: true,
      operator_emails: emails,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'singleton' },
  );

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath('/login/forge');
  revalidatePath('/forge/settings');

  return { success: true, emails };
}
