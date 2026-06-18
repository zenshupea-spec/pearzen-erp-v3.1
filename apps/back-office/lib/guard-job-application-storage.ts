import type { SupabaseClient } from '@supabase/supabase-js';

import {
  shouldApplyOfficeCopyWatermark,
  type GuardJobApplicationDocSlot,
} from './identity-document-watermark';
import { applyOfficeCopyWatermarkBuffer } from './identity-document-watermark-server';

export const GUARD_JOB_APPLICATIONS_BUCKET = 'guard-job-applications';

export type { GuardJobApplicationDocSlot };

function decodeBase64Image(photoBase64: string): {
  buffer: Buffer;
  contentType: string;
  extension: string;
} | null {
  const trimmed = photoBase64.trim();
  if (!trimmed) return null;

  const dataUrlMatch = trimmed.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/i);
  if (!dataUrlMatch) return null;

  const contentType = dataUrlMatch[1].toLowerCase();
  const base64Data = dataUrlMatch[2];
  const extByMime: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
  };
  const extension = extByMime[contentType] ?? 'jpg';
  return { buffer: Buffer.from(base64Data, 'base64'), contentType, extension };
}

async function maybeWatermarkBuffer(
  slot: GuardJobApplicationDocSlot,
  buffer: Buffer,
): Promise<Buffer> {
  if (!shouldApplyOfficeCopyWatermark(slot)) return buffer;
  return applyOfficeCopyWatermarkBuffer(buffer);
}

export async function uploadGuardJobApplicationImage(
  db: SupabaseClient,
  companyId: string,
  applicationId: string,
  slot: GuardJobApplicationDocSlot,
  photoBase64: string,
): Promise<string | null> {
  const decoded = decodeBase64Image(photoBase64);
  if (!decoded) return null;

  const buffer = await maybeWatermarkBuffer(slot, decoded.buffer);
  const objectPath = `${companyId}/${applicationId}/${slot}.jpg`;
  const { error } = await db.storage
    .from(GUARD_JOB_APPLICATIONS_BUCKET)
    .upload(objectPath, buffer, { contentType: 'image/jpeg', upsert: false });

  if (error) {
    console.error(`[guard-job-application] upload ${slot}:`, error.message);
    return null;
  }

  const { data } = db.storage.from(GUARD_JOB_APPLICATIONS_BUCKET).getPublicUrl(objectPath);
  return data.publicUrl;
}
