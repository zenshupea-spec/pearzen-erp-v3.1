export type IngredientUnit = 'ml' | 'gm';
export type FulfillmentMode = 'bought' | 'delivered';

export interface IngredientSupplier {
  name: string;
  address: string;
  phone: string;
}

export interface IngredientStockLot {
  id: string;
  quantity: number;
  expiresOn: string;
  receivedAt?: string;
  /** Lower = use first (FEFO). Same expiry date shares the same number. */
  usePriority?: number;
}

export const USE_PRIORITY_START = 200;
export const USE_PRIORITY_STEP = 100;

export interface Ingredient {
  id: string;
  name: string;
  brand?: string;
  unit: IngredientUnit;
  purchaseAmount: number;
  packagePrice: number;
  unitPrice: number;
  prevUnitPrice?: number;
  fulfillmentMode: FulfillmentMode;
  currentStock: number;
  minimumStock: number;
  rollingAvg14dUsage: number;
  stockLots: IngredientStockLot[];
  supplier: IngredientSupplier;
}

export interface ExpiryLotRow {
  lotId: string;
  ingredientId: string;
  ingredientName: string;
  brand?: string;
  unit: IngredientUnit;
  quantity: number;
  expiresOn: string;
  daysLeft: number;
  usePriority: number;
}

export function cafeTodayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function normalizeIngredientUnit(unit: string | undefined): IngredientUnit {
  const u = (unit ?? 'gm').toLowerCase();
  return u === 'ml' ? 'ml' : 'gm';
}

export function stockFromLots(lots: IngredientStockLot[]): number {
  return lots.reduce((sum, lot) => sum + lot.quantity, 0);
}

function uniqueExpiryTiers(
  lots: IngredientStockLot[],
): { expiresOn: string; usePriority: number }[] {
  const seen = new Set<string>();
  const tiers: { expiresOn: string; usePriority: number }[] = [];
  for (const lot of lots) {
    if (lot.quantity <= 0 || lot.usePriority == null || seen.has(lot.expiresOn)) continue;
    seen.add(lot.expiresOn);
    tiers.push({ expiresOn: lot.expiresOn, usePriority: lot.usePriority });
  }
  return tiers.sort((a, b) => a.expiresOn.localeCompare(b.expiresOn) || a.usePriority - b.usePriority);
}

/** Assign a write-on-package number for a new lot based on expiry vs existing stock. */
export function assignUsePriorityForNewLot(
  existingLots: IngredientStockLot[],
  newExpiresOn: string,
): number {
  const active = existingLots.filter((l) => l.quantity > 0);
  const sameExpiry = active.find((l) => l.expiresOn === newExpiresOn);
  if (sameExpiry?.usePriority != null) return sameExpiry.usePriority;

  const tiers = uniqueExpiryTiers(active);
  if (tiers.length === 0) return USE_PRIORITY_START;

  let before: { usePriority: number } | null = null;
  let after: { usePriority: number } | null = null;
  for (const tier of tiers) {
    if (tier.expiresOn < newExpiresOn) before = tier;
    else if (tier.expiresOn > newExpiresOn) {
      after = tier;
      break;
    }
  }

  if (!before && after) return after.usePriority - USE_PRIORITY_STEP;
  if (before && !after) return before.usePriority + USE_PRIORITY_STEP;
  if (before && after) return Math.round((before.usePriority + after.usePriority) / 2);
  return USE_PRIORITY_START;
}

/** Backfill missing use-priority numbers on legacy lots (grouped by expiry date). */
export function backfillLotUsePriorities(lots: IngredientStockLot[]): IngredientStockLot[] {
  const active = lots.filter((l) => l.quantity > 0);
  const needsBackfill = active.some((l) => l.usePriority == null);
  if (!needsBackfill) return lots;

  const uniqueExpiries = [...new Set(active.map((l) => l.expiresOn))].sort();
  const n = uniqueExpiries.length;
  const priorityByExpiry = new Map<string, number>();
  for (let i = 0; i < n; i++) {
    priorityByExpiry.set(
      uniqueExpiries[i],
      n === 1 ? USE_PRIORITY_START : Math.round(100 + (i / (n - 1)) * 100),
    );
  }

  return lots.map((lot) => ({
    ...lot,
    usePriority: lot.usePriority ?? priorityByExpiry.get(lot.expiresOn) ?? USE_PRIORITY_START,
  }));
}

