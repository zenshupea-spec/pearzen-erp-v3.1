import type { SupabaseClient } from '@supabase/supabase-js';

export const EMPLOYEE_HR_DOCS_BUCKET = 'employee-hr-documents';
export const MAX_HR_DOC_BYTES = 2 * 1024 * 1024;

export const HR_DOCUMENT_TYPES = [
  'mod_clearance',
  'police_clearance',
  'grama_niladari',
  'education_certificate_ol',
  'birth_certificate',
  'servicemen_certificate',
  'nic_passport',
] as const;

export type HrDocumentType = (typeof HR_DOCUMENT_TYPES)[number];

export type HrDocumentMeta = {
  column: string;
  label: string;
  expiryColumn?: 'grama_niladari_expiry';
};

export const HR_DOCUMENT_META: Record<HrDocumentType, HrDocumentMeta> = {
  mod_clearance: {
    column: 'mod_clearance_url',
    label: 'MoD Clearance',
  },
  police_clearance: {
    column: 'police_clearance_url',
    label: 'Police Clearance',
  },
  grama_niladari: {
    column: 'grama_niladari_url',
    label: 'Grama Niladari Certificate',
    expiryColumn: 'grama_niladari_expiry',
  },
  education_certificate_ol: {
    column: 'education_certificate_ol_url',
    label: 'Education Certificate (O/Ls)',
  },
  birth_certificate: {
    column: 'birth_certificate_url',
    label: 'Birth Certificate',
  },
  servicemen_certificate: {
    column: 'servicemen_certificate_url',
    label: 'Servicemen Certificate',
  },
  nic_passport: {
    column: 'nic_passport_doc_url',
    label: 'NIC / Passport',
  },
};

const MIME_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
};

function extensionForMime(mime: string): string | null {
  return MIME_EXT[mime] ?? null;
}

export function isHrDocumentType(value: string): value is HrDocumentType {
  return (HR_DOCUMENT_TYPES as readonly string[]).includes(value);
}

export async function uploadEmployeeHrDocumentBuffer(
  supabase: SupabaseClient,
  employeeId: string,
  docType: HrDocumentType,
  args: {
    buffer: Buffer;
    contentType: string;
    ext: string;
    storedBytes: number;
  },
): Promise<{ success: boolean; url?: string; storedBytes?: number; error?: string }> {
  if (!employeeId?.trim()) {
    return { success: false, error: 'Employee id is required.' };
  }
  if (!args.buffer?.length) {
    return { success: false, error: 'Choose a file to upload.' };
  }
  if (args.storedBytes > MAX_HR_DOC_BYTES) {
    return { success: false, error: 'File must be 2MB or smaller after compression.' };
  }

  const meta = HR_DOCUMENT_META[docType];
  const path = `${employeeId}/${docType}.${args.ext}`;

  const { error: uploadError } = await supabase.storage
    .from(EMPLOYEE_HR_DOCS_BUCKET)
    .upload(path, args.buffer, {
      contentType: args.contentType,
      upsert: true,
    });

  if (uploadError) {
    return { success: false, error: uploadError.message };
  }

  const { data } = supabase.storage.from(EMPLOYEE_HR_DOCS_BUCKET).getPublicUrl(path);
  const publicUrl = data.publicUrl;

  const { error: updateError } = await supabase
    .from('employees')
    .update({ [meta.column]: publicUrl })
    .eq('id', employeeId);

  if (updateError) {
    return { success: false, error: updateError.message };
  }

  return { success: true, url: publicUrl, storedBytes: args.storedBytes };
}

export async function uploadEmployeeHrDocumentFile(
  supabase: SupabaseClient,
  employeeId: string,
  docType: HrDocumentType,
  file: File,
): Promise<{ success: boolean; url?: string; storedBytes?: number; error?: string }> {
  if (!employeeId?.trim()) {
    return { success: false, error: 'Employee id is required.' };
  }
  if (!file || file.size === 0) {
    return { success: false, error: 'Choose a file to upload.' };
  }
  if (file.size > MAX_HR_DOC_BYTES) {
    return { success: false, error: 'File must be 2MB or smaller.' };
  }

  const mime = file.type || 'application/octet-stream';
  const ext = extensionForMime(mime);
  if (!ext) {
    return {
      success: false,
      error: 'Use PDF, JPEG, PNG, or WebP.',
    };
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  return uploadEmployeeHrDocumentBuffer(supabase, employeeId, docType, {
    buffer,
    contentType: mime,
    ext,
    storedBytes: buffer.length,
  });
}

export async function uploadEmployeeHrDocumentsFromForm(
  supabase: SupabaseClient,
  employeeId: string,
  formData: FormData,
): Promise<void> {
  for (const docType of HR_DOCUMENT_TYPES) {
    const file = formData.get(`hr_doc_${docType}`);
    if (file instanceof File && file.size > 0) {
      const result = await uploadEmployeeHrDocumentFile(supabase, employeeId, docType, file);
      if (!result.success) {
        console.error(`[HR] Document upload ${docType}:`, result.error);
      }
    }
  }
}
