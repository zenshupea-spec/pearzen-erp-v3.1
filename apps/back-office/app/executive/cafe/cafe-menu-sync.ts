import {
  consumeIngredientStock,
  consumeIngredientsForRecipe,
  type Ingredient,
} from './cafe-ingredient-utils';

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
  recipe: RecipeLine[];
  availableToSell: number;
  minReadyStock: number;
  rollingAvg14d: number;
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

export function calcAvailableToSell(recipe: RecipeLine[], ingredients: Ingredient[]): number {
  if (!recipe.length) return 0;
  const yields = recipe.map((line) => {
    if (line.quantity <= 0) return 0;
    const ing = ingredients.find((i) => i.id === line.ingredientId);
    if (!ing) return 0;
    return Math.floor(ing.currentStock / line.quantity);
  });
  return Math.min(...yields);
}

export function calcMenuRollingAvg14d(recipe: RecipeLine[], ingredients: Ingredient[]): number {
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
    const rollingAvg14d = calcMenuRollingAvg14d(item.recipe, ingredients);
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
  return {
    recipeCost: raw.recipeCost ?? 0,
    targetMargin: raw.targetMargin ?? 65,
    hasImage: raw.hasImage ?? false,
    recipe: raw.recipe ?? [],
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
): T[] {
  return items.map((item) => {
    const recipe = item.recipe ?? [];
    return {
      ...item,
      recipe,
      recipeCost: calcRecipeCost(recipe, ingredients),
      availableToSell: calcAvailableToSell(recipe, ingredients),
      rollingAvg14d: calcMenuRollingAvg14d(recipe, ingredients),
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
