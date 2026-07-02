import { describe, expect, it } from 'vitest';

import {
  calcCafeMemberGrossLkr,
  calcCafePayrollCostLkr,
  mergeCafePayrollMember,
} from './cafe-payroll-cost';

describe('cafe-payroll-cost', () => {
  it('sums daily rate × days + OT for gross', () => {
    expect(
      calcCafeMemberGrossLkr({ dailyRate: 1154, daysWorked: 1, otTotalLkr: 1000 }),
    ).toBe(2154);
  });

  it('prefers day logs for days worked and OT when present', () => {
    const member = mergeCafePayrollMember({
      employee: {
        id: 'emp-1',
        full_name: 'ASD FERNANDO',
        rank: 'BA',
        base_salary: 30_000,
      },
      period: {
        employee_id: 'emp-1',
        daily_rate_lkr: 1154,
        days_worked: 0,
        deductions_mtd_lkr: 0,
        role_label: 'Barista',
      },
      dayLogs: [
        { worked: true, ot_lkr: 1000, ot_hours: 2 },
        { worked: false, ot_lkr: 0, ot_hours: 0 },
      ],
    });

    expect(member.daysWorked).toBe(1);
    expect(member.otTotalLkr).toBe(1000);
    expect(calcCafeMemberGrossLkr(member)).toBe(2154);
  });

  it('falls back to period OT totals when day logs are absent', () => {
    const member = mergeCafePayrollMember({
      employee: {
        id: 'emp-1',
        full_name: 'ASD FERNANDO',
        rank: 'BA',
        base_salary: 30_000,
      },
      period: {
        employee_id: 'emp-1',
        daily_rate_lkr: 1154,
        days_worked: 1,
        deductions_mtd_lkr: 0,
        role_label: 'Barista',
        ot_total_hours: 2,
        ot_total_lkr: 1000,
      },
    });

    expect(member.daysWorked).toBe(1);
    expect(member.otTotalLkr).toBe(1000);
    expect(calcCafeMemberGrossLkr(member)).toBe(2154);
  });

  it('MD and FM readers agree within LKR 1 for the same fixture', () => {
    const member = mergeCafePayrollMember({
      employee: {
        id: 'emp-1',
        full_name: 'ASD FERNANDO',
        rank: 'BA',
        base_salary: 30_000,
      },
      period: {
        employee_id: 'emp-1',
        daily_rate_lkr: 1154,
        days_worked: 0,
        deductions_mtd_lkr: 0,
        role_label: 'Barista',
      },
      dayLogs: [{ worked: true, ot_lkr: 1000, ot_hours: 2 }],
    });

    const mdTotal = calcCafePayrollCostLkr([member]);
    const fmTotal = calcCafeMemberGrossLkr(member);
    expect(Math.abs(mdTotal - fmTotal)).toBeLessThanOrEqual(1);
  });
});
