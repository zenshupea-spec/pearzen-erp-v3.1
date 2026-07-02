import { describe, expect, it } from 'vitest';

import {
  formatSingletonPortalRankOccupiedMessage,
  isActiveWorkforceStatus,
  occupiedSingletonRanksFromRecords,
} from './singleton-portal-rank-guard-logic';

describe('isActiveWorkforceStatus', () => {
  it('treats ACTIVE and blank status as active workforce', () => {
    expect(isActiveWorkforceStatus('ACTIVE')).toBe(true);
    expect(isActiveWorkforceStatus(null)).toBe(true);
  });

  it('rejects terminated statuses', () => {
    expect(isActiveWorkforceStatus('RESIGNED')).toBe(false);
    expect(isActiveWorkforceStatus('TERMINATED')).toBe(false);
  });
});

describe('occupiedSingletonRanksFromRecords', () => {
  const employees = [
    {
      id: 'emp-md',
      rank: 'MD',
      full_name: 'Zen Director',
      status: 'ACTIVE',
    },
    {
      id: 'emp-fm',
      rank: 'fm',
      full_name: 'Finance Lead',
      status: 'ACTIVE',
    },
    {
      id: 'emp-od-resigned',
      rank: 'OD',
      full_name: 'Former OD',
      status: 'RESIGNED',
    },
  ];

  it('returns occupied singleton ranks only when portal work email is active', () => {
    const authByEmployeeId = new Map([
      ['emp-md', { work_email: 'md@cvs.lk', is_active: true }],
      ['emp-fm', { work_email: '   ', is_active: true }],
      ['emp-od-resigned', { work_email: 'od@cvs.lk', is_active: true }],
    ]);

    const occupied = occupiedSingletonRanksFromRecords(employees, authByEmployeeId);
    expect(occupied).toEqual([
      {
        rankCode: 'MD',
        employeeId: 'emp-md',
        fullName: 'Zen Director',
        workEmail: 'md@cvs.lk',
      },
    ]);
  });

  it('excludes the current employee when editing MNR', () => {
    const authByEmployeeId = new Map([
      ['emp-md', { work_email: 'md@cvs.lk', is_active: true }],
    ]);

    const occupied = occupiedSingletonRanksFromRecords(
      employees,
      authByEmployeeId,
      'emp-md',
    );
    expect(occupied).toEqual([]);
  });

  it('ignores inactive portal auth rows', () => {
    const authByEmployeeId = new Map([
      ['emp-md', { work_email: 'md@cvs.lk', is_active: false }],
    ]);

    expect(occupiedSingletonRanksFromRecords(employees, authByEmployeeId)).toEqual(
      [],
    );
  });
});

describe('formatSingletonPortalRankOccupiedMessage', () => {
  it('names the holder and work email', () => {
    expect(
      formatSingletonPortalRankOccupiedMessage({
        rankCode: 'FM',
        employeeId: 'emp-fm',
        fullName: 'Finance Lead',
        workEmail: 'fm@cvs.lk',
      }),
    ).toBe('FM is already assigned to Finance Lead (fm@cvs.lk).');
  });
});
