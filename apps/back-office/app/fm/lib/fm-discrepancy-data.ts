import type { ArClientDeduction } from '../../../lib/ar-invoicing/collection-math';
import { monthKeyToLabel } from '../../../lib/ar-invoicing/month-window';
import { normalizeGuardRank, type GuardRankKey } from '../../../lib/guard-site-pay';

export type FmDiscrepancyRankKey = GuardRankKey;

export type FmDiscrepancyGuardProfile = {
  empNo: string;
  name: string;
  rank: FmDiscrepancyRankKey;
  basicSalary: number;
  unpaidShiftsLastMonth: number;
};

export type FmDiscrepancyDeficitStatus = 'UNRESOLVED' | 'SUBMITTED';

export type FmDiscrepancySubmittedStructure = {
  guardEmpNos: string[];
  totalLoss: number;
  monthlyDeduction: number;
  durationMonths: number;
  finalMonthDeductionLkr?: number | null;
  deductionMethod: 'MONTHLY' | 'CUT_SHIFTS';
  guardPercentages?: Record<string, number>;
  guardShiftsPerMonth?: Record<string, number>;
  perShiftValueLkr?: number;
  perShiftValuesLkr?: Record<string, number>;
  omNote: string;
  submittedAt: string;
};

export type FmDiscrepancyDeficit = {
  deficitId: string;
  incidentRef: string;
  clientName: string;
  invoiceNo: string;
  invoiceMonth: string;
  deficitAmount: number;
  incidentDate: string;
  description: string;
  status: FmDiscrepancyDeficitStatus;
  submittedStructure?: FmDiscrepancySubmittedStructure;
};

type ArLedgerInvoiceCell = {
  status?: string;
  invoiceNo?: string;
  clientDeductions?: ArClientDeduction[];
};

type ArLedgerClientRow = {
  clientId: string;
  clientName: string;
  invoices: Record<string, ArLedgerInvoiceCell | undefined>;
};

type EmployeeRow = {
  emp_number: string | null;
  epf_no?: string | null;
  epf_num?: string | number | null;
  full_name: string | null;
  rank: string | null;
  group: string | null;
  basic_salary?: number | null;
  base_salary?: number | null;
};

const FIELD_OPS_GROUPS = new Set(['HEAD_OFFICE', 'SECTOR_MANAGER', 'CAFE']);

function guardEmpNo(emp: EmployeeRow): string {
  return String(emp.epf_no ?? emp.emp_number ?? '').trim();
}

function guardBasicSalary(emp: EmployeeRow): number {
  const basic = Number(emp.basic_salary ?? emp.base_salary ?? 0);
  return Number.isFinite(basic) && basic > 0 ? basic : 0;
}

function outstandingDeficitAmount(deduction: ArClientDeduction): number {
  const totalLoss = Math.max(0, Number(deduction.totalClientLoss ?? deduction.deductionThisMonth ?? 0));
  const recovered = Math.max(0, Number(deduction.recoveredToDate ?? 0));
  return Math.max(0, Math.round(totalLoss - recovered));
}

function hasActiveRecoveryPlan(deduction: ArClientDeduction): boolean {
  const duration = Math.max(1, Number(deduction.durationMonths ?? 1));
  const completed = Number(deduction.monthsCompleted ?? 0);
  const monthly = Number(deduction.monthlyDeductionPerGuard ?? 0);
  return completed > 0 || (duration > 1 && monthly > 0);
}

function submittedStructureFromDeduction(
  deduction: ArClientDeduction,
): FmDiscrepancySubmittedStructure | undefined {
  if (!hasActiveRecoveryPlan(deduction)) return undefined;

  const guardEmpNos =
    deduction.responsibleGuards?.map((guard) => guard.empNo).filter(Boolean) ?? [];
  const monthlyDeduction = Math.max(
    0,
    Number(deduction.monthlyDeductionPerGuard ?? deduction.deductionThisMonth ?? 0),
  );
  const durationMonths = Math.max(1, Number(deduction.durationMonths ?? 1));

  return {
    guardEmpNos,
    totalLoss: Math.max(0, Number(deduction.totalClientLoss ?? deduction.deductionThisMonth ?? 0)),
    monthlyDeduction,
    durationMonths,
    deductionMethod: 'MONTHLY',
    omNote: deduction.omNote ?? '',
    submittedAt: new Date().toISOString(),
  };
}

/** Invoice Desk client penalty deductions that still need guard recovery (PASS_TO_GUARD). */
export function buildFmClientDeficitsFromLedger(
  clients: ArLedgerClientRow[],
  monthKeys: string[],
): FmDiscrepancyDeficit[] {
  const monthSet = new Set(monthKeys);
  const deficits: FmDiscrepancyDeficit[] = [];

  for (const client of clients) {
    for (const [monthKey, cell] of Object.entries(client.invoices)) {
      if (!cell || !monthSet.has(monthKey) || cell.status === 'NONE') continue;

      for (const deduction of cell.clientDeductions ?? []) {
        if ((deduction.liabilityType ?? 'PASS_TO_GUARD') === 'COMPANY_ABSORBS') continue;

        const deficitAmount = outstandingDeficitAmount(deduction);
        if (deficitAmount <= 0) continue;

        const submittedStructure = submittedStructureFromDeduction(deduction);
        deficits.push({
          deficitId: `${client.clientId}:${monthKey}:${deduction.penaltyId}`,
          incidentRef: deduction.incidentRef || deduction.penaltyId,
          clientName: client.clientName,
          invoiceNo: cell.invoiceNo?.trim() || '—',
          invoiceMonth: monthKeyToLabel(monthKey),
          deficitAmount,
          incidentDate: monthKey,
          description:
            deduction.omNote?.trim() ||
            deduction.incidentRef?.trim() ||
            'Client pass-through penalty awaiting guard recovery',
          status: submittedStructure ? 'SUBMITTED' : 'UNRESOLVED',
          submittedStructure,
        });
      }
    }
  }

  return deficits.sort((a, b) => {
    if (a.status !== b.status) return a.status === 'UNRESOLVED' ? -1 : 1;
    return b.deficitAmount - a.deficitAmount;
  });
}

export function buildFmDiscrepancyGuardRoster(
  employees: EmployeeRow[],
  unpaidShiftsByEmpNo: Record<string, number>,
): FmDiscrepancyGuardProfile[] {
  return employees
    .filter((emp) => !FIELD_OPS_GROUPS.has(String(emp.group ?? '').toUpperCase()))
    .map((emp) => {
      const empNo = guardEmpNo(emp);
      return {
        empNo,
        name: String(emp.full_name ?? empNo).trim() || empNo,
        rank: normalizeGuardRank(emp.rank),
        basicSalary: guardBasicSalary(emp),
        unpaidShiftsLastMonth: unpaidShiftsByEmpNo[empNo] ?? 0,
      };
    })
    .filter((guard) => guard.empNo.length > 0)
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
}
