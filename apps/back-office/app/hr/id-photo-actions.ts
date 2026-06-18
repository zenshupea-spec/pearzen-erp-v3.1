'use server';

import { revalidatePath } from 'next/cache';

import { uploadEmployeeIdPhotoFile } from '../../../../packages/supabase/employee-id-photo';
import {
  createSupabaseServerClient,
  createSupabaseServiceClient,
} from '../../../../packages/supabase/server';
import { assertMnrEditAllowed } from '../../lib/executive-rank-guard';
import {
  fetchBackOfficeUserProfile,
  isHrPortalEditor,
} from '../../lib/hr-portal-access-server';

async function assertCanUploadIdPhoto(
  employeeId: string,
): Promise<ReturnType<typeof createSupabaseServerClient>> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user?.email) {
    throw new Error('You must be signed in to upload an ID photo.');
  }

  const { data: employee, error: fetchError } = await supabase
    .from('employees')
    .select('email, rank')
    .eq('id', employeeId)
    .single();

  if (fetchError || !employee) {
    throw new Error('Employee not found.');
  }

  const employeeEmail =
    typeof employee.email === 'string' ? employee.email.trim().toLowerCase() : '';
  const isSelf = employeeEmail && user.email.trim().toLowerCase() === employeeEmail;

  if (isSelf) return supabase;

  const profile = await fetchBackOfficeUserProfile(supabase, user);
  if (!isHrPortalEditor(profile.role)) {
    throw new Error('Only HR, MD, OD, or FM can upload ID photos for other employees.');
  }

  assertMnrEditAllowed({
    editorRole: profile.role,
    employeeRank: employee.rank as string | undefined,
  });

  return supabase;
}

export async function uploadEmployeeIdPhoto(
  employeeId: string,
  formData: FormData,
): Promise<{ success: boolean; url?: string; error?: string }> {
  const file = formData.get('file');
  if (!(file instanceof File)) {
    return { success: false, error: 'Choose a photo to upload.' };
  }

  try {
    await assertCanUploadIdPhoto(employeeId);
    const service = createSupabaseServiceClient();
    const result = await uploadEmployeeIdPhotoFile(service, employeeId, file);
    if (result.success) {
      revalidatePath('/hr/mnr');
      revalidatePath('/hr');
      revalidatePath('/executive');
      revalidatePath('/om');
    }
    return result;
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Upload failed.',
    };
  }
}
