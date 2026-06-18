import type { BatchDeductionRow } from './batch-deductions-ledger';

export type DeductionSortKey = 'name' | 'rank' | 'amount';

const RANK_ORDER: Record<string, number> = {
  CSO: 0,
  OIC: 1,
  SSO: 2,
  JSO: 3,
  LSO: 4,
  'Security Guard': 5,
};

function rankSortValue(rank: string) {
  const key = rank.trim();
  return RANK_ORDER[key] ?? 99;
}

export function filterDeductionRows(rows: BatchDeductionRow[], query: string): BatchDeductionRow[] {
  const q = query.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter(
    (r) =>
      r.name.toLowerCase().includes(q) ||
      r.empNo.toLowerCase().includes(q) ||
      r.rank.toLowerCase().includes(q) ||
      r.site.toLowerCase().includes(q) ||
      r.detail.toLowerCase().includes(q) ||
      r.supplier.toLowerCase().includes(q),
  );
}

export function sortDeductionRows(
  rows: BatchDeductionRow[],
  key: DeductionSortKey,
  dir: 'asc' | 'desc',
): BatchDeductionRow[] {
  const sorted = [...rows].sort((a, b) => {
    let cmp = 0;
    if (key === 'name') {
      cmp = a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    } else if (key === 'rank') {
      cmp = rankSortValue(a.rank) - rankSortValue(b.rank);
      if (cmp === 0) cmp = a.rank.localeCompare(b.rank, undefined, { sensitivity: 'base' });
    } else {
      cmp = a.amountLkr - b.amountLkr;
    }
    return dir === 'asc' ? cmp : -cmp;
  });
  return sorted;
}

export const DEDUCTION_SORT_OPTIONS: { id: DeductionSortKey; label: string }[] = [
  { id: 'name', label: 'Name' },
  { id: 'rank', label: 'Rank' },
  { id: 'amount', label: 'Amount' },
];
