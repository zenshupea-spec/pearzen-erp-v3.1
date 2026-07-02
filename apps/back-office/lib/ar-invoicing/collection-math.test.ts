import { describe, expect, it } from 'vitest';

import {
  applyRolloverDebts,
  canAcceptPartialPayment,
  canSettleWithFines,
  invoiceNetDue,
  mdSettlementShortfall,
  partialRolloverShortfall,
  patrolSubtotal,
  rankSubtotal,
  recomputeCellTotalAmount,
} from './collection-math';
import type { ArLedgerClientRecord } from './live-ledger';

function partialCell(totalAmount: number, amountReceived: number) {
  return {
    status: 'PARTIAL',
    invoiceNo: 'INV-001',
    totalAmount,
    amountReceived,
    rankLines: [],
    patrols: [],
  };
}

describe('invoiceCollectionMath', () => {
  it('suppresses rollover when partial shortfall is within 300 LKR', () => {
    const cell = partialCell(100_000, 99_800);
    expect(partialRolloverShortfall(cell)).toBe(0);
  });

  it('rolls forward when partial shortfall exceeds 300 LKR', () => {
    const cell = partialCell(100_000, 99_000);
    expect(partialRolloverShortfall(cell)).toBe(1_000);
  });

  it('uses net due with rollover for MD settlement shortfall', () => {
    const cell = {
      status: 'PENDING_MD_VERIFICATION',
      invoiceNo: 'INV-001',
      totalAmount: 100_000,
      rolloverDebt: 5_000,
      rankLines: [],
      patrols: [],
    };
    expect(invoiceNetDue(cell)).toBe(105_000);
    expect(mdSettlementShortfall(cell, 104_850)).toBe(150);
    expect(canSettleWithFines(150, 5_000)).toBe(false);
  });

  it('allows settled-with-fines when shortfall matches deductions', () => {
    expect(canSettleWithFines(5_000, 5_000)).toBe(true);
    expect(canAcceptPartialPayment(5_000, 5_000)).toBe(false);
  });

  it('applyRolloverDebts matches client tolerance on reload', () => {
    const clients: ArLedgerClientRecord[] = [
      {
        clientId: 'c1',
        clientName: 'Client',
        sector: 'Site',
        invoices: {
          '2026-05': partialCell(100_000, 99_800),
          '2026-06': {
            status: 'PENDING',
            invoiceNo: 'INV-002',
            totalAmount: 50_000,
            rankLines: [],
            patrols: [],
          },
        },
      },
    ];

    const rolled = applyRolloverDebts(clients, ['2026-05', '2026-06']);
    expect(rolled[0]?.invoices['2026-06']?.rolloverDebt).toBeUndefined();
  });

  it('June patrol-only cell: 3,500 = 0 rank + 3,500 patrol − 0 ded', () => {
    const total = recomputeCellTotalAmount({
      rankLines: [],
      patrols: [{ charge: 3_500 }],
      clientDeductions: [],
      totalAmount: 0,
    });
    expect(total).toBe(3_500);
    expect(rankSubtotal([])).toBe(0);
    expect(patrolSubtotal([{ charge: 3_500 }])).toBe(3_500);
  });

  it('subtracts client deductions from rank + patrol gross', () => {
    const total = recomputeCellTotalAmount({
      rankLines: [{ headcount: 2, shiftsPerHead: 15, ratePerShift: 1_000 }],
      patrols: [{ charge: 3_500 }],
      clientDeductions: [{ deductionThisMonth: 2_000 } as never],
      totalAmount: 0,
    });
    expect(total).toBe(31_500);
  });
});
