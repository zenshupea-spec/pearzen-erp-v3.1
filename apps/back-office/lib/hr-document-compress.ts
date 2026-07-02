/** Shared HR document compression helpers (client + server safe utilities). */

/** Target stored size for HR vetting scans — hard cap is MAX_HR_DOC_BYTES (2 MB). */
export const HR_DOC_TARGET_MAX_BYTES = 1_950_000;
export const HR_DOC_MAX_EDGE_PX = 2400;
export const HR_DOC_JPEG_QUALITY_START = 88;
export const HR_DOC_JPEG_QUALITY_MIN = 72;

/** MNR ID photo — keep under 2MB for storage and server actions. */
export const ID_PHOTO_UPLOAD_MAX_BYTES = 2 * 1024 * 1024;
export const ID_PHOTO_TARGET_MAX_BYTES = 1_950_000;
export const ID_PHOTO_MAX_EDGE_PX = 1600;

/** Smaller targets for public careers uploads (3 images in one server action). */
export const CAREERS_DOC_TARGET_MAX_BYTES = 450_000;
export const CAREERS_DOC_MAX_EDGE_PX = 1600;
export const CAREERS_SELFIE_TARGET_MAX_BYTES = 350_000;
export const CAREERS_SELFIE_MAX_EDGE_PX = 720;

export type HrDocumentCompressProfile = {
  targetMaxBytes: number;
  maxEdgePx: number;
  grayscale: boolean;
};

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
