'use server';

import { unstable_noStore as noStore } from 'next/cache';

import { createSupabaseServiceClient } from '../../../../../packages/supabase/service';
import { loadArLedgerClientsForMonths } from '../../../lib/ar-invoicing/finance-revenue';
import { buildRollingMonthKeys, getCurrentMonthKey } from '../../../lib/ar-invoicing/month-window';
import { prevPayrollMonth, type PayrollPeriod } from './payroll-period';
import { payrollMonthFromFmPeriod } from '../../../lib/deduction-month-lock-storage';
import { requireFmPortfolioRead } from './fm-portfolio-auth-server';
import {
  buildFmClientDeficitsFromLedger,
  buildFmDiscrepancyGuardRoster,
  type FmDiscrepancyDeficit,
  type FmDiscrepancyGuardProfile,
} from './fm-discrepancy-data';

export type FmDiscrepancyQueuePayload = {
  deficits: FmDiscrepancyDeficit[];
  guardRoster: FmDiscrepancyGuardProfile[];
  error?: string;
};

async function fetchGuardUnpaidShiftsByEmpNo(
  companyId: string,
  payrollPeriod: PayrollPeriod,
): Promise<Record<string, number>> {
  const prevMonth = payrollMonthFromFmPeriod(prevPayrollPeriod(payrollPeriod)).slice(0, 7);
  const [year, month] = prevMonth.split('-').map(Number);
  const start = `${prevMonth}-01`;
  const end = new Date(year, month, 0).toISOString().slice(0, 10);

  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase
    .from('time_shifts')
    .select('employee_id, employees!inner(epf_no, emp_number)')
    .eq('company_id', companyId)
    .eq('verification_status', 'VERIFIED')
    .gte('shift_date', start)
    .lte('shift_date', end);

  if (error) {
    if (!/does not exist|42P01/i.test(error.message)) {
      console.error('❌ SUPABASE ERROR (fetchGuardUnpaidShiftsByEmpNo):', error.message);
    }
    return {};
  }

  const counts: Record<string, number> = {};
  for (const row of data ?? []) {
    const employee = row.employees as { epf_no?: string | null; emp_number?: string | null } | null;
    const empNo = String(employee?.epf_no ?? employee?.emp_number ?? '').trim();
    if (!empNo) continue;
    counts[empNo] = (counts[empNo] ?? 0) + 1;
  }
  return counts;
}

/** Live FM discrepancy queue — AR client penalties + MNR guard roster. */
export async function getFmDiscrepancyQueueData(
  payrollPeriod?: PayrollPeriod,
): Promise<FmDiscrepancyQueuePayload> {
  noStore();

  let companyId: string;
  try {
    ({ companyId } = await requireFmPortfolioRead());
  } catch (err) {
    const message = err instanceof Error ? err.message : 'FM portfolio access denied';
    return { deficits: [], guardRoster: [], error: message };
  }

  const supabase = createSupabaseServiceClient();
  const monthKeys = buildRollingMonthKeys(getCurrentMonthKey(), 12);

  const [employeesResult, clients, unpaidShiftsByEmpNo] = await Promise.all([
    supabase
      .from('employees')
      .select('emp_number, epf_no, epf_num, full_name, rank, group, basic_salary, base_salary, status')
      .eq('company_id', companyId)
      .ilike('status', 'active')
      .order('full_name', { ascending: true }),
    loadArLedgerClientsForMonths(supabase, companyId, monthKeys),
    payrollPeriod
      ? fetchGuardUnpaidShiftsByEmpNo(companyId, payrollPeriod)
      : Promise.resolve({} as Record<string, number>),
  ]);

  if (employeesResult.error) {
    console.error('❌ SUPABASE ERROR (getFmDiscrepancyQueueData):', employeesResult.error.message);
    return { deficits: [], guardRoster: [], error: employeesResult.error.message };
  }

  return {
    deficits: buildFmClientDeficitsFromLedger(clients, monthKeys),
    guardRoster: buildFmDiscrepancyGuardRoster(employeesResult.data ?? [], unpaidShiftsByEmpNo),
  };
}
