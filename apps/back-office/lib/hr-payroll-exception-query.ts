export const PENDING_SALARY_STATUSES = ['PENDING_FM', 'PENDING_MD'] as const;

export type PayrollExceptionEmployeeRow = {
  id: string;
  full_name?: string | null;
  rank?: string | null;
  group?: string | null;
  custom_salary?: number | null;
  base_salary?: number | null;
  basic_salary?: number | null;
  salary_approval_status?: string | null;
  requires_md_approval?: boolean | null;
  updated_at?: string | null;
};

/** Matches payroll generate skip + exception radar visibility (R-FIN-04). */
export function isPayrollExceptionEmployee(row: {
  requires_md_approval?: boolean | null;
  salary_approval_status?: string | null;
}): boolean {
  if (Boolean(row.requires_md_approval)) return true;
  const status = String(row.salary_approval_status ?? '').toUpperCase();
  return (PENDING_SALARY_STATUSES as readonly string[]).includes(status);
}

export function payrollExceptionOrFilter(): string {
  return `requires_md_approval.eq.true,salary_approval_status.in.(${PENDING_SALARY_STATUSES.join(',')})`;
}

export type MappedSalaryOverride = {
  id: string;
  name: string;
  rank: string;
  company: string;
  defaultPay: number;
  overridePay: number;
  requestedBy: string;
  reason: string;
  date: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  requiresMdFlag: boolean;
};

export function mapSalaryOverrideRow(row: PayrollExceptionEmployeeRow): MappedSalaryOverride {
  const defaultPay = Number(row.base_salary ?? row.basic_salary ?? 0);
  const overridePay = Number(row.custom_salary ?? defaultPay);
  const group = String(row.group ?? '').toUpperCase();
  const company = group.includes('CAFE') ? 'Café' : group.includes('BNB') ? 'BnB' : 'Security';
  const requiresMdFlag = Boolean(row.requires_md_approval);
  const statusRaw = String(row.salary_approval_status ?? '').toUpperCase();
  const hasPendingStatus = (PENDING_SALARY_STATUSES as readonly string[]).includes(statusRaw);
  const isPending = requiresMdFlag || hasPendingStatus;

  return {
    id: String(row.id),
    name: String(row.full_name ?? 'Unknown'),
    rank: String(row.rank ?? ''),
    company,
    defaultPay,
    overridePay,
    requestedBy: 'HR Admin',
    reason: requiresMdFlag && !hasPendingStatus
      ? 'MD approval flag — blocked from payroll generate'
      : 'Custom salary pending FM approval',
    date: String(row.updated_at ?? new Date().toISOString()).slice(0, 10),
    status: isPending ? 'PENDING' : statusRaw === 'APPROVED' ? 'APPROVED' : 'REJECTED',
    requiresMdFlag,
  };
}
