/** Shared HR document compression helpers (client + server safe utilities). */

export const HR_DOC_TARGET_MAX_BYTES = 1_500_000;
export const HR_DOC_MAX_EDGE_PX = 2400;
export const HR_DOC_JPEG_QUALITY_START = 88;
export const HR_DOC_JPEG_QUALITY_MIN = 72;

export type HrDocumentCompressionResult = {
  buffer: Buffer;
  contentType: string;
  ext: string;
  originalBytes: number;
  compressedBytes: number;
};

export function formatHrDocumentBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10_240 ? 1 : 0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function hrDocumentFileName(docType: string, ext: string): string {
  return `${docType}.${ext}`;
}
