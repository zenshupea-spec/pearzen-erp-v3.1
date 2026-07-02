import { describe, expect, it } from 'vitest';

import { estimateSiteMonthlyTarget, sumLiveArMonthRevenue } from './finance-revenue-math';
import type { ArLedgerClientRecord } from './live-ledger';

describe('finance-revenue', () => {
  it('skips _shiftRows when estimating site monthly target', () => {
    const target = estimateSiteMonthlyTarget(
      {
        JSO: { invoiceRate: 3_500, qty: 1 },
        _shiftRows: [{ rank: 'JSO', shiftType: 'day', qty: 1, invoiceRate: 2_600, payRate: 2_000 }],
      },
      1,
    );
    expect(Number.isFinite(target)).toBe(true);
    expect(target).toBe(3_500 * 26);
  });

  it('June patrol-only CVS cells sum to 10,500 invoiced', () => {
    const clients: ArLedgerClientRecord[] = [
      {
        clientId: 'c1',
        clientName: 'test site — test',
        sector: 'Test',
        invoices: {
          '2026-06': {
            status: 'PENDING',
            invoiceNo: 'INV-2606-001',
            totalAmount: 3_500,
            rankLines: [],
            patrols: [{ visitId: '1', date: '2026-06-05', sm: 'SM', charge: 3_500 }],
          },
        },
      },
      {
        clientId: 'c2',
        clientName: 'test site 196',
        sector: 'Test',
        invoices: {
          '2026-06': {
            status: 'PENDING',
            invoiceNo: 'INV-2606-002',
            totalAmount: 3_500,
            rankLines: [],
            patrols: [{ visitId: '2', date: '2026-06-06', sm: 'SM', charge: 3_500 }],
          },
        },
      },
      {
        clientId: 'c3',
        clientName: 'tasha cafe — tasha',
        sector: 'Test',
        invoices: {
          '2026-06': {
            status: 'PENDING',
            invoiceNo: 'INV-2606-003',
            totalAmount: 3_500,
            rankLines: [],
            patrols: [{ visitId: '3', date: '2026-06-07', sm: 'SM', charge: 3_500 }],
          },
        },
      },
    ];

    const revenue = sumLiveArMonthRevenue(clients, '2026-06');
    expect(revenue.totalInvoiced).toBe(10_500);
    expect(revenue.rankInvoicing).toBe(0);
    expect(revenue.visitCharges).toBe(10_500);
    expect(revenue.clientDeductions).toBe(0);
  });
});
