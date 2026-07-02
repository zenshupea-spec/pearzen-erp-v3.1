export interface ReplacementCatalogEntry {
  id: string;
  item: string;
  cost: number;
}

export function parseReplacementCatalog(raw: unknown): ReplacementCatalogEntry[] {
  if (!Array.isArray(raw)) return [];

  return raw
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null;
      const row = entry as Record<string, unknown>;
      const item = typeof row.item === 'string' ? row.item.trim() : '';
      const cost = Number(row.cost);
      const id =
        typeof row.id === 'string'
          ? row.id
          : `r-${item.toLowerCase().replace(/\s+/g, '-')}`;
      if (!item || !Number.isFinite(cost) || cost < 0) return null;
      return { id, item, cost };
    })
    .filter((entry): entry is ReplacementCatalogEntry => entry !== null);
}
