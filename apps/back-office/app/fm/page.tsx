'use client';

import { useCallback, useEffect, useMemo, useState, useTransition } from 'react';
import FmSubnav from './components/FmSubnav';
import FmCommandShellLayout from './components/FmCommandShellLayout';
import { ExecutiveGlassCard } from '../../components/executive/ExecutiveVaultShell';
import { CVS_BRAND_CLASSES } from '../../lib/cvs-brand-tokens';
import { useFmHolidayCalendarIncomplete } from './use-fm-holiday-calendar-incomplete';
import FmGranularDeductionsLedger from './components/FmGranularDeductionsLedger';
import FmDeductionsModal from './components/FmDeductionsModal';
import FmPayrollAllowancesPanel from './components/FmPayrollAllowancesPanel';
import FmPayrollMonthSelector from './components/FmPayrollMonthSelector';
import FmPortfolioReportModal from './components/FmPortfolioReportModal';
import ShiftAdjustmentsPanel from './components/ShiftAdjustmentsPanel';
import type { FmPortfolioReportKind } from './lib/fm-portfolio-report-builders';
import {
  type PayrollWorkflowStatus,
} from '../../lib/payroll-batch-workflow';
import { type PayrollGroupId, type PayrollGroupWorkflow } from '../../lib/payroll-run-types';
import {
  triggerPayrollBankDownload,
  type PayrollBankExportCohort,
} from '../../lib/payroll-bank-export';
import { generateMonthEndPayroll } from './actions';
import {
  getPayrollBatchStatus,
  downloadPayrollBankFile,
  markPayrollGroupPaid,
  revertPayrollGroupToDraft,
  submitPayrollGroupForReview,
} from './payroll-run-actions';
import {
  effectiveShiftsAtSite,
  getPenaltyShiftReduction,
  syncEmployeeShiftCount,
  type ShiftAuditEntry,
} from './lib/shift-adjustments';
import {
  FM_LIVE_PAYROLL_PERIOD,
  getFmLivePayrollPeriod,
  formatPayrollPeriodLabel,
  historicalPortfolioScale,
  isLivePayrollPeriod,
} from './lib/payroll-period';
import { getDeductionMonthLockStatus } from '../hq/deductions/actions';
import { getMdEngineConstants } from '../executive/settings/engine-constants-actions';
import { CVS_GUARD_OPS_ENABLED } from '../../lib/cvs-workforce-phase';
import { ensurePinnedPayrollSites } from './lib/pinned-payroll-sites';
import {
  getFmPortfolio,
  saveFmShiftAdjustment,
  type FmPortfolioPayload,
} from './portfolio-actions';
import {
  payrollMonthFromFmPeriod,
} from '../../lib/deduction-month-lock-storage';
import {
  smPayModeLabel,
  type SmPayMode,
} from './lib/sm-pay-settings';
import {
  FM_FORMULA_CAFE_SOURCE,
  FM_FORMULA_GUARD_SOURCE,
  FM_FORMULA_SM_SOURCE,
  FM_MNR_SALARY_SOURCE,
  cafeOtHourlyRateLkr,
  corporatePayrollGroupLabel,
  inferCorporatePayrollGroup,
  resolvePayrollEarningsKind,
  type CorporatePayrollGroup,
  type FixedMonthlyAllowances,
  type VariablePayrollEarnings,
} from './lib/payroll-earnings-display';
import {
  bankExportLabel,
  hasPinnedPayrollWorkflow,
  isCashPayrollGroup,
  isGuardPayrollCohort,
  isStaffNoBankCohort,
  usesCohortBankDownload,
  type GuardPayrollCohort,
} from './lib/guard-payroll-cohorts';
import {
  ADVANCE_PAYROLL_SECTIONS,
  payrollGroupTheme,
  type AdvancePayrollSection,
} from './lib/fm-payroll-group-theme';
import { FmCashPaymentModal, FmCashPaymentTrigger } from './components/FmCashPaymentModal';
import type { PayrollPeriod } from './lib/payroll-period';
import {
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  Clock,
  Download,
  FileText,
  Wallet,
  Landmark,
  Lock,
  Receipt,
  Building2,
  Users,
  TrendingUp,
  DollarSign,
  X,
  CalendarDays,
  Pin,
  Send,
  Unlock,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

type DeductionEntry = {
  type: 'Meals' | 'Uniform' | 'Penalty' | 'Advance';
  totalLiability: number;
  installmentCurrent: number;
  installmentTotal: number;
  thisMonthAmount: number;
};

type DayTypeShift = {
  date: string;
  shift: string;
  premium: number;
};

type DayTypeBreakdown = {
  type: 'Normal Days' | 'Poya Days' | 'Public Holidays' | 'Sundays' | 'Saturdays';
  totalShifts: number;
  rateMultiplier: string;
  lkrEarned: number;
  dates: DayTypeShift[];
};

type CrossSiteEntry = {
  site: string;
  shifts: number;
};

type CafeData = {
  /** Rank / MD basic pay (B) for the salary month */
  monthlyBasicLkr: number;
  daysWorked: number;
  /** Overtime hours worked this period */
  totalOT: number;
  basePayLkr: number;
  otPayLkr: number;
};

/** Monthly gross from HR MNR `employees.base_salary` (fixed HO / CVS staff). */
type HoFixedData = {
  mnrBaseSalaryLkr: number;
};

type SmPayData = {
  payMode: SmPayMode;
  visitsCompleted: number;
  visitsTarget: number;
  perVisitRateLkr: number;
  visitPayLkr: number;
  fixedBasicLkr: number;
};

type EmployeeEarnings = {
  crossSiteDistribution: CrossSiteEntry[];
  cafeData?: CafeData;
  smPayData?: SmPayData;
  /** CVS / HO — fixed monthly salary (no shift statutory lines) */
  hoFixedData?: HoFixedData;
  basePayLkr?: number;
  fixedAllowances?: FixedMonthlyAllowances;
  variableEarnings?: VariablePayrollEarnings;
  dayTypeBreakdown: DayTypeBreakdown[];
};

type Employee = {
  id: string;
  empNumber: string;
  name: string;
  rank: string;
  corporateGroup?: CorporatePayrollGroup;
  /** System-recorded shifts at this site before penalty / FM changes */
  recordedShiftsAtSite: number;
  /** Net manual FM add/remove at this site */
  fmShiftDelta: number;
  shiftAuditLog: ShiftAuditEntry[];
  /** Payable shifts after penalty cut and FM adjustments */
  shiftsAtSite: number;
  totalGross: number;
  totalDeductions: number;
  netTakeHome: number;
  deductions: DeductionEntry[];
  earnings: EmployeeEarnings;
};

type Site = {
  id: string;
  name: string;
  location: string;
  clientBilled: number;
  payrollCost: number;
  smCashAllocation?: number;
  /** Pinned payroll-group row (HO / café / guard cohort), shown above client sites */
  payrollGroup?: 'cafe' | 'ho' | 'sm' | 'ho_no_bank' | 'sm_no_bank' | 'cafe_no_bank' | GuardPayrollCohort;
  displayEmployeeCount?: number;
  employees: Employee[];
};

// ─── Portfolio seed helpers ─────────────────────────────────────────────────

function employeePayrollContext(employee: Employee) {
  const corporateGroup =
    employee.corporateGroup ??
    inferCorporatePayrollGroup({
      rank: employee.rank,
      earnings: employee.earnings,
    });
  const earningsKind = resolvePayrollEarningsKind({
    corporateGroup,
    rank: employee.rank,
    earnings: employee.earnings,
  });
  return { corporateGroup, earningsKind };
}


type EmployeeSeed = Omit<
  Employee,
  'recordedShiftsAtSite' | 'fmShiftDelta' | 'shiftAuditLog'
>;

type SiteSeed = Omit<Site, 'employees'> & { employees: EmployeeSeed[] };


function initializeShiftState(seed: SiteSeed[]): Site[] {
  return seed.map((site) => ({
    ...site,
    employees: site.employees.map((emp) => {
      const corporateGroup =
        emp.corporateGroup ??
        inferCorporatePayrollGroup({
          rank: emp.rank,
          earnings: emp.earnings,
        });
      const base: Employee = {
        ...emp,
        corporateGroup,
        recordedShiftsAtSite: emp.shiftsAtSite,
        fmShiftDelta: 0,
        shiftAuditLog: [],
      };
      return syncEmployeeShiftCount(base);
    }),
  }));
}

function mergePortfolioAdjustments(
  sites: Site[],
  adjustments: FmPortfolioPayload['shiftAdjustments'],
): Site[] {
  return sites.map((site) => ({
    ...site,
    employees: site.employees.map((emp) => {
      const key = `${site.id}:${emp.id}`;
      const adj = adjustments[key];
      if (!adj) return emp;
      const withDelta: Employee = {
        ...emp,
        fmShiftDelta: adj.delta,
        shiftAuditLog: adj.audit.map((entry) => ({
          id: crypto.randomUUID(),
          at: entry.at,
          source: 'FM' as const,
          previousShifts: entry.previousShifts,
          newShifts: entry.newShifts,
          detail: entry.detail,
        })),
      };
      return syncEmployeeShiftCount(withDelta);
    }),
  }));
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const lkr = (n: number) =>
  'LKR ' + n.toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const DAY_TYPE_COLOR: Record<DayTypeBreakdown['type'], string> = {
  'Normal Days': 'bg-slate-100 text-slate-600',
  'Poya Days': 'bg-yellow-50 text-yellow-700 ring-1 ring-yellow-200',
  'Public Holidays': 'bg-red-50 text-red-700 ring-1 ring-red-200',
  Sundays: 'bg-blue-50 text-blue-700 ring-1 ring-blue-200',
  Saturdays: 'bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200',
};

// ─── Portfolio KPI Totals ──────────────────────────────────────────────────────

function calculateStatutoryTotal(grossPay: number) {
  return grossPay * 0.08 + grossPay * 0.12 + grossPay * 0.03;
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────

function KpiCard({
  label,
  sublabel,
  value,
  badge,
  badgePositive,
  icon: Icon,
  accentTop,
  iconBg,
  iconColor,
  onClick,
}: {
  label: string;
  sublabel: string;
  value: string;
  badge?: string;
  badgePositive?: boolean;
  icon: React.ElementType;
  accentTop: string;
  iconBg: string;
  iconColor: string;
  onClick?: () => void;
}) {
  return (
    <div
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
      className={`relative overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm ${
        onClick
          ? 'cursor-pointer transition-shadow hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/50'
          : ''
      }`}
    >
      <div className={`h-1 w-full ${accentTop}`} />
      <div className="p-6">
        <div className="mb-4 flex items-start justify-between">
          <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${iconBg}`}>
            <Icon className={`h-5 w-5 ${iconColor}`} />
          </div>
          {badge && (
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${
                badgePositive
                  ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200'
                  : 'bg-amber-50 text-amber-700 ring-1 ring-amber-200'
              }`}
            >
              <TrendingUp className="h-2.5 w-2.5" />
              {badge}
            </span>
          )}
        </div>
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{sublabel}</p>
        <p className="mt-1 text-2xl font-black tracking-tight text-slate-900">{value}</p>
        <p className="mt-1 text-sm font-medium text-slate-600">{label}</p>
        {onClick && (
          <p className="mt-2 text-[10px] font-semibold text-blue-600">Click for full report →</p>
        )}
      </div>
    </div>
  );
}

