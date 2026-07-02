import { describe, expect, it } from 'vitest';
import { resolveUniformInstalmentAmountLkr } from './uniform-instalment';

describe('resolveUniformInstalmentAmountLkr', () => {
  it('prefers saved uniform over issue and default', () => {
    expect(
      resolveUniformInstalmentAmountLkr({
        savedUniform: 1500,
        issuedUniform: 3000,
        defaultInstalmentLkr: 2000,
        shiftCount: 10,
      }),
    ).toEqual({ amountLkr: 1500, fromIssue: false, fromDefault: false });
  });

  it('uses issued uniform when no saved entry', () => {
    expect(
      resolveUniformInstalmentAmountLkr({
        savedUniform: 0,
        issuedUniform: 3500,
        defaultInstalmentLkr: 2000,
        shiftCount: 10,
      }),
    ).toEqual({ amountLkr: 3500, fromIssue: true, fromDefault: false });
  });

  it('uses default instalment when guard has shifts and no saved/issue', () => {
    expect(
      resolveUniformInstalmentAmountLkr({
        savedUniform: 0,
        issuedUniform: 0,
        defaultInstalmentLkr: 2000,
        shiftCount: 4,
      }),
    ).toEqual({ amountLkr: 2000, fromIssue: false, fromDefault: true });
  });

  it('returns zero when guard has no shifts', () => {
    expect(
      resolveUniformInstalmentAmountLkr({
        savedUniform: 0,
        issuedUniform: 0,
        defaultInstalmentLkr: 2000,
        shiftCount: 0,
      }),
    ).toEqual({ amountLkr: 0, fromIssue: false, fromDefault: false });
  });
});
