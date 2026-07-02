import { describe, expect, it } from 'vitest';

import {
  computeOffboardingBalanceColumns,
  persistedOffboardingBalanceLines,
} from './offboarding-balance-sync';

describe('offboarding-balance-sync', () => {
  it('splits uniform vs other recoveries into balance columns', () => {
    const cols = computeOffboardingBalanceColumns([
      { type: 'uniform', amountLkr: 4500 },
      { type: 'meals', amountLkr: 1200 },
      { type: 'advance', amountLkr: 5000 },
    ]);
    expect(cols).toEqual({ uniformBalance: 4500, accomBalance: 6200 });
  });

  it('round-trips persisted columns to clearance lines', () => {
    const lines = persistedOffboardingBalanceLines(4500, 6200);
    expect(lines).toHaveLength(2);
    expect(lines.reduce((s, l) => s + l.amountLkr, 0)).toBe(10700);
  });
});
