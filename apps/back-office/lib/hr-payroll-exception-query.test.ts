import { describe, expect, it } from 'vitest';

import {
  isPayrollExceptionEmployee,
  mapSalaryOverrideRow,
} from './hr-payroll-exception-query';

describe('hr-payroll-exception-query', () => {
  it('includes flag-only employees without pending salary status', () => {
    expect(
      isPayrollExceptionEmployee({
        requires_md_approval: true,
        salary_approval_status: null,
      }),
    ).toBe(true);
  });

  it('includes pending salary status rows', () => {
    expect(
      isPayrollExceptionEmployee({
        requires_md_approval: false,
        salary_approval_status: 'PENDING_FM',
      }),
    ).toBe(true);
  });

  it('maps flag-only rows as pending yellow radar entries', () => {
    const row = mapSalaryOverrideRow({
      id: 'emp-1',
      full_name: 'Flag Only Guard',
      rank: 'JSO',
      group: 'GUARD',
      custom_salary: 42_000,
      base_salary: 35_000,
      requires_md_approval: true,
      salary_approval_status: null,
      updated_at: '2026-06-01T00:00:00Z',
    });
    expect(row.status).toBe('PENDING');
    expect(row.requiresMdFlag).toBe(true);
    expect(row.reason).toMatch(/MD approval flag/i);
  });
});
