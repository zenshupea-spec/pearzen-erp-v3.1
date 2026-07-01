import { randomUUID } from 'crypto';

import type { SupabaseClient } from '@supabase/supabase-js';

export const SHALOM_GUEST_IDS_BUCKET = 'shalom-guest-ids';
export const SHALOM_GUEST_ID_UPLOAD_MAX_BYTES = 2_000_000;
export const SHALOM_GUEST_ID_SIGNED_URL_TTL_SEC = 3600;

export type ShalomGuestIdStorageRef = {
  bucket: string;
  objectPath: string;
};

/** Persisted reference: storage://{bucket}/{objectPath} */
export function formatShalomGuestIdStorageRef(
  bucket: string,
  objectPath: string,
): string {
  const path = objectPath.replace(/^\/+/, '');
  return `storage://${bucket}/${path}`;
}

export function buildShalomGuestIdObjectPath(
  companyId: string,
  bookingId: string,
  fileId = randomUUID(),
): string {
  return `${companyId}/${bookingId}/${fileId}.jpg`;
}

export function buildShalomDamagePhotoObjectPath(
  companyId: string,
  bookingId: string,
  fileId = randomUUID(),
): string {
  return `${companyId}/${bookingId}/damages/${fileId}.jpg`;
}

export function buildShalomHandoverPhotoObjectPath(
  companyId: string,
  bookingId: string,
  fileId = randomUUID(),
): string {
  return `${companyId}/${bookingId}/handover/${fileId}.jpg`;
}

export function parseShalomGuestIdStorageRef(
  stored: string | null | undefined,
): ShalomGuestIdStorageRef | null {
  if (!stored?.trim()) return null;
  const value = stored.trim();

  const storageUri = value.match(/^storage:\/\/([^/]+)\/(.+)$/i);
  if (storageUri) {
    const bucket = storageUri[1];
    const objectPath = storageUri[2].split('?')[0] || null;
    if (!objectPath || bucket !== SHALOM_GUEST_IDS_BUCKET) return null;
    return { bucket, objectPath };
  }

  const markers = [
    `/object/public/${SHALOM_GUEST_IDS_BUCKET}/`,
    `/object/sign/${SHALOM_GUEST_IDS_BUCKET}/`,
    `/object/authenticated/${SHALOM_GUEST_IDS_BUCKET}/`,
    `/${SHALOM_GUEST_IDS_BUCKET}/`,
  ];
  for (const marker of markers) {
    const idx = value.indexOf(marker);
    if (idx !== -1) {
      const objectPath = value.slice(idx + marker.length).split('?')[0] || null;
      if (objectPath) return { bucket: SHALOM_GUEST_IDS_BUCKET, objectPath };
    }
  }

  if (!value.startsWith('http://') && !value.startsWith('https://')) {
    const objectPath = value.replace(/^\/+/, '');
    if (objectPath.includes('/')) {
      return { bucket: SHALOM_GUEST_IDS_BUCKET, objectPath };
    }
  }

  return null;
}

