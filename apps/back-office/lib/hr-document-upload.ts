import type { SupabaseClient } from '@supabase/supabase-js';

import {
  HR_DOCUMENT_TYPES,
  uploadEmployeeHrDocumentBuffer,
  type HrDocumentType,
} from '../../../packages/supabase/employee-hr-documents';
import { compressHrDocumentBuffer } from './hr-document-compress-server';
import { shouldApplyOfficeCopyWatermark } from './identity-document-watermark';

export async function uploadCompressedEmployeeHrDocument(
  supabase: SupabaseClient,
  employeeId: string,
  docType: HrDocumentType,
  file: File,
) {
  const originalBytes = file.size;
  const buffer = Buffer.from(await file.arrayBuffer());
  const compressed = await compressHrDocumentBuffer(buffer, file.type || 'application/octet-stream', {
    officeCopyWatermark: shouldApplyOfficeCopyWatermark(docType),
  });
  const result = await uploadEmployeeHrDocumentBuffer(supabase, employeeId, docType, {
    buffer: compressed.buffer,
    contentType: compressed.contentType,
    ext: compressed.ext,
    storedBytes: compressed.compressedBytes,
  });
  return {
    ...result,
    originalBytes,
    storedBytes: result.storedBytes ?? compressed.compressedBytes,
  };
}

export async function uploadCompressedEmployeeHrDocumentsFromForm(
  supabase: SupabaseClient,
  employeeId: string,
  formData: FormData,
): Promise<void> {
  for (const docType of HR_DOCUMENT_TYPES) {
    const file = formData.get(`hr_doc_${docType}`);
    if (file instanceof File && file.size > 0) {
      const result = await uploadCompressedEmployeeHrDocument(
        supabase,
        employeeId,
        docType,
        file,
      );
      if (!result.success) {
        console.error(`[HR] Document upload ${docType}:`, result.error);
      }
    }
  }
}
