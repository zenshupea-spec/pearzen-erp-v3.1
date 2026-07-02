import { describe, expect, it } from 'vitest';

import {
  mapSectorManagerRosterRow,
  sectorManagerEmployeeOrFilter,
  SECTOR_MANAGER_EMPLOYEE_OR_FILTER,
} from './sector-manager-roster';

describe('sector-manager-roster', () => {
  it('exposes canonical PostgREST or-filter for both SM shapes', () => {
    expect(sectorManagerEmployeeOrFilter()).toBe(SECTOR_MANAGER_EMPLOYEE_OR_FILTER);
    expect(sectorManagerEmployeeOrFilter()).toBe(
      'group.eq.SECTOR_MANAGER,and(group.eq.HEAD_OFFICE,rank.eq.SM)',
    );
  });

  it('maps legacy SECTOR_MANAGER row using emp_number', () => {
    expect(
      mapSectorManagerRosterRow({
        emp_number: '446',
        full_name: 'ROY',
        group: 'SECTOR_MANAGER',
        rank: 'SM',
        site: null,
      }),
    ).toEqual({
      epf_number: '446',
      full_name: 'ROY',
      site: '—',
    });
  });

  it('maps HEAD_OFFICE + SM row using emp_number', () => {
    expect(
      mapSectorManagerRosterRow({
        emp_number: '125',
        full_name: 'PATHIRAJ',
        group: 'HEAD_OFFICE',
        rank: 'SM',
        site: 'COLOMBO 1',
      }),
    ).toEqual({
      epf_number: '125',
      full_name: 'PATHIRAJ',
      site: 'COLOMBO 1',
    });
  });

  it('falls back to epf_no when emp_number is blank', () => {
    expect(
      mapSectorManagerRosterRow({
        epf_no: '882',
        full_name: 'SM TWO',
        group: 'HEAD_OFFICE',
        rank: 'SM',
      }),
    ).toEqual({
      epf_number: '882',
      full_name: 'SM TWO',
      site: '—',
    });
  });

  it('returns null for non-SM rows', () => {
    expect(
      mapSectorManagerRosterRow({
        emp_number: '99',
        full_name: 'GUARD',
        group: 'GUARD',
        rank: 'CSO',
      }),
    ).toBeNull();
  });
});
