import { describe, expect, it } from 'vitest';

import {
  canHrProvisionTargetRank,
  hrProvisionTargetRankError,
} from './portal-role-utils';

describe('canHrProvisionTargetRank', () => {
  it('lets HR provision FM but not MD, OD, or HR', () => {
    expect(canHrProvisionTargetRank('HR', 'FM')).toBe(true);
    expect(canHrProvisionTargetRank('HR', 'EA')).toBe(true);
    expect(canHrProvisionTargetRank('HR', 'OM')).toBe(true);
    expect(canHrProvisionTargetRank('HR', 'MD')).toBe(false);
    expect(canHrProvisionTargetRank('HR', 'OD')).toBe(false);
    expect(canHrProvisionTargetRank('HR', 'HR')).toBe(false);
  });

  it('lets MD and OD provision any Head Office rank', () => {
    expect(canHrProvisionTargetRank('MD', 'OD')).toBe(true);
    expect(canHrProvisionTargetRank('MD', 'MD')).toBe(true);
    expect(canHrProvisionTargetRank('MD', 'FM')).toBe(true);
    expect(canHrProvisionTargetRank('OD', 'MD')).toBe(true);
    expect(canHrProvisionTargetRank('OD', 'HR')).toBe(true);
  });
});

describe('hrProvisionTargetRankError', () => {
  it('directs HR to MD Portal for executives', () => {
    expect(hrProvisionTargetRankError('HR', 'MD')).toMatch(/MD Portal/i);
    expect(hrProvisionTargetRankError('HR', 'OD')).toMatch(/MD Portal/i);
  });
});
