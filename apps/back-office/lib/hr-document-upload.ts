import type { SupabaseClient } from '@supabase/supabase-js';

import {
  HR_DOCUMENT_META,
  HR_DOCUMENT_TYPES,
  uploadEmployeeHrDocumentBuffer,
  type HrDocumentType,
} from '../../../packages/supabase/employee-hr-documents';
import { compressHrDocumentBuffer } from './hr-document-compress-server';
import { shouldApplyOfficeCopyWatermark } from './identity-document-watermark';

export type HrDocumentUploadFailure = {
  docType: HrDocumentType;
  error: string;
};

export type HrDocumentUploadBatchResult = {
  uploaded: HrDocumentType[];
  failed: HrDocumentUploadFailure[];
};

export function formatHrDocumentUploadWarning(
  result: HrDocumentUploadBatchResult,
): string | undefined {
  if (result.failed.length === 0) return undefined;
  const labels = result.failed.map(
    (entry) => HR_DOCUMENT_META[entry.docType]?.label ?? entry.docType,
  );
  return `Employee was saved to Master Nominal Roll, but ${result.failed.length} document(s) failed to upload (${labels.join(', ')}). Open MNR → Documents to attach them.`;
}

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
): Promise<HrDocumentUploadBatchResult> {
  const uploaded: HrDocumentType[] = [];
  const failed: HrDocumentUploadFailure[] = [];

  for (const docType of HR_DOCUMENT_TYPES) {
    const file = formData.get(`hr_doc_${docType}`);
    if (!(file instanceof File) || file.size === 0) continue;

    try {
      const result = await uploadCompressedEmployeeHrDocument(
        supabase,
        employeeId,
        docType,
        file,
      );
      if (result.success) {
        uploaded.push(docType);
      } else {
        failed.push({
          docType,
          error: result.error ?? 'Upload failed.',
        });
      }
    } catch (err) {
      failed.push({
        docType,
        error: err instanceof Error ? err.message : 'Upload failed.',
      });
    }
  }

  return { uploaded, failed };
}
