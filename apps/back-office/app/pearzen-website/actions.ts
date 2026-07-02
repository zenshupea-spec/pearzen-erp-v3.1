'use server';

import { revalidatePath } from 'next/cache';

import { isForgeOperatorEmail } from '../../lib/forge-access';
import {
  fetchPearzenWebsiteContent,
  savePearzenWebsiteContent as persistPearzenWebsiteContent,
} from '../../lib/pearzen-website-data';
import type { PearzenWebsiteContent } from '../../lib/pearzen-website-types';
import { createSupabaseServerClient } from '../../../../packages/supabase/server';

export async function getPearzenWebsitePageData(): Promise<{
  content: PearzenWebsiteContent;
  canEdit: boolean;
}> {
  const content = await fetchPearzenWebsiteContent();

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { content, canEdit: false };
  }

  const canEdit = await isForgeOperatorEmail(user.email);
  return { content, canEdit };
}

export async function savePearzenWebsiteContent(
  content: PearzenWebsiteContent,
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return { success: false, error: 'Please sign in again to save changes.' };
  }

  if (!(await isForgeOperatorEmail(user.email))) {
    return { success: false, error: 'You do not have permission to edit this website.' };
  }

  const result = await persistPearzenWebsiteContent(content);
  if (result.success) {
    revalidatePath('/pearzen-website', 'layout');
    revalidatePath('/forge');
  }
  return result;
}
