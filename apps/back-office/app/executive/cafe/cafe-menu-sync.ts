import {
  consumeIngredientStock,
  consumeIngredientsForRecipe,
  stockFromLots,
  type Ingredient,
} from './cafe-ingredient-utils';
import {
  calcMenuWeekdayVelocity,
  type MenuDailySaleRecord,
} from './cafe-menu-velocity';

import {
  DEFAULT_CAFE_MENU_ITEM_IMAGE_FRAME,
  normalizeCafeMenuItemImageFrame,
  type CafeMenuItemImageFrame,
} from './cafe-menu-item-image';

export type { CafeMenuItemImageFrame } from './cafe-menu-item-image';

export interface RecipeLine {
  ingredientId: string;
  quantity: number;
}

export interface CafeMenuRecipeItem {
  id: string;
  name: string;
  category: string;
  recipeCost: number;
  targetMargin: number;
  hasImage: boolean;
  imageUrl: string | null;
  imageFrame: CafeMenuItemImageFrame;
  recipe: RecipeLine[];
  availableToSell: number;
  minReadyStock: number;
  rollingAvg14d: number;
  velocityBoostCarry?: number;
  velocityBoostWeekIso?: string;
}

export const PLANNING_DAYS = 14;
export const SUPPLY_WEEKS = 1.5;
export const SUPPLY_DAYS = SUPPLY_WEEKS * 7;

export const MENU_DEFAULT_CATS = [
  'Hot Beverages',
  'Cold Beverages',
  'Pastries & Bakery',
  'Mains & Sandwiches',
  'Desserts',
];

export function calcRecipeCost(recipe: RecipeLine[], ingredients: Ingredient[]): number {
  return Math.round(
    recipe.reduce((sum, line) => {
      const ing = ingredients.find((i) => i.id === line.ingredientId);
      if (!ing) return sum;
      return sum + ing.unitPrice * line.quantity;
    }, 0),
  );
}

export function calcBaseCost(recipeCost: number, overheadPct: number): number {
  return Math.round(recipeCost * (1 + overheadPct / 100));
}

export function calcSellingPrice(baseCost: number, margin: number): number {
  if (margin >= 99) return baseCost * 10;
  return Math.round(baseCost / (1 - margin / 100));
}

/** Coerce legacy snapshot recipe lines (snake_case ids, partial rows). */
export function normalizeRecipeLine(raw: unknown): RecipeLine | null {
  if (!raw || typeof raw !== 'object') return null;
  const line = raw as Record<string, unknown>;
  const ingredientId = String(line.ingredientId ?? line.ingredient_id ?? '').trim();
  const quantity = Number(line.quantity ?? line.qty ?? 0);
  if (!ingredientId) return null;
  return { ingredientId, quantity: Number.isFinite(quantity) ? quantity : 0 };
}

export function normalizeRecipe(recipe: unknown): RecipeLine[] {
  if (!Array.isArray(recipe)) return [];
  return recipe
    .map((line) => normalizeRecipeLine(line))
    .filter((line): line is RecipeLine => line != null);
}

/** On-hand stock from active lots, falling back to persisted currentStock. */
export function liveIngredientStock(ing: Ingredient): number {
  const activeLotStock = stockFromLots(ing.stockLots.filter((lot) => lot.quantity > 0));
  if (activeLotStock > 0) return activeLotStock;
  return Math.max(0, ing.currentStock ?? 0);
}

export type MenuAvailContext = {
  prepItems?: Array<{ menuItemId: string; currentStock: number }>;
  displayItems?: Array<{
    menuItemId: string;
    currentWhole: number;
    currentSlices: number;
    slicesPerWhole: number;
  }>;
};

function calcPrepDisplayAvailable(menuItemId: string, ctx: MenuAvailContext): number | null {
  const display = ctx.displayItems?.find((row) => row.menuItemId === menuItemId);
  if (display) {
    return Math.max(
      0,
      Math.floor(
        display.currentSlices + display.currentWhole * (display.slicesPerWhole || 10),
      ),
    );
  }
  const prep = ctx.prepItems?.find((row) => row.menuItemId === menuItemId);
  if (prep) {
    return Math.max(0, Math.floor(prep.currentStock));
  }
  return null;
}

/** Min recipe yield from live ingredient stock, or prep/display on-hand when linked. */
export function calcMenuAvailableToSell(
  menuItemId: string,
  recipe: RecipeLine[] | unknown,
  ingredients: Ingredient[],
  ctx: MenuAvailContext = {},
): number {
  const prepDisplay = calcPrepDisplayAvailable(menuItemId, ctx);
  if (prepDisplay != null) return prepDisplay;
  return calcAvailableToSell(normalizeRecipe(recipe), ingredients);
}

