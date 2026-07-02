import type { SupabaseClient } from '@supabase/supabase-js';

import {
  EMPLOYEE_HR_DOCS_BUCKET,
  MAX_HR_DOC_BYTES,
} from '../../../packages/supabase/employee-hr-documents';
import { compressHrDocumentBuffer } from './hr-document-compress-server';
import type { OffboardingLetterIndex } from './offboarding-letters/types';
import { OFFBOARDING_LETTER_INDEXES } from './offboarding-letters/types';

export { EMPLOYEE_HR_DOCS_BUCKET as OFFBOARDING_LETTER_BUCKET };

const MIME_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
};

export const OFFBOARDING_LETTER_DOC_REF_PREFIX = 'hr-doc:';

export function encodeOffboardingLetterDocRef(storagePath: string): string {
  return `${OFFBOARDING_LETTER_DOC_REF_PREFIX}${storagePath.trim()}`;
}

/** Returns storage object path, or null when the value is a legacy public URL. */
export function decodeOffboardingLetterDocRef(
  storedRef: string | null | undefined,
): string | null {
  if (!storedRef?.trim()) return null;
  const trimmed = storedRef.trim();
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    const marker = '/employee-hr-documents/';
    const idx = trimmed.indexOf(marker);
    if (idx >= 0) {
      return trimmed.slice(idx + marker.length).split('?')[0] ?? null;
    }
    return null;
  }
  if (trimmed.startsWith(OFFBOARDING_LETTER_DOC_REF_PREFIX)) {
    return trimmed.slice(OFFBOARDING_LETTER_DOC_REF_PREFIX.length);
  }
  return trimmed;
}

export async function resolveOffboardingLetterDocumentUrl(
  supabase: SupabaseClient,
  storedRef: string | null | undefined,
): Promise<string | null> {
  if (!storedRef?.trim()) return null;
  const trimmed = storedRef.trim();
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return trimmed;
  }

  const path = decodeOffboardingLetterDocRef(trimmed);
  if (!path) return null;

  const { data: signed, error } = await supabase.storage
    .from(EMPLOYEE_HR_DOCS_BUCKET)
    .createSignedUrl(path, 60 * 60);

  if (!error && signed?.signedUrl) {
    return signed.signedUrl;
  }

  const { data: publicData } = supabase.storage
    .from(EMPLOYEE_HR_DOCS_BUCKET)
    .getPublicUrl(path);
  return publicData.publicUrl ?? null;
}

function fileFromFormDataEntry(entry: FormDataEntryValue | null): File | null {
  if (entry instanceof File && entry.size > 0) return entry;
  if (entry instanceof Blob && entry.size > 0) {
    const type = entry.type || 'application/octet-stream';
    return new File([entry], 'warning-letter-upload', { type });
  }
  return null;
}

export function offboardingLetterFileFromFormData(
  formData?: FormData,
): File | null {
  if (!formData) return null;
  return fileFromFormDataEntry(formData.get('file'));
}

export function isOffboardingLetterIndex(value: number): value is OffboardingLetterIndex {
  return (OFFBOARDING_LETTER_INDEXES as readonly number[]).includes(value);
}

export function buildOffboardingLetterStoragePath(
  companyId: string,
  employeeId: string,
  letterIndex: OffboardingLetterIndex,
  ext: string,
): string {
  const company = companyId.trim();
  const employee = employeeId.trim();
  const extension = ext.replace(/^\./, '').toLowerCase();
  return `${company}/offboarding-letters/${employee}/letter-${letterIndex}.${extension}`;
}

export async function uploadOffboardingLetterDocument(
  supabase: SupabaseClient,
  args: {
    companyId: string;
    employeeId: string;
    letterIndex: OffboardingLetterIndex;
    file: File;
  },
): Promise<{
  success: boolean;
  url?: string;
  path?: string;
  storedBytes?: number;
  originalBytes?: number;
  error?: string;
}> {
  const { companyId, employeeId, letterIndex, file } = args;

  if (!companyId?.trim()) {
    return { success: false, error: 'Company id is required.' };
  }
  if (!employeeId?.trim()) {
    return { success: false, error: 'Employee id is required.' };
  }
  if (!isOffboardingLetterIndex(letterIndex)) {
    return { success: false, error: 'Letter index must be 1, 2, or 3.' };
  }
  if (!file || file.size === 0) {
    return { success: false, error: 'Choose a file to upload.' };
  }
  if (file.size > MAX_HR_DOC_BYTES) {
    return { success: false, error: 'File must be 2MB or smaller before compression.' };
  }

  const originalBytes = file.size;
  const mime = file.type || 'application/octet-stream';
  const rawExt = MIME_EXT[mime.toLowerCase()];
  if (!rawExt) {
    return { success: false, error: 'Use PDF, JPEG, PNG, or WebP.' };
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const compressed = await compressHrDocumentBuffer(buffer, mime);
    if (compressed.compressedBytes > MAX_HR_DOC_BYTES) {
      return {
        success: false,
        error: 'File must be 2MB or smaller after compression.',
      };
    }

    const path = buildOffboardingLetterStoragePath(
      companyId,
      employeeId,
      letterIndex,
      compressed.ext,
    );

    const { error: uploadError } = await supabase.storage
      .from(EMPLOYEE_HR_DOCS_BUCKET)
      .upload(path, compressed.buffer, {
        contentType: compressed.contentType,
        upsert: true,
      });

    if (uploadError) {
      return { success: false, error: uploadError.message };
    }

    return {
      success: true,
      url: encodeOffboardingLetterDocRef(path),
      path,
      storedBytes: compressed.compressedBytes,
      originalBytes,
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Upload failed.',
    };
  }
}
