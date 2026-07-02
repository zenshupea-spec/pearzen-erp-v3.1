import type { SupabaseClient } from '@supabase/supabase-js';
import {
  ATTENDANCE_SELFIES_BUCKET,
  formatVerificationPhotoStorageRef,
} from '../../../packages/supabase/verification-photo-storage';

export const CAFE_LOGIN_SELFIE_MIN_BYTES = 4_000;

export type CafeLoginSelfieDecoded = {
  buffer: Buffer;
  contentType: string;
  extension: string;
};

export type CafeLoginSelfieValidation =
  | { ok: true; decoded: CafeLoginSelfieDecoded }
  | { ok: false; error: string };

export type CafeLoginSelfieUploadResult =
  | { ok: true; photoRef: string }
  | { ok: false; error: string };

export function decodeCafeLoginSelfieDataUrl(photoBase64: string): CafeLoginSelfieDecoded | null {
  const trimmed = photoBase64.trim();
  if (!trimmed) return null;

  const dataUrlMatch = trimmed.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/i);
  if (!dataUrlMatch) return null;

  const contentType = dataUrlMatch[1].toLowerCase();
  if (!contentType.startsWith('image/')) return null;

  const base64Data = dataUrlMatch[2];
  const extByMime: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
  };
  const extension = extByMime[contentType] ?? 'jpg';

  let buffer: Buffer;
  try {
    buffer = Buffer.from(base64Data, 'base64');
  } catch {
    return null;
  }

  if (buffer.length < CAFE_LOGIN_SELFIE_MIN_BYTES) return null;

  return { buffer, contentType, extension };
}

export function validateCafeLoginSelfieCapture(photoBase64: string): CafeLoginSelfieValidation {
  const trimmed = photoBase64.trim();
  if (!trimmed) {
    return { ok: false, error: 'Live face snapshot is required to sign in.' };
  }

  const dataUrlMatch = trimmed.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/i);
  if (!dataUrlMatch) {
    return {
      ok: false,
      error: 'Face snapshot could not be read. Center your face in the frame and try again.',
    };
  }

  const contentType = dataUrlMatch[1].toLowerCase();
  if (!contentType.startsWith('image/')) {
    return {
      ok: false,
      error: 'Use a live camera photo (JPEG or PNG). Screenshots are not accepted.',
    };
  }

  let buffer: Buffer;
  try {
    buffer = Buffer.from(dataUrlMatch[2], 'base64');
  } catch {
    return {
      ok: false,
      error: 'Face snapshot could not be read. Retake the photo and try again.',
    };
  }

  if (buffer.length < CAFE_LOGIN_SELFIE_MIN_BYTES) {
    return {
      ok: false,
      error: 'Face snapshot was too small or blank. Hold steady, fill the frame, and retake.',
    };
  }

  const extByMime: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
  };

  return {
    ok: true,
    decoded: {
      buffer,
      contentType,
      extension: extByMime[contentType] ?? 'jpg',
    },
  };
}

function selfieStorageErrorMessage(detail: string): string {
  const normalized = detail.toLowerCase();
  if (normalized.includes('bucket') || normalized.includes('not found')) {
    return 'Face snapshot storage is not available. Contact HR or IT support.';
  }
  if (normalized.includes('payload too large') || normalized.includes('entity too large')) {
    return 'Face snapshot is too large. Move closer to the camera and try again.';
  }
  return 'Could not upload face snapshot. Check your connection and try again.';
}

export async function uploadCafeLoginSelfieDecoded(
  service: SupabaseClient,
  epf: string,
  decoded: CafeLoginSelfieDecoded,
): Promise<CafeLoginSelfieUploadResult> {
  const safeEpf = epf.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 32);
  const objectPath = `cafe-login/${safeEpf}/login-${Date.now()}.${decoded.extension}`;

  const { error } = await service.storage
    .from(ATTENDANCE_SELFIES_BUCKET)
    .upload(objectPath, decoded.buffer, {
      contentType: decoded.contentType,
      upsert: false,
    });

  if (error) {
    console.error('[Café Login] Selfie upload error:', error.message);
    return { ok: false, error: selfieStorageErrorMessage(error.message) };
  }

  return {
    ok: true,
    photoRef: formatVerificationPhotoStorageRef(ATTENDANCE_SELFIES_BUCKET, objectPath),
  };
}

export async function uploadCafeLoginSelfie(
  service: SupabaseClient,
  epf: string,
  photoBase64: string,
): Promise<CafeLoginSelfieUploadResult> {
  const validated = validateCafeLoginSelfieCapture(photoBase64);
  if (!validated.ok) return validated;
  return uploadCafeLoginSelfieDecoded(service, epf, validated.decoded);
}
