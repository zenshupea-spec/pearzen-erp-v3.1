'use server';

import { createSupabaseServerClient } from '../../../../../packages/supabase/server';
import { revalidatePath } from 'next/cache';

export async function processAdvance(
  formData: FormData
): Promise<{ success: true } | { success: false; error: string }> {
  const supabase = await createSupabaseServerClient();

  const advanceId = formData.get('advanceId') as string;
  const status = (formData.get('status') as string).toUpperCase(); // APPROVED or REJECTED

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase
    .from('salary_advances')
    .update({
      status: status,
      approved_by: user?.id,
    })
    .eq('id', advanceId);

  if (error) {
    console.error('❌ SUPABASE ERROR:', error.message);
    return { success: false, error: error.message };
  }

  revalidatePath('/fm/advances');
  return { success: true };
}

/** Use with `<form action={...}>` — Next requires void; delegates to `processAdvance`. */
export async function processAdvanceFormAction(formData: FormData): Promise<void> {
  const result = await processAdvance(formData);
  if (!result.success) {
    throw new Error(result.error);
  }
}
