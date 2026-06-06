'use server';

import { revalidatePath } from 'next/cache';

import {
  isHrDocumentType,
  uploadEmployeeHrDocumentFile,
  type HrDocumentType,
} from '../../../../packages/supabase/employee-hr-documents';
import { createSupabaseServerClient } from '../../../../packages/supabase/server';
import {
  assertHrPortalEditor,
  fetchBackOfficeUserProfile,
} from '../../lib/hr-portal-access';

async function requireHrEditor() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new Error('You must be signed in to upload documents.');
  }

  const profile = await fetchBackOfficeUserProfile(supabase, user);
  assertHrPortalEditor(profile.role);

  return supabase;
}

export async function uploadEmployeeHrDocument(
  employeeId: string,
  docType: string,
  formData: FormData,
): Promise<{ success: boolean; url?: string; error?: string }> {
  if (!isHrDocumentType(docType)) {
    return { success: false, error: 'Invalid document type.' };
  }

  const file = formData.get('file');
  if (!(file instanceof File)) {
    return { success: false, error: 'Choose a file to upload.' };
  }

  try {
    const supabase = await requireHrEditor();
    const result = await uploadEmployeeHrDocumentFile(
      supabase,
      employeeId,
      docType as HrDocumentType,
      file,
    );
    if (result.success) {
      revalidatePath('/hr/mnr');
      revalidatePath('/hr/onboarding');
    }
    return result;
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Upload failed.',
    };
  }
}
