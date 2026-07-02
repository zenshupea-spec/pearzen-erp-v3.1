import { describe, expect, it } from 'vitest';

import {
  buildShalomPropertyPhotoObjectPath,
  formatShalomPublicMediaStorageRef,
  parseShalomPublicMediaStorageRef,
  parseShalomPublicPropertyPhotos,
  resolveShalomPublicMediaPublicUrl,
  SHALOM_PUBLIC_MEDIA_BUCKET,
} from './shalom-public-media-storage';

describe('shalom-public-media-storage', () => {
  it('builds property photo object paths under company/property', () => {
    expect(
      buildShalomPropertyPhotoObjectPath('co-1', 'prop-1', 'file-1', 'webp'),
    ).toBe('co-1/prop-1/file-1.webp');
  });

  it('round-trips storage refs', () => {
    const objectPath = buildShalomPropertyPhotoObjectPath('co-1', 'prop-1', 'abc');
    const ref = formatShalomPublicMediaStorageRef(SHALOM_PUBLIC_MEDIA_BUCKET, objectPath);
    expect(parseShalomPublicMediaStorageRef(ref)).toEqual({
      bucket: SHALOM_PUBLIC_MEDIA_BUCKET,
      objectPath,
    });
  });

  it('resolves public URLs from storage refs', () => {
    const ref = formatShalomPublicMediaStorageRef(
      SHALOM_PUBLIC_MEDIA_BUCKET,
      'co/prop/x.jpg',
    );
    expect(
      resolveShalomPublicMediaPublicUrl('https://example.supabase.co', ref),
    ).toBe('https://example.supabase.co/storage/v1/object/public/shalom-public-media/co/prop/x.jpg');
  });

  it('parses ordered gallery json', () => {
    const photos = parseShalomPublicPropertyPhotos([
      { id: 'a', storageRef: 'storage://shalom-public-media/co/p/1.jpg', sortOrder: 1 },
      { id: 'b', url: 'storage://shalom-public-media/co/p/2.jpg', sortOrder: 0 },
    ]);
    expect(photos.map((p) => p.id)).toEqual(['b', 'a']);
  });
});
