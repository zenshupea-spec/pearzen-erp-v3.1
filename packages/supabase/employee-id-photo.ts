import type { SupabaseClient } from '@supabase/supabase-js';

const ID_PHOTO_BUCKET = 'company-branding';
const MAX_ID_PHOTO_BYTES = 5 * 1024 * 1024;

const MIME_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

function extensionForMime(mime: string): string | null {
  return MIME_EXT[mime] ?? null;
}

export async function uploadEmployeeIdPhotoFile(
  supabase: SupabaseClient,
  employeeId: string,
  file: File,
): Promise<{ success: boolean; url?: string; error?: string }> {
  if (!employeeId?.trim()) {
    return { success: false, error: 'Employee id is required.' };
  }
  if (!file || file.size === 0) {
    return { success: false, error: 'Choose a photo to upload.' };
  }
  if (file.size > MAX_ID_PHOTO_BYTES) {
    return { success: false, error: 'Photo must be 5MB or smaller.' };
  }

  const mime = file.type || 'application/octet-stream';
  const ext = extensionForMime(mime);
  if (!ext) {
    return { success: false, error: 'Use JPEG, PNG, or WebP.' };
  }

  const path = `employee-id-photos/${employeeId}/photo.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error: uploadError } = await supabase.storage
    .from(ID_PHOTO_BUCKET)
    .upload(path, buffer, {
      contentType: mime,
      upsert: true,
    });

  if (uploadError) {
    return { success: false, error: uploadError.message };
  }

  const { data } = supabase.storage.from(ID_PHOTO_BUCKET).getPublicUrl(path);
  const publicUrl = data.publicUrl;

  const { error: updateError } = await supabase
    .from('employees')
    .update({ id_photo_url: publicUrl })
    .eq('id', employeeId);

  if (updateError) {
    return { success: false, error: updateError.message };
  }

  return { success: true, url: publicUrl };
}
