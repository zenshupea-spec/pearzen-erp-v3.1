import { describe, expect, it } from 'vitest';

import { buildFmClientDeficitsFromLedger } from './fm-discrepancy-data';

describe('buildFmClientDeficitsFromLedger', () => {
  it('includes PASS_TO_GUARD deductions with outstanding balance', () => {
    const deficits = buildFmClientDeficitsFromLedger(
      [
        {
          clientId: 'client-acme',
          clientName: 'Acme Corp',
          invoices: {
            '2026-05': {
              status: 'PARTIAL',
              invoiceNo: 'INV-2605-001',
              clientDeductions: [
                {
                  penaltyId: 'pen-1',
                  incidentRef: 'Broken barrier',
                  totalClientLoss: 50_000,
                  deductionThisMonth: 50_000,
                  recoveredToDate: 10_000,
                  liabilityType: 'PASS_TO_GUARD',
                  omNote: 'Client withheld payment',
                },
              ],
            },
          },
        },
      ],
      ['2026-05'],
    );

    expect(deficits).toHaveLength(1);
    expect(deficits[0]).toMatchObject({
      clientName: 'Acme Corp',
      invoiceNo: 'INV-2605-001',
      deficitAmount: 40_000,
      status: 'UNRESOLVED',
    });
  });

  it('skips company-absorbed penalties and fully recovered rows', () => {
    const deficits = buildFmClientDeficitsFromLedger(
      [
        {
          clientId: 'client-acme',
          clientName: 'Acme Corp',
          invoices: {
            '2026-05': {
              status: 'PAID',
              invoiceNo: 'INV-2605-002',
              clientDeductions: [
                {
                  penaltyId: 'pen-absorbed',
                  incidentRef: 'Absorbed',
                  totalClientLoss: 20_000,
                  deductionThisMonth: 20_000,
                  liabilityType: 'COMPANY_ABSORBS',
                },
                {
                  penaltyId: 'pen-done',
                  incidentRef: 'Recovered',
                  totalClientLoss: 30_000,
                  deductionThisMonth: 30_000,
                  recoveredToDate: 30_000,
                  liabilityType: 'PASS_TO_GUARD',
                },
              ],
            },
          },
        },
      ],
      ['2026-05'],
    );

    expect(deficits).toHaveLength(0);
  });
});
