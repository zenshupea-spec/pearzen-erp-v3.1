import type { SupabaseClient } from '@supabase/supabase-js';

function randomUuid(): string {
  return globalThis.crypto.randomUUID();
}

/** Public bucket — property listing photos for shalom.pearzen.tech (MD upload per property). */
export const SHALOM_PUBLIC_MEDIA_BUCKET = 'shalom-public-media';

/** 5 MB per image — MD uploads JPEG/PNG/WebP from the Shalom desk. */
export const SHALOM_PUBLIC_MEDIA_UPLOAD_MAX_BYTES = 5_242_880;

export type ShalomPublicMediaStorageRef = {
  bucket: string;
  objectPath: string;
};

/** One photo in `shalom_properties.public_gallery_urls`. */
export type ShalomPublicPropertyPhoto = {
  id: string;
  /** storage://shalom-public-media/{companyId}/{propertyId}/{uuid}.jpg */
  storageRef: string;
  sortOrder: number;
  caption?: string;
};

export function formatShalomPublicMediaStorageRef(
  bucket: string,
  objectPath: string,
): string {
  const path = objectPath.replace(/^\/+/, '');
  return `storage://${bucket}/${path}`;
}

export function buildShalomPropertyPhotoObjectPath(
  companyId: string,
  propertyId: string,
  fileId = randomUuid(),
  extension: 'jpg' | 'jpeg' | 'png' | 'webp' = 'jpg',
): string {
  const ext = extension === 'jpeg' ? 'jpg' : extension;
  return `${companyId}/${propertyId}/${fileId}.${ext}`;
}

export function parseShalomPublicMediaStorageRef(
  stored: string | null | undefined,
): ShalomPublicMediaStorageRef | null {
  if (!stored?.trim()) return null;
  const value = stored.trim();

  const storageUri = value.match(/^storage:\/\/([^/]+)\/(.+)$/i);
  if (storageUri) {
    const bucket = storageUri[1];
    const objectPath = storageUri[2].split('?')[0] || null;
    if (!objectPath || bucket !== SHALOM_PUBLIC_MEDIA_BUCKET) return null;
    return { bucket, objectPath };
  }

  const markers = [
    `/object/public/${SHALOM_PUBLIC_MEDIA_BUCKET}/`,
    `/object/sign/${SHALOM_PUBLIC_MEDIA_BUCKET}/`,
    `/storage/v1/object/public/${SHALOM_PUBLIC_MEDIA_BUCKET}/`,
    `/${SHALOM_PUBLIC_MEDIA_BUCKET}/`,
  ];
  for (const marker of markers) {
    const idx = value.indexOf(marker);
    if (idx !== -1) {
      const objectPath = value.slice(idx + marker.length).split('?')[0] || null;
      if (objectPath) {
        return { bucket: SHALOM_PUBLIC_MEDIA_BUCKET, objectPath };
      }
    }
  }

  if (!value.startsWith('http://') && !value.startsWith('https://')) {
    const objectPath = value.replace(/^\/+/, '');
    if (objectPath.includes('/')) {
      return { bucket: SHALOM_PUBLIC_MEDIA_BUCKET, objectPath };
    }
  }

  return null;
}

export function resolveShalomPublicMediaPublicUrl(
  supabaseUrl: string,
  storageRefOrUrl: string | null | undefined,
): string | null {
  if (!storageRefOrUrl?.trim()) return null;
  const trimmed = storageRefOrUrl.trim();
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return trimmed;
  }

  const parsed = parseShalomPublicMediaStorageRef(trimmed);
  if (!parsed) return null;

  const base = supabaseUrl.replace(/\/$/, '');
  return `${base}/storage/v1/object/public/${parsed.bucket}/${parsed.objectPath}`;
}

export function parseShalomPublicPropertyPhotos(raw: unknown): ShalomPublicPropertyPhoto[] {
  if (!Array.isArray(raw)) return [];

  const photos: ShalomPublicPropertyPhoto[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    const storageRef =
      typeof row.storageRef === 'string'
        ? row.storageRef.trim()
        : typeof row.url === 'string'
          ? row.url.trim()
          : '';
    if (!storageRef) continue;

    photos.push({
      id: typeof row.id === 'string' && row.id.trim() ? row.id.trim() : randomUuid(),
      storageRef,
      sortOrder:
        typeof row.sortOrder === 'number' && Number.isFinite(row.sortOrder)
          ? Math.round(row.sortOrder)
          : photos.length,
      caption: typeof row.caption === 'string' ? row.caption.trim() : undefined,
    });
  }

  return photos.sort((a, b) => a.sortOrder - b.sortOrder);
}

export async function uploadShalomPropertyPhoto(
  admin: SupabaseClient,
  input: {
    companyId: string;
    propertyId: string;
    bytes: Buffer | Uint8Array;
    contentType: string;
    fileId?: string;
  },
): Promise<{ storageRef: string; publicUrl: string | null }> {
  const contentType = input.contentType.toLowerCase();
  const extension =
    contentType.includes('png')
      ? 'png'
      : contentType.includes('webp')
        ? 'webp'
        : 'jpg';

  const objectPath = buildShalomPropertyPhotoObjectPath(
    input.companyId,
    input.propertyId,
    input.fileId,
    extension,
  );

  const { error } = await admin.storage
    .from(SHALOM_PUBLIC_MEDIA_BUCKET)
    .upload(objectPath, input.bytes, {
      contentType,
      upsert: false,
    });

  if (error) {
    throw new Error(error.message);
  }

  const storageRef = formatShalomPublicMediaStorageRef(
    SHALOM_PUBLIC_MEDIA_BUCKET,
    objectPath,
  );

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? '';
  const publicUrl = resolveShalomPublicMediaPublicUrl(supabaseUrl, storageRef);

  return { storageRef, publicUrl };
}
