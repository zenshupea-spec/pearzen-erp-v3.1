import type { PayrollPeriod } from './payroll-period';
import type { SmPenaltyDeduction } from './fm-sm-penalties';
import type { PayrollComplianceSettings } from '../../executive/settings/actions';
import {
  applyFmPayrollCompliance,
  resolveFmPortfolioBasicSalary,
  scaleVoluntaryDeductionRows,
} from './fm-payroll-compliance';

export const FM_GRANULAR_DEDUCTION_KINDS = [
  { key: 'DEATH_DONATION', label: 'Death Donation' },
  { key: 'WEDDING_GIFTS', label: 'Wedding Gifts' },
  { key: 'EXTRA_ITEMS', label: 'Extra Items' },
  { key: 'UNIT_DAMAGES', label: 'Unit Damages' },
  { key: 'TRAINING', label: 'Training' },
  { key: 'SALARY_LOAN', label: 'Salary Loan' },
  { key: 'OTHER_DEDUCTIONS', label: 'Other Deductions' },
] as const;

export type FmGranularDeductionKind = (typeof FM_GRANULAR_DEDUCTION_KINDS)[number]['key'];
export type FmGranularDeductionLabel = (typeof FM_GRANULAR_DEDUCTION_KINDS)[number]['label'];

export type FmHqDeductionType = 'Meals' | 'Uniform' | 'Advance' | 'Penalty';
export type FmPortfolioDeductionType = FmHqDeductionType | FmGranularDeductionLabel;

export type FmPortfolioDeduction = {
  type: FmPortfolioDeductionType;
  totalLiability: number;
  installmentCurrent: number;
  installmentTotal: number;
  thisMonthAmount: number;
  planId?: string;
  editable?: boolean;
  source?: 'hq' | 'fm' | 'system';
  notes?: string;
};

export type FmEmployeeDeductionPlanRow = {
  id: string;
  employeeId: string;
  deductionKind: FmGranularDeductionKind;
  totalLiabilityLkr: number;
  installmentTotal: number;
  startPayrollMonth: string;
  status: 'ACTIVE' | 'COMPLETED' | 'CANCELLED';
  notes: string | null;
};

export type FmDeductionAuditRow = {
  type: FmPortfolioDeductionType;
  planId?: string;
  editable: boolean;
  source: 'hq' | 'fm' | 'system';
  totalLiability: number;
  installmentCurrent: number;
  installmentTotal: number;
  thisMonthAmount: number;
  notes?: string | null;
};

const LABEL_BY_KIND = Object.fromEntries(
  FM_GRANULAR_DEDUCTION_KINDS.map((entry) => [entry.key, entry.label]),
) as Record<FmGranularDeductionKind, FmGranularDeductionLabel>;

const KIND_BY_LABEL = Object.fromEntries(
  FM_GRANULAR_DEDUCTION_KINDS.map((entry) => [entry.label, entry.key]),
) as Record<FmGranularDeductionLabel, FmGranularDeductionKind>;

export function fmGranularDeductionLabel(kind: FmGranularDeductionKind): FmGranularDeductionLabel {
  return LABEL_BY_KIND[kind];
}

export function fmGranularDeductionKind(label: FmGranularDeductionLabel): FmGranularDeductionKind {
  return KIND_BY_LABEL[label];
}

export function payrollMonthDate(period: PayrollPeriod): string {
  return `${period.year}-${String(period.month).padStart(2, '0')}-01`;
}

function monthsBetween(startYear: number, startMonth: number, year: number, month: number): number {
  return (year - startYear) * 12 + (month - startMonth);
}

export function computeInstallmentSchedule(
  plan: Pick<
    FmEmployeeDeductionPlanRow,
    'totalLiabilityLkr' | 'installmentTotal' | 'startPayrollMonth' | 'status'
  >,
  period: PayrollPeriod,
): {
  installmentCurrent: number;
  installmentTotal: number;
  thisMonthAmount: number;
  completed: boolean;
} | null {
  if (plan.status !== 'ACTIVE') return null;

  const [startYearRaw, startMonthRaw] = plan.startPayrollMonth.slice(0, 7).split('-');
  const startYear = Number(startYearRaw);
  const startMonth = Number(startMonthRaw);
  const elapsed = monthsBetween(startYear, startMonth, period.year, period.month);
  if (elapsed < 0) return null;

  const installmentCurrent = elapsed + 1;
  if (installmentCurrent > plan.installmentTotal) {
    return {
      installmentCurrent: plan.installmentTotal,
      installmentTotal: plan.installmentTotal,
      thisMonthAmount: 0,
      completed: true,
    };
  }

  const base = Math.floor(plan.totalLiabilityLkr / plan.installmentTotal);
  const remainder = Math.round(plan.totalLiabilityLkr - base * plan.installmentTotal);
  const thisMonthAmount =
    installmentCurrent === plan.installmentTotal ? base + remainder : base;

  return {
    installmentCurrent,
    installmentTotal: plan.installmentTotal,
    thisMonthAmount: Math.max(0, thisMonthAmount),
    completed: false,
  };
}

