import type { UnsettledBalanceLine } from '../../../lib/employee-clearance-ledger';
import type { SalaryReleaseAction } from '../../../lib/salary-retention';
import type { ClearanceSettlement, HrResignationGate } from '../../../lib/clearance-settlement';
import type { GratuityCalculation } from '../../../../../packages/gratuity';

export type ClearanceShiftRow = {
  date: string;
  site: string;
  source: 'attendance' | 'sm_portal' | 'time_engine';
};

export type EmployeeClearanceSnapshot = {
  employeeId: string;
  status: string | null;
  fullName: string;
  empNo: string | null;
  rank: string | null;
  assignedSite: string | null;
  lastDateWorked: string | null;
  lastMonthLabel: string;
  lastMonthShiftCount: number;
  lastMonthShifts: ClearanceShiftRow[];
  primarySiteLastMonth: string | null;
  totalGrossLastMonthLkr: number | null;
  totalDeductionsLastMonthLkr: number | null;
  netTakeHomeLastMonthLkr: number | null;
  currMonthLabel: string;
  currMonthShiftCount: number;
  retentionStatus: SalaryReleaseAction;
  retentionLabel: string;
  retentionReason: string;
  thresholds: { prevMonthMinShifts: number; salaryMonthMinShifts: number };
  unsettledBalances: UnsettledBalanceLine[];
  totalOwedToCompanyLkr: number;
  settlement: ClearanceSettlement;
  hrResignationGate: HrResignationGate;
  fmOffboardingPaymentConfirmed: boolean;
  fmOffboardingPaymentConfirmedAt: string | null;
  hrOffboardingSentToFm: boolean;
  hrOffboardingSentToFmAt: string | null;
  gratuity: GratuityCalculation;
};
