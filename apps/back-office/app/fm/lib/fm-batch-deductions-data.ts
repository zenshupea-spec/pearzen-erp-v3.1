import { createSupabaseServiceClient } from '../../../../../packages/supabase/service';
import type { BatchDeductionRow } from './batch-deductions-ledger';
import { payrollMonthDate } from './fm-employee-deduction-plans';
import { fetchPenaltyDeductionLedgerRows } from './fm-sm-penalties';

function isMissingTableError(message: string): boolean {
  return /does not exist|relation .* not found|42P01/i.test(message);
}

type EmpMeta = {
  id: string;
  emp_number: string | null;
  full_name: string | null;
  rank: string | null;
  site: string | null;
};

function empNo(emp: EmpMeta): string {
  return String(emp.emp_number ?? '—').trim() || '—';
}

function toBatchRow(
  emp: EmpMeta,
  amountLkr: number,
  detail: string,
  supplier: string,
): BatchDeductionRow {
  return {
    empNo: empNo(emp),
    name: String(emp.full_name ?? 'Unknown'),
    rank: String(emp.rank ?? '—'),
    site: String(emp.site ?? '—').trim() || '—',
    amountLkr: Math.round(amountLkr),
    detail,
    supplier,
  };
}

async function loadActiveEmployees(companyId: string): Promise<Map<string, EmpMeta>> {
  const db = createSupabaseServiceClient();
  const { data, error } = await db
    .from('employees')
    .select('id, emp_number, full_name, rank, site')
    .eq('company_id', companyId)
    .ilike('status', 'active');

  if (error) {
    if (isMissingTableError(error.message)) return new Map();
    console.error('loadActiveEmployees:', error.message);
    return new Map();
  }

  return new Map((data ?? []).map((row) => [String(row.id), row as EmpMeta]));
}

async function loadMealSupplierBySiteName(companyId: string): Promise<Map<string, string>> {
  const db = createSupabaseServiceClient();
  const { data: sites, error: siteError } = await db
    .from('site_profiles')
    .select('id, site_name')
    .eq('company_id', companyId);

  if (siteError || !sites?.length) return new Map();

  const siteIdByName = new Map(
    sites.map((site) => [String(site.site_name).trim().toLowerCase(), String(site.id)]),
  );
  const siteIds = sites.map((site) => String(site.id));

  const { data: assignments } = await db
    .from('site_meal_supplier_assignments')
    .select('site_profile_id, meal_supplier_id, meal_suppliers ( name )')
    .in('site_profile_id', siteIds);

  const supplierNameBySiteKey = new Map<string, string>();
  for (const row of assignments ?? []) {
    const siteId = String(row.site_profile_id);
    const siteName = sites.find((site) => String(site.id) === siteId)?.site_name;
    if (!siteName) continue;
    const sp = row.meal_suppliers as { name?: string } | { name?: string }[] | null;
    const name = Array.isArray(sp) ? sp[0]?.name : sp?.name;
    if (name) supplierNameBySiteKey.set(String(siteName).trim().toLowerCase(), name);
  }

  return supplierNameBySiteKey;
}

export async function fetchMealsDeductionLedgerRows(
  companyId: string,
  year: number,
  month: number,
): Promise<BatchDeductionRow[]> {
  const payrollMonth = payrollMonthDate({ year, month });
  const db = createSupabaseServiceClient();

  const [employees, supplierBySite, entriesRes] = await Promise.all([
    loadActiveEmployees(companyId),
    loadMealSupplierBySiteName(companyId),
    db
      .from('payroll_monthly_deduction_entries')
      .select('employee_id, meals_amount_lkr')
      .eq('company_id', companyId)
      .eq('payroll_month', payrollMonth)
      .gt('meals_amount_lkr', 0),
  ]);

  if (entriesRes.error) {
    if (!isMissingTableError(entriesRes.error.message)) {
      console.error('fetchMealsDeductionLedgerRows:', entriesRes.error.message);
    }
    return [];
  }

  const rows: BatchDeductionRow[] = [];
  for (const entry of entriesRes.data ?? []) {
    const emp = employees.get(String(entry.employee_id));
    if (!emp) continue;
    const amount = Number(entry.meals_amount_lkr ?? 0);
    if (amount <= 0) continue;
    const siteKey = String(emp.site ?? '').trim().toLowerCase();
    const supplier = (siteKey && supplierBySite.get(siteKey)) || 'HQ Deductions Admin';
    rows.push(toBatchRow(emp, amount, 'Monthly meals recovery', supplier));
  }

  return rows.sort((a, b) => a.name.localeCompare(b.name));
}

