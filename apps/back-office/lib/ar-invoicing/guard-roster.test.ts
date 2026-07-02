import { describe, expect, it } from 'vitest';

import {
  buildGuardRosterFromEmployeeShifts,
  guardRosterForCell,
  type ArGuardRostersByClientMonth,
} from './guard-roster';

describe('buildGuardRosterFromEmployeeShifts', () => {
  const empById = new Map([
    [
      'bench-guard',
      {
        id: 'bench-guard',
        emp_number: 'MNR-R001',
        full_name: 'Bench Guard',
        rank: 'JSO',
        site: 'Unassigned (Bench)',
      },
    ],
    [
      'home-guard',
      {
        id: 'home-guard',
        emp_number: 'MNR-R002',
        full_name: 'Home Guard',
        rank: 'CSO',
        site: 'Test Site 196',
      },
    ],
  ]);

  it('includes loaned bench guards billed on client sites', () => {
    const roster = buildGuardRosterFromEmployeeShifts(
      [
        {
          employeeId: 'bench-guard',
          rank: 'JSO',
          rate: 8_500,
          shifts: 4,
        },
      ],
      empById,
    );

    expect(roster).toHaveLength(1);
    expect(roster[0]?.empNo).toBe('MNR-R001');
    expect(roster[0]?.shiftsWorked).toBe(4);
    expect(roster[0]?.billedRate).toBe(8_500);
  });

  it('merges shift counts for the same guard across sites', () => {
    const roster = buildGuardRosterFromEmployeeShifts(
      [
        { employeeId: 'bench-guard', rank: 'JSO', rate: 8_500, shifts: 2 },
        { employeeId: 'bench-guard', rank: 'JSO', rate: 8_500, shifts: 2 },
      ],
      empById,
    );

    expect(roster[0]?.shiftsWorked).toBe(4);
  });

  it('resolves month-scoped rosters for audit lookup', () => {
    const rosters: ArGuardRostersByClientMonth = {
      'client-196': {
        '2026-05': [
          {
            empNo: 'MNR-R001',
            name: 'Bench Guard',
            rank: 'JSO',
            shiftsWorked: 4,
            billedRate: 8_500,
          },
        ],
      },
    };

    expect(guardRosterForCell(rosters, 'client-196', '2026-05')[0]?.empNo).toBe('MNR-R001');
    expect(guardRosterForCell(rosters, 'client-196', '2026-04')).toEqual([]);
  });
});
