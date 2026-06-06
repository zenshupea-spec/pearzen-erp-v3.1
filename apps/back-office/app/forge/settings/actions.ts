'use server';

import { revalidatePath } from 'next/cache';

import { createSupabaseServerClient } from '../../../../../packages/supabase/server';
import { createSupabaseServiceClient } from '../../../../../packages/supabase/service';
import {
  getForgeOperatorEmails,
  isForgeOperatorEmail,
  normalizeForgeOperatorEmails,
} from '../../../lib/forge-access';

export async function fetchForgeOperatorEmails(): Promise<string[]> {
  return getForgeOperatorEmails();
}

export async function updateForgeOperatorEmails(
  email1: string,
  email2: string,
): Promise<{ success: true; emails: string[] } | { success: false; error: string }> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !(await isForgeOperatorEmail(user.email))) {
    return { success: false, error: 'You are not authorised to change Forge operator emails.' };
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
