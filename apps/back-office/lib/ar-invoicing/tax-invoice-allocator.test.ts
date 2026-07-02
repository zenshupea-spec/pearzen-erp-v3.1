import { describe, expect, it } from 'vitest';

import {
  globalTaxSeqFromState,
  mergePreservedTaxInvoiceNumbers,
  taxSeqStateFromGlobal,
} from './tax-invoice-allocator';
import {
  assignMissingTaxInvoiceNumbers,
  collectUsedTaxInvoiceSequences,
} from '../invoice-desk/tax-invoice';
import type { ArLedgerClientRecord } from './live-ledger';

function billableClient(id: string, monthKey: string): ArLedgerClientRecord {
  return {
    clientId: id,
    clientName: id,
    sector: 'Test',
    invoices: {
      [monthKey]: {
        status: 'PENDING',
        invoiceNo: `INV-${monthKey}`,
        totalAmount: 10_000,
        rankLines: [],
        patrols: [],
      },
    },
  };
}

describe('tax-invoice-allocator', () => {
  it('merges legacy per-month seq keys into global max', () => {
    expect(globalTaxSeqFromState({ __global__: 3, '2026-05': 7 })).toBe(7);
    expect(taxSeqStateFromGlobal(12)).toEqual({ __global__: 12 });
  });

  it('assigns monotonic CVS suffixes from a reserved block', () => {
    const clients = [billableClient('c1', '2026-05'), billableClient('c2', '2026-05')];
    const { clients: assigned, nextSeq } = assignMissingTaxInvoiceNumbers(clients, {
      __global__: 0,
    });

    const suffixes = [...collectUsedTaxInvoiceSequences(assigned)].sort((a, b) => a - b);
    expect(suffixes).toEqual([1, 2]);
    expect(globalTaxSeqFromState(nextSeq)).toBe(2);
    expect(assigned[0]?.invoices['2026-05']?.taxInvoiceNo).toMatch(/^26MAYCVS00001$/);
    expect(assigned[1]?.invoices['2026-05']?.taxInvoiceNo).toMatch(/^26MAYCVS00002$/);
  });

  it('preserves server tax numbers when desk saves unrelated edits', () => {
    const existing = [
      {
        ...billableClient('c1', '2026-05'),
        invoices: {
          '2026-05': {
            ...billableClient('c1', '2026-05').invoices['2026-05']!,
            taxInvoiceNo: '26MAYCVS00009',
            amountReceived: 5_000,
          },
        },
      },
    ];
    const incoming = [
      {
        ...existing[0]!,
        invoices: {
          '2026-05': {
            ...existing[0]!.invoices['2026-05']!,
            taxInvoiceNo: undefined,
            amountReceived: 6_000,
          },
        },
      },
    ];

    const merged = mergePreservedTaxInvoiceNumbers(existing, incoming);
    expect(merged[0]?.invoices['2026-05']?.taxInvoiceNo).toBe('26MAYCVS00009');
    expect(merged[0]?.invoices['2026-05']?.amountReceived).toBe(6_000);
  });

  it('simulates non-overlapping reserved blocks for concurrent desks', () => {
    let counter = 0;

    function reserve(count: number): { first: number; last: number } | null {
      const expected = counter;
      const newLast = expected + count;
      counter = newLast;
      return { first: expected + 1, last: newLast };
    }

    const blockA = reserve(1);
    const blockB = reserve(1);
    expect(blockA).toEqual({ first: 1, last: 1 });
    expect(blockB).toEqual({ first: 2, last: 2 });

    const { clients: assignedA } = assignMissingTaxInvoiceNumbers(
      [billableClient('a', '2026-06')],
      { __global__: blockA!.first - 1 },
    );
    const { clients: assignedB } = assignMissingTaxInvoiceNumbers(
      [billableClient('b', '2026-06')],
      { __global__: blockB!.first - 1 },
    );

    const suffixA = assignedA[0]?.invoices['2026-06']?.taxInvoiceNo;
    const suffixB = assignedB[0]?.invoices['2026-06']?.taxInvoiceNo;
    expect(suffixA).toMatch(/CVS00001$/);
    expect(suffixB).toMatch(/CVS00002$/);
    expect(suffixA).not.toBe(suffixB);
  });
});
