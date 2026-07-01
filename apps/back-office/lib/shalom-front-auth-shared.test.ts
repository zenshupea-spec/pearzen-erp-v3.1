import { describe, expect, it } from 'vitest';

import {
  isShalomFrontAuthEmail,
  isShalomStaff,
  shalomFrontAuthEmail,
  shalomPortalLoginDateColombo,
  SHALOM_STAFF_GROUP,
} from './shalom-front-auth-shared';

describe('shalom-front-auth-shared', () => {
  it('builds auth email in shalom namespace', () => {
    expect(shalomFrontAuthEmail('epf001')).toBe('epf001@shalom.pearzen.local');
    expect(isShalomFrontAuthEmail('epf001@shalom.pearzen.local')).toBe(true);
    expect(isShalomFrontAuthEmail('epf001@pearzen.cafe')).toBe(false);
  });

  it('formats login date in Asia/Colombo', () => {
    const date = shalomPortalLoginDateColombo(new Date('2026-06-25T20:30:00.000Z'));
    expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('isShalomStaff', () => {
  it('accepts SHALOM group employees', () => {
    expect(
      isShalomStaff({
        id: '1',
        full_name: 'Caretaker',
        emp_number: null,
        epf_no: 'EPF1',
        epf_num: null,
        status: 'ACTIVE',
        group: SHALOM_STAFF_GROUP,
        rank: null,
        site: null,
        company_id: null,
      }),
    ).toBe(true);
  });

  it('accepts CARETAKER rank', () => {
    expect(
      isShalomStaff({
        id: '1',
        full_name: 'Caretaker',
        emp_number: null,
        epf_no: 'EPF1',
        epf_num: null,
        status: 'ACTIVE',
        group: 'FIELD',
        rank: 'CARETAKER',
        site: null,
        company_id: null,
      }),
    ).toBe(true);
  });

  it('rejects unrelated groups', () => {
    expect(
      isShalomStaff({
        id: '1',
        full_name: 'Guard',
        emp_number: null,
        epf_no: 'EPF1',
        epf_num: null,
        status: 'ACTIVE',
        group: 'GUARD',
        rank: 'GUARD',
        site: null,
        company_id: null,
      }),
    ).toBe(false);
  });
});
