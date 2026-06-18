'use client';

import { OFFICE_COPY_WATERMARK_TEXT } from './identity-document-watermark';

function canvasToJpegBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('Could not apply watermark.'));
          return;
        }
        resolve(blob);
      },
      'image/jpeg',
      quality / 100,
    );
  });
}

function drawOfficeCopyWatermark(ctx: CanvasRenderingContext2D, width: number, height: number) {
  const fontSize = Math.max(14, Math.round(Math.min(width, height) / 28));
  ctx.save();
  ctx.translate(width / 2, height / 2);
  ctx.rotate((-28 * Math.PI) / 180);
  ctx.font = `700 ${fontSize}px Arial, Helvetica, sans-serif`;
  ctx.fillStyle = 'rgba(185, 28, 28, 0.38)';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const stepX = fontSize * 11;
  const stepY = fontSize * 4.5;
  const cols = Math.ceil(width / stepX) + 2;
  const rows = Math.ceil(height / stepY) + 2;
  const startX = -((cols * stepX) / 2);
  const startY = -((rows * stepY) / 2);

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      ctx.fillText(
        OFFICE_COPY_WATERMARK_TEXT,
        startX + col * stepX,
        startY + row * stepY,
      );
    }
  }
  ctx.restore();
}

/** Client-side burned-in watermark for identity scans before upload. */
export async function applyOfficeCopyWatermarkToFile(file: File): Promise<File> {
  const mime = (file.type || '').toLowerCase();
  if (mime === 'application/pdf') return file;

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not read image.'));
    };
    image.src = url;
  });

  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not apply watermark.');

  ctx.drawImage(img, 0, 0);
  drawOfficeCopyWatermark(ctx, canvas.width, canvas.height);

  const blob = await canvasToJpegBlob(canvas, 88);
  const baseName = file.name.replace(/\.[^.]+$/, '') || 'document';
  return new File([blob], `${baseName}.jpg`, {
    type: 'image/jpeg',
    lastModified: Date.now(),
  });
}

export function OfficeCopyWatermarkOverlay({ className = '' }: { className?: string }) {
  return (
    <div
      className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`}
      aria-hidden
    >
      <div className="absolute inset-[-45%] flex rotate-[-28deg] flex-wrap content-center justify-center gap-x-10 gap-y-8 opacity-40">
        {Array.from({ length: 18 }).map((_, index) => (
          <span
            key={index}
            className="select-none whitespace-nowrap text-sm font-black uppercase tracking-[0.2em] text-red-700"
          >
            {OFFICE_COPY_WATERMARK_TEXT}
          </span>
        ))}
      </div>
    </div>
  );
}
