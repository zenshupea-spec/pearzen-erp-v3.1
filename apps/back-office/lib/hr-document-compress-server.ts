import sharp from 'sharp';

import {
  HR_DOC_JPEG_QUALITY_MIN,
  HR_DOC_JPEG_QUALITY_START,
  HR_DOC_MAX_EDGE_PX,
  HR_DOC_TARGET_MAX_BYTES,
  type HrDocumentCompressionResult,
} from './hr-document-compress';
import { applyOfficeCopyWatermarkBuffer } from './identity-document-watermark-server';

export type HrDocumentCompressOptions = {
  officeCopyWatermark?: boolean;
};

async function compressImageBuffer(input: Buffer): Promise<Buffer> {
  let quality = HR_DOC_JPEG_QUALITY_START;
  let output = await sharp(input)
    .rotate()
    .grayscale()
    .resize({
      width: HR_DOC_MAX_EDGE_PX,
      height: HR_DOC_MAX_EDGE_PX,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .jpeg({ quality, mozjpeg: true })
    .toBuffer();

  while (output.length > HR_DOC_TARGET_MAX_BYTES && quality > HR_DOC_JPEG_QUALITY_MIN) {
    quality -= 4;
    output = await sharp(input)
      .rotate()
      .grayscale()
      .resize({
        width: HR_DOC_MAX_EDGE_PX,
        height: HR_DOC_MAX_EDGE_PX,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .jpeg({ quality, mozjpeg: true })
      .toBuffer();
  }

  return output;
}

async function compressPdfBuffer(input: Buffer): Promise<Buffer | null> {
  try {
    let quality = HR_DOC_JPEG_QUALITY_START;
    let output = await sharp(input, { density: 160, pages: -1 })
      .grayscale()
      .resize({
        width: HR_DOC_MAX_EDGE_PX,
        height: HR_DOC_MAX_EDGE_PX,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .jpeg({ quality, mozjpeg: true })
      .toBuffer();

    while (output.length > HR_DOC_TARGET_MAX_BYTES && quality > HR_DOC_JPEG_QUALITY_MIN) {
      quality -= 4;
      output = await sharp(input, { density: 160, pages: -1 })
        .grayscale()
        .resize({
          width: HR_DOC_MAX_EDGE_PX,
          height: HR_DOC_MAX_EDGE_PX,
          fit: 'inside',
          withoutEnlargement: true,
        })
        .jpeg({ quality, mozjpeg: true })
        .toBuffer();
    }

    return output;
  } catch {
    return null;
  }
}

export async function compressHrDocumentBuffer(
  input: Buffer,
  mime: string,
  options: HrDocumentCompressOptions = {},
): Promise<HrDocumentCompressionResult> {
  const originalBytes = input.length;
  const normalizedMime = (mime || 'application/octet-stream').toLowerCase();

  async function finalizeImageBuffer(buffer: Buffer): Promise<Buffer> {
    if (!options.officeCopyWatermark) return buffer;
    return applyOfficeCopyWatermarkBuffer(buffer);
  }

  if (normalizedMime === 'application/pdf') {
    const converted = await compressPdfBuffer(input);
    if (converted) {
      const watermarked = await finalizeImageBuffer(converted);
      return {
        buffer: watermarked,
        contentType: 'image/jpeg',
        ext: 'jpg',
        originalBytes,
        compressedBytes: watermarked.length,
      };
    }
    if (input.length <= HR_DOC_TARGET_MAX_BYTES) {
      return {
        buffer: input,
        contentType: 'application/pdf',
        ext: 'pdf',
        originalBytes,
        compressedBytes: input.length,
      };
    }
    throw new Error(
      'PDF is too large to store. Scan as JPEG/PNG or use a smaller PDF.',
    );
  }

  if (
    normalizedMime === 'image/jpeg' ||
    normalizedMime === 'image/png' ||
    normalizedMime === 'image/webp'
  ) {
    const compressed = await finalizeImageBuffer(await compressImageBuffer(input));
    return {
      buffer: compressed,
      contentType: 'image/jpeg',
      ext: 'jpg',
      originalBytes,
      compressedBytes: compressed.length,
    };
  }

  throw new Error('Use PDF, JPEG, PNG, or WebP.');
}
