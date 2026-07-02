import { describe, expect, it } from 'vitest';

import {
  isHeadOfficeWorkEmailOptionalRank,
  isHeadOfficeWorkEmailRequired,
  showHeadOfficeWorkEmailInMnr,
} from './head-office-work-email';

describe('head-office-work-email', () => {
  it('treats SM and support ranks as optional', () => {
    expect(isHeadOfficeWorkEmailOptionalRank('SM')).toBe(true);
    expect(isHeadOfficeWorkEmailOptionalRank('DRIVER')).toBe(true);
    expect(isHeadOfficeWorkEmailOptionalRank('CARETAKER')).toBe(true);
    expect(isHeadOfficeWorkEmailOptionalRank('SHALOM_CARETAKER')).toBe(true);
    expect(isHeadOfficeWorkEmailOptionalRank('')).toBe(true);
  });

  it('requires work email for portal ranks', () => {
    expect(isHeadOfficeWorkEmailRequired('HR')).toBe(true);
    expect(isHeadOfficeWorkEmailRequired('FM')).toBe(true);
    expect(isHeadOfficeWorkEmailRequired('OM')).toBe(true);
  });

  it('hides work email field for sector managers on HO', () => {
    expect(
      showHeadOfficeWorkEmailInMnr({ group: 'HEAD_OFFICE', rank: 'SM' }),
    ).toBe(false);
    expect(
      showHeadOfficeWorkEmailInMnr({ group: 'HEAD_OFFICE', rank: 'HR' }),
    ).toBe(true);
    expect(
      showHeadOfficeWorkEmailInMnr({ group: 'GUARD', rank: 'SG' }),
    ).toBe(false);
  });
});
