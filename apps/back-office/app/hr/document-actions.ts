'use server';

import { revalidatePath } from 'next/cache';

import {
  isHrDocumentType,
  type HrDocumentType,
} from '../../../../packages/supabase/employee-hr-documents';
import {
  createSupabaseServerClient,
  createSupabaseServiceClient,
} from '../../../../packages/supabase/server';
import { assertMnrEditAllowed } from '../../lib/executive-rank-guard';
import {
  assertHrPortalEditor,
  fetchBackOfficeUserProfile,
} from '../../lib/hr-portal-access-server';
import { uploadCompressedEmployeeHrDocument } from '../../lib/hr-document-upload';

async function requireHrEditorForEmployee(employeeId: string) {
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

  const service = createSupabaseServiceClient();
  const { data: employee, error: employeeError } = await service
    .from('employees')
    .select('rank')
    .eq('id', employeeId)
    .maybeSingle();

  if (employeeError || !employee) {
    throw new Error('Employee not found.');
  }

  assertMnrEditAllowed({
    editorRole: profile.role,
    employeeRank: typeof employee.rank === 'string' ? employee.rank : null,
  });

  return supabase;
}

export async function uploadEmployeeHrDocument(
  employeeId: string,
  docType: string,
  formData: FormData,
): Promise<{
  success: boolean;
  url?: string;
  storedBytes?: number;
  originalBytes?: number;
  error?: string;
}> {
  if (!isHrDocumentType(docType)) {
    return { success: false, error: 'Invalid document type.' };
  }

  const file = formData.get('file');
  if (!(file instanceof File)) {
    return { success: false, error: 'Choose a file to upload.' };
  }

  try {
    await requireHrEditorForEmployee(employeeId);
    const service = createSupabaseServiceClient();
    const result = await uploadCompressedEmployeeHrDocument(
      service,
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
