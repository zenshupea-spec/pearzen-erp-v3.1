import { findRankPayEntry, type RankPayEntry } from '../../../packages/rank-pay-matrix';

export type SalaryOverrideApproval = {
  requires_md_approval: boolean;
  salary_approval_status: string | null;
  custom_salary: number | null;
};

function normalizeLkr(value: unknown): number | null {
  if (value == null || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.round(n);
}

/** When HR sets base pay away from the MD rank matrix default, gate FM payroll until approved. */
export function resolveSalaryOverrideApproval(
  matrix: RankPayEntry[],
  rank: string | null | undefined,
  submittedBaseSalary: unknown,
): SalaryOverrideApproval {
  const submitted = normalizeLkr(submittedBaseSalary);
  if (submitted == null) {
    return {
      requires_md_approval: false,
      salary_approval_status: null,
      custom_salary: null,
    };
  }

  const matrixBasic = normalizeLkr(findRankPayEntry(matrix, rank)?.basicPay);
  if (matrixBasic != null && submitted === matrixBasic) {
    return {
      requires_md_approval: false,
      salary_approval_status: 'APPROVED',
      custom_salary: null,
    };
  }

  if (matrixBasic == null || submitted !== matrixBasic) {
    return {
      requires_md_approval: true,
      salary_approval_status: 'PENDING_FM',
      custom_salary: submitted,
    };
  }

  return {
    requires_md_approval: false,
    salary_approval_status: null,
    custom_salary: null,
  };
}
