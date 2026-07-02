import type { SupabaseClient } from '@supabase/supabase-js';

export const ATTENDANCE_SELFIES_BUCKET = 'attendance_selfies';
export const SM_VISIT_SELFIES_BUCKET = 'sm-visit-selfies';
export const VERIFICATION_PHOTO_SIGNED_URL_TTL_SEC = 3600;

/** Persisted reference: storage://{bucket}/{objectPath} */
export function formatVerificationPhotoStorageRef(
  bucket: string,
  objectPath: string,
): string {
  const path = objectPath.replace(/^\/+/, '');
  return `storage://${bucket}/${path}`;
}

export function parseVerificationPhotoObjectPath(
  stored: string | null | undefined,
  bucket: string,
): string | null {
  if (!stored?.trim()) return null;
  const value = stored.trim();

  const storageUri = value.match(/^storage:\/\/([^/]+)\/(.+)$/i);
  if (storageUri) {
    if (storageUri[1] !== bucket) return null;
    return storageUri[2].split('?')[0] || null;
  }

  const markers = [
    `/object/public/${bucket}/`,
    `/object/sign/${bucket}/`,
    `/object/authenticated/${bucket}/`,
    `/${bucket}/`,
  ];
  for (const marker of markers) {
    const idx = value.indexOf(marker);
    if (idx !== -1) {
      return value.slice(idx + marker.length).split('?')[0] || null;
    }
  }

  if (!value.startsWith('http://') && !value.startsWith('https://')) {
    return value.replace(/^\/+/, '');
  }

  return null;
}

export function isAllowedAttendancePhotoRef(
  photoUrl: string | null | undefined,
  projectUrl?: string | null,
): boolean {
  if (!photoUrl?.trim()) return true;
  if (parseVerificationPhotoObjectPath(photoUrl, ATTENDANCE_SELFIES_BUCKET)) {
    return true;
  }
  if (photoUrl.startsWith('http://') || photoUrl.startsWith('https://')) {
    if (!projectUrl) return false;
    return (
      photoUrl.startsWith(projectUrl) &&
      photoUrl.includes(`/${ATTENDANCE_SELFIES_BUCKET}/`)
    );
  }
  return false;
}

export async function createVerificationPhotoSignedUrl(
  supabase: SupabaseClient,
  bucket: string,
  stored: string | null | undefined,
  expiresIn = VERIFICATION_PHOTO_SIGNED_URL_TTL_SEC,
): Promise<string | null> {
  const objectPath = parseVerificationPhotoObjectPath(stored, bucket);
  if (!objectPath) return null;

  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(objectPath, expiresIn);

  if (error || !data?.signedUrl) {
    console.error(`createSignedUrl (${bucket}):`, error?.message ?? 'missing url');
    return null;
  }

  return data.signedUrl;
}

export async function signVerificationPhotoRef(
  supabase: SupabaseClient,
  bucket: string,
  stored: string | null | undefined,
): Promise<string | null> {
  if (!stored?.trim()) return null;
  return createVerificationPhotoSignedUrl(supabase, bucket, stored);
}
