import 'server-only';

import { randomUUID } from 'crypto';

import {
  formatShalomPublicMediaStorageRef,
  resolveShalomPublicMediaPublicUrl,
  SHALOM_PUBLIC_MEDIA_BUCKET,
  SHALOM_PUBLIC_MEDIA_UPLOAD_MAX_BYTES,
} from '../../../packages/supabase/shalom-public-media-storage';
import { createSupabaseServiceClient } from '../../../packages/supabase/service';

function parseDataUrl(dataUrl: string): { buffer: Buffer; mime: string; ext: string } | null {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return null;

  const mime = match[1].toLowerCase();
  const buffer = Buffer.from(match[2], 'base64');
  if (buffer.length > SHALOM_PUBLIC_MEDIA_UPLOAD_MAX_BYTES) return null;

  const ext =
    mime === 'image/svg+xml'
      ? 'svg'
      : mime === 'image/webp'
        ? 'webp'
        : mime === 'image/png'
          ? 'png'
          : 'jpg';

  return { buffer, mime, ext };
}

export async function uploadShalomPublicWebsiteSiteImageFromDataUrl(
  companyId: string,
  slot: 'hero' | 'logo',
  dataUrl: string,
): Promise<{ success: boolean; storageRef?: string; publicUrl?: string | null; error?: string }> {
  if (!dataUrl.startsWith('data:')) {
    return { success: false, error: 'Invalid image data.' };
  }

  const parsed = parseDataUrl(dataUrl);
  if (!parsed) {
    return {
      success: false,
      error: 'Image must be under 5 MB and a valid JPEG, PNG, WebP, or SVG.',
    };
  }

  const objectPath = `${companyId}/site/${slot}-${randomUUID()}.${parsed.ext}`;
  const db = createSupabaseServiceClient();

  const { error } = await db.storage.from(SHALOM_PUBLIC_MEDIA_BUCKET).upload(objectPath, parsed.buffer, {
    contentType: parsed.mime,
    upsert: true,
  });

  if (error) {
    return { success: false, error: error.message };
  }

  const storageRef = formatShalomPublicMediaStorageRef(SHALOM_PUBLIC_MEDIA_BUCKET, objectPath);
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? '';
  const publicUrl = resolveShalomPublicMediaPublicUrl(supabaseUrl, storageRef);

  return { success: true, storageRef, publicUrl };
}
