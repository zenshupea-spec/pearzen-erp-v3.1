'use client';

export const SHALOM_GUEST_ID_TARGET_MAX_BYTES = 2_000_000;
export const SHALOM_GUEST_ID_MAX_EDGE_PX = 2400;
const JPEG_QUALITY_START = 88;
const JPEG_QUALITY_MIN = 62;

const ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
]);

export type ShalomGuestIdCompressionResult = {
  file: File;
  originalBytes: number;
  compressedBytes: number;
  previewUrl: string;
};

function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not read image. Use JPEG, PNG, or WebP.'));
    };
    img.src = url;
  });
}

function canvasToJpegBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('Could not compress image.'));
          return;
        }
        resolve(blob);
      },
      'image/jpeg',
      quality / 100,
    );
  });
}

export function isShalomGuestIdImageFile(file: File): boolean {
  const mime = (file.type || '').toLowerCase();
  if (ALLOWED_MIME.has(mime)) return true;
  return /\.(jpe?g|png|webp|heic|heif)$/i.test(file.name);
}

/** Resize/compress NIC or passport photo to ≤ 2 MB before server upload. */
export async function compressShalomGuestIdFile(file: File): Promise<ShalomGuestIdCompressionResult> {
  const mime = (file.type || '').toLowerCase();
  if (!isShalomGuestIdImageFile(file)) {
    throw new Error('Use a JPEG, PNG, or WebP photo of the guest NIC or passport.');
  }

  const img = await loadImageFromFile(file);
  const scale = Math.min(1, SHALOM_GUEST_ID_MAX_EDGE_PX / Math.max(img.width, img.height));
  const width = Math.max(1, Math.round(img.width * scale));
  const height = Math.max(1, Math.round(img.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not compress image.');
  ctx.drawImage(img, 0, 0, width, height);

  let quality = JPEG_QUALITY_START;
  let blob = await canvasToJpegBlob(canvas, quality);
  while (blob.size > SHALOM_GUEST_ID_TARGET_MAX_BYTES && quality > JPEG_QUALITY_MIN) {
    quality -= 4;
    blob = await canvasToJpegBlob(canvas, quality);
  }

  if (blob.size > SHALOM_GUEST_ID_TARGET_MAX_BYTES) {
    throw new Error('Photo is still too large after compression. Retake closer or in better light.');
  }

  const baseName = file.name.replace(/\.[^.]+$/, '') || 'guest-id';
  const outFile = new File([blob], `${baseName}.jpg`, {
    type: 'image/jpeg',
    lastModified: Date.now(),
  });

  return {
    file: outFile,
    originalBytes: file.size,
    compressedBytes: outFile.size,
    previewUrl: URL.createObjectURL(outFile),
  };
}
