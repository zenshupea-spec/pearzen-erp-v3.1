import type { SupabaseClient } from '@supabase/supabase-js';

import { removeShalomGuestIdObject } from './shalom-guest-id-storage';

export const SHALOM_HANDOVER_PHOTO_RETENTION_DAYS = 14;

export type PurgeShalomHandoverPhotosResult = {
  bookingsUpdated: number;
  photosRemoved: number;
  storageObjectsRemoved: number;
  cutoffIso: string;
};

type HandoverPhotoRow = Record<string, unknown> & { photoUrl: string; capturedAt: string };

function parseHandoverPhotoRows(raw: unknown): HandoverPhotoRow[] {
  if (!Array.isArray(raw)) return [];
  const photos: HandoverPhotoRow[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    const photoUrl = typeof row.photoUrl === 'string' ? row.photoUrl.trim() : '';
    const capturedAt = typeof row.capturedAt === 'string' ? row.capturedAt.trim() : '';
    if (!photoUrl || !capturedAt) continue;
    photos.push({ ...row, photoUrl, capturedAt });
  }
  return photos;
}

function retentionCutoffIso(retentionDays: number): string {
  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - retentionDays);
  return cutoff.toISOString();
}

export async function purgeShalomHandoverPhotos(
  supabase: SupabaseClient,
  retentionDays = SHALOM_HANDOVER_PHOTO_RETENTION_DAYS,
): Promise<PurgeShalomHandoverPhotosResult> {
  const cutoffIso = retentionCutoffIso(retentionDays);
  const storagePaths = new Set<string>();
  let bookingsUpdated = 0;
  let photosRemoved = 0;

  const { data: bookingRows, error: fetchError } = await supabase
    .from('shalom_bookings')
    .select('id, company_id, pre_handover_photos, pre_handover_verified_at')
    .not('pre_handover_photos', 'eq', '[]')
    .limit(500);

  if (fetchError) {
    throw new Error(`shalom_bookings fetch: ${fetchError.message}`);
  }

  for (const row of bookingRows ?? []) {
    const photos = parseHandoverPhotoRows(row.pre_handover_photos);
    if (photos.length === 0) continue;

    const kept: HandoverPhotoRow[] = [];
    for (const photo of photos) {
      const expired = photo.capturedAt < cutoffIso;
      if (expired) {
        storagePaths.add(photo.photoUrl);
        photosRemoved += 1;
      } else {
        kept.push(photo);
      }
    }

    if (kept.length === photos.length) continue;

    const { error: updateError } = await supabase
      .from('shalom_bookings')
      .update({
        pre_handover_photos: kept,
        updated_at: new Date().toISOString(),
      })
      .eq('id', row.id)
      .eq('company_id', row.company_id);

    if (!updateError) bookingsUpdated += 1;
  }

  let storageObjectsRemoved = 0;
  for (const stored of storagePaths) {
    await removeShalomGuestIdObject(supabase, stored);
    storageObjectsRemoved += 1;
  }

  return {
    bookingsUpdated,
    photosRemoved,
    storageObjectsRemoved,
    cutoffIso,
  };
}
