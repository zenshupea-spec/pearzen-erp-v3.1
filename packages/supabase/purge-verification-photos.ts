import type { SupabaseClient } from '@supabase/supabase-js';
import {
  ATTENDANCE_SELFIES_BUCKET,
  parseVerificationPhotoObjectPath,
  SM_VISIT_SELFIES_BUCKET,
} from './verification-photo-storage';

export const VERIFICATION_PHOTO_RETENTION_DAYS = 60;

export type PurgeVerificationPhotosResult = {
  attendanceCleared: number;
  visitCleared: number;
  attendanceObjectsRemoved: number;
  visitObjectsRemoved: number;
  cutoffIso: string;
};

function retentionCutoffIso(retentionDays: number): string {
  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - retentionDays);
  return cutoff.toISOString();
}

export async function purgeVerificationPhotos(
  supabase: SupabaseClient,
  retentionDays = VERIFICATION_PHOTO_RETENTION_DAYS,
): Promise<PurgeVerificationPhotosResult> {
  const cutoffIso = retentionCutoffIso(retentionDays);
  const attendancePaths = new Set<string>();
  const visitPaths = new Set<string>();

  let attendanceCleared = 0;
  let visitCleared = 0;

  const { data: attendanceRows, error: attendanceError } = await supabase
    .from('attendance_logs')
    .select('id, photo_url, device_time')
    .not('photo_url', 'is', null)
    .lt('device_time', cutoffIso)
    .limit(500);

  if (attendanceError) {
    throw new Error(`attendance_logs fetch: ${attendanceError.message}`);
  }

  for (const row of attendanceRows ?? []) {
    const path = parseVerificationPhotoObjectPath(
      row.photo_url as string,
      ATTENDANCE_SELFIES_BUCKET,
    );
    if (path) attendancePaths.add(path);

    const { error } = await supabase
      .from('attendance_logs')
      .update({ photo_url: null })
      .eq('id', row.id);
    if (!error) attendanceCleared += 1;
  }

  const { data: visitRows, error: visitError } = await supabase
    .from('sm_visit_logs')
    .select('id, photo_url, created_at')
    .not('photo_url', 'is', null)
    .lt('created_at', cutoffIso)
    .limit(500);

  if (visitError) {
    throw new Error(`sm_visit_logs fetch: ${visitError.message}`);
  }

  for (const row of visitRows ?? []) {
    const path = parseVerificationPhotoObjectPath(
      row.photo_url as string,
      SM_VISIT_SELFIES_BUCKET,
    );
    if (path) visitPaths.add(path);

    const { error } = await supabase
      .from('sm_visit_logs')
      .update({ photo_url: null })
      .eq('id', row.id);
    if (!error) visitCleared += 1;
  }

  let attendanceObjectsRemoved = 0;
  if (attendancePaths.size > 0) {
    const { error } = await supabase.storage
      .from(ATTENDANCE_SELFIES_BUCKET)
      .remove([...attendancePaths]);
    if (!error) attendanceObjectsRemoved = attendancePaths.size;
  }

  let visitObjectsRemoved = 0;
  if (visitPaths.size > 0) {
    const { error } = await supabase.storage
      .from(SM_VISIT_SELFIES_BUCKET)
      .remove([...visitPaths]);
    if (!error) visitObjectsRemoved = visitPaths.size;
  }

  return {
    attendanceCleared,
    visitCleared,
    attendanceObjectsRemoved,
    visitObjectsRemoved,
    cutoffIso,
  };
}
