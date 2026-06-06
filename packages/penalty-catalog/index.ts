export interface PenaltyCatalogEntry {
  id: string;
  offense: string;
  fine: number;
}

export const DEFAULT_PENALTY_CATALOG: PenaltyCatalogEntry[] = [
  { id: 'p1', offense: 'Sleeping on Post', fine: 5000 },
  { id: 'p2', offense: 'Absence Without Notice', fine: 3500 },
  { id: 'p3', offense: 'Uniform Non-Compliance', fine: 1500 },
  { id: 'p4', offense: 'Mobile Phone Misuse on Duty', fine: 2000 },
  { id: 'p5', offense: 'Abandoning Post', fine: 8000 },
  { id: 'p6', offense: 'Late Reporting (>30 min)', fine: 1000 },
  { id: 'p7', offense: 'Insubordination', fine: 6000 },
  { id: 'p8', offense: 'Failure to Log Patrol Visit', fine: 2500 },
];

export function parsePenaltyCatalog(raw: unknown): PenaltyCatalogEntry[] {
  if (!Array.isArray(raw)) return DEFAULT_PENALTY_CATALOG;

  const parsed = raw
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null;
      const row = entry as Record<string, unknown>;
      const offense = typeof row.offense === 'string' ? row.offense.trim() : '';
      const fine = Number(row.fine);
      const id = typeof row.id === 'string' ? row.id : `p-${offense.toLowerCase().replace(/\s+/g, '-')}`;
      if (!offense || !Number.isFinite(fine) || fine < 0) return null;
      return { id, offense, fine };
    })
    .filter((entry): entry is PenaltyCatalogEntry => entry !== null);

  return parsed.length > 0 ? parsed : DEFAULT_PENALTY_CATALOG;
}