export async function fetchUniformDeductionLedgerRows(
  companyId: string,
  year: number,
  month: number,
): Promise<BatchDeductionRow[]> {
  const payrollMonth = payrollMonthDate({ year, month });
  const db = createSupabaseServiceClient();

  const [employees, entriesRes, uniformDedRes] = await Promise.all([
    loadActiveEmployees(companyId),
    db
      .from('payroll_monthly_deduction_entries')
      .select('employee_id, uniform_amount_lkr')
      .eq('company_id', companyId)
      .eq('payroll_month', payrollMonth)
      .gt('uniform_amount_lkr', 0),
    db
      .from('payroll_deductions')
      .select('guard_id, amount')
      .eq('company_id', companyId)
      .eq('category', 'UNIFORM')
      .eq('applied_month', payrollMonth),
  ]);

  const amountByEmployee = new Map<string, number>();

  if (!entriesRes.error) {
    for (const entry of entriesRes.data ?? []) {
      const employeeId = String(entry.employee_id);
      const amount = Number(entry.uniform_amount_lkr ?? 0);
      if (amount > 0) amountByEmployee.set(employeeId, amount);
    }
  } else if (!isMissingTableError(entriesRes.error.message)) {
    console.error('fetchUniformDeductionLedgerRows entries:', entriesRes.error.message);
  }

  if (!uniformDedRes.error) {
    for (const row of uniformDedRes.data ?? []) {
      const employeeId = String(row.guard_id);
      if (amountByEmployee.has(employeeId)) continue;
      const amount = Number(row.amount ?? 0);
      if (amount > 0) amountByEmployee.set(employeeId, amount);
    }
  } else if (!isMissingTableError(uniformDedRes.error.message)) {
    console.error('fetchUniformDeductionLedgerRows payroll_deductions:', uniformDedRes.error.message);
  }

  const rows: BatchDeductionRow[] = [];
  for (const [employeeId, amount] of amountByEmployee) {
    const emp = employees.get(employeeId);
    if (!emp) continue;
    rows.push(toBatchRow(emp, amount, 'Uniform recovery', 'Uniform issue ledger'));
  }

  return rows.sort((a, b) => a.name.localeCompare(b.name));
}

export async function fetchAdvanceDeductionLedgerRows(
  companyId: string,
  year: number,
  month: number,
): Promise<BatchDeductionRow[]> {
  const db = createSupabaseServiceClient();
  const { data, error } = await db
    .from('salary_advances')
    .select('profile_id, emp_number, amount')
    .eq('company_id', companyId)
    .eq('period_year', year)
    .eq('period_month', month)
    .eq('status', 'APPROVED')
    .gt('amount', 0);

  if (error) {
    if (error.code === '42P01' || isMissingTableError(error.message)) return [];
    console.error('fetchAdvanceDeductionLedgerRows:', error.message);
    return [];
  }

  const profileIds = (data ?? []).map((row) => String(row.profile_id));
  const employees = await loadActiveEmployees(companyId);
  const employeeById = employees;

  const rows: BatchDeductionRow[] = [];
  for (const row of data ?? []) {
    const profileId = String(row.profile_id);
    const emp = employeeById.get(profileId);
    const amount = Number(row.amount ?? 0);
    if (amount <= 0) continue;

    const advanceLabel = amount.toLocaleString('en-LK');
    if (emp) {
      rows.push(
        toBatchRow(
          emp,
          amount,
          `One-time · LKR ${advanceLabel}`,
          'Pearzen Security (Payroll)',
        ),
      );
      continue;
    }

    rows.push({
      empNo: String(row.emp_number ?? '—').trim() || '—',
      name: 'Unknown',
      rank: '—',
      site: '—',
      amountLkr: Math.round(amount),
      detail: `One-time · LKR ${advanceLabel}`,
      supplier: 'Pearzen Security (Payroll)',
    });
  }

  return rows.sort((a, b) => a.name.localeCompare(b.name));
}

export async function fetchBatchDeductionLedgerRows(
  companyId: string,
  kind: 'meals' | 'uniform' | 'advance' | 'penalty',
  year: number,
  month: number,
): Promise<BatchDeductionRow[]> {
  switch (kind) {
    case 'meals':
      return fetchMealsDeductionLedgerRows(companyId, year, month);
    case 'uniform':
      return fetchUniformDeductionLedgerRows(companyId, year, month);
    case 'advance':
      return fetchAdvanceDeductionLedgerRows(companyId, year, month);
    case 'penalty': {
      const penaltyRows = await fetchPenaltyDeductionLedgerRows(companyId, year, month);
      return penaltyRows.map((row) => ({
        empNo: row.empNo,
        name: row.name,
        rank: row.rank,
        site: row.site,
        amountLkr: row.amountLkr,
        detail: row.catalogLabel ?? row.category,
        supplier: row.supplier,
      }));
    }
    default:
      return [];
  }
}
