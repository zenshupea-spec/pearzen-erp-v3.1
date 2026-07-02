import type { SupabaseClient } from '@supabase/supabase-js';

import {
  ATTENDANCE_SELFIES_BUCKET,
  parseVerificationPhotoObjectPath,
  VERIFICATION_PHOTO_SIGNED_URL_TTL_SEC,
} from './verification-photo-storage';

export const CAFE_TASK_PROOFS_BUCKET = 'cafe_task_proofs';
export const CAFE_TASK_PROOF_RETENTION_DAYS = 14;
export const CAFE_TASK_PROOF_SIGNED_URL_TTL_SEC = VERIFICATION_PHOTO_SIGNED_URL_TTL_SEC;

/** Buckets that may hold café task proof objects (legacy + current). */
export const CAFE_TASK_PROOF_BUCKETS = [
  CAFE_TASK_PROOFS_BUCKET,
  ATTENDANCE_SELFIES_BUCKET,
] as const;

export type CafeTaskProofStorageRef = {
  bucket: string;
  objectPath: string;
};

/** Persisted reference: storage://{bucket}/{objectPath} */
export function formatCafeTaskProofStorageRef(
  bucket: string,
  objectPath: string,
): string {
  const path = objectPath.replace(/^\/+/, '');
  return `storage://${bucket}/${path}`;
}

export function parseCafeTaskProofStorageRef(
  stored: string | null | undefined,
): CafeTaskProofStorageRef | null {
  if (!stored?.trim()) return null;
  const value = stored.trim();

  const storageUri = value.match(/^storage:\/\/([^/]+)\/(.+)$/i);
  if (storageUri) {
    const bucket = storageUri[1];
    const objectPath = storageUri[2].split('?')[0] || null;
    if (!objectPath || !CAFE_TASK_PROOF_BUCKETS.includes(bucket as (typeof CAFE_TASK_PROOF_BUCKETS)[number])) {
      return null;
    }
    return { bucket, objectPath };
  }

  for (const bucket of CAFE_TASK_PROOF_BUCKETS) {
    const objectPath = parseVerificationPhotoObjectPath(value, bucket);
    if (objectPath) return { bucket, objectPath };
  }

  return null;
}

export function cafeTaskProofPurgeAfterIso(
  uploadedOn = new Date(),
  retentionDays = CAFE_TASK_PROOF_RETENTION_DAYS,
): string {
  const purgeAfter = new Date(uploadedOn);
  purgeAfter.setUTCDate(purgeAfter.getUTCDate() + retentionDays);
  return purgeAfter.toISOString().slice(0, 10);
}

export function isCafeTaskProofPurged(
  purgeAfter: string | null | undefined,
  referenceDate = new Date().toISOString().slice(0, 10),
): boolean {
  if (!purgeAfter?.trim()) return false;
  return purgeAfter.trim() < referenceDate;
}

export async function createCafeTaskProofSignedUrl(
  supabase: SupabaseClient,
  stored: string | null | undefined,
  expiresIn = CAFE_TASK_PROOF_SIGNED_URL_TTL_SEC,
): Promise<string | null> {
  const ref = parseCafeTaskProofStorageRef(stored);
  if (!ref) return null;

  const { data, error } = await supabase.storage
    .from(ref.bucket)
    .createSignedUrl(ref.objectPath, expiresIn);

  if (error || !data?.signedUrl) {
    console.error(`createSignedUrl (${ref.bucket}):`, error?.message ?? 'missing url');
    return null;
  }

  return data.signedUrl;
}

export async function signCafeTaskProofRef(
  supabase: SupabaseClient,
  stored: string | null | undefined,
): Promise<string | null> {
  if (!stored?.trim()) return null;
  return createCafeTaskProofSignedUrl(supabase, stored);
}