export function calcAvailableToSell(recipe: RecipeLine[] | unknown, ingredients: Ingredient[]): number {
  const lines = normalizeRecipe(recipe);
  if (!lines.length) return 0;
  const yields = lines.map((line) => {
    if (line.quantity <= 0) return 0;
    const ing = ingredients.find((i) => i.id === line.ingredientId);
    if (!ing) return 0;
    return Math.floor(liveIngredientStock(ing) / line.quantity);
  });
  return Math.min(...yields);
}

/** Ingredient-implied daily units (legacy fallback when no POS weekday history). */
export function calcMenuRollingAvg14dFromIngredients(
  recipe: RecipeLine[],
  ingredients: Ingredient[],
): number {
  if (!recipe.length) return 0;
  const impliedDaily = recipe
    .map((line) => {
      if (line.quantity <= 0) return 0;
      const ing = ingredients.find((i) => i.id === line.ingredientId);
      if (!ing || ing.rollingAvg14dUsage <= 0) return 0;
      return ing.rollingAvg14dUsage / line.quantity;
    })
    .filter((rate) => rate > 0);
  if (!impliedDaily.length) return 0;
  return Math.round(Math.min(...impliedDaily));
}

/** Planning reference daily units — weekday POS avg (+ sold-out boost) when sales exist. */
export function calcMenuReferenceDaily(
  recipe: RecipeLine[],
  ingredients: Ingredient[],
  sales: MenuDailySaleRecord[] = [],
  boostCarry = 0,
  boostWeekIso?: string,
  today: Date = new Date(),
): number {
  if (sales.length > 0) {
    return calcMenuWeekdayVelocity(sales, boostCarry, boostWeekIso, today).referenceDaily;
  }
  return calcMenuRollingAvg14dFromIngredients(recipe, ingredients);
}

/** @deprecated Use calcMenuReferenceDaily — kept for call-site compatibility. */
export function calcMenuRollingAvg14d(
  recipe: RecipeLine[],
  ingredients: Ingredient[],
  sales: MenuDailySaleRecord[] = [],
  boostCarry = 0,
  boostWeekIso?: string,
  today: Date = new Date(),
): number {
  return calcMenuReferenceDaily(recipe, ingredients, sales, boostCarry, boostWeekIso, today);
}

/** Finished-menu units per day implied by MD min/day and 14d sales velocity. */
export function calcEffectiveMenuDailyUnits(minReadyStock: number, rollingAvg14d: number): number {
  return Math.max(minReadyStock, rollingAvg14d);
}

/** 14-day ready-stock target for a menu item (units). */
export function calcMenu14dTarget(minReadyStock: number, rollingAvg14d: number): number {
  return calcEffectiveMenuDailyUnits(minReadyStock, rollingAvg14d) * PLANNING_DAYS;
}

/** Ingredient gm/ml per day implied by menu BOM mins and 14d averages. */
export function calcMenuIngredientDailyDemand(
  ingredientId: string,
  menuItems: CafeMenuRecipeItem[],
  ingredients: Ingredient[],
): number {
  let total = 0;
  for (const item of menuItems) {
    if (!item.recipe.some((line) => line.ingredientId === ingredientId)) continue;
    const rollingAvg14d =
      item.rollingAvg14d > 0
        ? item.rollingAvg14d
        : calcMenuRollingAvg14dFromIngredients(item.recipe, ingredients);
    const dailyUnits = calcEffectiveMenuDailyUnits(item.minReadyStock, rollingAvg14d);
    for (const line of item.recipe) {
      if (line.ingredientId !== ingredientId) continue;
      total += dailyUnits * line.quantity;
    }
  }
  return total;
}

/** 14-day stock target for an ingredient from menu BOM, usage velocity, and MD floor. */
export function calcIngredient14dTarget(
  ing: Ingredient,
  menuItems: CafeMenuRecipeItem[],
  ingredients: Ingredient[],
): number {
  const menuDaily = calcMenuIngredientDailyDemand(ing.id, menuItems, ingredients);
  const menuTargetStock = Math.ceil(menuDaily * PLANNING_DAYS);
  const usageTargetStock = Math.ceil(ing.rollingAvg14dUsage * PLANNING_DAYS);
  return Math.max(menuTargetStock, usageTargetStock, ing.minimumStock);
}

