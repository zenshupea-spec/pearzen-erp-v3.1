import { createSupabaseServiceClient } from '../../../packages/supabase/service';

const BRANDING_BUCKET = 'company-branding';
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

export type SecurityWebsiteImageSlot =
  | 'logo'
  | 'hero'
  | 'about'
  | 'tech'
  | 'timelineCoverage'
  | 'timelineMonitoring';

/** Strip `?v=` / `?t=` cache-busters before persisting image URLs. */
export function stripImageCacheBuster(url: string | null | undefined): string | null {
  const trimmed = typeof url === 'string' ? url.trim() : '';
  if (!trimmed) return null;
  return trimmed.replace(/[?&](?:v|t)=\d+$/, '');
}

/** Bust browser/CDN cache after overwriting a storage object at a stable public URL. */
export function withImageCacheBuster(url: string): string {
  const clean = stripImageCacheBuster(url) ?? url;
  const separator = clean.includes('?') ? '&' : '?';
  return `${clean}${separator}v=${Date.now()}`;
}

export function needsImageCacheBuster(url: string | null | undefined): boolean {
  const trimmed = typeof url === 'string' ? url.trim() : '';
  return (
    trimmed.includes('supabase.co/storage') && !/[?&](?:v|t)=\d+/.test(trimmed)
  );
}

function parseDataUrl(dataUrl: string): { buffer: Buffer; mime: string; ext: string } | null {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return null;
  const mime = match[1];
  const buffer = Buffer.from(match[2], 'base64');
  if (buffer.length > MAX_IMAGE_BYTES) return null;
  const ext =
    mime === 'image/svg+xml'
      ? 'svg'
      : mime === 'image/webp'
        ? 'webp'
        : mime === 'image/jpeg'
          ? 'jpg'
          : 'png';
  return { buffer, mime, ext };
}

export async function uploadSecurityWebsiteImage(
  companyId: string,
  slot: SecurityWebsiteImageSlot,
  dataUrl: string,
): Promise<{ success: boolean; url?: string; error?: string }> {
  if (!dataUrl.startsWith('data:')) {
    return { success: false, error: 'Invalid image data' };
  }

  const parsed = parseDataUrl(dataUrl);
  if (!parsed) {
    return { success: false, error: 'Image must be under 4MB and a valid format' };
  }

  const supabase = createSupabaseServiceClient();
  const path = `${companyId}/security-website/${slot}.${parsed.ext}`;

  const { error: uploadError } = await supabase.storage
    .from(BRANDING_BUCKET)
    .upload(path, parsed.buffer, {
      contentType: parsed.mime,
      upsert: true,
      cacheControl: '60',
    });

  if (uploadError) {
    return { success: false, error: uploadError.message };
  }

  const { data } = supabase.storage.from(BRANDING_BUCKET).getPublicUrl(path);
  return { success: true, url: withImageCacheBuster(data.publicUrl) };
}

export async function uploadSecurityWebsiteClientLogo(
  companyId: string,
  clientId: string,
  dataUrl: string,
): Promise<{ success: boolean; url?: string; error?: string }> {
  if (!dataUrl.startsWith('data:')) {
    return { success: false, error: 'Invalid image data' };
  }

  const parsed = parseDataUrl(dataUrl);
  if (!parsed) {
    return { success: false, error: 'Image must be under 4MB and a valid format' };
  }

  const safeId = clientId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 48) || 'client';
  const supabase = createSupabaseServiceClient();
  const path = `${companyId}/security-website/clients/${safeId}.${parsed.ext}`;

  const { error: uploadError } = await supabase.storage
    .from(BRANDING_BUCKET)
    .upload(path, parsed.buffer, {
      contentType: parsed.mime,
      upsert: true,
      cacheControl: '60',
    });

  if (uploadError) {
    return { success: false, error: uploadError.message };
  }

  const { data } = supabase.storage.from(BRANDING_BUCKET).getPublicUrl(path);
  return { success: true, url: data.publicUrl };
}

export async function uploadSecurityWebsiteTrainingGalleryImage(
  companyId: string,
  imageId: string,
  dataUrl: string,
): Promise<{ success: boolean; url?: string; error?: string }> {
  if (!dataUrl.startsWith('data:')) {
    return { success: false, error: 'Invalid image data' };
  }

  const parsed = parseDataUrl(dataUrl);
  if (!parsed) {
    return { success: false, error: 'Image must be under 4MB and a valid format' };
  }

  const safeId = imageId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 48) || 'training';
  const supabase = createSupabaseServiceClient();
  const path = `${companyId}/security-website/training-gallery/${safeId}.${parsed.ext}`;

  const { error: uploadError } = await supabase.storage
    .from(BRANDING_BUCKET)
    .upload(path, parsed.buffer, {
      contentType: parsed.mime,
      upsert: true,
      cacheControl: '31536000',
    });

  if (uploadError) {
    return { success: false, error: uploadError.message };
  }

  const { data } = supabase.storage.from(BRANDING_BUCKET).getPublicUrl(path);
  return { success: true, url: withImageCacheBuster(data.publicUrl) };
}
