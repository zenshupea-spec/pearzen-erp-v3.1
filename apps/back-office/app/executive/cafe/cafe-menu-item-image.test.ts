import { describe, expect, it } from 'vitest';

import {
  DEFAULT_CAFE_MENU_ITEM_IMAGE_FRAME,
  cafeMenuItemHasImage,
  normalizeCafeMenuItemImageFrame,
} from './cafe-menu-item-image';

describe('cafe-menu-item-image', () => {
  it('normalizes image frame defaults', () => {
    expect(normalizeCafeMenuItemImageFrame(null)).toEqual(DEFAULT_CAFE_MENU_ITEM_IMAGE_FRAME);
    expect(
      normalizeCafeMenuItemImageFrame({ objectPosition: '20% 80%', scale: 1.4 }),
    ).toEqual({ objectPosition: '20% 80%', scale: 1.4 });
  });

  it('detects image presence from url or legacy flag', () => {
    expect(cafeMenuItemHasImage({ imageUrl: 'data:image/jpeg;base64,abc' })).toBe(true);
    expect(cafeMenuItemHasImage({ hasImage: true })).toBe(true);
    expect(cafeMenuItemHasImage({})).toBe(false);
  });
});