export async function createShalomGuestIdSignedUrl(
  supabase: SupabaseClient,
  stored: string | null | undefined,
  expiresIn = SHALOM_GUEST_ID_SIGNED_URL_TTL_SEC,
): Promise<string | null> {
  const ref = parseShalomGuestIdStorageRef(stored);
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

export async function signShalomGuestIdRef(
  supabase: SupabaseClient,
  stored: string | null | undefined,
): Promise<string | null> {
  if (!stored?.trim()) return null;
  return createShalomGuestIdSignedUrl(supabase, stored);
}

export async function removeShalomGuestIdObject(
  supabase: SupabaseClient,
  stored: string | null | undefined,
): Promise<void> {
  const ref = parseShalomGuestIdStorageRef(stored);
  if (!ref) return;
  const { error } = await supabase.storage.from(ref.bucket).remove([ref.objectPath]);
  if (error) {
    console.error(`removeShalomGuestIdObject (${ref.objectPath}):`, error.message);
  }
}

export async function uploadShalomGuestIdBuffer(
  supabase: SupabaseClient,
  input: {
    companyId: string;
    bookingId: string;
    buffer: Buffer;
    replaceStoredRef?: string | null;
  },
): Promise<{ success: boolean; storageRef?: string; error?: string }> {
  const { companyId, bookingId, buffer, replaceStoredRef } = input;

  if (!companyId?.trim() || !bookingId?.trim()) {
    return { success: false, error: 'Booking context is required.' };
  }
  if (!buffer.length) {
    return { success: false, error: 'Choose a photo to upload.' };
  }
  if (buffer.length > SHALOM_GUEST_ID_UPLOAD_MAX_BYTES) {
    return { success: false, error: 'Photo must be 2MB or smaller.' };
  }

  const objectPath = buildShalomGuestIdObjectPath(companyId, bookingId);
  const { error: uploadError } = await supabase.storage
    .from(SHALOM_GUEST_IDS_BUCKET)
    .upload(objectPath, buffer, {
      contentType: 'image/jpeg',
      upsert: false,
    });

  if (uploadError) {
    return { success: false, error: uploadError.message };
  }

  if (replaceStoredRef?.trim()) {
    await removeShalomGuestIdObject(supabase, replaceStoredRef);
  }

  return {
    success: true,
    storageRef: formatShalomGuestIdStorageRef(SHALOM_GUEST_IDS_BUCKET, objectPath),
  };
}

export async function uploadShalomDamagePhotoBuffer(
  supabase: SupabaseClient,
  input: {
    companyId: string;
    bookingId: string;
    buffer: Buffer;
  },
): Promise<{ success: boolean; storageRef?: string; error?: string }> {
  const { companyId, bookingId, buffer } = input;

  if (!companyId?.trim() || !bookingId?.trim()) {
    return { success: false, error: 'Booking context is required.' };
  }
  if (!buffer.length) {
    return { success: false, error: 'Choose a photo to upload.' };
  }
  if (buffer.length > SHALOM_GUEST_ID_UPLOAD_MAX_BYTES) {
    return { success: false, error: 'Photo must be 2MB or smaller.' };
  }

  const objectPath = buildShalomDamagePhotoObjectPath(companyId, bookingId);
  const { error: uploadError } = await supabase.storage
    .from(SHALOM_GUEST_IDS_BUCKET)
    .upload(objectPath, buffer, {
      contentType: 'image/jpeg',
      upsert: false,
    });

  if (uploadError) {
    return { success: false, error: uploadError.message };
  }

  return {
    success: true,
    storageRef: formatShalomGuestIdStorageRef(SHALOM_GUEST_IDS_BUCKET, objectPath),
  };
}

export async function uploadShalomHandoverPhotoBuffer(
  supabase: SupabaseClient,
  input: {
    companyId: string;
    bookingId: string;
    buffer: Buffer;
  },
): Promise<{ success: boolean; storageRef?: string; error?: string }> {
  const { companyId, bookingId, buffer } = input;

  if (!companyId?.trim() || !bookingId?.trim()) {
    return { success: false, error: 'Booking context is required.' };
  }
  if (!buffer.length) {
    return { success: false, error: 'Choose a photo to upload.' };
  }
  if (buffer.length > SHALOM_GUEST_ID_UPLOAD_MAX_BYTES) {
    return { success: false, error: 'Photo must be 2MB or smaller.' };
  }

  const objectPath = buildShalomHandoverPhotoObjectPath(companyId, bookingId);
  const { error: uploadError } = await supabase.storage
    .from(SHALOM_GUEST_IDS_BUCKET)
    .upload(objectPath, buffer, {
      contentType: 'image/jpeg',
      upsert: false,
    });

  if (uploadError) {
    return { success: false, error: uploadError.message };
  }

  return {
    success: true,
    storageRef: formatShalomGuestIdStorageRef(SHALOM_GUEST_IDS_BUCKET, objectPath),
  };
}
