'use client';

import {
  HR_DOC_JPEG_QUALITY_MIN,
  HR_DOC_JPEG_QUALITY_START,
  HR_DOC_MAX_EDGE_PX,
  HR_DOC_TARGET_MAX_BYTES,
  formatHrDocumentBytes,
} from './hr-document-compress';

export { formatHrDocumentBytes };

export type ClientCompressionResult = {
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

async function compressImageFile(file: File): Promise<ClientCompressionResult> {
  const img = await loadImageFromFile(file);
  const scale = Math.min(1, HR_DOC_MAX_EDGE_PX / Math.max(img.width, img.height));
  const width = Math.max(1, Math.round(img.width * scale));
  const height = Math.max(1, Math.round(img.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not compress image.');
  ctx.drawImage(img, 0, 0, width, height);
  const grayscale = ctx.getImageData(0, 0, width, height);
  const data = grayscale.data;
  for (let i = 0; i < data.length; i += 4) {
    const gray = Math.round(data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114);
    data[i] = gray;
    data[i + 1] = gray;
    data[i + 2] = gray;
  }
  ctx.putImageData(grayscale, 0, 0);

  let quality = HR_DOC_JPEG_QUALITY_START;
  let blob = await canvasToJpegBlob(canvas, quality);
  while (blob.size > HR_DOC_TARGET_MAX_BYTES && quality > HR_DOC_JPEG_QUALITY_MIN) {
    quality -= 4;
    blob = await canvasToJpegBlob(canvas, quality);
  }

  const baseName = file.name.replace(/\.[^.]+$/, '') || 'document';
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

/** Browser-side compression for immediate preview. PDFs are compressed on the server at upload. */
export async function compressHrDocumentFileClient(
  file: File,
  options: { officeCopyWatermark?: boolean } = {},
): Promise<ClientCompressionResult> {
  const mime = (file.type || '').toLowerCase();
  if (mime === 'application/pdf') {
    return {
      file,
      originalBytes: file.size,
      compressedBytes: file.size,
      previewUrl: URL.createObjectURL(file),
    };
  }
  if (mime === 'image/jpeg' || mime === 'image/png' || mime === 'image/webp') {
    const { applyOfficeCopyWatermarkToFile } = await import('./identity-document-watermark-client');
    const source = options.officeCopyWatermark ? await applyOfficeCopyWatermarkToFile(file) : file;
    return compressImageFile(source);
  }
  throw new Error('Use PDF, JPEG, PNG, or WebP.');
}

export function replaceFileInputFiles(input: HTMLInputElement, file: File) {
  const dt = new DataTransfer();
  dt.items.add(file);
  input.files = dt.files;
}
