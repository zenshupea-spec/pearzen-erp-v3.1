'use client';

const MAX_EDGE_PX = 1920;
const TARGET_MAX_BYTES = 700_000;
const JPEG_QUALITY_START = 82;
const JPEG_QUALITY_MIN = 58;

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
      reject(new Error('Could not read image.'));
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

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      typeof reader.result === 'string'
        ? resolve(reader.result)
        : reject(new Error('Could not read compressed image.'));
    reader.onerror = () => reject(new Error('Could not read compressed image.'));
    reader.readAsDataURL(blob);
  });
}

/** Resize/compress before server upload so the data URL stays under Next.js action limits. */
export async function compressSecurityWebsiteImageFile(file: File): Promise<string> {
  const mime = (file.type || '').toLowerCase();
  if (mime === 'image/svg+xml') {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () =>
        typeof reader.result === 'string'
          ? resolve(reader.result)
          : reject(new Error('Could not read SVG.'));
      reader.onerror = () => reject(new Error('Could not read SVG.'));
      reader.readAsDataURL(file);
    });
  }

  const img = await loadImageFromFile(file);
  const scale = Math.min(1, MAX_EDGE_PX / Math.max(img.width, img.height));
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
  while (blob.size > TARGET_MAX_BYTES && quality > JPEG_QUALITY_MIN) {
    quality -= 5;
    blob = await canvasToJpegBlob(canvas, quality);
  }

  return blobToDataUrl(blob);
}

const GALLERY_MAX_EDGE_PX = 720;
const GALLERY_TARGET_MAX_BYTES = 90_000;
const GALLERY_JPEG_QUALITY_START = 78;
const GALLERY_JPEG_QUALITY_MIN = 52;

/** Smaller thumbs for hero training gallery — keeps page weight low while staying sharp at display size. */
export async function compressSecurityWebsiteGalleryThumbFile(file: File): Promise<string> {
  const mime = (file.type || '').toLowerCase();
  if (mime === 'image/svg+xml') {
    return compressSecurityWebsiteImageFile(file);
  }

  const img = await loadImageFromFile(file);
  const scale = Math.min(1, GALLERY_MAX_EDGE_PX / Math.max(img.width, img.height));
  const width = Math.max(1, Math.round(img.width * scale));
  const height = Math.max(1, Math.round(img.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not compress image.');
  ctx.drawImage(img, 0, 0, width, height);

  let quality = GALLERY_JPEG_QUALITY_START;
  let blob = await canvasToJpegBlob(canvas, quality);
  while (blob.size > GALLERY_TARGET_MAX_BYTES && quality > GALLERY_JPEG_QUALITY_MIN) {
    quality -= 4;
    blob = await canvasToJpegBlob(canvas, quality);
  }

  return blobToDataUrl(blob);
}
