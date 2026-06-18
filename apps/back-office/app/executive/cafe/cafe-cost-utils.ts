import type { CafeDailyStockItem, CafeIngredient } from './actions';

/** Convert stock-list units to ingredient ledger units (gm / ml). */
export function stockQtyToIngredientUnits(
  quantity: number,
  stockUnit: string,
  ingredientUnit: 'gm' | 'ml',
): number {
  const unit = stockUnit.trim().toLowerCase();
  if (unit === ingredientUnit) return quantity;
  if (unit === 'kg' && ingredientUnit === 'gm') return quantity * 1000;
  if (unit === 'l' && ingredientUnit === 'ml') return quantity * 1000;
  if (unit === 'ml' && ingredientUnit === 'gm') return quantity;
  if (unit === 'gm' && ingredientUnit === 'ml') return quantity;
  return quantity;
}

export function calcLoggedWastageCostLkr(
  listA: CafeDailyStockItem[],
  ingredients: CafeIngredient[],
): number {
  const priceByName = new Map(
    ingredients.map((ing) => [ing.name.trim().toLowerCase(), ing]),
  );

  let total = 0;
  for (const item of listA) {
    if (item.loggedWastage <= 0) continue;
    const ing = priceByName.get(item.name.trim().toLowerCase());
    if (!ing || ing.unitPrice <= 0) continue;
    const qty = stockQtyToIngredientUnits(item.loggedWastage, item.unit, ing.unit);
    total += qty * ing.unitPrice;
  }
  return Math.round(total);
}

export function calcPayrollCostLkr(
  staff: Array<{ dailyRate: number; daysWorked: number; otTotalLkr?: number }>,
): number {
  return Math.round(
    staff.reduce(
      (sum, member) =>
        sum + member.dailyRate * member.daysWorked + (member.otTotalLkr ?? 0),
      0,
    ),
  );
}
