export interface UniformCatalogEntry {
  id: string;
  item: string;
  cost: number;
}

export const DEFAULT_UNIFORM_CATALOG: UniformCatalogEntry[] = [
  { id: 'u1', item: 'Shirt (Short Sleeve)', cost: 2500 },
  { id: 'u2', item: 'Shirt (Long Sleeve)', cost: 2800 },
  { id: 'u3', item: 'Trousers', cost: 3500 },
  { id: 'u4', item: 'Belt', cost: 800 },
  { id: 'u5', item: 'Cap / Beret', cost: 1200 },
  { id: 'u6', item: 'Boots', cost: 6500 },
  { id: 'u7', item: 'Jacket / Blouson', cost: 4500 },
  { id: 'u8', item: 'Epaulettes', cost: 500 },
  { id: 'u9', item: 'ID Badge / Lanyard', cost: 400 },
  { id: 'u10', item: 'High-Vis Vest', cost: 1800 },
  { id: 'u11', item: 'Gloves', cost: 600 },
  { id: 'u12', item: 'Tie', cost: 500 },
];

export function parseUniformCatalog(raw: unknown): UniformCatalogEntry[] {
  if (!Array.isArray(raw)) return DEFAULT_UNIFORM_CATALOG;

  const parsed = raw
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null;
      const row = entry as Record<string, unknown>;
      const item = typeof row.item === 'string' ? row.item.trim() : '';
      const cost = Number(row.cost ?? row.price);
      const id = typeof row.id === 'string' ? row.id : `u-${item.toLowerCase().replace(/\s+/g, '-')}`;
      if (!item || !Number.isFinite(cost) || cost < 0) return null;
      return { id, item, cost };
    })
    .filter((entry): entry is UniformCatalogEntry => entry !== null);

  return parsed.length > 0 ? parsed : DEFAULT_UNIFORM_CATALOG;
}

export function lookupUniformCost(catalog: UniformCatalogEntry[], itemName: string): number {
  return catalog.find((entry) => entry.item === itemName)?.cost ?? 0;
}
