import type {
  UniformCollectionItemLine,
  UniformIssuedSummary,
  UniformReturnMergeResult,
} from './types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type UniformCollectionDb = any;

export function normalizeGuardEpf(guardEpf: string): string {
  return guardEpf.trim().toUpperCase();
}

export function parseUniformItemsFromJsonb(raw: unknown): UniformCollectionItemLine[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null;
      const row = entry as Record<string, unknown>;
      const item = typeof row.item === 'string' ? row.item.trim() : '';
      const qty = Number(row.qty);
      if (!item || !Number.isFinite(qty) || qty < 1) return null;
      const unitAmountLkr =
        row.unitAmountLkr != null && Number.isFinite(Number(row.unitAmountLkr))
          ? Number(row.unitAmountLkr)
          : undefined;
      return {
        item,
        qty: Math.floor(qty),
        ...(unitAmountLkr != null ? { unitAmountLkr } : {}),
      };
    })
    .filter((row): row is UniformCollectionItemLine => row !== null);
}

/** Merge item lines by item name (sum qty; keep first unitAmountLkr when present). */
export function mergeUniformItemLines(
  lines: UniformCollectionItemLine[],
): UniformCollectionItemLine[] {
  const byItem = new Map<string, UniformCollectionItemLine>();
  for (const line of lines) {
    const key = line.item.trim();
    if (!key) continue;
    const existing = byItem.get(key);
    if (!existing) {
      byItem.set(key, { item: key, qty: line.qty, unitAmountLkr: line.unitAmountLkr });
      continue;
    }
    byItem.set(key, {
      item: key,
      qty: existing.qty + line.qty,
      unitAmountLkr: existing.unitAmountLkr ?? line.unitAmountLkr,
    });
  }
  return Array.from(byItem.values()).sort((a, b) => a.item.localeCompare(b.item));
}

export function summarizeIssuedUniformLines(
  lines: UniformCollectionItemLine[],
  totalAmountLkr = 0,
): UniformIssuedSummary {
  const merged = mergeUniformItemLines(lines);
  const byItem: Record<string, number> = {};
  let totalQty = 0;
  for (const line of merged) {
    byItem[line.item] = line.qty;
    totalQty += line.qty;
  }
  return {
    lines: merged,
    totalIssuedLines: merged.length,
    totalQty,
    totalAmountLkr: Math.max(0, Number(totalAmountLkr) || 0),
    byItem,
  };
}

export function hasIssuedUniforms(lines: UniformCollectionItemLine[]): boolean {
  return mergeUniformItemLines(lines).some((line) => line.qty > 0);
}

export function mergeReturnedAgainstIssued(
  issued: UniformCollectionItemLine[],
  returned: UniformCollectionItemLine[],
): UniformReturnMergeResult {
  const issuedMap = new Map(mergeUniformItemLines(issued).map((line) => [line.item, line.qty]));
  const returnedMap = new Map(mergeUniformItemLines(returned).map((line) => [line.item, line.qty]));
  const shortfallLines: UniformCollectionItemLine[] = [];

  for (const [item, issuedQty] of issuedMap) {
    const returnedQty = returnedMap.get(item) ?? 0;
    if (returnedQty < issuedQty) {
      shortfallLines.push({ item, qty: issuedQty - returnedQty });
    }
  }

  return {
    allReturned: shortfallLines.length === 0,
    shortfallLines: shortfallLines.sort((a, b) => a.item.localeCompare(b.item)),
  };
}

export function isMissingUniformRequestsTable(message: string): boolean {
  return (
    message.includes('42P01') ||
    message.includes('sm_uniform_requests') ||
    message.toLowerCase().includes('does not exist')
  );
}

export function isMissingUniformCollectionTable(message: string): boolean {
  return (
    message.includes('42P01') ||
    message.includes('uniform_collection_cases') ||
    message.toLowerCase().includes('does not exist')
  );
}

export async function fetchIssuedUniformHistory(
  db: UniformCollectionDb,
  companyId: string | null,
  guardEpf: string,
): Promise<UniformCollectionItemLine[]> {
  const epf = normalizeGuardEpf(guardEpf);
  if (!epf) return [];

  if (companyId) {
    const { data: guard, error: guardError } = await db
      .from('employees')
      .select('id')
      .eq('company_id', companyId)
      .eq('emp_number', epf)
      .maybeSingle();

    if (guardError || !guard) return [];
  }

  const { data, error } = await db
    .from('sm_uniform_requests')
    .select('items, total_amount')
    .eq('request_type', 'ISSUE')
    .eq('status', 'ISSUED')
    .eq('guard_epf', epf);

  if (error) {
    if (isMissingUniformRequestsTable(error.message)) return [];
    throw new Error(error.message);
  }

  const parsed: UniformCollectionItemLine[] = [];
  for (const row of data ?? []) {
    parsed.push(...parseUniformItemsFromJsonb(row.items));
  }

  return mergeUniformItemLines(parsed);
}

export async function fetchIssuedUniformSummary(
  db: UniformCollectionDb,
  companyId: string | null,
  guardEpf: string,
): Promise<UniformIssuedSummary> {
  const epf = normalizeGuardEpf(guardEpf);
  if (!epf) {
    return summarizeIssuedUniformLines([], 0);
  }

  if (companyId) {
    const { data: guard, error: guardError } = await db
      .from('employees')
      .select('id')
      .eq('company_id', companyId)
      .eq('emp_number', epf)
      .maybeSingle();

    if (guardError || !guard) {
      return summarizeIssuedUniformLines([], 0);
    }
  }

  const { data, error } = await db
    .from('sm_uniform_requests')
    .select('items, total_amount')
    .eq('request_type', 'ISSUE')
    .eq('status', 'ISSUED')
    .eq('guard_epf', epf);

  if (error) {
    if (isMissingUniformRequestsTable(error.message)) {
      return summarizeIssuedUniformLines([], 0);
    }
    throw new Error(error.message);
  }

  const parsed: UniformCollectionItemLine[] = [];
  let totalAmountLkr = 0;
  for (const row of data ?? []) {
    parsed.push(...parseUniformItemsFromJsonb(row.items));
    totalAmountLkr += Number(row.total_amount ?? 0);
  }

  return summarizeIssuedUniformLines(parsed, totalAmountLkr);
}
