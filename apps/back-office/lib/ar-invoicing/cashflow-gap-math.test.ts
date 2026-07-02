import { describe, expect, it } from 'vitest';

import {
  evaluateCollectionWarning,
  isCollectionWarningDayReached,
  payrollLiabilityServiceMonth,
  proratedInvoiceTargetForDispatchDay,
} from './cashflow-gap-math';

describe('cashflow-gap-math', () => {
  it('prorates issued target by day 21 when dispatch day is 1', () => {
    const fullTarget = 91_000;
    const asOf = new Date(2026, 5, 21);
    const prorated = proratedInvoiceTargetForDispatchDay(
      fullTarget,
      '2026-05',
      1,
      asOf,
    );
    expect(prorated).toBe(Math.round(fullTarget * (21 / 30)));
  });

  it('returns zero before invoice dispatch day in billing month', () => {
    const prorated = proratedInvoiceTargetForDispatchDay(
      50_000,
      '2026-05',
      5,
      new Date(2026, 5, 4),
    );
    expect(prorated).toBe(0);
  });

  it('returns full target after billing month ends', () => {
    const prorated = proratedInvoiceTargetForDispatchDay(
      10_500,
      '2026-06',
      1,
      new Date(2026, 7, 15),
    );
    expect(prorated).toBe(10_500);
  });

  it('maps payroll liability to the prior service month', () => {
    expect(payrollLiabilityServiceMonth(2026, 6)).toEqual({
      year: 2026,
      month: 5,
      monthKey: '2026-05',
    });
  });

  it('does not fire collection warning before collectionWarningDay', () => {
    expect(
      isCollectionWarningDayReached('2026-05', 6, new Date(2026, 5, 5)),
    ).toBe(false);
    const warning = evaluateCollectionWarning({
      gapTarget: 10_500,
      cashReceived: 0,
      serviceMonthKey: '2026-05',
      collectionWarningDay: 6,
      silencedByDisputes: false,
      asOf: new Date(2026, 5, 5),
    });
    expect(warning.active).toBe(false);
  });

  it('fires collection warning on day 6+ when cash is below target', () => {
    const warning = evaluateCollectionWarning({
      gapTarget: 10_500,
      cashReceived: 0,
      serviceMonthKey: '2026-05',
      collectionWarningDay: 6,
      silencedByDisputes: false,
      asOf: new Date(2026, 5, 6),
    });
    expect(warning.active).toBe(true);
    expect(warning.shortfall).toBe(10_500);
  });

  it('stays silent when cash covers the prorated target', () => {
    const warning = evaluateCollectionWarning({
      gapTarget: 10_500,
      cashReceived: 10_500,
      serviceMonthKey: '2026-05',
      collectionWarningDay: 6,
      silencedByDisputes: false,
      asOf: new Date(2026, 5, 10),
    });
    expect(warning.active).toBe(false);
  });

  it('silences collection warning when a dispute hold is active', () => {
    const warning = evaluateCollectionWarning({
      gapTarget: 10_500,
      cashReceived: 0,
      serviceMonthKey: '2026-05',
      collectionWarningDay: 6,
      silencedByDisputes: true,
      asOf: new Date(2026, 5, 10),
    });
    expect(warning.active).toBe(false);
  });
});