export function addIngredientStockLot(
  ing: Ingredient,
  quantity: number,
  expiresOn: string,
): Ingredient {
  if (quantity <= 0) return ing;
  const usePriority = assignUsePriorityForNewLot(ing.stockLots, expiresOn);
  const stockLots = [
    ...ing.stockLots,
    {
      id: crypto.randomUUID(),
      quantity,
      expiresOn,
      receivedAt: cafeTodayStr(),
      usePriority,
    },
  ];
  return { ...ing, stockLots, currentStock: stockFromLots(stockLots) };
}

/** Deduct stock from lowest use-priority lots first (then earliest expiry). */
export function consumeIngredientStock(ing: Ingredient, quantity: number): Ingredient {
  if (quantity <= 0) return ing;
  let remaining = quantity;
  const order = ing.stockLots
    .map((lot, idx) => ({ lot, idx }))
    .filter(({ lot }) => lot.quantity > 0)
    .sort((a, b) => {
      const pa = a.lot.usePriority ?? USE_PRIORITY_START;
      const pb = b.lot.usePriority ?? USE_PRIORITY_START;
      if (pa !== pb) return pa - pb;
      return a.lot.expiresOn.localeCompare(b.lot.expiresOn);
    });

  const stockLots = [...ing.stockLots];
  for (const { lot, idx } of order) {
    if (remaining <= 0) break;
    const take = Math.min(lot.quantity, remaining);
    stockLots[idx] = { ...lot, quantity: lot.quantity - take };
    remaining -= take;
  }

  return { ...ing, stockLots, currentStock: stockFromLots(stockLots) };
}

export function consumeIngredientsForRecipe(
  ingredients: Ingredient[],
  recipe: { ingredientId: string; quantity: number }[],
  units: number,
): Ingredient[] {
  if (units <= 0) return ingredients;
  return ingredients.map((ing) => {
    const line = recipe.find((l) => l.ingredientId === ing.id);
    if (!line || line.quantity <= 0) return ing;
    return consumeIngredientStock(ing, line.quantity * units);
  });
}

export function daysUntilExpiry(expiresOn: string): number {
  const today = new Date(`${cafeTodayStr()}T12:00:00`);
  const expiry = new Date(`${expiresOn}T12:00:00`);
  return Math.round((expiry.getTime() - today.getTime()) / 86_400_000);
}

export function buildExpiryRows(ingredients: Ingredient[]): ExpiryLotRow[] {
  const rows: ExpiryLotRow[] = [];
  for (const ing of ingredients) {
    for (const lot of ing.stockLots) {
      if (lot.quantity <= 0) continue;
      rows.push({
        lotId: lot.id,
        ingredientId: ing.id,
        ingredientName: ing.name,
        brand: ing.brand,
        unit: ing.unit,
        quantity: lot.quantity,
        expiresOn: lot.expiresOn,
        daysLeft: daysUntilExpiry(lot.expiresOn),
        usePriority: lot.usePriority ?? USE_PRIORITY_START,
      });
    }
  }
  return rows.sort(
    (a, b) =>
      a.usePriority - b.usePriority ||
      a.daysLeft - b.daysLeft ||
      a.expiresOn.localeCompare(b.expiresOn),
  );
}

export function normalizeIngredient(
  raw: Partial<Ingredient> & Pick<Ingredient, 'id' | 'name' | 'supplier'>,
): Ingredient {
  const unit = normalizeIngredientUnit(raw.unit);
  const purchaseAmount = raw.purchaseAmount ?? 1000;
  const legacyUnitPrice = raw.unitPrice ?? 0;
  const packagePrice = raw.packagePrice ?? Math.round(legacyUnitPrice * purchaseAmount);
  const unitPrice = purchaseAmount > 0 ? packagePrice / purchaseAmount : legacyUnitPrice;
  const stockLots = backfillLotUsePriorities(raw.stockLots ?? []);
  const lotStock = stockFromLots(stockLots);
  const currentStock = stockLots.length > 0 ? lotStock : (raw.currentStock ?? 0);
  return {
    brand: raw.brand,
    prevUnitPrice: raw.prevUnitPrice,
    unit,
    purchaseAmount,
    packagePrice,
    unitPrice,
    fulfillmentMode: raw.fulfillmentMode ?? 'bought',
    currentStock,
    minimumStock: raw.minimumStock ?? 0,
    rollingAvg14dUsage: raw.rollingAvg14dUsage ?? 0,
    stockLots,
    id: raw.id,
    name: raw.name,
    supplier: raw.supplier,
  };
}

export function calcPriceChangePct(current: number, prev?: number): number | null {
  if (prev === undefined || prev === 0) return null;
  return ((current - prev) / prev) * 100;
}
