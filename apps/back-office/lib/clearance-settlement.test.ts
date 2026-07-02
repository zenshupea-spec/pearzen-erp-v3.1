import { describe, expect, it } from 'vitest';

import {
  computeClearanceSettlement,
  evaluateHrResignationGate,
} from './clearance-settlement';

describe('clearance-settlement', () => {
  it('computes net settlement with gratuity and recoveries', () => {
    const settlement = computeClearanceSettlement(50000, 5000, 10000);
    expect(settlement).toEqual({
      finalPayLkr: 50000,
      gratuityLkr: 10000,
      recoveryLkr: 5000,
      netSettlementLkr: 55000,
    });
  });

  it('allows resignation when uniforms are not required or already collected', () => {
    const gate = evaluateHrResignationGate({ uniformCollectionOk: true });
    expect(gate.ok).toBe(true);
  });

  it('blocks resignation when uniform collection is required but not confirmed', () => {
    const gate = evaluateHrResignationGate({
      uniformCollectionOk: false,
      uniformCollectionPending: true,
    });
    expect(gate.ok).toBe(false);
    expect(gate.message).toContain('confirm uniform collection');
  });

  it('prompts HR to request collection when uniforms are not yet queued', () => {
    const gate = evaluateHrResignationGate({
      uniformCollectionOk: false,
      uniformCollectionPending: false,
    });
    expect(gate.ok).toBe(false);
    expect(gate.message).toContain('Request uniform collection');
  });
});
