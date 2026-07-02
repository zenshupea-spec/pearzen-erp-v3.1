import type { SupabaseClient } from '@supabase/supabase-js';

export const GUARD_MNR_PHOTO_SUBMISSIONS_BUCKET = 'guard-mnr-photo-submissions';

/** Hard cap for SM-submitted guard MNR photos (under 5 MB). */
export const GUARD_MNR_PHOTO_MAX_BYTES = 5 * 1024 * 1024;

export type GuardMnrPhotoSubmissionStatus = 'PENDING' | 'APPROVED' | 'RESUBMIT_REQUESTED';

export type GuardMnrPhotoSubmissionRow = {
  id: string;
  company_id: string;
  guard_employee_id: string;
  guard_epf: string;
  guard_name: string | null;
  guard_site: string | null;
  sm_epf: string;
  sm_name: string | null;
  photo_url: string;
  status: GuardMnrPhotoSubmissionStatus;
  reviewed_by_email: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  created_at: string;
  updated_at: string;
};

const MIME_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

function extensionForMime(mime: string): string | null {
  return MIME_EXT[mime.toLowerCase()] ?? null;
}

export async function uploadGuardMnrSubmissionPhoto(
  supabase: SupabaseClient,
  objectPath: string,
  buffer: Buffer,
  contentType: string,
): Promise<{ success: boolean; url?: string; error?: string }> {
  const { error: uploadError } = await supabase.storage
    .from(GUARD_MNR_PHOTO_SUBMISSIONS_BUCKET)
    .upload(objectPath, buffer, { contentType, upsert: true });

  if (uploadError) {
    return { success: false, error: uploadError.message };
  }

  const { data } = supabase.storage.from(GUARD_MNR_PHOTO_SUBMISSIONS_BUCKET).getPublicUrl(objectPath);
  return { success: true, url: data.publicUrl };
}

export async function promoteSubmissionToEmployeeIdPhoto(
  supabase: SupabaseClient,
  employeeId: string,
  photoUrl: string,
): Promise<{ success: boolean; url?: string; error?: string }> {
  const response = await fetch(photoUrl);
  if (!response.ok) {
    return { success: false, error: 'Could not read submitted photo.' };
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  if (buffer.length === 0) {
    return { success: false, error: 'Submitted photo is empty.' };
  }
  if (buffer.length > GUARD_MNR_PHOTO_MAX_BYTES) {
    return { success: false, error: 'Submitted photo exceeds 5 MB.' };
  }

  const contentType = (response.headers.get('content-type') ?? 'image/jpeg').split(';')[0].trim();
  const ext = extensionForMime(contentType) ?? 'jpg';
  const path = `employee-id-photos/${employeeId}/photo.${ext}`;

  const { error: uploadError } = await supabase.storage.from('company-branding').upload(path, buffer, {
    contentType,
    upsert: true,
  });

  if (uploadError) {
    return { success: false, error: uploadError.message };
  }

  const { data } = supabase.storage.from('company-branding').getPublicUrl(path);
  const publicUrl = data.publicUrl;
  const capturedAt = new Date().toISOString();

  const { error: updateError } = await supabase
    .from('employees')
    .update({ id_photo_url: publicUrl, id_photo_captured_at: capturedAt })
    .eq('id', employeeId);

  if (updateError) {
    return { success: false, error: updateError.message };
  }

  return { success: true, url: publicUrl };
}