export function calcIngredientOrderQty(
  ing: Ingredient,
  menuItems: CafeMenuRecipeItem[],
  ingredients: Ingredient[],
): number {
  const targetStock = calcIngredient14dTarget(ing, menuItems, ingredients);
  return Math.max(0, Math.ceil(targetStock - ing.currentStock));
}

export function calcIngredientMdDaily(ing: Ingredient): number {
  return ing.minimumStock > 0 ? ing.minimumStock / PLANNING_DAYS : 0;
}

export function calcIngredientVelocityBoost(ing: Ingredient, menuDaily: number): boolean {
  const mdDaily = calcIngredientMdDaily(ing);
  return (
    (ing.rollingAvg14dUsage > mdDaily && mdDaily > 0) ||
    (menuDaily > mdDaily && menuDaily > 0)
  );
}

export function calcIngredientBelowMinimum(
  ing: Ingredient,
  menuDaily: number,
): boolean {
  return (
    ing.currentStock < ing.minimumStock ||
    (menuDaily > 0 && ing.currentStock < Math.ceil(menuDaily * PLANNING_DAYS))
  );
}

export function normalizeMenuItem(
  raw: Partial<CafeMenuRecipeItem> & Pick<CafeMenuRecipeItem, 'id' | 'name' | 'category'>,
): CafeMenuRecipeItem {
  const imageUrl =
    typeof raw.imageUrl === 'string' && raw.imageUrl.trim() ? raw.imageUrl.trim() : null;
  const imageFrame = normalizeCafeMenuItemImageFrame(raw.imageFrame);
  return {
    recipeCost: raw.recipeCost ?? 0,
    targetMargin: raw.targetMargin ?? 65,
    imageUrl,
    imageFrame,
    hasImage: Boolean(imageUrl) || Boolean(raw.hasImage),
    recipe: normalizeRecipe(raw.recipe ?? []),
    availableToSell: raw.availableToSell ?? 0,
    minReadyStock: raw.minReadyStock ?? 0,
    rollingAvg14d: raw.rollingAvg14d ?? 0,
    id: raw.id,
    name: raw.name,
    category: raw.category,
  };
}

export function normalizeMenuItems(
  items: Array<Partial<CafeMenuRecipeItem> & Pick<CafeMenuRecipeItem, 'id' | 'name' | 'category'>>,
): CafeMenuRecipeItem[] {
  return items.map((item) => normalizeMenuItem({ ...item, recipe: item.recipe ?? [] }));
}

export function syncMenuRecipeCosts<T extends CafeMenuRecipeItem>(
  items: T[],
  ingredients: Ingredient[],
  salesByMenuId: Map<string, MenuDailySaleRecord[]> = new Map(),
  today: Date = new Date(),
  availCtx: MenuAvailContext = {},
): T[] {
  return items.map((item) => {
    const recipe = normalizeRecipe(item.recipe ?? []);
    const sales = salesByMenuId.get(item.id) ?? [];
    const velocity = sales.length
      ? calcMenuWeekdayVelocity(
          sales,
          item.velocityBoostCarry ?? 0,
          item.velocityBoostWeekIso,
          today,
        )
      : null;
    return {
      ...item,
      recipe,
      recipeCost: calcRecipeCost(recipe, ingredients),
      availableToSell: calcMenuAvailableToSell(item.id, recipe, ingredients, availCtx),
      rollingAvg14d: calcMenuReferenceDaily(
        recipe,
        ingredients,
        sales,
        item.velocityBoostCarry ?? 0,
        item.velocityBoostWeekIso,
        today,
      ),
      velocityBoostCarry: velocity?.soldOutBoost ?? item.velocityBoostCarry ?? 0,
      velocityBoostWeekIso: velocity?.boostWeekIso ?? item.velocityBoostWeekIso,
    };
  });
}

/** Deduct recipe stock on POS sale — lowest use-priority lot first. */
export function applyMenuSaleToIngredients(
  ingredients: Ingredient[],
  menuItem: Pick<CafeMenuRecipeItem, 'recipe'>,
  unitsSold: number,
): Ingredient[] {
  return consumeIngredientsForRecipe(ingredients, menuItem.recipe, unitsSold);
}

/** Deduct a single ingredient on wastage — lowest use-priority lot first. */
export function applyIngredientWastage(
  ingredients: Ingredient[],
  ingredientId: string,
  quantity: number,
): Ingredient[] {
  return ingredients.map((ing) =>
    ing.id === ingredientId ? consumeIngredientStock(ing, quantity) : ing,
  );
}