export function planToPortfolioDeduction(
  plan: FmEmployeeDeductionPlanRow,
  period: PayrollPeriod,
): FmPortfolioDeduction | null {
  const schedule = computeInstallmentSchedule(plan, period);
  if (!schedule || schedule.completed || schedule.thisMonthAmount <= 0) return null;

  return {
    type: fmGranularDeductionLabel(plan.deductionKind),
    planId: plan.id,
    editable: true,
    source: 'fm',
    totalLiability: plan.totalLiabilityLkr,
    installmentCurrent: schedule.installmentCurrent,
    installmentTotal: schedule.installmentTotal,
    thisMonthAmount: schedule.thisMonthAmount,
  };
}

export function buildHqDeductionRow(
  type: 'Meals' | 'Uniform',
  amount: number,
): FmPortfolioDeduction {
  const value = Math.max(0, Math.round(amount));
  return {
    type,
    source: 'hq',
    editable: false,
    totalLiability: value,
    installmentCurrent: value > 0 ? 1 : 0,
    installmentTotal: 1,
    thisMonthAmount: value,
  };
}

export function buildAdvanceDeductionRow(amount: number): FmPortfolioDeduction | null {
  const value = Math.max(0, Math.round(amount));
  if (value <= 0) return null;
  return {
    type: 'Advance',
    source: 'system',
    editable: false,
    totalLiability: value,
    installmentCurrent: 1,
    installmentTotal: 1,
    thisMonthAmount: value,
  };
}

export function buildPenaltyDeductionRow(
  amount: number,
  catalogLabel?: string,
): FmPortfolioDeduction | null {
  const value = Math.max(0, Math.round(amount));
  if (value <= 0) return null;
  return {
    type: 'Penalty',
    source: 'system',
    editable: false,
    totalLiability: value,
    installmentCurrent: 1,
    installmentTotal: 1,
    thisMonthAmount: value,
    notes: catalogLabel?.trim() || undefined,
  };
}

export function mapPlanRow(row: Record<string, unknown>): FmEmployeeDeductionPlanRow {
  return {
    id: String(row.id),
    employeeId: String(row.employee_id),
    deductionKind: String(row.deduction_kind) as FmGranularDeductionKind,
    totalLiabilityLkr: Number(row.total_liability_lkr ?? 0),
    installmentTotal: Number(row.installment_total ?? 1),
    startPayrollMonth: String(row.start_payroll_month).slice(0, 10),
    status: String(row.status ?? 'ACTIVE') as FmEmployeeDeductionPlanRow['status'],
    notes: (row.notes as string | null) ?? null,
  };
}

function cashVoluntaryDeductions(deductions: FmPortfolioDeduction[]): FmPortfolioDeduction[] {
  return deductions.filter((row) => row.type !== 'Penalty');
}

function penaltyDeductions(deductions: FmPortfolioDeduction[]): FmPortfolioDeduction[] {
  return deductions.filter((row) => row.type === 'Penalty');
}

function sumDeductionAmounts(deductions: FmPortfolioDeduction[]): number {
  return deductions.reduce((sum, row) => sum + row.thisMonthAmount, 0);
}

export function recalcEmployeeDeductionTotals<
  T extends {
    totalGross: number;
    deductions: FmPortfolioDeduction[];
    earnings?: {
      hoFixedData?: { mnrBaseSalaryLkr: number };
      cafeData?: { monthlyBasicLkr: number };
      smPayData?: {
        fixedBasicLkr?: number;
        epfEmployeeLkr?: number;
        payeeTaxLkr?: number;
        stampDutyLkr?: number;
      };
      guardData?: { monthlyBasicLkr: number };
      basePayLkr?: number;
    };
  },
