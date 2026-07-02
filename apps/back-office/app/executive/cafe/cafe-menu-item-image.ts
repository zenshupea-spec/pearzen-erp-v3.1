export type CafeMenuItemImageFrame = {
  objectPosition: string;
  scale: number;
};

export const DEFAULT_CAFE_MENU_ITEM_IMAGE_FRAME: CafeMenuItemImageFrame = {
  objectPosition: 'center',
  scale: 1,
};

export function normalizeCafeMenuItemImageFrame(
  value: unknown,
): CafeMenuItemImageFrame {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return DEFAULT_CAFE_MENU_ITEM_IMAGE_FRAME;
  }
  const row = value as Record<string, unknown>;
  const objectPosition =
    typeof row.objectPosition === 'string' && row.objectPosition.trim()
      ? row.objectPosition.trim()
      : DEFAULT_CAFE_MENU_ITEM_IMAGE_FRAME.objectPosition;
  const scaleRaw =
    typeof row.scale === 'number' ? row.scale : Number.parseFloat(String(row.scale ?? ''));
  const scale = Number.isFinite(scaleRaw)
    ? Math.min(3, Math.max(1, scaleRaw))
    : DEFAULT_CAFE_MENU_ITEM_IMAGE_FRAME.scale;
  return { objectPosition, scale };
}

export function cafeMenuItemHasImage(item: {
  imageUrl?: string | null;
  hasImage?: boolean;
}): boolean {
  return Boolean(item.imageUrl?.trim()) || Boolean(item.hasImage);
}
