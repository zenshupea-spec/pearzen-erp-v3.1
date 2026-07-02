import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));

vi.mock('./sector-role-assignment-data', () => ({
  fetchSectorRoleAssignmentsForCompany: vi.fn(),
}));

import { fetchSectorRoleAssignmentsForCompany } from './sector-role-assignment-data';
import { fetchSectorOmAssignmentsForCompany } from './om-sector-assignment-data';

describe('om-sector-assignment-data', () => {
  beforeEach(() => {
    vi.mocked(fetchSectorRoleAssignmentsForCompany).mockReset();
  });

  it('maps OM assignees from sector_role_assignments rows only', async () => {
    vi.mocked(fetchSectorRoleAssignmentsForCompany).mockResolvedValue({
      ROY: {
        OM: {
          employeeId: 'om-1',
          fullName: 'Alice OM',
          epfNo: '12001',
          rank: 'OM',
        },
        FM: {
          employeeId: 'fm-1',
          fullName: 'Bob FM',
          epfNo: '22001',
          rank: 'FM',
        },
      },
      KANDY: {
        TM: {
          employeeId: 'tm-1',
          fullName: 'Carol TM',
          epfNo: '33001',
          rank: 'TM',
        },
      },
    });

    const result = await fetchSectorOmAssignmentsForCompany('company-1');

    expect(fetchSectorRoleAssignmentsForCompany).toHaveBeenCalledWith('company-1');
    expect(result).toEqual({
      ROY: {
        employeeId: 'om-1',
        fullName: 'Alice OM',
        epfNo: '12001',
      },
    });
    expect(result.KANDY).toBeUndefined();
  });

  it('returns empty map when no OM rows exist', async () => {
    vi.mocked(fetchSectorRoleAssignmentsForCompany).mockResolvedValue({});
    await expect(fetchSectorOmAssignmentsForCompany('co-empty')).resolves.toEqual({});
  });
});
