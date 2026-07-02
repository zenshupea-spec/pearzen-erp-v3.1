import { describe, expect, it } from 'vitest';

import {
  emptyForgeTenantExecutives,
  isForgeExecutive2faTarget,
  mapCompanyExecutives,
  resolveTenantExecutiveTarget,
  type ForgeTenantExecutiveAuthRow,
} from './forge-tenant-executive-portal';

describe('forge-tenant-executive-portal', () => {
  it('maps MD/OD slots from employees and portal auth', () => {
    const auth = new Map<string, ForgeTenantExecutiveAuthRow>([
      [
        'md-1',
        { employee_id: 'md-1', work_email: 'md@tenant.test', two_factor_enabled: true },
      ],
      [
        'od-1',
        { employee_id: 'od-1', work_email: 'od@tenant.test', two_factor_enabled: false },
      ],
    ]);

    const mapped = mapCompanyExecutives(
      'company-1',
      [
        {
          id: 'md-1',
          company_id: 'company-1',
          rank: 'MD',
          full_name: 'Managing Director',
          email: 'legacy-md@tenant.test',
        },
        {
          id: 'od-1',
          company_id: 'company-1',
          rank: 'OD',
          full_name: 'Operations Director',
          email: 'legacy-od@tenant.test',
        },
        {
          id: 'hr-1',
          company_id: 'company-1',
          rank: 'HR',
          full_name: 'HR Lead',
          email: 'hr@tenant.test',
        },
      ],
      auth,
    );

    expect(mapped.md).toEqual({
      employeeId: 'md-1',
      email: 'md@tenant.test',
      twoFactorEnabled: true,
      fullName: 'Managing Director',
    });
    expect(mapped.od.twoFactorEnabled).toBe(false);
    expect(resolveTenantExecutiveTarget(mapped, 'od').email).toBe('od@tenant.test');
  });

  it('returns empty slots when no executives exist', () => {
    expect(mapCompanyExecutives('company-1', [], new Map())).toEqual(
      emptyForgeTenantExecutives(),
    );
  });

  it('validates executive 2FA targets', () => {
    expect(isForgeExecutive2faTarget('md')).toBe(true);
    expect(isForgeExecutive2faTarget('od')).toBe(true);
    expect(isForgeExecutive2faTarget('hr')).toBe(false);
  });
});