// ─── Earnings Breakdown Modal ─────────────────────────────────────────────────

function EarningsModal({
  employee,
  siteName,
  onClose,
  onShiftAdjust,
  onVariableEarningsSaved,
  payrollPeriod,
  payrollLocked,
}: {
  employee: Employee;
  siteName: string;
  onClose: () => void;
  onShiftAdjust: (delta: number, note: string) => void;
  onVariableEarningsSaved: (
    variableEarnings: VariablePayrollEarnings,
    totals: { totalGross: number; netTakeHome: number },
    fixedAllowances: FixedMonthlyAllowances,
  ) => void;
  payrollPeriod: PayrollPeriod;
  payrollLocked: boolean;
}) {
  const [openDayType, setOpenDayType] = useState<string | null>(null);
  const { corporateGroup, earningsKind } = employeePayrollContext(employee);
  const guardField = earningsKind === 'guard';
  const hoFixed = earningsKind === 'ho_fixed';
  const smPay = earningsKind === 'sm';
  const cafePay = earningsKind === 'cafe';
  const cafeOtRate = employee.earnings.cafeData
    ? cafeOtHourlyRateLkr(employee.earnings.cafeData.monthlyBasicLkr)
    : 0;
  const hoFixedData =
    employee.earnings.hoFixedData ?? (hoFixed ? { mnrBaseSalaryLkr: 0 } : undefined);
  const smPayData = employee.earnings.smPayData;
  const cafeData = employee.earnings.cafeData;

  const toggleDayType = (type: string) =>
    setOpenDayType((prev) => (prev === type ? null : type));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-2xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">

        {/* Modal header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-emerald-200 bg-emerald-50">
              <Wallet className="h-4 w-4 text-emerald-600" />
            </div>
            <div>
              <p className="text-sm font-black text-slate-900">Earnings Breakdown</p>
              <p className="text-[11px] text-slate-500">
                {employee.name} · {employee.empNumber} · {employee.rank}
              </p>
              <p className="mt-0.5 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                {corporatePayrollGroupLabel(corporateGroup)}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            type="button"
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-[70vh] overflow-y-auto">
          {payrollLocked && (
            <div className="border-b border-amber-100 bg-amber-50 px-6 py-3 text-[11px] font-semibold text-amber-900">
              Payroll is locked — shift adjustments are disabled until the batch is returned to draft
              (MD de-approval or unlock on Batch Payroll).
            </div>
          )}
          <FmPayrollAllowancesPanel
            employee={employee}
            payrollPeriod={payrollPeriod}
            payrollLocked={payrollLocked}
            onSaved={onVariableEarningsSaved}
          />
          {guardField && (
            <ShiftAdjustmentsPanel
              employee={employee}
              siteName={siteName}
              onAdjust={onShiftAdjust}
              disabled={payrollLocked}
            />
          )}

          {/* Cross-Site Distribution — guards only (shift-based pay) */}
          {guardField && (
          <div className="border-b border-slate-100 px-6 py-5">
            <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-slate-400">
              Cross-Site Distribution
            </p>
            <div className="overflow-hidden rounded-xl border border-slate-200">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50">
                    <th className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-widest text-slate-400">
                      Site
                    </th>
                    <th className="px-4 py-2.5 text-right text-[10px] font-bold uppercase tracking-widest text-slate-400">
                      Shifts
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {employee.earnings.crossSiteDistribution.map((entry, i) => (
                    <tr key={i} className="hover:bg-slate-50">
                      <td className="px-4 py-2.5 text-xs font-semibold text-slate-700">
                        {entry.site}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono text-xs font-bold text-slate-900">
                        {entry.shifts === 0 ? (
                          <span className="text-slate-400">—</span>
                        ) : (
                          entry.shifts
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          )}

          {hoFixed && hoFixedData && (
            <div className="border-b border-slate-100 px-6 py-5">
              <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-indigo-700">
                CVS / Head Office — Fixed Salary
              </p>
              {hoFixedData.mnrBaseSalaryLkr <= 0 && (
                <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50/80 px-4 py-3 text-[11px] font-semibold text-amber-900">
                  Base salary is not set on the Master Nominal Roll — update MNR before payroll lock.
                </div>
              )}
              <div className="overflow-hidden rounded-xl border border-indigo-200/80 bg-indigo-50/30">
                <table className="w-full text-sm">
                  <tbody className="divide-y divide-indigo-100/80">
                    <tr>
                      <td className="px-4 py-3 text-xs font-semibold text-slate-600">
                        Base salary (MNR)
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-xs font-black text-slate-900">
                        {hoFixedData.mnrBaseSalaryLkr > 0
                          ? lkr(hoFixedData.mnrBaseSalaryLkr)
                          : '—'}
                      </td>
                    </tr>
                    <tr className="bg-white/60">
                      <td className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-emerald-700">
                        Total gross
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-sm font-black text-emerald-700">
                        {lkr(employee.totalGross)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p className="mt-2 text-[10px] font-medium text-slate-500">
                HO staff are paid a flat monthly salary from {FM_MNR_SALARY_SOURCE}. No shift
                statutory lines, café OT, or SM visit pay apply.
              </p>
            </div>
          )}

          {smPay && smPayData && (
            <div className="border-b border-slate-100 px-6 py-5">
              <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-sky-700">
                Sector Manager — Visit Pay
              </p>
              <div className="overflow-hidden rounded-xl border border-sky-200/80 bg-sky-50/40">
                <table className="w-full text-sm">
                  <tbody className="divide-y divide-sky-100/80">
                    <tr>
                      <td className="px-4 py-3 text-xs font-semibold text-slate-600">Pay mode (MD settings)</td>
                      <td className="px-4 py-3 text-right text-xs font-bold text-sky-900">
                        {smPayModeLabel(smPayData.payMode)}
                      </td>
                    </tr>
                    <tr>
                      <td className="px-4 py-3 text-xs font-semibold text-slate-600">Visits logged / target</td>
                      <td className="px-4 py-3 text-right font-mono text-xs font-bold text-slate-900">
                        {smPayData.visitsCompleted} / {smPayData.visitsTarget}
                      </td>
                    </tr>
                    {smPayData.fixedBasicLkr > 0 && (
                      <tr>
                        <td className="px-4 py-3 text-xs font-semibold text-slate-600">Fixed basic</td>
                        <td className="px-4 py-3 text-right font-mono text-xs font-black text-slate-900">
                          {lkr(smPayData.fixedBasicLkr)}
                        </td>
                      </tr>
                    )}
                    {smPayData.visitPayLkr > 0 && (
                      <tr className="bg-sky-50/50">
                        <td className="px-4 py-3">
                          <span className="text-xs font-semibold text-sky-900">Visit pay</span>
                          <span className="mt-0.5 block text-[10px] font-medium text-sky-800/90">
                            {smPayData.visitsCompleted} visit
                            {smPayData.visitsCompleted !== 1 ? 's' : ''} ×{' '}
                            {lkr(smPayData.perVisitRateLkr)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-xs font-black text-sky-900">
                          {lkr(smPayData.visitPayLkr)}
                        </td>
                      </tr>
                    )}
                    <tr className="bg-white/60">
                      <td className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-emerald-700">
                        Total gross
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-sm font-black text-emerald-700">
                        {lkr(employee.totalGross)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p className="mt-2 text-[10px] font-medium text-slate-500">
                SM payroll follows {FM_FORMULA_SM_SOURCE} — not guard shift statutory lines or café
                day/OT rules.
              </p>
            </div>
          )}

          {cafePay && cafeData && (
            <div className="border-b border-slate-100 px-6 py-5">
              <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-violet-600">
                Café Staff — Days &amp; Overtime
              </p>
              <div className="overflow-hidden rounded-xl border border-violet-200/80 bg-violet-50/30">
                <table className="w-full text-sm">
                  <tbody className="divide-y divide-violet-100/80">
                    <tr>
                      <td className="px-4 py-3 text-xs font-semibold text-slate-600">
                        Basic pay (B)
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-xs font-black text-slate-900">
                        {lkr(cafeData.monthlyBasicLkr)}
                      </td>
                    </tr>
                    <tr>
                      <td className="px-4 py-3 text-xs font-semibold text-slate-600">
                        Daily rate (B ÷ 26)
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-xs font-bold text-slate-800">
                        {lkr(Math.round(cafeData.monthlyBasicLkr / 26))}
                      </td>
                    </tr>
                    <tr>
                      <td className="px-4 py-3 text-xs font-semibold text-slate-600">Days worked</td>
                      <td className="px-4 py-3 text-right font-mono text-xs font-bold text-slate-900">
                        {cafeData.daysWorked}
                      </td>
                    </tr>
                    <tr>
                      <td className="px-4 py-3 text-xs font-semibold text-slate-600">
                        Base pay (days × B/26)
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-xs font-black text-slate-900">
                        {lkr(cafeData.basePayLkr)}
                      </td>
                    </tr>
                    <tr className="bg-violet-50/50">
                      <td className="px-4 py-3">
                        <span className="text-xs font-semibold text-violet-900">Overtime</span>
                        <span className="mt-0.5 block text-[10px] font-medium text-violet-700/90">
                          {cafeData.totalOT} hr
                          {cafeData.totalOT !== 1 ? 's' : ''} × {lkr(cafeOtRate)}
                          /hr · (B/26/9)×1.5
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-xs font-black text-violet-900">
                        {lkr(cafeData.otPayLkr)}
                      </td>
                    </tr>
                    <tr className="bg-white/60">
                      <td className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-emerald-700">
                        Total gross
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-sm font-black text-emerald-700">
                        {lkr(cafeData.basePayLkr + cafeData.otPayLkr)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p className="mt-2 text-[10px] font-medium text-slate-500">
                Café pay follows {FM_FORMULA_CAFE_SOURCE}. Poya / statutory holidays use OT_RATE ×
                hours; other days use B/26. Guard Poya/Sunday multipliers do not apply.
              </p>
            </div>
          )}

          {/* Statutory Day-Type Breakdown (field guards only) */}
          {guardField && (
          <div className="px-6 py-5">
            <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-slate-400">
              Statutory Day-Type Breakdown
            </p>
            <p className="mb-3 text-[10px] font-medium text-slate-500">
              Computed from {FM_FORMULA_GUARD_SOURCE} (standard day, Poya, Sunday, Saturday, etc.).
            </p>
            <div className="space-y-1.5">
              {employee.earnings.dayTypeBreakdown.map((dt) => (
                <div key={dt.type} className="overflow-hidden rounded-xl border border-slate-200">
                  <button
                    type="button"
                    onClick={() => dt.dates.length > 0 && toggleDayType(dt.type)}
                    className={`flex w-full items-center justify-between px-4 py-3 text-left transition-colors ${
                      dt.dates.length > 0 ? 'cursor-pointer hover:bg-slate-50' : 'cursor-default'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <CalendarDays className="h-3.5 w-3.5 text-slate-400" />
                      <span className="text-sm font-semibold text-slate-800">{dt.type}</span>
                      <span
                        className={`inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${DAY_TYPE_COLOR[dt.type]}`}
                      >
                        {dt.rateMultiplier}
                      </span>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="font-mono text-xs font-bold text-slate-600">
                        {dt.totalShifts} shift{dt.totalShifts !== 1 ? 's' : ''}
                      </span>
                      <span className="font-mono text-xs font-black text-emerald-700">
                        {lkr(dt.lkrEarned)}
                      </span>
                      {dt.dates.length > 0 && (
                        <ChevronDown
                          className={`h-4 w-4 text-slate-400 transition-transform duration-200 ${
                            openDayType === dt.type ? 'rotate-180' : ''
                          }`}
                        />
                      )}
                    </div>
                  </button>

                  {openDayType === dt.type && dt.dates.length > 0 && (
                    <div className="border-t border-slate-100">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="bg-slate-50">
                            <th className="px-4 py-2 text-left text-[10px] font-bold uppercase tracking-widest text-slate-400">
                              Date
                            </th>
                            <th className="px-4 py-2 text-left text-[10px] font-bold uppercase tracking-widest text-slate-400">
                              Shift
                            </th>
                            <th className="px-4 py-2 text-right text-[10px] font-bold uppercase tracking-widest text-slate-400">
                              Premium
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {dt.dates.map((d, i) => (
                            <tr key={i} className="hover:bg-slate-50">
                              <td className="px-4 py-2 font-semibold text-slate-700">{d.date}</td>
                              <td className="px-4 py-2 font-mono text-slate-500">{d.shift}</td>
                              <td className="px-4 py-2 text-right font-mono font-bold text-emerald-600">
                                + {lkr(d.premium)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
          )}
        </div>

        <div className="border-t border-slate-100 px-6 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-bold uppercase tracking-widest text-slate-600 transition-colors hover:bg-slate-50"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Shift display (roster cell) ──────────────────────────────────────────────

function ShiftAtSiteCell({ employee }: { employee: Employee }) {
  const penalty = getPenaltyShiftReduction(employee);
  const effective = effectiveShiftsAtSite(employee);
  const changed =
    effective !== employee.recordedShiftsAtSite || employee.fmShiftDelta !== 0;

  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className="font-mono text-sm font-bold text-slate-800">{effective}</span>
      {penalty.shiftsReduced > 0 && (
        <span className="text-[10px] font-bold text-amber-600">
          −{penalty.shiftsReduced} penalty
        </span>
      )}
      {changed && (
        <span className="text-[10px] font-medium text-slate-400">
          was {employee.recordedShiftsAtSite}
        </span>
      )}
    </div>
  );
}

// ─── Payroll group workflow (pinned ledger rows) ─────────────────────────────

function fmSitePayrollCohort(site: Site): PayrollBankExportCohort | null {
  if (site.payrollGroup === 'guard_commercial') return 'guard_commercial';
  if (site.payrollGroup === 'guard_other_bank') return 'guard_other_bank';
  if (site.payrollGroup === 'ho') return 'ho';
  if (site.payrollGroup === 'sm') return 'sm';
  if (site.payrollGroup === 'cafe') return 'cafe';
  return null;
}

function pinnedSitePayrollGroupId(site: Site): PayrollGroupId | null {
  if (site.payrollGroup === 'cafe' || site.id === 'group-cafe') return 'cafe';
  if (
    site.payrollGroup === 'ho' ||
    site.payrollGroup === 'sm' ||
    isGuardPayrollCohort(site.payrollGroup) ||
    site.id === 'group-cvs' ||
    site.id === 'group-cvs-sm' ||
    site.id.startsWith('group-guard-')
  ) {
    return 'security';
  }
  return null;
}

function WorkflowStatusBadge({ status }: { status: PayrollWorkflowStatus }) {
  const map: Record<PayrollWorkflowStatus, { label: string; cls: string; Icon: typeof Clock }> = {
    DRAFT: {
      label: 'Draft',
      cls: 'border-amber-200 bg-amber-100/80 text-amber-900',
      Icon: Clock,
    },
    SUBMITTED_FOR_REVIEW: {
      label: 'With MD',
      cls: 'border-indigo-200 bg-indigo-100/80 text-indigo-900',
      Icon: Send,
    },
    APPROVED: {
      label: 'MD Approved',
      cls: 'border-emerald-200 bg-emerald-100/80 text-emerald-900',
      Icon: CheckCircle2,
    },
  };
  const { label, cls, Icon } = map[status];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10px] font-black uppercase tracking-widest ${cls}`}
    >
      <Icon className="h-3 w-3" />
      {label}
    </span>
  );
}

function KpiCardSkeleton() {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm animate-pulse">
      <div className="h-1 w-full bg-slate-200" />
      <div className="p-6">
        <div className="mb-4 flex items-start justify-between">
          <div className="h-10 w-10 rounded-xl bg-slate-200" />
          <div className="h-6 w-16 rounded-full bg-slate-200" />
        </div>
        <div className="space-y-2">
          <div className="h-3 w-24 rounded bg-slate-200" />
          <div className="h-8 w-32 rounded bg-slate-200" />
          <div className="h-3 w-20 rounded bg-slate-100" />
        </div>
      </div>
    </div>
  );
}

function PortfolioSiteRowSkeleton({ pinned = false }: { pinned?: boolean }) {
  return (
    <div
      className={`rounded-2xl border bg-white shadow-sm animate-pulse ${
        pinned ? 'border-indigo-200/80 ring-1 ring-indigo-100/80' : 'border-slate-200'
      }`}
    >
      <div
        className={`flex items-center gap-4 border-l-4 border-slate-200 p-4 ${
          pinned ? 'min-h-[168px] flex-col items-stretch' : 'min-h-[88px]'
        }`}
      >
        <div className="flex flex-1 items-center justify-between gap-3">
          <div className="min-w-0 flex-1 space-y-2">
            <div className="h-3 w-20 rounded bg-slate-200" />
            <div className="h-4 w-36 rounded bg-slate-200" />
            <div className="h-3 w-28 rounded bg-slate-100" />
          </div>
          <div className="hidden shrink-0 space-y-2 sm:block">
            <div className="h-3 w-16 rounded bg-slate-100" />
            <div className="h-5 w-24 rounded bg-slate-200" />
          </div>
        </div>
        {pinned && (
          <div className="flex gap-2 pt-1">
            <div className="h-8 flex-1 rounded-xl bg-slate-200" />
            <div className="h-8 flex-1 rounded-xl bg-slate-100" />
          </div>
        )}
      </div>
    </div>
  );
}

function PortfolioLedgerSkeleton() {
  const skeletonCounts: Record<AdvancePayrollSection['id'], number> = {
    ho: 2,
    sm: 2,
    cafe: 2,
    guards: 3,
  };

  return (
    <div className="mb-4 space-y-5">
      {ADVANCE_PAYROLL_SECTIONS.map((section) => (
        <section
          key={section.id}
          className={`overflow-hidden rounded-2xl border shadow-sm ${section.border} ${section.bg}`}
        >
          <div className="flex items-start gap-3 border-b border-inherit px-4 py-3 sm:px-5">
            <div
              className={`mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl text-xs font-black ${section.iconBg}`}
            >
              {section.id === 'ho'
                ? 'HO'
                : section.id === 'sm'
                  ? 'SM'
                  : section.id === 'cafe'
                    ? 'CF'
                    : 'GD'}
            </div>
            <div className="min-w-0">
              <p className={`text-[11px] font-black uppercase tracking-widest ${section.titleColor}`}>
                {section.title}
              </p>
              <p className={`mt-0.5 text-[11px] font-medium ${section.subtitleColor}`}>
                {section.subtitle}
              </p>
            </div>
          </div>
          <div
            className={`grid gap-3 p-3 sm:p-4 ${
              section.id === 'guards'
                ? 'grid-cols-1 md:grid-cols-2 xl:grid-cols-3'
                : 'grid-cols-1 sm:grid-cols-2'
            }`}
          >
            {Array.from({ length: skeletonCounts[section.id] }, (_, i) => (
              <PortfolioSiteRowSkeleton key={`${section.id}-${i}`} pinned />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

// ─── Site Row ─────────────────────────────────────────────────────────────────

function SiteRow({
  site,
  onShiftAdjust,
  onVariableEarningsSaved,
  onDeductionsSaved,
  payrollLocked,
  periodLabel,
  payrollPeriod,
  isLivePeriod,
  portfolioScale,
  pinned = false,
  groupWorkflow,
  payrollGenerated = false,
  hqDeductionsLocked = true,
  onLockGroup,
  onReeditGroup,
  onDownloadBank,
  locking = false,
  bankFileDownloaded = false,
}: {
  site: Site;
  onShiftAdjust: (
    employeeId: string,
    delta: number,
    note: string,
  ) => Employee | undefined;
  onVariableEarningsSaved?: (
    employeeId: string,
    variableEarnings: VariablePayrollEarnings,
    totals: { totalGross: number; netTakeHome: number },
    fixedAllowances: FixedMonthlyAllowances,
  ) => Employee | undefined;
  onDeductionsSaved?: () => void;
  payrollLocked: boolean;
  periodLabel: string;
  payrollPeriod: PayrollPeriod;
  isLivePeriod: boolean;
  portfolioScale: number;
  pinned?: boolean;
  groupWorkflow?: PayrollGroupWorkflow;
  payrollGenerated?: boolean;
  hqDeductionsLocked?: boolean;
  onLockGroup?: () => void;
  onReeditGroup?: () => void;
  onDownloadBank?: () => void;
  locking?: boolean;
  bankFileDownloaded?: boolean;
}) {
  const stale = !isLivePeriod;
  const rosterLocked = payrollLocked || stale;
  const scaledPayrollCost = Math.round(site.payrollCost * portfolioScale);
  const scaledClientBilled = Math.round(site.clientBilled * portfolioScale);
  const [expanded, setExpanded] = useState(false);
  const [deductionsTarget, setDeductionsTarget] = useState<Employee | null>(null);
  const [earningsTarget, setEarningsTarget] = useState<Employee | null>(null);
  const [cashPaymentTarget, setCashPaymentTarget] = useState<Employee | null>(null);

  const isSmGroup = site.payrollGroup === 'sm' || site.payrollGroup === 'sm_no_bank';
  const isHoGroup = site.payrollGroup === 'ho' || site.payrollGroup === 'ho_no_bank';
  const isCafeGroup = site.payrollGroup === 'cafe' || site.payrollGroup === 'cafe_no_bank';
  const isGuardPayrollRow =
    !site.payrollGroup || isGuardPayrollCohort(site.payrollGroup);
  const isCashPayrollRow = isCashPayrollGroup(site.payrollGroup);
  const showShiftsBilled = isCafeGroup || isGuardPayrollRow;
  const showSiteEarnings = !pinned && !isHoGroup && !isCafeGroup && !isSmGroup;
  const totalCafeDays = Math.max(
    0,
    Math.round(
      site.employees.reduce((s, e) => s + (e.earnings.cafeData?.daysWorked ?? 0), 0) *
        portfolioScale,
    ),
  );
  const totalShiftsBilled = Math.max(
    0,
    Math.round(
      site.employees.reduce((s, e) => s + effectiveShiftsAtSite(e), 0) * portfolioScale,
    ),
  );
  const totalVisitsLogged = Math.max(
    0,
    Math.round(
      site.employees.reduce((s, e) => s + (e.earnings.smPayData?.visitsCompleted ?? 0), 0) *
        portfolioScale,
    ),
  );
  const billedMetric = isSmGroup ? totalVisitsLogged : isCafeGroup ? totalCafeDays : totalShiftsBilled;
  const billedMetricLabel = isSmGroup
    ? 'Visits Logged'
    : isCafeGroup
      ? 'Days Worked'
      : 'Shifts Billed';
  const margin = scaledClientBilled - scaledPayrollCost;
  const marginPctSite =
    scaledClientBilled > 0 ? ((margin / scaledClientBilled) * 100).toFixed(1) : '0.0';
  const payrollCostClass = 'text-slate-800';
  const marginAmountClass = 'text-emerald-700';
  const employeeCount = site.displayEmployeeCount ?? site.employees.length;
  const payrollGroupId = pinned ? pinnedSitePayrollGroupId(site) : null;
  const showWorkflow = Boolean(
    pinned &&
      payrollGroupId &&
      groupWorkflow &&
      isLivePeriod &&
      hasPinnedPayrollWorkflow(site.payrollGroup),
  );
  const workflowStatus = groupWorkflow?.status ?? 'DRAFT';
  const isDraft = workflowStatus === 'DRAFT';
  const isWithMd = workflowStatus === 'SUBMITTED_FOR_REVIEW';
  const isApproved = workflowStatus === 'APPROVED';
  const usesCohortExport = usesCohortBankDownload(site.payrollGroup);
  const isPaid = usesCohortExport
    ? bankFileDownloaded
    : Boolean(groupWorkflow?.paidAt);
  const canLock = showWorkflow && isDraft && payrollGenerated && hqDeductionsLocked;
  const canReedit = showWorkflow && isWithMd && !isPaid;
  const canDownload = showWorkflow && isApproved && !isPaid;
  const bankHeadcount = usesCohortExport
    ? employeeCount
    : (groupWorkflow?.payslipCount ?? employeeCount);
  const bankExportHint = bankExportLabel(site.payrollGroup);
  const theme = pinned ? payrollGroupTheme(site.payrollGroup) : null;
  const groupAccent = theme?.card ?? 'border-slate-200';

  return (
    <>
      {deductionsTarget && (
        <FmDeductionsModal
          employeeId={deductionsTarget.id}
          employeeName={deductionsTarget.name}
          employeeNumber={deductionsTarget.empNumber}
          totalGross={deductionsTarget.totalGross}
          payrollPeriod={payrollPeriod}
          payrollLocked={rosterLocked}
          onClose={() => setDeductionsTarget(null)}
          onSaved={() => {
            onDeductionsSaved?.();
            setDeductionsTarget(null);
          }}
        />
      )}
      {earningsTarget && (
        <EarningsModal
          employee={earningsTarget}
          siteName={site.name}
          onClose={() => setEarningsTarget(null)}
          payrollPeriod={payrollPeriod}
          payrollLocked={rosterLocked}
          onShiftAdjust={(delta, note) => {
            const updated = onShiftAdjust(earningsTarget.id, delta, note);
            if (updated) setEarningsTarget(updated);
          }}
          onVariableEarningsSaved={(variableEarnings, totals, fixedAllowances) => {
            const updated = onVariableEarningsSaved?.(
              earningsTarget.id,
              variableEarnings,
              totals,
              fixedAllowances,
            );
            if (updated) setEarningsTarget(updated);
          }}
        />
      )}
      {cashPaymentTarget && isCashPayrollRow && (
        <FmCashPaymentModal
          open
          onClose={() => setCashPaymentTarget(null)}
          employeeId={cashPaymentTarget.id}
          employeeName={cashPaymentTarget.name}
          employeeNumber={cashPaymentTarget.empNumber}
          period={payrollPeriod}
          dueLkr={cashPaymentTarget.netTakeHome}
        />
      )}

      <div
        className={`${expanded ? 'overflow-visible' : 'overflow-hidden'} ${
          pinned ? 'flex h-full flex-col' : ''
        } rounded-2xl border bg-white shadow-sm ${
          pinned ? `ring-1 ${groupAccent}` : 'border-slate-200'
        }`}
      >
        {pinned && theme ? (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className={`flex min-h-[168px] flex-1 flex-col gap-3 border-l-4 p-4 text-left transition-colors ${theme.stripe} ${theme.headerBg} ${theme.headerHover}`}
          >
            <div className="flex items-start justify-between gap-2">
              <span
                className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-black uppercase tracking-widest ${theme.badge}`}
              >
                <Pin className="h-2.5 w-2.5" />
                {theme.label}
              </span>
              <div
                className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg border transition-all ${
                  expanded ? theme.chevronExpanded : theme.chevronCollapsed
                }`}
              >
                <ChevronDown
                  className={`h-3.5 w-3.5 transition-transform duration-200 ${
                    expanded ? 'rotate-180' : ''
                  }`}
                />
              </div>
            </div>

            <div className="min-w-0 flex-1">
              <p className="text-sm font-black leading-tight tracking-tight text-slate-900">
                {site.name}
              </p>
              <p className="mt-1 text-[10px] leading-snug text-slate-500">{site.location}</p>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {showShiftsBilled && (
                <div className="rounded-xl border border-white/80 bg-white/70 px-2.5 py-2">
                  <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">
                    {billedMetricLabel}
                  </p>
                  <p className="mt-0.5 font-mono text-xs font-bold text-slate-800">{billedMetric}</p>
                </div>
              )}
              <div
                className={`rounded-xl border border-white/80 bg-white/70 px-2.5 py-2 ${
                  showShiftsBilled ? '' : 'col-span-2'
                }`}
              >
                <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">
                  Payroll cost
                </p>
                <p className={`mt-0.5 font-mono text-xs font-bold ${payrollCostClass}`}>
                  {lkr(scaledPayrollCost)}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1 rounded-full border border-slate-200/80 bg-white/80 px-2 py-0.5 text-[10px] font-bold text-slate-600">
                <Users className="h-3 w-3" />
                {employeeCount}
              </span>
              {showWorkflow && <WorkflowStatusBadge status={workflowStatus} />}
            </div>
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="flex w-full items-center gap-4 px-6 py-4 text-left transition-colors hover:bg-slate-50"
          >
            <div
              className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg border transition-all ${
                expanded ? 'border-blue-200 bg-blue-50' : 'border-slate-200 bg-slate-100'
              }`}
            >
              <ChevronDown
                className={`h-4 w-4 transition-transform duration-200 ${
                  expanded ? 'rotate-180 text-blue-600' : 'text-slate-500'
                }`}
              />
            </div>

            <div className="min-w-0 flex-1">
              <p className="text-sm font-black tracking-tight text-slate-900">{site.name}</p>
              <p className="mt-0.5 text-[11px] text-slate-400">{site.location}</p>
            </div>

            <div className="hidden items-center gap-8 md:flex">
              {showShiftsBilled && (
                <div className="text-right">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                    {billedMetricLabel}
                  </p>
                  <p className="mt-0.5 font-mono text-xs font-bold text-slate-800">{billedMetric}</p>
                </div>
              )}
              <div className="text-right">
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                  Payroll Cost
                </p>
                <p className={`mt-0.5 font-mono text-xs font-bold ${payrollCostClass}`}>
                  {lkr(scaledPayrollCost)}
                </p>
              </div>
              {showSiteEarnings && (
                <div className="text-right">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-500">
                    Site Earnings
                  </p>
                  <p className={`mt-0.5 font-mono text-xs font-black ${marginAmountClass}`}>
                    {lkr(margin)}
                  </p>
                  <p className="text-[10px] font-bold text-emerald-500">{marginPctSite}%</p>
                </div>
              )}
            </div>

            <div className="ml-2 flex-shrink-0">
              <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-600">
                <Users className="h-3 w-3" />
                {employeeCount}
              </span>
            </div>
          </button>
        )}

        {showWorkflow && (
          <div
            className={`flex flex-col gap-3 border-t border-slate-100 bg-slate-50/80 px-4 py-3 ${
              pinned ? '' : 'flex-wrap items-center justify-between sm:flex-row'
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            {!pinned && (
              <div className="flex flex-wrap items-center gap-2">
                <WorkflowStatusBadge status={workflowStatus} />
                {isPaid && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-100 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-widest text-slate-600">
                    Bank file downloaded
                  </span>
                )}
              </div>
            )}
            {pinned && isPaid && (
              <span className="inline-flex w-fit items-center gap-1 rounded-full border border-slate-200 bg-slate-100 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-widest text-slate-600">
                Bank file downloaded
              </span>
            )}
            <div className={`flex flex-wrap items-center gap-2 ${pinned ? 'w-full' : ''}`}>
              <button
                type="button"
                onClick={onLockGroup}
                disabled={!canLock || locking}
                title={
                  !hqDeductionsLocked
                    ? 'Deductions pending admin lock — wait for Deductions Admin to lock the month and send to FM'
                    : !payrollGenerated
                      ? 'Generate draft payslips first — use Generate on the workflow card above'
                      : canLock
                        ? 'Lock batch and send to MD for approval'
                        : 'Batch already submitted or approved'
                }
                className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-[10px] font-black uppercase tracking-wider shadow-sm transition-all ${
                  canLock && !locking
                    ? 'border border-indigo-200/80 bg-indigo-600 text-white hover:bg-indigo-500'
                    : 'cursor-not-allowed border border-slate-200/80 bg-slate-100/80 text-slate-400'
                }`}
              >
                {locking ? (
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                ) : (
                  <Lock className="h-3.5 w-3.5" />
                )}
                Lock &amp; Send to MD
              </button>
              <button
                type="button"
                onClick={onDownloadBank}
                disabled={!canDownload || bankHeadcount === 0}
                title={
                  isPaid
                    ? 'Bank file already downloaded — MD must reject or re-edit the batch to download again'
                    : canDownload
                      ? `${bankExportHint} · ${bankHeadcount} recipients`
                      : 'Available only after MD approves this batch'
                }
                className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-[10px] font-black uppercase tracking-wider shadow-sm transition-all ${
                  canDownload && bankHeadcount > 0
                    ? 'border border-emerald-200/80 bg-emerald-600 text-white hover:bg-emerald-500'
                    : 'cursor-not-allowed border border-slate-200/80 bg-slate-100/80 text-slate-400'
                }`}
              >
                <Download className="h-3.5 w-3.5" />
                Bank .TXT
              </button>
              {canReedit && (
                <button
                  type="button"
                  onClick={onReeditGroup}
                  title="Unlock for editing — removes batch from MD portal"
                  className="inline-flex items-center gap-1.5 rounded-xl border border-amber-200/80 bg-amber-50/90 px-3 py-2 text-[10px] font-black uppercase tracking-wider text-amber-900 shadow-sm transition-all hover:bg-amber-100/90"
                >
                  <Unlock className="h-3.5 w-3.5" />
                  Re-edit
                </button>
              )}
            </div>
          </div>
        )}

        {showWorkflow && isWithMd && (
          <div className="border-t border-indigo-200/50 bg-indigo-50/40 px-4 py-2 text-[10px] font-semibold text-indigo-800">
            Locked and queued on the MD payroll audit desk — awaiting approval.
          </div>
        )}
        {showWorkflow && isApproved && !isPaid && (
          <div className="border-t border-emerald-200/50 bg-emerald-50/40 px-4 py-2 text-[10px] font-semibold text-emerald-800">
            MD approved — bank transfer file is ready for one-time download.
          </div>
        )}

        {!showWorkflow && pinned && isCashPayrollRow && (
          <div className="border-t border-amber-200/50 bg-amber-50/40 px-4 py-2 text-[10px] font-semibold text-amber-900">
            Cash cohort — pay staff in person and record payment in the expanded roster.
          </div>
        )}

        {/* Mobile KPI strip (client guard sites only) */}
        {!pinned && (
        <div
          className={`grid divide-x divide-slate-100 border-t border-slate-100 bg-slate-50 px-4 py-2 md:hidden ${
            showShiftsBilled && showSiteEarnings
              ? 'grid-cols-3'
              : showShiftsBilled || showSiteEarnings
                ? 'grid-cols-2'
                : 'grid-cols-1'
          }`}
        >
          {showShiftsBilled && (
            <div className="pr-3">
              <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">
                {isSmGroup ? 'Visits' : 'Shifts'}
              </p>
              <p className="mt-0.5 font-mono text-[11px] font-bold text-slate-800">{billedMetric}</p>
            </div>
          )}
          <div className={showShiftsBilled ? 'px-3' : 'pr-3'}>
            <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Cost</p>
            <p className="mt-0.5 font-mono text-[11px] font-bold text-slate-800">
              {lkr(scaledPayrollCost)}
            </p>
          </div>
          {showSiteEarnings && (
            <div className="pl-3">
              <p className="text-[9px] font-bold uppercase tracking-widest text-emerald-500">
                Margin
              </p>
              <p className="mt-0.5 font-mono text-[11px] font-black text-emerald-700">
                {lkr(margin)}
              </p>
            </div>
          )}
        </div>
        )}

        {/* Expanded employee roster */}
        {expanded && (
          <div className="border-t border-slate-200">
            <div className="px-4 py-3">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                {pinned
                  ? site.payrollGroup === 'sm'
                    ? 'Sector manager roster (visit pay)'
                    : 'Payroll group roster'
                  : 'Active Guard Roster'}{' '}
                — {periodLabel}
              </p>
            </div>
            <div className="overflow-x-auto overflow-y-visible">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-y border-slate-100 bg-slate-50">
                    <th className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-widest text-slate-400">
                      Employee
                    </th>
                    <th className="px-4 py-2.5 text-center text-[10px] font-bold uppercase tracking-widest text-slate-400">
                      {site.payrollGroup === 'sm' ? 'Visits (period)' : 'Shifts Here'}
                    </th>
                    <th className="px-4 py-2.5 text-right text-[10px] font-bold uppercase tracking-widest text-slate-400">
                      Total Gross (All Sites)
                    </th>
                    <th className="px-4 py-2.5 text-right text-[10px] font-bold uppercase tracking-widest text-slate-400">
                      Total Deductions
                    </th>
                    <th className="px-4 py-2.5 text-right text-[10px] font-bold uppercase tracking-widest text-slate-400">
                      Net Take-Home
                    </th>
                    <th className="px-4 py-2.5 text-center text-[10px] font-bold uppercase tracking-widest text-slate-400">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {site.employees.map((emp) => (
                    <tr key={emp.id} className="transition-colors hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <p className="font-bold text-slate-900">{emp.name}</p>
                        <div className="mt-0.5 flex items-center gap-2">
                          <span className="font-mono text-[11px] text-slate-400">
                            {emp.empNumber}
                          </span>
                          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-500">
                            {emp.rank}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        {(() => {
                          const { earningsKind } = employeePayrollContext(emp);
                          if (earningsKind === 'sm' && emp.earnings.smPayData) {
                            return (
                              <span className="font-mono text-[11px] font-bold text-sky-800">
                                {emp.earnings.smPayData.visitsCompleted} visits
                              </span>
                            );
                          }
                          if (earningsKind === 'ho_fixed') {
                            return (
                              <span className="font-mono text-[11px] font-bold text-indigo-800">
                                Fixed
                              </span>
                            );
                          }
                          if (earningsKind === 'cafe' && emp.earnings.cafeData) {
                            return (
                              <span className="font-mono text-[11px] font-bold text-violet-800">
                                {emp.earnings.cafeData.daysWorked} days
                              </span>
                            );
                          }
                          if (
                            emp.recordedShiftsAtSite === 0 &&
                            emp.shiftsAtSite === 0
                          ) {
                            return (
                              <span className="font-mono text-[11px] text-slate-400">—</span>
                            );
                          }
                          return <ShiftAtSiteCell employee={emp} />;
                        })()}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-xs font-bold text-slate-800">
                        {lkr(emp.totalGross)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="font-mono text-xs font-bold text-red-600">
                          {emp.totalDeductions > 0 ? `− ${lkr(emp.totalDeductions)}` : '—'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-xs font-black text-emerald-700">
                        {lkr(emp.netTakeHome)}
                      </td>
                      <td className="overflow-visible px-4 py-3">
                        <div className="flex flex-wrap items-center justify-center gap-1.5 overflow-visible">
                          {isCashPayrollRow && (
                            <FmCashPaymentTrigger
                              employeeId={emp.id}
                              period={payrollPeriod}
                              dueLkr={emp.netTakeHome}
                              onOpen={() => setCashPaymentTarget(emp)}
                            />
                          )}
                          <button
                            type="button"
                            onClick={() => setEarningsTarget(emp)}
                            className="flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-[11px] font-bold text-emerald-700 transition-colors hover:bg-emerald-100 whitespace-nowrap"
                          >
                            <Wallet className="h-3 w-3" />
                            Earnings Breakdown
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeductionsTarget(emp)}
                            className="flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-[11px] font-bold text-red-700 transition-colors hover:bg-red-100 whitespace-nowrap"
                          >
                            <Receipt className="h-3 w-3" />
                            Deductions Audit
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

function applyShiftAdjustToSites(
  prev: Site[],
  siteId: string,
  employeeId: string,
  delta: number,
  note: string,
): { sites: Site[]; updatedEmployee?: Employee } {
  let updatedEmployee: Employee | undefined;

  const sites = prev.map((site) => {
    if (site.id !== siteId) return site;
    return {
      ...site,
      employees: site.employees.map((emp) => {
        if (emp.id !== employeeId) return emp;
        const previous = effectiveShiftsAtSite(emp);
        const withDelta = { ...emp, fmShiftDelta: emp.fmShiftDelta + delta };
        const newShifts = effectiveShiftsAtSite(withDelta);
        const next: Employee = syncEmployeeShiftCount({
          ...withDelta,
          shiftAuditLog: [
            ...emp.shiftAuditLog,
            {
              id: crypto.randomUUID(),
              at: new Date().toISOString(),
              source: 'FM',
              previousShifts: previous,
              newShifts,
              detail: note,
            },
          ],
        });
        updatedEmployee = next;
        return next;
      }),
    };
  });

  return { sites, updatedEmployee };
}

function applyVariableEarningsToSites(
  prev: Site[],
  siteId: string,
  employeeId: string,
  variableEarnings: VariablePayrollEarnings,
  totals: { totalGross: number; netTakeHome: number },
  fixedAllowances?: FixedMonthlyAllowances,
): { sites: Site[]; updatedEmployee?: Employee } {
  let updatedEmployee: Employee | undefined;

  const sites = prev.map((site) => {
    if (site.id !== siteId) return site;
    const employees = site.employees.map((emp) => {
      if (emp.id !== employeeId) return emp;
      const next: Employee = {
        ...emp,
        totalGross: totals.totalGross,
        netTakeHome: totals.netTakeHome,
        earnings: {
          ...emp.earnings,
          variableEarnings,
          ...(fixedAllowances ? { fixedAllowances } : {}),
        },
      };
      updatedEmployee = next;
      return next;
    });
    return {
      ...site,
      employees,
      payrollCost: employees.reduce((sum, employee) => sum + employee.totalGross, 0),
    };
  });

  return { sites, updatedEmployee };
}

export default function FMPortalPage() {
  const [pinnedSites, setPinnedSites] = useState<Site[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [portfolioLoading, setPortfolioLoading] = useState(true);
  const [portfolioError, setPortfolioError] = useState<string | null>(null);
  const [payrollPeriod, setPayrollPeriod] = useState(FM_LIVE_PAYROLL_PERIOD);
  const [activeReport, setActiveReport] = useState<FmPortfolioReportKind | null>(null);
  const [workflowStatus, setWorkflowStatus] = useState<PayrollWorkflowStatus>('DRAFT');
  const [payrollRuns, setPayrollRuns] = useState<PayrollGroupWorkflow[]>([]);
  const [payrollGenerated, setPayrollGenerated] = useState(false);
  const [payrollTableReady, setPayrollTableReady] = useState(false);
  const [generateMessage, setGenerateMessage] = useState<string | null>(null);
  const [workflowMessage, setWorkflowMessage] = useState<string | null>(null);
  const [lockingGroup, setLockingGroup] = useState<PayrollGroupId | null>(null);
  const [bankCohortDownloaded, setBankCohortDownloaded] = useState<Set<string>>(new Set());
  const [isGenerating, startGenerateTransition] = useTransition();
  const [hqDeductionsLocked, setHqDeductionsLocked] = useState(true);
  const [requireDeductionMonthLock, setRequireDeductionMonthLock] = useState(true);

  const isLivePeriod = isLivePayrollPeriod(payrollPeriod);
  const deductionsGateActive = requireDeductionMonthLock;
  const fmCanLockPayroll = !deductionsGateActive || hqDeductionsLocked;
  const livePayrollMonth = payrollMonthFromFmPeriod(getFmLivePayrollPeriod());

  const refreshHqDeductionLock = useCallback(async () => {
    if (!isLivePayrollPeriod(payrollPeriod)) {
      setHqDeductionsLocked(true);
      return;
    }
    const status = await getDeductionMonthLockStatus(livePayrollMonth);
    setHqDeductionsLocked(Boolean(status.locked));
  }, [payrollPeriod, livePayrollMonth]);
  const periodLabel = formatPayrollPeriodLabel(payrollPeriod);
  const portfolioScale = historicalPortfolioScale(payrollPeriod);

  const portfolioTotals = useMemo(() => {
    const liveCost = sites.reduce((s, site) => s + site.payrollCost, 0);
    const liveBilled = sites.reduce((s, site) => s + site.clientBilled, 0);
    const liveStatutory = sites.reduce(
      (sum, site) => sum + calculateStatutoryTotal(site.payrollCost),
      0,
    );
    const totalPortfolioCost = Math.round(liveCost * portfolioScale);
    const totalPortfolioBilled = Math.round(liveBilled * portfolioScale);
    const totalStatutoryCost = Math.round(liveStatutory * portfolioScale);
    const statutoryPctOfCost =
      totalPortfolioCost > 0
        ? ((totalStatutoryCost / totalPortfolioCost) * 100).toFixed(1)
        : '0.0';
    return {
      totalPortfolioCost,
      totalPortfolioBilled,
      totalStatutoryCost,
      statutoryPctOfCost,
    };
  }, [sites, portfolioScale]);

  useEffect(() => {
    let cancelled = false;
    setPortfolioLoading(true);
    setPortfolioError(null);
    void getFmPortfolio(payrollPeriod)
      .then((payload) => {
        if (cancelled) return;
        if (payload.error) {
          setPortfolioError(payload.error);
          setPinnedSites([]);
          setSites([]);
        } else {
          setPortfolioError(null);
          setPinnedSites(
            mergePortfolioAdjustments(
              initializeShiftState(
                ensurePinnedPayrollSites<SiteSeed>(payload.pinnedSites as SiteSeed[]),
              ),
              payload.shiftAdjustments,
            ),
          );
          setSites(
            mergePortfolioAdjustments(
              initializeShiftState(payload.sites as SiteSeed[]),
              payload.shiftAdjustments,
            ),
          );
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setPortfolioError(err instanceof Error ? err.message : 'Failed to load live portfolio.');
        setPinnedSites([]);
        setSites([]);
      })
      .finally(() => {
        if (!cancelled) setPortfolioLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [payrollPeriod]);

  const refreshPortfolio = useCallback(() => {
    void getFmPortfolio(payrollPeriod).then((payload) => {
      if (payload.error) return;
      setPinnedSites(
        mergePortfolioAdjustments(
          initializeShiftState(
            ensurePinnedPayrollSites<SiteSeed>(payload.pinnedSites as SiteSeed[]),
          ),
          payload.shiftAdjustments,
        ),
      );
      setSites(
        mergePortfolioAdjustments(
          initializeShiftState(payload.sites as SiteSeed[]),
          payload.shiftAdjustments,
        ),
      );
    });
  }, [payrollPeriod]);

  const refreshPayrollWorkflow = useCallback(async () => {
    if (!isLivePayrollPeriod(payrollPeriod)) {
      setPayrollRuns([]);
      setPayrollGenerated(false);
      setPayrollTableReady(false);
      setWorkflowStatus('DRAFT');
      return;
    }
    const status = await getPayrollBatchStatus(payrollPeriod.year, payrollPeriod.month);
    setPayrollRuns(status.runs);
    setPayrollGenerated(status.generated);
    setPayrollTableReady(status.tableReady);
    const securityRun = status.runs.find((r) => r.groupId === 'security');
    setWorkflowStatus(securityRun?.status ?? 'DRAFT');
  }, [payrollPeriod]);

  useEffect(() => {
    void refreshPayrollWorkflow();
  }, [refreshPayrollWorkflow]);

  useEffect(() => {
    setBankCohortDownloaded(new Set());
  }, [payrollPeriod.year, payrollPeriod.month]);

  useEffect(() => {
    void refreshHqDeductionLock();
  }, [refreshHqDeductionLock]);

  useEffect(() => {
    void getMdEngineConstants().then((engine) => {
      setRequireDeductionMonthLock(engine.requireDeductionMonthLock);
    });
  }, []);

  const workflowForGroup = (groupId: PayrollGroupId) =>
    payrollRuns.find((w) => w.groupId === groupId) ?? {
      groupId,
      batchId: '',
      status: 'DRAFT' as const,
    };

  const payrollLocked = workflowStatus !== 'DRAFT';
  const payrollMdApproved = workflowStatus === 'APPROVED';
  const payrollLockedForRegenerate =
    payrollRuns.length > 0 && payrollRuns.every((w) => w.status !== 'DRAFT');

  const handleLockGroup = (groupId: PayrollGroupId) => {
    if (!isLivePeriod) return;
    setLockingGroup(groupId);
    setWorkflowMessage(null);
    void submitPayrollGroupForReview(groupId, payrollPeriod.year, payrollPeriod.month).then(
      (result) => {
        setLockingGroup(null);
        if (result.success) {
          void refreshPayrollWorkflow();
        } else {
          setWorkflowMessage(result.error ?? 'Could not submit batch for MD review.');
        }
      },
    );
  };

  const runGeneratePayroll = useCallback(() => {
    if (!isLivePeriod) return;
    setGenerateMessage(null);
    startGenerateTransition(async () => {
      const formData = new FormData();
      formData.set('month', String(payrollPeriod.month));
      formData.set('year', String(payrollPeriod.year));

      const result = await generateMonthEndPayroll(formData);
      if (result.success) {
        const skippedSuffix =
          (result.skipped ?? 0) > 0
            ? ` Skipped ${result.skipped} employee${result.skipped === 1 ? '' : 's'} pending MD salary approval${
                result.skippedLabels?.length
                  ? ` (${result.skippedLabels.join(', ')})`
                  : ''
              }. Their draft payslips for this period were removed.`
            : '';
        setGenerateMessage(
          `Generated ${result.count} draft payslip${result.count === 1 ? '' : 's'} for ${periodLabel}. Review each payroll group, then lock and send to MD.${skippedSuffix}`,
        );
        await refreshPayrollWorkflow();
      } else {
        setGenerateMessage(
          result.error ??
            (result.blocked
              ? 'Payroll already submitted or approved for this period.'
              : 'Payroll generation failed. Check server logs and try again.'),
        );
      }
    });
  }, [isLivePeriod, payrollPeriod.month, payrollPeriod.year, periodLabel, refreshPayrollWorkflow]);

  const handleReeditGroup = (groupId: PayrollGroupId) => {
    if (!isLivePeriod) return;
    setWorkflowMessage(null);
    void revertPayrollGroupToDraft(groupId, payrollPeriod.year, payrollPeriod.month).then(
      async (result) => {
        if (result.success) {
          setBankCohortDownloaded(new Set());
          await refreshPayrollWorkflow();
          runGeneratePayroll();
        } else {
          setWorkflowMessage(result.error ?? 'Could not unlock batch for editing.');
        }
      },
    );
  };

  const handleDownloadBankFile = (site: Site, groupId: PayrollGroupId) => {
    if (!isLivePeriod) return;
    const cohort = fmSitePayrollCohort(site);
    const usesGuardCohort = usesCohortBankDownload(site.payrollGroup);

    void downloadPayrollBankFile(
      groupId,
      payrollPeriod.year,
      payrollPeriod.month,
      cohort,
    ).then((result) => {
      if (!result.success || !result.content || !result.filename || !result.mimeType) {
        setWorkflowMessage(result.error ?? 'Could not generate bank file.');
        return;
      }

      triggerPayrollBankDownload(result.filename, result.content, result.mimeType);

      if (usesGuardCohort) {
        setBankCohortDownloaded((prev) => new Set(prev).add(site.id));
      }

      void markPayrollGroupPaid(groupId, payrollPeriod.year, payrollPeriod.month).then(() => {
        void refreshPayrollWorkflow();
      });
    });
  };

  const handleShiftAdjust = (
    siteId: string,
    employeeId: string,
    delta: number,
    note: string,
  ): Employee | undefined => {
    const persistAdjustment = (updatedEmployee?: Employee) => {
      if (!updatedEmployee || !isLivePeriod) return;
      const previous = updatedEmployee.shiftAuditLog.at(-1)?.previousShifts;
      const next = updatedEmployee.shiftAuditLog.at(-1)?.newShifts;
      if (previous == null || next == null) return;
      void saveFmShiftAdjustment({
        employeeId,
        siteKey: siteId,
        payrollMonth: livePayrollMonth,
        delta,
        previousShifts: previous,
        newShifts: next,
        detail: note,
      });
    };

    if (
      siteId === 'group-cvs' ||
      siteId === 'group-cvs-sm' ||
      siteId === 'group-cafe' ||
      siteId === 'group-cvs-no-bank' ||
      siteId === 'group-cvs-sm-no-bank' ||
      siteId === 'group-cafe-no-bank' ||
      siteId.startsWith('group-guard-')
    ) {
      let updatedEmployee: Employee | undefined;
      setPinnedSites((prev) => {
        const result = applyShiftAdjustToSites(prev, siteId, employeeId, delta, note);
        updatedEmployee = result.updatedEmployee;
        return result.sites;
      });
      persistAdjustment(updatedEmployee);
      return updatedEmployee;
    }

    let updatedEmployee: Employee | undefined;
    setSites((prev) => {
      const result = applyShiftAdjustToSites(prev, siteId, employeeId, delta, note);
      updatedEmployee = result.updatedEmployee;
      return result.sites;
    });
    persistAdjustment(updatedEmployee);
    return updatedEmployee;
  };

  const handleVariableEarningsSaved = (
    siteId: string,
    employeeId: string,
    variableEarnings: VariablePayrollEarnings,
    totals: { totalGross: number; netTakeHome: number },
    fixedAllowances: FixedMonthlyAllowances,
  ): Employee | undefined => {
    const isPinned =
      siteId === 'group-cvs' ||
      siteId === 'group-cvs-sm' ||
      siteId === 'group-cafe' ||
      siteId === 'group-cvs-no-bank' ||
      siteId === 'group-cvs-sm-no-bank' ||
      siteId === 'group-cafe-no-bank' ||
      siteId.startsWith('group-guard-');

    if (isPinned) {
      let updatedEmployee: Employee | undefined;
      setPinnedSites((prev) => {
        const result = applyVariableEarningsToSites(
          prev,
          siteId,
          employeeId,
          variableEarnings,
          totals,
          fixedAllowances,
        );
        updatedEmployee = result.updatedEmployee;
        return result.sites;
      });
      return updatedEmployee;
    }

    let updatedEmployee: Employee | undefined;
    setSites((prev) => {
      const result = applyVariableEarningsToSites(
        prev,
        siteId,
        employeeId,
        variableEarnings,
        totals,
        fixedAllowances,
      );
      updatedEmployee = result.updatedEmployee;
      return result.sites;
    });
    return updatedEmployee;
  };

  const holidayCalendarIncomplete = useFmHolidayCalendarIncomplete();

  const rosterCount =
    pinnedSites.reduce((s, site) => s + (site.displayEmployeeCount ?? site.employees.length), 0) +
    sites.reduce((s, site) => s + site.employees.length, 0);

  const payrollSections = useMemo(
    () =>
      ADVANCE_PAYROLL_SECTIONS.map((section) => ({
        ...section,
        sites: pinnedSites.filter((site) => section.matches(site.payrollGroup)),
      })).filter((section) => section.sites.length > 0),
    [pinnedSites],
  );

  const renderPinnedSite = (site: Site) => {
    const groupId = pinnedSitePayrollGroupId(site);
    const groupWorkflow = groupId ? workflowForGroup(groupId) : undefined;
    const groupLocked = groupWorkflow ? groupWorkflow.status !== 'DRAFT' : payrollLocked;
    return (
      <SiteRow
        key={site.id}
        site={site}
        pinned
        payrollLocked={groupLocked}
        periodLabel={periodLabel}
        payrollPeriod={payrollPeriod}
        isLivePeriod={isLivePeriod}
        portfolioScale={portfolioScale}
        groupWorkflow={groupWorkflow}
        payrollGenerated={payrollGenerated}
        hqDeductionsLocked={fmCanLockPayroll}
        locking={groupId != null && lockingGroup === groupId}
        onLockGroup={groupId ? () => handleLockGroup(groupId) : undefined}
        onReeditGroup={groupId ? () => handleReeditGroup(groupId) : undefined}
        onDownloadBank={groupId ? () => handleDownloadBankFile(site, groupId) : undefined}
        onShiftAdjust={(employeeId, delta, note) =>
          handleShiftAdjust(site.id, employeeId, delta, note)
        }
        onVariableEarningsSaved={(employeeId, variableEarnings, totals, fixedAllowances) =>
          handleVariableEarningsSaved(
            site.id,
            employeeId,
            variableEarnings,
            totals,
            fixedAllowances,
          )
        }
        onDeductionsSaved={refreshPortfolio}
        bankFileDownloaded={bankCohortDownloaded.has(site.id)}
      />
    );
  };

  return (
    <FmCommandShellLayout>

        <FmSubnav holidayCalendarIncomplete={holidayCalendarIncomplete} />

        {/* ── Page Header ──────────────────────────────────────────────────── */}
        <div className="mb-8">
          <div className="mb-3 flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-[color:var(--cvs-accent-muted)] bg-[var(--cvs-accent-soft)]">
              <DollarSign className="h-4 w-4 text-[color:var(--cvs-accent)]" />
            </div>
            <span
              className={`text-[10px] font-bold uppercase tracking-widest ${CVS_BRAND_CLASSES.portalEyebrow}`}
            >
              Finance Manager Portal
            </span>
          </div>
          <div>
            <h1 className="text-3xl font-black tracking-tight text-slate-900">
              FM Master Desk — Site Payroll Reconciliation
            </h1>
          </div>

          {/* Status bar */}
          <div className="mt-5 flex w-full flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
            {portfolioLoading && (
              <div className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 shadow-sm">
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-blue-200 border-t-blue-600" />
                <span className="text-[10px] font-bold uppercase tracking-widest text-blue-800">
                  Loading live portfolio…
                </span>
              </div>
            )}
            {portfolioError && !portfolioLoading && (
              <div className="flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 shadow-sm">
                <span className="text-[10px] font-semibold text-rose-800">
                  Live portfolio unavailable — {portfolioError}
                </span>
              </div>
            )}
            <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-sm">
              <Building2 className="h-3.5 w-3.5 text-slate-400" />
              <span className="text-[10px] font-semibold text-slate-500">
                {sites.length} active sites
              </span>
            </div>
            <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-sm">
              <Users className="h-3.5 w-3.5 text-slate-400" />
              <span className="text-[10px] font-semibold text-slate-500">
                {rosterCount} employees on roster
              </span>
            </div>
            {isLivePeriod && deductionsGateActive && !hqDeductionsLocked && (
              <div className="flex items-center gap-2 rounded-lg border border-violet-300 bg-violet-50 px-3 py-2 shadow-sm">
                <span className="h-1.5 w-1.5 rounded-full bg-violet-500" />
                <span className="text-[10px] font-bold uppercase tracking-widest text-violet-900">
                  Deductions pending admin lock
                </span>
              </div>
            )}
            <div
              className={`flex items-center gap-2 rounded-lg border px-3 py-2 shadow-sm ${
                payrollMdApproved
                  ? 'border-emerald-300 bg-emerald-50'
                  : workflowStatus === 'SUBMITTED_FOR_REVIEW'
                    ? 'border-indigo-200 bg-indigo-50'
                    : 'border-amber-200 bg-amber-50'
              }`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  payrollMdApproved
                    ? 'bg-emerald-500'
                    : workflowStatus === 'SUBMITTED_FOR_REVIEW'
                      ? 'bg-indigo-500'
                      : 'bg-amber-500'
                }`}
              />
              <span
                className={`text-[10px] font-bold uppercase tracking-widest ${
                  payrollMdApproved
                    ? 'text-emerald-800'
                    : workflowStatus === 'SUBMITTED_FOR_REVIEW'
                      ? 'text-indigo-800'
                      : 'text-amber-800'
                }`}
              >
                {payrollMdApproved
                  ? `MD Approved · ${periodLabel} — Desk Locked`
                  : workflowStatus === 'SUBMITTED_FOR_REVIEW'
                    ? `With MD · ${periodLabel} — Desk Locked`
                    : `Payroll Draft · ${periodLabel}`}
              </span>
            </div>
            </div>
            <FmPayrollMonthSelector period={payrollPeriod} onChange={setPayrollPeriod} />
          </div>
        </div>

        <div className="mb-6 border-t border-slate-200" />

        {/* ── Portfolio KPI Cards ───────────────────────────────────────────── */}
        <p className="mb-4 text-[10px] font-bold uppercase tracking-widest text-slate-400">
          Portfolio Summary
        </p>
        <div className="mb-8 grid grid-cols-1 gap-5 sm:grid-cols-3">
          {portfolioLoading ? (
            <>
              <KpiCardSkeleton />
              <KpiCardSkeleton />
              <KpiCardSkeleton />
            </>
          ) : (
            <>
              <KpiCard
                label="Total Portfolio Cost"
                sublabel="Payroll Cost"
                value={lkr(portfolioTotals.totalPortfolioCost)}
                icon={Receipt}
                accentTop="bg-slate-300"
                iconBg="bg-slate-100"
                iconColor="text-slate-600"
                onClick={() => setActiveReport('payroll-cost')}
              />
              <KpiCard
                label="Total Portfolio Billed"
                sublabel="Client Billing"
                value={lkr(portfolioTotals.totalPortfolioBilled)}
                badge={`${sites.length} sites`}
                badgePositive
                icon={FileText}
                accentTop="bg-blue-500"
                iconBg="bg-blue-50"
                iconColor="text-blue-700"
                onClick={() => setActiveReport('client-billing')}
              />
              <KpiCard
                label="Total Statutory Cost"
                sublabel="EPF · ETF · APIT"
                value={lkr(portfolioTotals.totalStatutoryCost)}
                badge={`${portfolioTotals.statutoryPctOfCost}%`}
                icon={Landmark}
                accentTop="bg-indigo-500"
                iconBg="bg-indigo-50"
                iconColor="text-indigo-700"
                onClick={() => setActiveReport('statutory')}
              />
            </>
          )}
        </div>

        {!portfolioLoading && (
          <FmGranularDeductionsLedger headcount={rosterCount} defaultPeriod={payrollPeriod} />
        )}

        {activeReport && !portfolioLoading && (
          <FmPortfolioReportModal
            kind={activeReport}
            sites={sites}
            workflowStatus={workflowStatus}
            periodLabel={periodLabel}
            payrollPeriod={payrollPeriod}
            isLivePeriod={isLivePeriod}
            onClose={() => setActiveReport(null)}
          />
        )}

        {/* ── Site-by-Site Payroll Ledger ───────────────────────────────────── */}
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
              Site-by-Site Payroll Ledger
            </p>
            <p className="mt-0.5 text-[10px] font-semibold text-slate-500">
              Pinned payroll groups (CVS · SM group · SM CVS · Café) — generate drafts, then lock
              &amp; send to MD
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <ChevronRight className="h-3 w-3 text-slate-400" />
            <span className="text-[10px] text-slate-400">Click any row to expand roster</span>
          </div>
        </div>

        {isLivePeriod && !payrollTableReady && (
          <div className="mb-4 rounded-xl border border-amber-200/60 bg-amber-50/60 px-4 py-3 text-[11px] font-semibold text-amber-900">
            <span className="font-black uppercase tracking-wider">Payroll schema pending.</span>{' '}
            Apply the payroll runs migration (
            <span className="font-mono">npm run db:apply-payroll-runs</span>) to enable
            duplicate-safe generation.
          </div>
        )}

        {isLivePeriod && deductionsGateActive && !hqDeductionsLocked && (
          <div className="mb-4 rounded-xl border border-violet-200/60 bg-violet-50/60 px-4 py-3 text-[11px] font-semibold text-violet-900">
            <span className="font-black uppercase tracking-wider">Deductions pending admin lock.</span>{' '}
            Finance must finish monthly entries on Deductions Admin and use{' '}
            <span className="font-black">Lock month &amp; send to FM</span> for {periodLabel}{' '}
            before you can lock payroll groups.
          </div>
        )}

        {workflowMessage && (
          <div className="mb-4 rounded-xl border border-rose-200/60 bg-rose-50/50 px-4 py-2.5 text-[11px] font-semibold text-rose-800">
            {workflowMessage}
          </div>
        )}

        {isLivePeriod &&
          payrollTableReady &&
          !portfolioLoading &&
          !payrollGenerated &&
          !payrollLockedForRegenerate && (
            <div className="mb-4 rounded-xl border border-indigo-200/60 bg-indigo-50/60 px-4 py-3 text-[11px] font-semibold text-indigo-900">
              <span className="font-black uppercase tracking-wider">Draft payslips not generated.</span>{' '}
              Review the live portfolio below, then use{' '}
              <span className="font-black">Generate draft payslips</span> when ready — generation no
              longer runs automatically on page load.
            </div>
          )}

        {isLivePeriod && isGenerating && (
          <div className="mb-4 rounded-xl border border-indigo-200/60 bg-indigo-50/60 px-4 py-3 text-[11px] font-semibold text-indigo-900">
            <span className="font-black uppercase tracking-wider">Generating payroll…</span>{' '}
            Building draft payslips for {periodLabel}.
          </div>
        )}

        {generateMessage && (
          <div
            className={`mb-4 rounded-xl border px-4 py-2.5 text-[11px] font-semibold ${
              payrollGenerated
                ? 'border-emerald-200/60 bg-emerald-50/50 text-emerald-800'
                : 'border-rose-200/60 bg-rose-50/50 text-rose-800'
            }`}
          >
            {generateMessage}
          </div>
        )}

        <ExecutiveGlassCard className="mb-5 border-slate-200/80 bg-gradient-to-br from-white to-slate-50/80 p-4 sm:p-5">
          <div className="flex flex-wrap items-start gap-4">
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl border border-indigo-200/80 bg-indigo-50/90">
              <Landmark className="h-5 w-5 text-indigo-700" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-black uppercase tracking-widest text-indigo-700">
                Payroll workflow
              </p>
              <ol className="mt-2 space-y-1.5 text-[11px] font-medium text-slate-600">
                <li>
                  <span className="font-black text-slate-800">1. Generate</span> — click{' '}
                  <span className="font-black">Generate draft payslips</span> when the portfolio is
                  ready for {periodLabel}.
                </li>
                <li>
                  <span className="font-black text-slate-800">2. Lock &amp; send to MD</span> — on
                  bank cohort cards only; locks the whole Security or Café batch for MD review.
                </li>
                <li>
                  <span className="font-black text-slate-800">3. MD approves</span> — on the
                  executive payroll desk; until then Bank .TXT stays disabled.
                </li>
                <li>
                  <span className="font-black text-slate-800">4. Bank .TXT</span> — download one
                  cohort file at a time (HO, SM, guards by bank). No-bank cards are paid in cash
                  from the expanded roster.
                </li>
              </ol>
            </div>
            {isLivePeriod &&
              payrollTableReady &&
              !portfolioLoading &&
              !payrollLockedForRegenerate && (
                <button
                  type="button"
                  onClick={runGeneratePayroll}
                  disabled={isGenerating || payrollGenerated}
                  title={
                    payrollGenerated
                      ? 'Draft payslips already generated for this period'
                      : 'Build draft payslips for the live payroll period'
                  }
                  className={`inline-flex shrink-0 items-center gap-1.5 rounded-xl px-4 py-2.5 text-[10px] font-black uppercase tracking-wider shadow-sm transition-all ${
                    !isGenerating && !payrollGenerated
                      ? 'border border-indigo-200/80 bg-indigo-600 text-white hover:bg-indigo-500'
                      : 'cursor-not-allowed border border-slate-200/80 bg-slate-100/80 text-slate-400'
                  }`}
                >
                  {isGenerating ? (
                    <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  ) : (
                    <FileText className="h-3.5 w-3.5" />
                  )}
                  {isGenerating ? 'Generating…' : 'Generate draft payslips'}
                </button>
              )}
          </div>
        </ExecutiveGlassCard>

        {portfolioLoading ? (
          <PortfolioLedgerSkeleton />
        ) : (
          <div className="mb-4 space-y-5">
            {payrollSections.map((section) => (
              <section
                key={section.id}
                className={`overflow-hidden rounded-2xl border shadow-sm ${section.border} ${section.bg}`}
              >
                <div className="flex items-start gap-3 border-b border-inherit px-4 py-3 sm:px-5">
                  <div
                    className={`mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl text-xs font-black ${section.iconBg}`}
                  >
                    {section.id === 'ho'
                      ? 'HO'
                      : section.id === 'sm'
                        ? 'SM'
                        : section.id === 'cafe'
                          ? 'CF'
                          : 'GD'}
                  </div>
                  <div className="min-w-0">
                    <p
                      className={`text-[11px] font-black uppercase tracking-widest ${section.titleColor}`}
                    >
                      {section.title}
                    </p>
                    <p className={`mt-0.5 text-[11px] font-medium ${section.subtitleColor}`}>
                      {section.subtitle}
                    </p>
                  </div>
                </div>
                <div
                  className={`grid gap-3 p-3 sm:p-4 ${
                    section.id === 'guards'
                      ? 'grid-cols-1 md:grid-cols-2 xl:grid-cols-3'
                      : 'grid-cols-1 sm:grid-cols-2'
                  }`}
                >
                  {section.sites.map(renderPinnedSite)}
                </div>
              </section>
            ))}
          </div>
        )}

        {CVS_GUARD_OPS_ENABLED ? (
          <>
            <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-slate-400">
              Client guard sites
            </p>
            <div className="space-y-3">
              {portfolioLoading ? (
                <>
                  <PortfolioSiteRowSkeleton />
                  <PortfolioSiteRowSkeleton />
                  <PortfolioSiteRowSkeleton />
                </>
              ) : (
                sites.map((site) => (
                  <SiteRow
                    key={site.id}
                    site={site}
                    payrollLocked={payrollLocked}
                    periodLabel={periodLabel}
                    payrollPeriod={payrollPeriod}
                    isLivePeriod={isLivePeriod}
                    portfolioScale={portfolioScale}
                    onShiftAdjust={(employeeId, delta, note) =>
                      handleShiftAdjust(site.id, employeeId, delta, note)
                    }
                    onVariableEarningsSaved={(employeeId, variableEarnings, totals, fixedAllowances) =>
                      handleVariableEarningsSaved(site.id, employeeId, variableEarnings, totals, fixedAllowances)
                    }
                    onDeductionsSaved={refreshPortfolio}
                  />
                ))
              )}
            </div>
          </>
        ) : null}
    </FmCommandShellLayout>
  );
}