>(emp: T, compliance?: PayrollComplianceSettings): T {
  const smStatutory = emp.earnings?.smPayData
    ? (emp.earnings.smPayData.epfEmployeeLkr ?? 0) +
      (emp.earnings.smPayData.payeeTaxLkr ?? 0) +
      (emp.earnings.smPayData.stampDutyLkr ?? 0)
    : 0;

  if (compliance) {
    const basicSalary = resolveFmPortfolioBasicSalary(emp);
    const cashDeductions = cashVoluntaryDeductions(emp.deductions);
    const voluntaryTotal = sumDeductionAmounts(cashDeductions);
    const complianceResult = applyFmPayrollCompliance({
      grossPay: emp.totalGross,
      basicSalary,
      statutoryDeductions: smStatutory,
      voluntaryDeductions: voluntaryTotal,
      compliance,
    });
    const scaledCash = scaleVoluntaryDeductionRows(
      cashDeductions,
      complianceResult.allowedVoluntaryDeductions,
    );
    const deductions = [...scaledCash, ...penaltyDeductions(emp.deductions)];
    const totalDeductions = sumDeductionAmounts(scaledCash);
    return {
      ...emp,
      deductions,
      totalDeductions,
      netTakeHome: complianceResult.netPay,
    } as T;
  }

  const cashDeductions = cashVoluntaryDeductions(emp.deductions);
  const totalDeductions = sumDeductionAmounts(cashDeductions);
  return {
    ...emp,
    deductions: [...cashDeductions, ...penaltyDeductions(emp.deductions)],
    totalDeductions,
    netTakeHome: Math.max(0, emp.totalGross - totalDeductions - smStatutory),
  } as T;
}

export function mergePortfolioDeductionsForEmployee(
  employeeId: string,
  period: PayrollPeriod,
  hqByEmployee: Map<string, { meals: number; uniform: number }>,
  advancesByProfile: Map<string, number>,
  plansByEmployee: Map<string, FmEmployeeDeductionPlanRow[]>,
  smPenaltiesByEmployee?: Map<string, SmPenaltyDeduction[]>,
): FmPortfolioDeduction[] {
  const hq = hqByEmployee.get(employeeId);
  const deductions: FmPortfolioDeduction[] = [
    buildHqDeductionRow('Meals', hq?.meals ?? 0),
    buildHqDeductionRow('Uniform', hq?.uniform ?? 0),
  ];

  const advance = buildAdvanceDeductionRow(advancesByProfile.get(employeeId) ?? 0);
  if (advance) deductions.push(advance);

  for (const plan of plansByEmployee.get(employeeId) ?? []) {
    const row = planToPortfolioDeduction(plan, period);
    if (row) deductions.push(row);
  }

  deductions.push(...portfolioPenaltyDeductionsFromSmPenalties(smPenaltiesByEmployee?.get(employeeId) ?? []));

  return deductions.filter((row) => row.thisMonthAmount > 0);
}

function portfolioPenaltyDeductionsFromSmPenalties(penalties: SmPenaltyDeduction[]): FmPortfolioDeduction[] {
  const total = penalties.reduce((sum, row) => sum + row.amountLkr, 0);
  if (total <= 0) return [];
  const labels = [...new Set(penalties.map((row) => row.catalogLabel).filter(Boolean))];
  const row = buildPenaltyDeductionRow(total, labels.join('; ') || 'Disciplinary penalty');
  return row ? [row] : [];
}

export function buildFmAuditRows(
  period: PayrollPeriod,
  hqMeals: number,
  hqUniform: number,
  advanceAmount: number,
  plans: FmEmployeeDeductionPlanRow[],
): FmDeductionAuditRow[] {
  const rows: FmDeductionAuditRow[] = [
    {
      ...buildHqDeductionRow('Meals', hqMeals),
      editable: false,
      source: 'hq',
    },
    {
      ...buildHqDeductionRow('Uniform', hqUniform),
      editable: false,
      source: 'hq',
    },
  ];

  const advance = buildAdvanceDeductionRow(advanceAmount);
  if (advance) {
    rows.push({
      ...advance,
      editable: false,
      source: 'system',
    });
  }

  const plansByKind = new Map(plans.map((plan) => [plan.deductionKind, plan]));

  for (const kindEntry of FM_GRANULAR_DEDUCTION_KINDS) {
    const plan = plansByKind.get(kindEntry.key);
    if (plan) {
      const schedule = computeInstallmentSchedule(plan, period);
      rows.push({
        type: kindEntry.label,
        planId: plan.id,
        editable: true,
        source: 'fm',
        totalLiability: plan.totalLiabilityLkr,
        installmentCurrent: schedule?.installmentCurrent ?? 0,
        installmentTotal: plan.installmentTotal,
        thisMonthAmount: schedule?.thisMonthAmount ?? 0,
        notes: plan.notes,
      });
    } else {
      rows.push({
        type: kindEntry.label,
        editable: true,
        source: 'fm',
        totalLiability: 0,
        installmentCurrent: 0,
        installmentTotal: 1,
        thisMonthAmount: 0,
      });
    }
  }

  return rows;
}
