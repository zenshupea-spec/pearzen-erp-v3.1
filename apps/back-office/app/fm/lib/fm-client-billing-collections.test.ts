import { describe, expect, it } from 'vitest';

import { mapArCollectionsToSites, type FmArLedgerClientRef } from './fm-client-billing-collections';

function client(name: string, monthKey: string, cell: Record<string, unknown>): FmArLedgerClientRef {
  return {
    clientId: `client-${name}`,
    clientName: name,
    sector: '',
    invoices: { [monthKey]: cell as FmArLedgerClientRef['invoices'][string] },
  };
}

describe('mapArCollectionsToSites', () => {
  const monthKey = '2026-05';

  it('maps paid collection to a single-site client', () => {
    const sites = [{ id: 'site-a', name: 'Alpha Tower', clientBilled: 500_000 }];
    const clients = [
      client('Alpha Tower', monthKey, {
        status: 'PAID',
        totalAmount: 500_000,
        amountReceived: 495_000,
        paidDate: '28 May 2026',
        clientDeductions: [{ deductionThisMonth: 25_000 }],
      }),
    ];

    expect(mapArCollectionsToSites(sites, clients, monthKey, {})).toEqual({
      'site-a': {
        paidDate: '28 May 2026',
        paidAmount: 495_000,
        clientDeductions: 25_000,
      },
    });
  });

  it('allocates collection pro-rata when multiple sites share one billing client', () => {
    const sites = [
      { id: 'site-a', name: 'North Wing', clientBilled: 300_000 },
      { id: 'site-b', name: 'South Wing', clientBilled: 700_000 },
    ];
    const clients = [
      client('Mega Corp', monthKey, {
        status: 'PARTIAL',
        totalAmount: 1_000_000,
        amountReceived: 600_000,
        paidDate: '15 May 2026',
        clientDeductions: [{ deductionThisMonth: 10_000 }],
      }),
    ];
    const meta = {
      'site-a': { parent_client: 'Mega Corp' },
      'site-b': { parent_client: 'Mega Corp' },
    };

    expect(mapArCollectionsToSites(sites, clients, monthKey, meta)).toEqual({
      'site-a': {
        paidDate: '15 May 2026',
        paidAmount: 180_000,
        clientDeductions: 3_000,
      },
      'site-b': {
        paidDate: '15 May 2026',
        paidAmount: 420_000,
        clientDeductions: 7_000,
      },
    });
  });
});
