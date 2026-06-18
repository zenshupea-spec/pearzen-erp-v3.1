import sharp from 'sharp';

import { OFFICE_COPY_WATERMARK_TEXT } from './identity-document-watermark';

function buildWatermarkSvg(width: number, height: number): Buffer {
  const tileW = 320;
  const tileH = 140;
  const fontSize = Math.max(14, Math.round(Math.min(width, height) / 28));
  const safeText = OFFICE_COPY_WATERMARK_TEXT.replace(/[<>&'"]/g, '');

  const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <pattern id="officeCopy" patternUnits="userSpaceOnUse" width="${tileW}" height="${tileH}" patternTransform="rotate(-28)">
      <text x="8" y="${Math.round(tileH * 0.55)}" font-family="Arial, Helvetica, sans-serif" font-size="${fontSize}" font-weight="700" fill="rgba(185,28,28,0.38)">${safeText}</text>
    </pattern>
  </defs>
  <rect width="100%" height="100%" fill="url(#officeCopy)" />
</svg>`;

  return Buffer.from(svg);
}

/** Burn a diagonal office-copy watermark into a JPEG/PNG/WebP buffer. */
export async function applyOfficeCopyWatermarkBuffer(input: Buffer): Promise<Buffer> {
  const base = sharp(input).rotate();
  const meta = await base.metadata();
  const width = meta.width ?? 1200;
  const height = meta.height ?? 1600;

  return base
    .composite([{ input: buildWatermarkSvg(width, height), top: 0, left: 0 }])
    .jpeg({ quality: 88, mozjpeg: true })
    .toBuffer();
}
