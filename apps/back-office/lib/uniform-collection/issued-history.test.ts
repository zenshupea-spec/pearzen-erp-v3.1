import { describe, expect, it } from 'vitest';

import {
  fetchIssuedUniformHistory,
  hasIssuedUniforms,
  mergeReturnedAgainstIssued,
  mergeUniformItemLines,
  parseUniformItemsFromJsonb,
  summarizeIssuedUniformLines,
} from './issued-history';

describe('uniform-collection issued-history', () => {
  it('parses and merges issued item jsonb by item name', () => {
    const batchA = parseUniformItemsFromJsonb([
      { item: ' Shirt ', qty: 2 },
      { item: 'Trouser', qty: 1 },
    ]);
    const batchB = parseUniformItemsFromJsonb([{ item: 'Shirt', qty: 1 }]);
    const merged = mergeUniformItemLines([...batchA, ...batchB]);
    expect(merged).toEqual([
      { item: 'Shirt', qty: 3 },
      { item: 'Trouser', qty: 1 },
    ]);
  });

  it('summarizes issued lines with totals', () => {
    const summary = summarizeIssuedUniformLines(
      [
        { item: 'Shirt', qty: 2 },
        { item: 'Shirt', qty: 1 },
        { item: 'Boot', qty: 1 },
      ],
      4500,
    );
    expect(summary.totalIssuedLines).toBe(2);
    expect(summary.totalQty).toBe(4);
    expect(summary.totalAmountLkr).toBe(4500);
    expect(summary.byItem).toEqual({ Shirt: 3, Boot: 1 });
  });

  it('detects when uniforms were issued', () => {
    expect(hasIssuedUniforms([])).toBe(false);
    expect(hasIssuedUniforms([{ item: 'Shirt', qty: 0 }])).toBe(false);
    expect(hasIssuedUniforms([{ item: 'Shirt', qty: 1 }])).toBe(true);
  });

  it('computes shortfall when returned qty is below issued', () => {
    const result = mergeReturnedAgainstIssued(
      [
        { item: 'Shirt', qty: 2 },
        { item: 'Boot', qty: 1 },
      ],
      [{ item: 'Shirt', qty: 1 }],
    );
    expect(result.allReturned).toBe(false);
    expect(result.shortfallLines).toEqual([
      { item: 'Boot', qty: 1 },
      { item: 'Shirt', qty: 1 },
    ]);
  });

  it('marks allReturned when every issued item is fully returned', () => {
    const result = mergeReturnedAgainstIssued(
      [{ item: 'Shirt', qty: 2 }],
      [{ item: 'Shirt', qty: 2 }],
    );
    expect(result.allReturned).toBe(true);
    expect(result.shortfallLines).toEqual([]);
  });

  it('fetchIssuedUniformHistory merges ISSUED rows for guard EPF', async () => {
    const db = {
      from(table: string) {
        const state: { table: string; filters: Record<string, string> } = {
          table,
          filters: {},
        };
        const chain = {
          select() {
            return chain;
          },
          eq(column: string, value: string) {
            state.filters[column] = value;
            return chain;
          },
          maybeSingle: async () => {
            if (state.table === 'employees') {
              return { data: { id: 'emp-1' }, error: null };
            }
            return { data: null, error: null };
          },
          then(resolve: (value: unknown) => void) {
            if (state.table === 'sm_uniform_requests') {
              resolve({
                data: [
                  {
                    items: [{ item: 'Shirt', qty: 1 }],
                    total_amount: 1500,
                  },
                  {
                    items: [{ item: 'Shirt', qty: 1 }, { item: 'Boot', qty: 1 }],
                    total_amount: 3000,
                  },
                ],
                error: null,
              });
              return;
            }
            resolve({ data: [], error: null });
          },
        };
        return chain;
      },
    };

    const lines = await fetchIssuedUniformHistory(db, 'company-1', 'mnr-001');
    expect(lines).toEqual([
      { item: 'Boot', qty: 1 },
      { item: 'Shirt', qty: 2 },
    ]);
  });
});
