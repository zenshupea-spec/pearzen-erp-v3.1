'use server';

import { revalidatePath } from 'next/cache';

import { createSupabaseServerClient } from '../../../../../packages/supabase/server';
import { isForgeOperatorEmail } from '../../../lib/forge-access';
import {
  confirmForgeEmailChange,
  getForgeOperatorEmailProfile,
  requestForgeEmailChange,
  type ForgeEmailField,
} from '../../../lib/forge-portal-email-change';
import { clearForgePortalSessionCookies } from '../../../lib/forge-portal-auth';

async function assertForgeOperatorSession() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email || !(await isForgeOperatorEmail(user.email))) {
    return { error: 'Not authorised.' as const };
  }

  return {
    email: user.email.trim().toLowerCase(),
    authSignInAt: user.last_sign_in_at ?? null,
    supabase,
  };
}

export async function fetchForgeAccountEmailsAction() {
  const session = await assertForgeOperatorSession();
  if ('error' in session) return { error: session.error };

  const profile = await getForgeOperatorEmailProfile(session.email);
  return { profile };
}

export async function requestForgeEmailChangeAction(input: {
  field: ForgeEmailField;
  newEmail: string;
  password: string;
  totpCode: string;
}) {
  const session = await assertForgeOperatorSession();
  if ('error' in session) return { error: session.error };

  const result = await requestForgeEmailChange({
    operatorEmail: session.email,
    field: input.field,
    newEmail: input.newEmail,
    password: input.password,
    totpCode: input.totpCode,
  });

  if (!result.ok) {
    return { error: result.error ?? 'Could not start email change.' };
  }

  return {
    success: true as const,
    requiresOldCode: result.requiresOldCode ?? false,
  };
}

export async function confirmForgeEmailChangeAction(input: {
  field: ForgeEmailField;
  newEmail: string;
  newCode: string;
  oldCode?: string;
}) {
  const session = await assertForgeOperatorSession();
  if ('error' in session) return { error: session.error };

  const result = await confirmForgeEmailChange({
    operatorEmail: session.email,
    field: input.field,
    newEmail: input.newEmail,
    newCode: input.newCode,
    oldCode: input.oldCode,
  });

  if (!result.ok) {
    return { error: result.error ?? 'Could not confirm email change.' };
  }

  revalidatePath('/forge/settings');

  if (result.signOutRequired) {
    await clearForgePortalSessionCookies();
    await session.supabase.auth.signOut();
    return { success: true as const, signOutRequired: true as const };
  }

  return { success: true as const };
}
