import type { SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';

import {
  parseVerificationPhotoObjectPath,
  VERIFICATION_PHOTO_SIGNED_URL_TTL_SEC,
} from './verification-photo-storage';

export const OPEX_RECEIPTS_BUCKET = 'opex-receipts';
export const OPEX_RECEIPT_RETENTION_DAYS = 60;
export const OPEX_RECEIPT_PERMANENT_THRESHOLD_LKR = 30_000;
export const OPEX_RECEIPT_MAX_BYTES = 10 * 1024 * 1024;
export const OPEX_RECEIPT_SIGNED_URL_TTL_SEC = VERIFICATION_PHOTO_SIGNED_URL_TTL_SEC;

const ALLOWED_CONTENT_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'application/pdf',
]);

/** Persisted reference: storage://opex-receipts/{objectPath} */
export function formatOpexReceiptStorageRef(objectPath: string): string {
  return `storage://${OPEX_RECEIPTS_BUCKET}/${objectPath.replace(/^\/+/, '')}`;
}

export function parseOpexReceiptStorageRef(
  stored: string | null | undefined,
): string | null {
  return parseVerificationPhotoObjectPath(stored, OPEX_RECEIPTS_BUCKET);
}

export function isOpexReceiptEligibleForPurge(
  billDate: string,
  amount: number,
  referenceDate = new Date().toISOString().slice(0, 10),
): boolean {
  if (amount > OPEX_RECEIPT_PERMANENT_THRESHOLD_LKR) return false;
  const purgeOn = new Date(`${billDate.slice(0, 10)}T00:00:00.000Z`);
  purgeOn.setUTCDate(purgeOn.getUTCDate() + OPEX_RECEIPT_RETENTION_DAYS);
  return purgeOn.toISOString().slice(0, 10) <= referenceDate;
}

export function opexReceiptPurgeOnDate(billDate: string): string {
  const purgeOn = new Date(`${billDate.slice(0, 10)}T00:00:00.000Z`);
  purgeOn.setUTCDate(purgeOn.getUTCDate() + OPEX_RECEIPT_RETENTION_DAYS);
  return purgeOn.toISOString().slice(0, 10);
}

function extensionForContentType(contentType: string): string {
  switch (contentType) {
    case 'image/jpeg':
    case 'image/jpg':
      return 'jpg';
    case 'image/png':
      return 'png';
    case 'image/webp':
      return 'webp';
    case 'application/pdf':
      return 'pdf';
    default:
      return 'bin';
  }
}

export function assertOpexReceiptUpload(contentType: string, byteLength: number): void {
  if (!ALLOWED_CONTENT_TYPES.has(contentType.toLowerCase())) {
    throw new Error('Receipt must be JPG, PNG, WEBP, or PDF.');
  }
  if (byteLength <= 0) {
    throw new Error('Receipt file is empty.');
  }
  if (byteLength > OPEX_RECEIPT_MAX_BYTES) {
    throw new Error('Receipt must be 10 MB or smaller.');
  }
}

export async function uploadOpexReceiptBuffer(
  supabase: SupabaseClient,
  companyId: string,
  buffer: Buffer,
  contentType: string,
): Promise<{ storageRef: string; objectPath: string }> {
  assertOpexReceiptUpload(contentType, buffer.byteLength);

  const year = new Date().getUTCFullYear();
  const ext = extensionForContentType(contentType);
  const objectPath = `${companyId}/${year}/${randomUUID()}.${ext}`;

  const { error } = await supabase.storage
    .from(OPEX_RECEIPTS_BUCKET)
    .upload(objectPath, buffer, {
      contentType,
      upsert: false,
    });

  if (error) {
    throw new Error(error.message);
  }

  return {
    objectPath,
    storageRef: formatOpexReceiptStorageRef(objectPath),
  };
}

export async function createOpexReceiptSignedUrl(
  supabase: SupabaseClient,
  stored: string | null | undefined,
  expiresIn = OPEX_RECEIPT_SIGNED_URL_TTL_SEC,
): Promise<string | null> {
  const objectPath = parseOpexReceiptStorageRef(stored);
  if (!objectPath) return null;

  const { data, error } = await supabase.storage
    .from(OPEX_RECEIPTS_BUCKET)
    .createSignedUrl(objectPath, expiresIn);

  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

export async function removeOpexReceiptObject(
  supabase: SupabaseClient,
  stored: string | null | undefined,
): Promise<boolean> {
  const objectPath = parseOpexReceiptStorageRef(stored);
  if (!objectPath) return false;

  const { error } = await supabase.storage.from(OPEX_RECEIPTS_BUCKET).remove([objectPath]);
  return !error;
}
