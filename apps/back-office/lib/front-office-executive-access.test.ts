import { describe, expect, it } from 'vitest';

import {
  canAccessFrontOfficeAsExecutive,
  executiveCafeShiftGate,
} from './front-office-executive-access';

describe('front-office-executive-access', () => {
  it('allows MD and OD only', () => {
    expect(canAccessFrontOfficeAsExecutive({ role: 'MD' })).toBe(true);
    expect(canAccessFrontOfficeAsExecutive({ role: 'OD' })).toBe(true);
    expect(canAccessFrontOfficeAsExecutive({ role: 'HR' })).toBe(false);
    expect(canAccessFrontOfficeAsExecutive({ role: 'FM' })).toBe(false);
    expect(canAccessFrontOfficeAsExecutive({ role: null })).toBe(false);
  });

  it('unlocks café portal UI for executive oversight without shift check-in', () => {
    const gate = executiveCafeShiftGate();
    expect(gate.portalAccessible).toBe(true);
    expect(gate.canAcceptOrders).toBe(false);
    expect(gate.activeOnShift).toBe(false);
  });
});
