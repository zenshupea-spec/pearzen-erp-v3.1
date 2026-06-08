import type { CafeDisplayItem, CafeMenuItem, CafePrepItem } from './actions';
import { calcEffectiveMenuDailyUnits } from './cafe-menu-sync';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type KitchenTrackKind = 'none' | 'prep' | 'display';

export function newPrepRowId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `prep-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function getMenuKitchenTrackKind(
  menuItemId: string,
  prepItems: CafePrepItem[],
  displayItems: CafeDisplayItem[],
): KitchenTrackKind {
  if (displayItems.some((row) => row.menuItemId === menuItemId)) return 'display';
  if (prepItems.some((row) => row.menuItemId === menuItemId)) return 'prep';
  return 'none';
}

export function removeMenuFromKitchenTrack(
  menuItemId: string,
  prepItems: CafePrepItem[],
  displayItems: CafeDisplayItem[],
): { prepItems: CafePrepItem[]; displayItems: CafeDisplayItem[] } {
  return {
    prepItems: prepItems.filter((row) => row.menuItemId !== menuItemId),
    displayItems: displayItems.filter((row) => row.menuItemId !== menuItemId),
  };
}

export function setMenuKitchenTrack(
  menu: CafeMenuItem,
  track: KitchenTrackKind,
  prepItems: CafePrepItem[],
  displayItems: CafeDisplayItem[],
): { prepItems: CafePrepItem[]; displayItems: CafeDisplayItem[] } {
  const cleared = removeMenuFromKitchenTrack(menu.id, prepItems, displayItems);
  if (track === 'none') return cleared;

  const effectiveDaily = calcEffectiveMenuDailyUnits(menu.minReadyStock, menu.rollingAvg14d);
  if (track === 'prep') {
    return {
      prepItems: [
        ...cleared.prepItems,
        {
          id: newPrepRowId(),
          menuItemId: menu.id,
          name: menu.name,
          unit: 'pcs',
          currentStock: 0,
          rollingAvg14d: effectiveDaily,
          shelfLifeDays: 1,
        },
      ],
      displayItems: cleared.displayItems,
    };
  }

  return {
    prepItems: cleared.prepItems,
    displayItems: [
      ...cleared.displayItems,
      {
        id: newPrepRowId(),
        menuItemId: menu.id,
        name: menu.name,
        currentWhole: 0,
        currentSlices: 0,
        slicesPerWhole: 8,
        rollingAvg14d: effectiveDaily,
        shelfLifeDays: 1,
      },
    ],
  };
}

/** Sync names and demand on explicitly linked prep/display rows only. */
export function reconcilePrepWithMenu(
  menuItems: CafeMenuItem[],
  prepItems: CafePrepItem[],
  displayItems: CafeDisplayItem[],
): { prepItems: CafePrepItem[]; displayItems: CafeDisplayItem[] } {
  const menuById = new Map(menuItems.map((menu) => [menu.id, menu]));
  const menuIds = new Set(menuItems.map((menu) => menu.id));

  const nextPrep: CafePrepItem[] = [];
  for (const row of prepItems) {
    if (!row.menuItemId || !menuIds.has(row.menuItemId)) continue;
    const menu = menuById.get(row.menuItemId)!;
    const effectiveDaily = calcEffectiveMenuDailyUnits(menu.minReadyStock, menu.rollingAvg14d);
    nextPrep.push({
      ...row,
      id: row.id && UUID_RE.test(row.id) ? row.id : newPrepRowId(),
      menuItemId: menu.id,
      name: menu.name,
      rollingAvg14d: effectiveDaily,
    });
  }

  const nextDisplay: CafeDisplayItem[] = [];
  for (const row of displayItems) {
    if (!row.menuItemId || !menuIds.has(row.menuItemId)) continue;
    const menu = menuById.get(row.menuItemId)!;
    const effectiveDaily = calcEffectiveMenuDailyUnits(menu.minReadyStock, menu.rollingAvg14d);
    nextDisplay.push({
      ...row,
      id: row.id && UUID_RE.test(row.id) ? row.id : newPrepRowId(),
      menuItemId: menu.id,
      name: menu.name,
      rollingAvg14d: effectiveDaily,
    });
  }

  return { prepItems: nextPrep, displayItems: nextDisplay };
}
