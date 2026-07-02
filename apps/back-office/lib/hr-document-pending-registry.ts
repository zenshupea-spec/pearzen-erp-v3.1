'use client';

import {
  HR_DOCUMENT_TYPES,
  type HrDocumentType,
} from '../../../packages/supabase/employee-hr-documents';

const pending = new Map<HrDocumentType, File>();

export function setPendingHrDocument(docType: HrDocumentType, file: File) {
  pending.set(docType, file);
}

export function clearPendingHrDocument(docType: HrDocumentType) {
  pending.delete(docType);
}

export function clearAllPendingHrDocuments() {
  pending.clear();
}

export function getPendingHrDocument(docType: HrDocumentType): File | undefined {
  return pending.get(docType);
}

/** Inject compressed induction files — avoids Safari dropping DataTransfer file-input values. */
export function mergePendingHrDocumentsIntoFormData(formData: FormData) {
  for (const docType of HR_DOCUMENT_TYPES) {
    const file = pending.get(docType);
    if (file && file.size > 0) {
      formData.set(`hr_doc_${docType}`, file, file.name);
    }
  }
}
