import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

vi.mock('../../../lib/executive-portal-server-gate', () => ({
  assertExecutivePortalSecurityGate: vi.fn(),
}));

vi.mock('../../../lib/hr-portal-access-server', () => ({
  fetchBackOfficeUserProfile: vi.fn(),
}));

vi.mock('../../../../../packages/supabase/server', () => ({
  createSupabaseServerClient: vi.fn(),
}));

vi.mock('../../executive/settings/lib/executive-md-settings-db', () => ({
  getMdSettingsDb: vi.fn(),
  resolveExecutiveCompanyId: vi.fn(),
}));

vi.mock('../../../lib/staff-audit', () => ({
  auditStaffAction: vi.fn(),
}));

vi.mock('../../../lib/sector-role-assignment-data', () => ({
  fetchActiveSectorRoleStaffForCompany: vi.fn(),
  fetchSectorRoleAssignmentsForCompany: vi.fn(),
}));

vi.mock('./field-radar', () => ({
  getLiveFieldRadar: vi.fn(),
}));

import { assertExecutivePortalSecurityGate } from '../../../lib/executive-portal-server-gate';
import { fetchBackOfficeUserProfile } from '../../../lib/hr-portal-access-server';
import { createSupabaseServerClient } from '../../../../../packages/supabase/server';
import {
  getMdSettingsDb,
  resolveExecutiveCompanyId,
} from '../../executive/settings/lib/executive-md-settings-db';
import {
  assignSectorRoleAction,
  clearSectorRoleAction,
} from './sector-role-assignments';

function mockSession(role: string | null) {
  vi.mocked(createSupabaseServerClient).mockResolvedValue({
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: {
          user: role ? { id: 'user-1', email: 'actor@cvs.lk' } : null,
        },
      }),
    },
  } as never);

  if (!role) {
    vi.mocked(fetchBackOfficeUserProfile).mockResolvedValue(null as never);
    return;
  }

  vi.mocked(fetchBackOfficeUserProfile).mockResolvedValue({
    role,
    full_name: 'Actor',
    employeeId: 'actor-emp',
  } as never);
  vi.mocked(assertExecutivePortalSecurityGate).mockResolvedValue({ ok: true });
  vi.mocked(resolveExecutiveCompanyId).mockResolvedValue('company-1');
}

describe('sector-role-assignments actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('assignSectorRoleAction rejects unsigned sessions', async () => {
    mockSession(null);
    const result = await assignSectorRoleAction({
      smEpf: 'ROY',
      roleCode: 'OM',
      employeeId: 'om-1',
    });
    expect(result).toEqual({
      success: false,
      error: 'Not signed in.',
    });
  });

  it('assignSectorRoleAction rejects OM actors', async () => {
    mockSession('OM');
    const result = await assignSectorRoleAction({
      smEpf: 'ROY',
      roleCode: 'OM',
      employeeId: 'om-1',
    });
    expect(result).toEqual({
      success: false,
      error: 'Only MD or OD can manage sector assignments.',
    });
  });

  it('assignSectorRoleAction rejects HR actors', async () => {
    mockSession('HR');
    const result = await assignSectorRoleAction({
      smEpf: 'ROY',
      roleCode: 'FM',
      employeeId: 'fm-1',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe('Only MD or OD can manage sector assignments.');
    }
  });

  it('assignSectorRoleAction validates sm_epf and role_code before database writes', async () => {
    mockSession('MD');

    await expect(
      assignSectorRoleAction({
        smEpf: '__unassigned__',
        roleCode: 'OM',
        employeeId: 'om-1',
      }),
    ).resolves.toEqual({
      success: false,
      error: 'Invalid sector manager key.',
    });

    await expect(
      assignSectorRoleAction({
        smEpf: 'ROY',
        roleCode: 'MD',
        employeeId: 'md-1',
      }),
    ).resolves.toEqual({
      success: false,
      error: 'Invalid sector role.',
    });

    await expect(
      assignSectorRoleAction({
        smEpf: 'ROY',
        roleCode: 'OM',
        employeeId: '',
      }),
    ).resolves.toEqual({
      success: false,
      error: 'Choose a OM employee.',
    });

    expect(getMdSettingsDb).not.toHaveBeenCalled();
  });

  it('assignSectorRoleAction upserts sector_role_assignments for MD actor', async () => {
    mockSession('MD');

    const upsert = vi.fn().mockResolvedValue({ error: null });
    const maybeSingle = vi.fn().mockResolvedValue({
      data: {
        id: 'om-1',
        full_name: 'Alice OM',
        email: 'alice@cvs.lk',
        status: 'ACTIVE',
        rank: 'OM',
        company_id: 'company-1',
      },
      error: null,
    });
    const eqChain = {
      eq: vi.fn().mockReturnThis(),
      maybeSingle,
    };

    vi.mocked(getMdSettingsDb).mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === 'employees') {
          return {
            select: vi.fn().mockReturnValue(eqChain),
          };
        }
        if (table === 'sector_role_assignments') {
          return { upsert };
        }
        return { select: vi.fn().mockReturnValue(eqChain) };
      }),
    } as never);

    const result = await assignSectorRoleAction({
      smEpf: 'ROY',
      roleCode: 'OM',
      employeeId: 'om-1',
    });

    expect(result).toEqual({ success: true });
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        company_id: 'company-1',
        sm_epf: 'ROY',
        role_code: 'OM',
        employee_id: 'om-1',
      }),
      { onConflict: 'company_id,sm_epf,role_code' },
    );
  });

  it('clearSectorRoleAction rejects FM actors', async () => {
    mockSession('FM');
    const result = await clearSectorRoleAction({
      smEpf: 'ROY',
      roleCode: 'OM',
    });
    expect(result).toEqual({
      success: false,
      error: 'Only MD or OD can manage sector assignments.',
    });
  });
});
