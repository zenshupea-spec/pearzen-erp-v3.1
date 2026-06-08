'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import FmSubnav from './components/FmSubnav';
import FmLedgerSummaryCards from './components/FmLedgerSummaryCards';
import FmPayrollMonthSelector from './components/FmPayrollMonthSelector';
import FmPortfolioReportModal from './components/FmPortfolioReportModal';
import ShiftAdjustmentsPanel from './components/ShiftAdjustmentsPanel';
import type { FmPortfolioReportKind } from './lib/fm-portfolio-report-builders';
import {
  getGroupWorkflow,
  subscribePayrollWorkflow,
  type PayrollWorkflowStatus,
} from '../../lib/payroll-batch-workflow';
import {
  effectiveShiftsAtSite,
  getPenaltyShiftReduction,
  syncEmployeeShiftCount,
  type ShiftAuditEntry,
} from './lib/shift-adjustments';
import {
  FM_LIVE_PAYROLL_PERIOD,
  formatPayrollPeriodLabel,
  historicalPortfolioScale,
  isLivePayrollPeriod,
} from './lib/payroll-period';
import { getDeductionMonthLockStatus } from '../hq/deductions/actions';
import {
  getFmPortfolio,
  saveFmShiftAdjustment,
  type FmPortfolioPayload,
} from './portfolio-actions';
import {
  getClientDeductionMonthLockedAt,
  payrollMonthFromFmPeriod,
  subscribeDeductionMonthLock,
} from '../../lib/deduction-month-lock-storage';
import {
  FM_SM_COMPENSATION,
  computeSmGrossLkr,
  smPayModeLabel,
  type SmPayMode,
} from './lib/sm-pay-settings';
import {
  FM_FORMULA_CAFE_SOURCE,
  FM_FORMULA_GUARD_SOURCE,
  FM_MNR_SALARY_SOURCE,
  cafeOtHourlyRateLkr,
  isGuardFieldEarnings,
} from './lib/payroll-earnings-display';
import {
  ChevronDown,
  ChevronRight,
  FileText,
  Wallet,
  Landmark,
  Receipt,
  Building2,
  Users,
  TrendingUp,
  DollarSign,
  X,
  CalendarDays,
  Pin,
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
  dayTypeBreakdown: DayTypeBreakdown[];
};

type Employee = {
  id: string;
  empNumber: string;
  name: string;
  rank: string;
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
  /** Pinned payroll-group row (HO / SM / café), shown above client sites */
  payrollGroup?: 'cafe' | 'ho' | 'sm';
  displayEmployeeCount?: number;
  employees: Employee[];
};

// ─── Mock Data ────────────────────────────────────────────────────────────────

function smEarningsSeed(
  patrolSites: string[],
  visitsCompleted: number,
  visitsTarget: number,
  deductions: DeductionEntry[] = [],
  totalDeductions = 0,
): Pick<Employee, 'shiftsAtSite' | 'totalGross' | 'totalDeductions' | 'netTakeHome' | 'deductions' | 'earnings'> {
  const { visitPayLkr, fixedBasicLkr, totalGrossLkr } = computeSmGrossLkr(visitsCompleted);
  return {
    shiftsAtSite: 0,
    totalGross: totalGrossLkr,
    totalDeductions,
    netTakeHome: totalGrossLkr - totalDeductions,
    deductions,
    earnings: {
      crossSiteDistribution: patrolSites.map((site) => ({ site, shifts: 0 })),
      smPayData: {
        payMode: FM_SM_COMPENSATION.payMode,
        visitsCompleted,
        visitsTarget,
        perVisitRateLkr: FM_SM_COMPENSATION.perVisitRateLkr,
        visitPayLkr,
        fixedBasicLkr,
      },
      dayTypeBreakdown: minimalDayTypes(0, 0),
    },
  };
}

function minimalDayTypes(normalShifts: number, normalLkr: number): DayTypeBreakdown[] {
  return [
    { type: 'Normal Days', totalShifts: normalShifts, rateMultiplier: '1.0x', lkrEarned: normalLkr, dates: [] },
    { type: 'Sundays', totalShifts: 0, rateMultiplier: '1.5x', lkrEarned: 0, dates: [] },
    { type: 'Poya Days', totalShifts: 0, rateMultiplier: '2.0x', lkrEarned: 0, dates: [] },
    { type: 'Public Holidays', totalShifts: 0, rateMultiplier: '2.0x', lkrEarned: 0, dates: [] },
    { type: 'Saturdays', totalShifts: 0, rateMultiplier: '1.25x', lkrEarned: 0, dates: [] },
  ];
}

/** Pinned above client sites — CVS (HO) · CVS SM · Café Tasha. */
const MOCK_PINNED_GROUP_SITES_SEED: SiteSeed[] = [
  {
    id: 'group-cvs',
    name: 'CVS',
    location: 'Classic Venture Security · HO & administration · Battaramulla',
    clientBilled: 2_650_000,
    payrollCost: 2_180_000,
    payrollGroup: 'ho',
    displayEmployeeCount: 24,
    employees: [
      {
        id: 'ho-001',
        empNumber: 'HQ-0201',
        name: 'Sanduni Wickramasinghe',
        rank: 'Finance Executive',
        shiftsAtSite: 0,
        totalGross: 118_000,
        totalDeductions: 4_200,
        netTakeHome: 113_800,
        deductions: [
          {
            type: 'Advance',
            totalLiability: 25_000,
            installmentCurrent: 1,
            installmentTotal: 1,
            thisMonthAmount: 4_200,
          },
        ],
        earnings: {
          crossSiteDistribution: [{ site: 'CVS', shifts: 0 }],
          hoFixedData: { mnrBaseSalaryLkr: 118_000 },
          dayTypeBreakdown: minimalDayTypes(0, 0),
        },
      },
      {
        id: 'ho-002',
        empNumber: 'HQ-0214',
        name: 'Kasun Mendis',
        rank: 'HR Manager',
        shiftsAtSite: 0,
        totalGross: 142_000,
        totalDeductions: 0,
        netTakeHome: 142_000,
        deductions: [],
        earnings: {
          crossSiteDistribution: [{ site: 'CVS', shifts: 0 }],
          hoFixedData: { mnrBaseSalaryLkr: 142_000 },
          dayTypeBreakdown: minimalDayTypes(0, 0),
        },
      },
      {
        id: 'ho-003',
        empNumber: 'HQ-0222',
        name: 'Priya Rajapaksa',
        rank: 'Payroll Officer',
        shiftsAtSite: 0,
        totalGross: 96_500,
        totalDeductions: 1_800,
        netTakeHome: 94_700,
        deductions: [
          {
            type: 'Uniform',
            totalLiability: 10_800,
            installmentCurrent: 2,
            installmentTotal: 6,
            thisMonthAmount: 1_800,
          },
        ],
        earnings: {
          crossSiteDistribution: [{ site: 'CVS', shifts: 0 }],
          hoFixedData: { mnrBaseSalaryLkr: 96_500 },
          dayTypeBreakdown: minimalDayTypes(0, 0),
        },
      },
      {
        id: 'ho-004',
        empNumber: 'HQ-0235',
        name: 'Niroshan Bandara',
        rank: 'Operations Coordinator',
        shiftsAtSite: 0,
        totalGross: 88_000,
        totalDeductions: 0,
        netTakeHome: 88_000,
        deductions: [],
        earnings: {
          crossSiteDistribution: [{ site: 'CVS', shifts: 0 }],
          hoFixedData: { mnrBaseSalaryLkr: 88_000 },
          dayTypeBreakdown: minimalDayTypes(0, 0),
        },
      },
    ],
  },
  {
    id: 'group-cvs-sm',
    name: 'CVS SM',
    location: `Sector managers · ${smPayModeLabel(FM_SM_COMPENSATION.payMode)} (MD settings)`,
    clientBilled: 588_000,
    payrollCost: 470_000,
    payrollGroup: 'sm',
    displayEmployeeCount: 6,
    employees: [
      {
        id: 'sm-001',
        empNumber: 'EMP-SM-001',
        name: 'Dissanayake K.P.',
        rank: 'Sector Manager',
        ...smEarningsSeed(
          [
            'Lanka Hospitals Corporation',
            'Sri Lanka Telecom HQ',
            'John Keells Holdings Tower',
            'Dialog Axiata HQ',
          ],
          56,
          60,
        ),
      },
      {
        id: 'sm-002',
        empNumber: 'EMP-SM-002',
        name: 'Perera R.S.',
        rank: 'Sector Manager',
        ...smEarningsSeed(
          ['Sri Lanka Telecom HQ', 'Bank of Ceylon Head Office', 'Dialog Axiata HQ'],
          48,
          52,
        ),
      },
      {
        id: 'sm-003',
        empNumber: 'EMP-SM-003',
        name: 'Fernando L.M.',
        rank: 'Sector Manager',
        ...smEarningsSeed(['John Keells Holdings Tower', 'Hemas Holdings'], 22, 28),
      },
      {
        id: 'sm-004',
        empNumber: 'EMP-SM-004',
        name: 'Jayasuriya N.T.',
        rank: 'Sector Manager',
        ...smEarningsSeed(
          ['Bank of Ceylon Head Office', 'Dialog Axiata HQ', 'Hemas Holdings'],
          44,
          48,
          [
            {
              type: 'Advance',
              totalLiability: 20_000,
              installmentCurrent: 1,
              installmentTotal: 4,
              thisMonthAmount: 5_000,
            },
          ],
          5_000,
        ),
      },
      {
        id: 'sm-005',
        empNumber: 'EMP-SM-005',
        name: 'Gunasekara C.B.',
        rank: 'Sector Manager',
        ...smEarningsSeed(['Hemas Holdings', 'Dialog Axiata HQ'], 18, 24),
      },
      {
        id: 'sm-006',
        empNumber: 'EMP-SM-006',
        name: 'Bandara H.W.',
        rank: 'Sector Manager',
        ...smEarningsSeed(['Unassigned — bench'], 0, 0),
      },
    ],
  },
  {
    id: 'group-cafe',
    name: 'Café Tasha',
    location: 'Café operations · baristas · counter · kitchen',
    clientBilled: 1_820_000,
    payrollCost: 1_450_000,
    payrollGroup: 'cafe',
    displayEmployeeCount: 18,
    employees: [
      {
        id: 'cafe-001',
        empNumber: 'CT-0102',
        name: 'Anuki Fernando',
        rank: 'Barista',
        shiftsAtSite: 26,
        totalGross: 82_400,
        totalDeductions: 1_200,
        netTakeHome: 81_200,
        deductions: [],
        earnings: {
          crossSiteDistribution: [{ site: 'Café Tasha', shifts: 26 }],
          cafeData: {
            monthlyBasicLkr: 71_600,
            daysWorked: 26,
            totalOT: 12,
            basePayLkr: 71_600,
            otPayLkr: 10_800,
          },
          dayTypeBreakdown: minimalDayTypes(0, 0),
        },
      },
      {
        id: 'cafe-002',
        empNumber: 'CT-0118',
        name: 'Dilshan Perera',
        rank: 'Counter Staff',
        shiftsAtSite: 24,
        totalGross: 76_800,
        totalDeductions: 800,
        netTakeHome: 76_000,
        deductions: [],
        earnings: {
          crossSiteDistribution: [{ site: 'Café Tasha', shifts: 24 }],
          cafeData: {
            monthlyBasicLkr: 76_400,
            daysWorked: 24,
            totalOT: 8,
            basePayLkr: 70_400,
            otPayLkr: 6_400,
          },
          dayTypeBreakdown: minimalDayTypes(0, 0),
        },
      },
      {
        id: 'cafe-003',
        empNumber: 'CT-0124',
        name: 'Nethmi Jayawardena',
        rank: 'Kitchen Staff',
        shiftsAtSite: 22,
        totalGross: 71_200,
        totalDeductions: 0,
        netTakeHome: 71_200,
        deductions: [],
        earnings: {
          crossSiteDistribution: [{ site: 'Café Tasha', shifts: 22 }],
          cafeData: {
            monthlyBasicLkr: 78_500,
            daysWorked: 22,
            totalOT: 6,
            basePayLkr: 66_400,
            otPayLkr: 4_800,
          },
          dayTypeBreakdown: minimalDayTypes(0, 0),
        },
      },
      {
        id: 'cafe-004',
        empNumber: 'CT-0131',
        name: 'Ravindu Silva',
        rank: 'Barista',
        shiftsAtSite: 20,
        totalGross: 68_500,
        totalDeductions: 450,
        netTakeHome: 68_050,
        deductions: [
          {
            type: 'Meals',
            totalLiability: 1_350,
            installmentCurrent: 1,
            installmentTotal: 1,
            thisMonthAmount: 450,
          },
        ],
        earnings: {
          crossSiteDistribution: [{ site: 'Café Tasha', shifts: 20 }],
          cafeData: {
            monthlyBasicLkr: 85_150,
            daysWorked: 20,
            totalOT: 4,
            basePayLkr: 65_500,
            otPayLkr: 3_000,
          },
          dayTypeBreakdown: minimalDayTypes(0, 0),
        },
      },
    ],
  },
];

const MOCK_SITES_SEED: SiteSeed[] = [
  {
    id: 'site-001',
    name: 'Lanka Hospitals Corporation',
    location: 'Narahenpita, Colombo 05',
    clientBilled: 1_108_500,
    payrollCost: 780_400,
    smCashAllocation: 45_000,
    employees: [
      {
        id: 'emp-001',
        empNumber: 'G-0041',
        name: 'Chaminda Perera',
        rank: 'Senior Security Officer',
        shiftsAtSite: 26,
        totalGross: 68_420,
        totalDeductions: 9_250,
        netTakeHome: 59_170,
        deductions: [
          {
            type: 'Meals',
            totalLiability: 18_000,
            installmentCurrent: 2,
            installmentTotal: 3,
            thisMonthAmount: 6_000,
          },
          {
            type: 'Advance',
            totalLiability: 15_000,
            installmentCurrent: 1,
            installmentTotal: 3,
            thisMonthAmount: 3_250,
          },
        ],
        earnings: {
          crossSiteDistribution: [
            { site: 'Lanka Hospitals Corporation', shifts: 26 },
            { site: 'BOC Head Office', shifts: 4 },
          ],
          dayTypeBreakdown: [
            {
              type: 'Normal Days',
              totalShifts: 22,
              rateMultiplier: '1.0x',
              lkrEarned: 55_880,
              dates: [
                { date: '01 May 2026', shift: '06:00 – 18:00', premium: 0 },
                { date: '02 May 2026', shift: '06:00 – 18:00', premium: 0 },
                { date: '05 May 2026', shift: '06:00 – 18:00', premium: 0 },
                { date: '06 May 2026', shift: '18:00 – 06:00', premium: 0 },
                { date: '07 May 2026', shift: '06:00 – 18:00', premium: 0 },
              ],
            },
            {
              type: 'Sundays',
              totalShifts: 2,
              rateMultiplier: '1.5x',
              lkrEarned: 4_200,
              dates: [
                { date: '04 May 2026', shift: '06:00 – 18:00', premium: 2_100 },
                { date: '11 May 2026', shift: '06:00 – 18:00', premium: 2_100 },
              ],
            },
            {
              type: 'Poya Days',
              totalShifts: 1,
              rateMultiplier: '2.0x',
              lkrEarned: 4_200,
              dates: [{ date: '12 May 2026', shift: '06:00 – 18:00', premium: 4_200 }],
            },
            {
              type: 'Public Holidays',
              totalShifts: 1,
              rateMultiplier: '2.0x',
              lkrEarned: 4_140,
              dates: [{ date: '22 May 2026', shift: '06:00 – 18:00', premium: 4_200 }],
            },
            { type: 'Saturdays', totalShifts: 0, rateMultiplier: '1.25x', lkrEarned: 0, dates: [] },
          ],
        },
      },
      {
        id: 'emp-002',
        empNumber: 'G-0088',
        name: 'Priyantha Rajapaksa',
        rank: 'Security Officer',
        shiftsAtSite: 28,
        totalGross: 58_800,
        totalDeductions: 5_900,
        netTakeHome: 52_900,
        deductions: [
          {
            type: 'Meals',
            totalLiability: 9_000,
            installmentCurrent: 3,
            installmentTotal: 3,
            thisMonthAmount: 3_000,
          },
          {
            type: 'Uniform',
            totalLiability: 8_400,
            installmentCurrent: 2,
            installmentTotal: 6,
            thisMonthAmount: 1_400,
          },
          {
            type: 'Penalty',
            totalLiability: 1_500,
            installmentCurrent: 1,
            installmentTotal: 1,
            thisMonthAmount: 1_500,
          },
        ],
        earnings: {
          crossSiteDistribution: [{ site: 'Lanka Hospitals Corporation', shifts: 28 }],
          dayTypeBreakdown: [
            { type: 'Normal Days', totalShifts: 24, rateMultiplier: '1.0x', lkrEarned: 51_360, dates: [] },
            {
              type: 'Sundays',
              totalShifts: 4,
              rateMultiplier: '1.5x',
              lkrEarned: 7_360,
              dates: [
                { date: '04 May 2026', shift: '18:00 – 06:00', premium: 1_840 },
                { date: '11 May 2026', shift: '18:00 – 06:00', premium: 1_840 },
                { date: '18 May 2026', shift: '18:00 – 06:00', premium: 1_840 },
                { date: '25 May 2026', shift: '18:00 – 06:00', premium: 1_840 },
              ],
            },
            { type: 'Poya Days', totalShifts: 0, rateMultiplier: '2.0x', lkrEarned: 0, dates: [] },
            { type: 'Public Holidays', totalShifts: 0, rateMultiplier: '2.0x', lkrEarned: 0, dates: [] },
            { type: 'Saturdays', totalShifts: 0, rateMultiplier: '1.25x', lkrEarned: 0, dates: [] },
          ],
        },
      },
      {
        id: 'emp-003',
        empNumber: 'G-0112',
        name: 'Kapila Bandara',
        rank: 'Security Guard',
        shiftsAtSite: 24,
        totalGross: 52_000,
        totalDeductions: 31_200,
        netTakeHome: 20_800,
        deductions: [
          {
            type: 'Advance',
            totalLiability: 60_000,
            installmentCurrent: 1,
            installmentTotal: 6,
            thisMonthAmount: 20_000,
          },
          {
            type: 'Uniform',
            totalLiability: 8_400,
            installmentCurrent: 1,
            installmentTotal: 6,
            thisMonthAmount: 8_400,
          },
          {
            type: 'Meals',
            totalLiability: 9_000,
            installmentCurrent: 1,
            installmentTotal: 3,
            thisMonthAmount: 2_800,
          },
        ],
        earnings: {
          crossSiteDistribution: [{ site: 'Lanka Hospitals Corporation', shifts: 24 }],
          dayTypeBreakdown: [
            { type: 'Normal Days', totalShifts: 22, rateMultiplier: '1.0x', lkrEarned: 46_200, dates: [] },
            {
              type: 'Sundays',
              totalShifts: 2,
              rateMultiplier: '1.5x',
              lkrEarned: 3_150,
              dates: [
                { date: '11 May 2026', shift: '06:00 – 18:00', premium: 1_575 },
                { date: '25 May 2026', shift: '06:00 – 18:00', premium: 1_575 },
              ],
            },
            {
              type: 'Poya Days',
              totalShifts: 1,
              rateMultiplier: '2.0x',
              lkrEarned: 2_650,
              dates: [{ date: '12 May 2026', shift: '06:00 – 18:00', premium: 2_650 }],
            },
            { type: 'Public Holidays', totalShifts: 0, rateMultiplier: '2.0x', lkrEarned: 0, dates: [] },
            { type: 'Saturdays', totalShifts: 0, rateMultiplier: '1.25x', lkrEarned: 0, dates: [] },
          ],
        },
      },
    ],
  },
  {
    id: 'site-002',
    name: 'Sri Lanka Telecom HQ',
    location: 'Lotus Road, Colombo 01',
    clientBilled: 872_000,
    payrollCost: 641_800,
    employees: [
      {
        id: 'emp-005',
        empNumber: 'G-0155',
        name: 'Ruwan Jayasinghe',
        rank: 'Security Guard',
        shiftsAtSite: 24,
        totalGross: 44_200,
        totalDeductions: 4_400,
        netTakeHome: 39_800,
        deductions: [
          {
            type: 'Meals',
            totalLiability: 6_000,
            installmentCurrent: 1,
            installmentTotal: 2,
            thisMonthAmount: 3_000,
          },
          {
            type: 'Uniform',
            totalLiability: 2_800,
            installmentCurrent: 1,
            installmentTotal: 2,
            thisMonthAmount: 1_400,
          },
        ],
        earnings: {
          crossSiteDistribution: [{ site: 'Sri Lanka Telecom HQ', shifts: 24 }],
          dayTypeBreakdown: [
            { type: 'Normal Days', totalShifts: 20, rateMultiplier: '1.0x', lkrEarned: 36_600, dates: [] },
            {
              type: 'Sundays',
              totalShifts: 3,
              rateMultiplier: '1.5x',
              lkrEarned: 4_140,
              dates: [
                { date: '04 May 2026', shift: '06:00 – 18:00', premium: 1_380 },
                { date: '11 May 2026', shift: '06:00 – 18:00', premium: 1_380 },
                { date: '18 May 2026', shift: '06:00 – 18:00', premium: 1_380 },
              ],
            },
            {
              type: 'Poya Days',
              totalShifts: 1,
              rateMultiplier: '2.0x',
              lkrEarned: 2_760,
              dates: [{ date: '12 May 2026', shift: '06:00 – 18:00', premium: 2_760 }],
            },
            { type: 'Public Holidays', totalShifts: 0, rateMultiplier: '2.0x', lkrEarned: 0, dates: [] },
            { type: 'Saturdays', totalShifts: 0, rateMultiplier: '1.25x', lkrEarned: 0, dates: [] },
          ],
        },
      },
      {
        id: 'emp-006',
        empNumber: 'G-0162',
        name: 'Dilshan Gunasekara',
        rank: 'Assistant Security Officer',
        shiftsAtSite: 26,
        totalGross: 51_600,
        totalDeductions: 5_000,
        netTakeHome: 46_600,
        deductions: [
          {
            type: 'Advance',
            totalLiability: 25_000,
            installmentCurrent: 1,
            installmentTotal: 5,
            thisMonthAmount: 5_000,
          },
        ],
        earnings: {
          crossSiteDistribution: [
            { site: 'Sri Lanka Telecom HQ', shifts: 22 },
            { site: 'Lanka Hospitals Corporation', shifts: 4 },
          ],
          dayTypeBreakdown: [
            { type: 'Normal Days', totalShifts: 22, rateMultiplier: '1.0x', lkrEarned: 43_344, dates: [] },
            {
              type: 'Sundays',
              totalShifts: 4,
              rateMultiplier: '1.5x',
              lkrEarned: 6_448,
              dates: [
                { date: '04 May 2026', shift: '18:00 – 06:00', premium: 1_612 },
                { date: '11 May 2026', shift: '18:00 – 06:00', premium: 1_612 },
                { date: '18 May 2026', shift: '18:00 – 06:00', premium: 1_612 },
                { date: '25 May 2026', shift: '18:00 – 06:00', premium: 1_612 },
              ],
            },
            { type: 'Poya Days', totalShifts: 0, rateMultiplier: '2.0x', lkrEarned: 0, dates: [] },
            { type: 'Public Holidays', totalShifts: 0, rateMultiplier: '2.0x', lkrEarned: 0, dates: [] },
            { type: 'Saturdays', totalShifts: 0, rateMultiplier: '1.25x', lkrEarned: 0, dates: [] },
          ],
        },
      },
    ],
  },
  {
    id: 'site-003',
    name: 'John Keells Holdings Tower',
    location: 'Union Place, Colombo 02',
    clientBilled: 1_540_000,
    payrollCost: 1_102_600,
    smCashAllocation: 55_000,
    employees: [
      {
        id: 'emp-007',
        empNumber: 'G-0207',
        name: 'Lasantha Wickramasinghe',
        rank: 'Senior Security Officer',
        shiftsAtSite: 30,
        totalGross: 74_800,
        totalDeductions: 14_200,
        netTakeHome: 60_600,
        deductions: [
          {
            type: 'Advance',
            totalLiability: 40_000,
            installmentCurrent: 3,
            installmentTotal: 4,
            thisMonthAmount: 10_000,
          },
          {
            type: 'Penalty',
            totalLiability: 3_000,
            installmentCurrent: 1,
            installmentTotal: 1,
            thisMonthAmount: 3_000,
          },
          {
            type: 'Meals',
            totalLiability: 3_600,
            installmentCurrent: 2,
            installmentTotal: 3,
            thisMonthAmount: 1_200,
          },
        ],
        earnings: {
          crossSiteDistribution: [{ site: 'John Keells Holdings Tower', shifts: 30 }],
          dayTypeBreakdown: [
            { type: 'Normal Days', totalShifts: 24, rateMultiplier: '1.0x', lkrEarned: 59_840, dates: [] },
            {
              type: 'Sundays',
              totalShifts: 4,
              rateMultiplier: '1.5x',
              lkrEarned: 9_360,
              dates: [
                { date: '04 May 2026', shift: '06:00 – 18:00', premium: 2_340 },
                { date: '11 May 2026', shift: '06:00 – 18:00', premium: 2_340 },
                { date: '18 May 2026', shift: '06:00 – 18:00', premium: 2_340 },
                { date: '25 May 2026', shift: '06:00 – 18:00', premium: 2_340 },
              ],
            },
            {
              type: 'Poya Days',
              totalShifts: 1,
              rateMultiplier: '2.0x',
              lkrEarned: 4_680,
              dates: [{ date: '12 May 2026', shift: '06:00 – 18:00', premium: 4_680 }],
            },
            {
              type: 'Public Holidays',
              totalShifts: 1,
              rateMultiplier: '2.0x',
              lkrEarned: 4_680,
              dates: [{ date: '22 May 2026', shift: '06:00 – 18:00', premium: 4_680 }],
            },
            { type: 'Saturdays', totalShifts: 0, rateMultiplier: '1.25x', lkrEarned: 0, dates: [] },
          ],
        },
      },
      {
        id: 'emp-008',
        empNumber: 'G-0219',
        name: 'Kavindi Amarasinghe',
        rank: 'Security Officer',
        shiftsAtSite: 28,
        totalGross: 57_200,
        totalDeductions: 6_400,
        netTakeHome: 50_800,
        deductions: [
          {
            type: 'Uniform',
            totalLiability: 16_800,
            installmentCurrent: 4,
            installmentTotal: 12,
            thisMonthAmount: 1_400,
          },
          {
            type: 'Advance',
            totalLiability: 20_000,
            installmentCurrent: 2,
            installmentTotal: 4,
            thisMonthAmount: 5_000,
          },
        ],
        earnings: {
          crossSiteDistribution: [{ site: 'John Keells Holdings Tower', shifts: 28 }],
          dayTypeBreakdown: [
            { type: 'Normal Days', totalShifts: 24, rateMultiplier: '1.0x', lkrEarned: 48_973, dates: [] },
            {
              type: 'Sundays',
              totalShifts: 3,
              rateMultiplier: '1.5x',
              lkrEarned: 5_361,
              dates: [
                { date: '04 May 2026', shift: '18:00 – 06:00', premium: 1_787 },
                { date: '11 May 2026', shift: '18:00 – 06:00', premium: 1_787 },
                { date: '18 May 2026', shift: '18:00 – 06:00', premium: 1_787 },
              ],
            },
            {
              type: 'Poya Days',
              totalShifts: 1,
              rateMultiplier: '2.0x',
              lkrEarned: 3_575,
              dates: [{ date: '12 May 2026', shift: '18:00 – 06:00', premium: 3_575 }],
            },
            { type: 'Public Holidays', totalShifts: 0, rateMultiplier: '2.0x', lkrEarned: 0, dates: [] },
            { type: 'Saturdays', totalShifts: 0, rateMultiplier: '1.25x', lkrEarned: 0, dates: [] },
          ],
        },
      },
    ],
  },
  {
    id: 'site-004',
    name: 'Bank of Ceylon Head Office',
    location: 'BOC Square, Colombo 01',
    clientBilled: 624_000,
    payrollCost: 448_200,
    employees: [
      {
        id: 'emp-009',
        empNumber: 'G-0334',
        name: 'Tharaka Fernando',
        rank: 'Security Guard',
        shiftsAtSite: 22,
        totalGross: 41_800,
        totalDeductions: 1_700,
        netTakeHome: 40_100,
        deductions: [
          {
            type: 'Meals',
            totalLiability: 3_000,
            installmentCurrent: 3,
            installmentTotal: 3,
            thisMonthAmount: 1_000,
          },
          {
            type: 'Uniform',
            totalLiability: 5_600,
            installmentCurrent: 6,
            installmentTotal: 12,
            thisMonthAmount: 700,
          },
        ],
        earnings: {
          crossSiteDistribution: [
            { site: 'Bank of Ceylon Head Office', shifts: 18 },
            { site: 'Lanka Hospitals Corporation', shifts: 4 },
          ],
          dayTypeBreakdown: [
            { type: 'Normal Days', totalShifts: 20, rateMultiplier: '1.0x', lkrEarned: 38_188, dates: [] },
            {
              type: 'Sundays',
              totalShifts: 2,
              rateMultiplier: '1.5x',
              lkrEarned: 2_612,
              dates: [
                { date: '11 May 2026', shift: '06:00 – 18:00', premium: 1_306 },
                { date: '25 May 2026', shift: '06:00 – 18:00', premium: 1_306 },
              ],
            },
            { type: 'Poya Days', totalShifts: 0, rateMultiplier: '2.0x', lkrEarned: 0, dates: [] },
            { type: 'Public Holidays', totalShifts: 0, rateMultiplier: '2.0x', lkrEarned: 0, dates: [] },
            { type: 'Saturdays', totalShifts: 0, rateMultiplier: '1.25x', lkrEarned: 0, dates: [] },
          ],
        },
      },
    ],
  },
  {
    id: 'site-005',
    name: 'Dialog Axiata HQ',
    location: 'Galle Road, Colombo 03',
    clientBilled: 980_000,
    payrollCost: 712_400,
    employees: [
      {
        id: 'emp-010',
        empNumber: 'G-0411',
        name: 'Sampath Dissanayake',
        rank: 'Senior Security Officer',
        shiftsAtSite: 28,
        totalGross: 71_400,
        totalDeductions: 7_100,
        netTakeHome: 64_300,
        deductions: [
          {
            type: 'Advance',
            totalLiability: 30_000,
            installmentCurrent: 1,
            installmentTotal: 6,
            thisMonthAmount: 5_000,
          },
          {
            type: 'Meals',
            totalLiability: 2_100,
            installmentCurrent: 1,
            installmentTotal: 1,
            thisMonthAmount: 2_100,
          },
        ],
        earnings: {
          crossSiteDistribution: [{ site: 'Dialog Axiata HQ', shifts: 28 }],
          dayTypeBreakdown: [
            { type: 'Normal Days', totalShifts: 23, rateMultiplier: '1.0x', lkrEarned: 58_477, dates: [] },
            {
              type: 'Sundays',
              totalShifts: 3,
              rateMultiplier: '1.5x',
              lkrEarned: 6_693,
              dates: [
                { date: '04 May 2026', shift: '06:00 – 18:00', premium: 2_231 },
                { date: '18 May 2026', shift: '06:00 – 18:00', premium: 2_231 },
                { date: '25 May 2026', shift: '06:00 – 18:00', premium: 2_231 },
              ],
            },
            {
              type: 'Poya Days',
              totalShifts: 1,
              rateMultiplier: '2.0x',
              lkrEarned: 4_462,
              dates: [{ date: '12 May 2026', shift: '06:00 – 18:00', premium: 4_462 }],
            },
            {
              type: 'Public Holidays',
              totalShifts: 1,
              rateMultiplier: '2.0x',
              lkrEarned: 4_462,
              dates: [{ date: '22 May 2026', shift: '06:00 – 18:00', premium: 4_462 }],
            },
            { type: 'Saturdays', totalShifts: 0, rateMultiplier: '1.25x', lkrEarned: 0, dates: [] },
          ],
        },
      },
      {
        id: 'emp-011',
        empNumber: 'G-0428',
        name: 'Iresha Kumari',
        rank: 'Security Officer',
        shiftsAtSite: 24,
        totalGross: 52_800,
        totalDeductions: 3_900,
        netTakeHome: 48_900,
        deductions: [
          {
            type: 'Uniform',
            totalLiability: 14_000,
            installmentCurrent: 2,
            installmentTotal: 10,
            thisMonthAmount: 1_400,
          },
          {
            type: 'Penalty',
            totalLiability: 2_500,
            installmentCurrent: 1,
            installmentTotal: 1,
            thisMonthAmount: 2_500,
          },
        ],
        earnings: {
          crossSiteDistribution: [{ site: 'Dialog Axiata HQ', shifts: 24 }],
          dayTypeBreakdown: [
            { type: 'Normal Days', totalShifts: 20, rateMultiplier: '1.0x', lkrEarned: 44_000, dates: [] },
            {
              type: 'Sundays',
              totalShifts: 3,
              rateMultiplier: '1.5x',
              lkrEarned: 4_950,
              dates: [
                { date: '04 May 2026', shift: '18:00 – 06:00', premium: 1_650 },
                { date: '11 May 2026', shift: '18:00 – 06:00', premium: 1_650 },
                { date: '25 May 2026', shift: '18:00 – 06:00', premium: 1_650 },
              ],
            },
            {
              type: 'Poya Days',
              totalShifts: 1,
              rateMultiplier: '2.0x',
              lkrEarned: 3_300,
              dates: [{ date: '12 May 2026', shift: '18:00 – 06:00', premium: 3_300 }],
            },
            { type: 'Public Holidays', totalShifts: 0, rateMultiplier: '2.0x', lkrEarned: 0, dates: [] },
            { type: 'Saturdays', totalShifts: 0, rateMultiplier: '1.25x', lkrEarned: 0, dates: [] },
          ],
        },
      },
    ],
  },
];

/** Portfolio mock seeds — shared with FM Payroll Employee Register (`/fm/roster`). */
export { MOCK_PINNED_GROUP_SITES_SEED, MOCK_SITES_SEED };

type EmployeeSeed = Omit<
  Employee,
  'recordedShiftsAtSite' | 'fmShiftDelta' | 'shiftAuditLog'
>;

type SiteSeed = Omit<Site, 'employees'> & { employees: EmployeeSeed[] };

function initializeShiftState(seed: SiteSeed[]): Site[] {
  return seed.map((site) => ({
    ...site,
    employees: site.employees.map((emp) => {
      const base: Employee = {
        ...emp,
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

const DEDUCTION_COLOR: Record<DeductionEntry['type'], string> = {
  Meals: 'bg-orange-50 text-orange-700 ring-1 ring-orange-200',
  Uniform: 'bg-violet-50 text-violet-700 ring-1 ring-violet-200',
  Penalty: 'bg-red-50 text-red-700 ring-1 ring-red-200',
  Advance: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
};

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

// ─── Deductions Audit Modal ───────────────────────────────────────────────────

function DeductionsModal({
  employee,
  onClose,
}: {
  employee: Employee;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-2xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">

        {/* Modal header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-red-200 bg-red-50">
              <Receipt className="h-4 w-4 text-red-600" />
            </div>
            <div>
              <p className="text-sm font-black text-slate-900">Deductions Audit</p>
              <p className="text-[11px] text-slate-500">
                {employee.name} · {employee.empNumber}
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

        <div className="border-b border-slate-200 bg-slate-50 px-6 py-5">
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
              Gross Salary
            </p>
            <p className="mt-1 font-mono text-base font-black text-slate-900">
              {lkr(employee.totalGross)}
            </p>
          </div>
        </div>

        {/* Active deductions table */}
        <div className="px-6 py-4">
          <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-slate-400">
            Active Deduction Schedule
          </p>
          {employee.deductions.length === 0 ? (
            <p className="rounded-xl border border-slate-100 bg-slate-50 py-8 text-center text-sm text-slate-400">
              No active deductions for this period.
            </p>
          ) : (
            <div className="overflow-hidden rounded-xl border border-slate-200">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50">
                    <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-slate-400">
                      Type
                    </th>
                    <th className="px-4 py-3 text-right text-[10px] font-bold uppercase tracking-widest text-slate-400">
                      Total Liability
                    </th>
                    <th className="px-4 py-3 text-center text-[10px] font-bold uppercase tracking-widest text-slate-400">
                      Instalment Plan
                    </th>
                    <th className="px-4 py-3 text-right text-[10px] font-bold uppercase tracking-widest text-slate-400">
                      This Month
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {employee.deductions.map((d, i) => (
                    <tr key={i} className="transition-colors hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center rounded-md px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ${DEDUCTION_COLOR[d.type]}`}
                        >
                          {d.type}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-xs font-semibold text-slate-700">
                        {lkr(d.totalLiability)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold text-slate-600">
                          Month {d.installmentCurrent} of {d.installmentTotal}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-xs font-black text-red-600">
                        − {lkr(d.thisMonthAmount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-slate-200 bg-red-50">
                    <td
                      colSpan={3}
                      className="px-4 py-3 text-right text-[11px] font-bold uppercase tracking-widest text-red-600"
                    >
                      Total Deducted This Month
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-sm font-black text-red-700">
                      − {lkr(employee.totalDeductions)}
                    </td>
                  </tr>
                  <tr className="border-t border-slate-100 bg-emerald-50">
                    <td
                      colSpan={3}
                      className="px-4 py-3 text-right text-[11px] font-bold uppercase tracking-widest text-emerald-700"
                    >
                      Net Take-Home
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-sm font-black text-emerald-800">
                      {lkr(employee.netTakeHome)}
                    </td>
                  </tr>
                </tfoot>
              </table>
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

// ─── Earnings Breakdown Modal ─────────────────────────────────────────────────

function EarningsModal({
  employee,
  siteName,
  onClose,
  onShiftAdjust,
  payrollLocked,
}: {
  employee: Employee;
  siteName: string;
  onClose: () => void;
  onShiftAdjust: (delta: number, note: string) => void;
  payrollLocked: boolean;
}) {
  const [openDayType, setOpenDayType] = useState<string | null>(null);
  const guardField = isGuardFieldEarnings(employee.earnings);
  const cafeOtRate = employee.earnings.cafeData
    ? cafeOtHourlyRateLkr(employee.earnings.cafeData.monthlyBasicLkr)
    : 0;

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
          {guardField && (
            <ShiftAdjustmentsPanel
              employee={employee}
              siteName={siteName}
              onAdjust={onShiftAdjust}
              disabled={payrollLocked}
            />
          )}

          {/* Cross-Site Distribution */}
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
                          <span className="text-slate-400">
                            {employee.earnings.hoFixedData
                              ? '— (fixed salary)'
                              : employee.earnings.smPayData
                                ? '— (visit pay)'
                                : employee.earnings.cafeData
                                  ? '— (café days)'
                                  : '—'}
                          </span>
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

          {employee.earnings.hoFixedData && (
            <div className="border-b border-slate-100 px-6 py-5">
              <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-indigo-700">
                CVS / Head Office — Fixed Salary
              </p>
              <div className="overflow-hidden rounded-xl border border-indigo-200/80 bg-indigo-50/30">
                <table className="w-full text-sm">
                  <tbody className="divide-y divide-indigo-100/80">
                    <tr>
                      <td className="px-4 py-3 text-xs font-semibold text-slate-600">
                        Base salary (MNR)
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-xs font-black text-slate-900">
                        {lkr(employee.earnings.hoFixedData.mnrBaseSalaryLkr)}
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
                CVS / HO pay is the fixed amount recorded in {FM_MNR_SALARY_SOURCE} on each employee
                profile — not the rank pay matrix, guard statutory day-types, or café OT rules.
              </p>
            </div>
          )}

          {employee.earnings.smPayData && (
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
                        {smPayModeLabel(employee.earnings.smPayData.payMode)}
                      </td>
                    </tr>
                    <tr>
                      <td className="px-4 py-3 text-xs font-semibold text-slate-600">Visits logged / target</td>
                      <td className="px-4 py-3 text-right font-mono text-xs font-bold text-slate-900">
                        {employee.earnings.smPayData.visitsCompleted} /{' '}
                        {employee.earnings.smPayData.visitsTarget}
                      </td>
                    </tr>
                    {employee.earnings.smPayData.fixedBasicLkr > 0 && (
                      <tr>
                        <td className="px-4 py-3 text-xs font-semibold text-slate-600">Fixed basic</td>
                        <td className="px-4 py-3 text-right font-mono text-xs font-black text-slate-900">
                          {lkr(employee.earnings.smPayData.fixedBasicLkr)}
                        </td>
                      </tr>
                    )}
                    {employee.earnings.smPayData.visitPayLkr > 0 && (
                      <tr className="bg-sky-50/50">
                        <td className="px-4 py-3">
                          <span className="text-xs font-semibold text-sky-900">Visit pay</span>
                          <span className="mt-0.5 block text-[10px] font-medium text-sky-800/90">
                            {employee.earnings.smPayData.visitsCompleted} visit
                            {employee.earnings.smPayData.visitsCompleted !== 1 ? 's' : ''} ×{' '}
                            {lkr(employee.earnings.smPayData.perVisitRateLkr)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-xs font-black text-sky-900">
                          {lkr(employee.earnings.smPayData.visitPayLkr)}
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
                SM payroll follows FM Settings visit rules — not billed on guard shift statutory lines.
              </p>
            </div>
          )}

          {employee.earnings.cafeData && (
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
                        {lkr(employee.earnings.cafeData.monthlyBasicLkr)}
                      </td>
                    </tr>
                    <tr>
                      <td className="px-4 py-3 text-xs font-semibold text-slate-600">
                        Daily rate (B ÷ 26)
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-xs font-bold text-slate-800">
                        {lkr(
                          Math.round(
                            employee.earnings.cafeData.monthlyBasicLkr / 26,
                          ),
                        )}
                      </td>
                    </tr>
                    <tr>
                      <td className="px-4 py-3 text-xs font-semibold text-slate-600">Days worked</td>
                      <td className="px-4 py-3 text-right font-mono text-xs font-bold text-slate-900">
                        {employee.earnings.cafeData.daysWorked}
                      </td>
                    </tr>
                    <tr>
                      <td className="px-4 py-3 text-xs font-semibold text-slate-600">
                        Base pay (days × B/26)
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-xs font-black text-slate-900">
                        {lkr(employee.earnings.cafeData.basePayLkr)}
                      </td>
                    </tr>
                    <tr className="bg-violet-50/50">
                      <td className="px-4 py-3">
                        <span className="text-xs font-semibold text-violet-900">Overtime</span>
                        <span className="mt-0.5 block text-[10px] font-medium text-violet-700/90">
                          {employee.earnings.cafeData.totalOT} hr
                          {employee.earnings.cafeData.totalOT !== 1 ? 's' : ''} × {lkr(cafeOtRate)}
                          /hr · (B/26/9)×1.5
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-xs font-black text-violet-900">
                        {lkr(employee.earnings.cafeData.otPayLkr)}
                      </td>
                    </tr>
                    <tr className="bg-white/60">
                      <td className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-emerald-700">
                        Total gross
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-sm font-black text-emerald-700">
                        {lkr(
                          employee.earnings.cafeData.basePayLkr +
                            employee.earnings.cafeData.otPayLkr,
                        )}
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

// ─── Site Row ─────────────────────────────────────────────────────────────────

function SiteRow({
  site,
  onShiftAdjust,
  payrollLocked,
  periodLabel,
  isLivePeriod,
  portfolioScale,
  pinned = false,
}: {
  site: Site;
  onShiftAdjust: (
    employeeId: string,
    delta: number,
    note: string,
  ) => Employee | undefined;
  payrollLocked: boolean;
  periodLabel: string;
  isLivePeriod: boolean;
  portfolioScale: number;
  pinned?: boolean;
}) {
  const stale = !isLivePeriod;
  const rosterLocked = payrollLocked || stale;
  const scaledPayrollCost = Math.round(site.payrollCost * portfolioScale);
  const scaledClientBilled = Math.round(site.clientBilled * portfolioScale);
  const [expanded, setExpanded] = useState(false);
  const [deductionsTarget, setDeductionsTarget] = useState<Employee | null>(null);
  const [earningsTarget, setEarningsTarget] = useState<Employee | null>(null);

  const isSmGroup = site.payrollGroup === 'sm';
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
  const billedMetric = isSmGroup ? totalVisitsLogged : totalShiftsBilled;
  const billedMetricLabel = isSmGroup ? 'Visits Logged' : 'Shifts Billed';
  const margin = scaledClientBilled - scaledPayrollCost;
  const marginPctSite =
    scaledClientBilled > 0 ? ((margin / scaledClientBilled) * 100).toFixed(1) : '0.0';
  const payrollCostClass = 'text-slate-800';
  const marginAmountClass = 'text-emerald-700';
  const employeeCount = site.displayEmployeeCount ?? site.employees.length;
  const groupAccent =
    site.payrollGroup === 'cafe'
      ? 'border-violet-200/80 ring-violet-100/80'
      : site.payrollGroup === 'sm'
        ? 'border-sky-200/80 ring-sky-100/80'
        : site.payrollGroup === 'ho'
          ? 'border-indigo-200/80 ring-indigo-100/80'
          : 'border-slate-200';

  return (
    <>
      {deductionsTarget && (
        <DeductionsModal employee={deductionsTarget} onClose={() => setDeductionsTarget(null)} />
      )}
      {earningsTarget && (
        <EarningsModal
          employee={earningsTarget}
          siteName={site.name}
          onClose={() => setEarningsTarget(null)}
          payrollLocked={rosterLocked}
          onShiftAdjust={(delta, note) => {
            const updated = onShiftAdjust(earningsTarget.id, delta, note);
            if (updated) setEarningsTarget(updated);
          }}
        />
      )}

      <div
        className={`overflow-hidden rounded-2xl border bg-white shadow-sm ${
          pinned ? `ring-1 ${groupAccent}` : 'border-slate-200'
        }`}
      >

        {/* Site header button */}
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex w-full items-center gap-4 px-6 py-4 text-left transition-colors hover:bg-slate-50"
        >
          {/* Expand icon */}
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

          {/* Site identity */}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-black tracking-tight text-slate-900">{site.name}</p>
              {pinned && (
                <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-[9px] font-black uppercase tracking-widest text-slate-600">
                  <Pin className="h-2.5 w-2.5" />
                  Payroll group
                </span>
              )}
            </div>
            <p className="mt-0.5 text-[11px] text-slate-400">{site.location}</p>
          </div>

          {/* KPI columns (desktop) */}
          <div className="hidden items-center gap-8 md:flex">
            <div className="text-right">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                {billedMetricLabel}
              </p>
              <p className="mt-0.5 font-mono text-xs font-bold text-slate-800">{billedMetric}</p>
            </div>
            <div className="text-right">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                Payroll Cost
              </p>
              <p className={`mt-0.5 font-mono text-xs font-bold ${payrollCostClass}`}>
                {lkr(scaledPayrollCost)}
              </p>
            </div>
            <div className="text-right">
              <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-500">
                Site Earnings
              </p>
              <p className={`mt-0.5 font-mono text-xs font-black ${marginAmountClass}`}>
                {lkr(margin)}
              </p>
              <p className="text-[10px] font-bold text-emerald-500">{marginPctSite}%</p>
            </div>
          </div>

          {/* Employee count */}
          <div className="ml-2 flex-shrink-0">
            <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-600">
              <Users className="h-3 w-3" />
              {employeeCount}
            </span>
          </div>
        </button>

        {/* Mobile KPI strip */}
        <div className="grid grid-cols-3 divide-x divide-slate-100 border-t border-slate-100 bg-slate-50 px-4 py-2 md:hidden">
          <div className="pr-3">
            <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">
              {isSmGroup ? 'Visits' : 'Shifts'}
            </p>
            <p className="mt-0.5 font-mono text-[11px] font-bold text-slate-800">{billedMetric}</p>
          </div>
          <div className="px-3">
            <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Cost</p>
            <p className="mt-0.5 font-mono text-[11px] font-bold text-slate-800">
              {lkr(scaledPayrollCost)}
            </p>
          </div>
          <div className="pl-3">
            <p className="text-[9px] font-bold uppercase tracking-widest text-emerald-500">
              Margin
            </p>
            <p className="mt-0.5 font-mono text-[11px] font-black text-emerald-700">
              {lkr(margin)}
            </p>
          </div>
        </div>

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
            <div className="overflow-x-auto">
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
                        {emp.earnings.smPayData ? (
                          <span className="font-mono text-[11px] font-bold text-sky-800">
                            {emp.earnings.smPayData.visitsCompleted} visits
                          </span>
                        ) : emp.earnings.hoFixedData ? (
                          <span className="font-mono text-[11px] font-bold text-indigo-800">
                            Fixed
                          </span>
                        ) : emp.earnings.cafeData ? (
                          <span className="font-mono text-[11px] font-bold text-violet-800">
                            {emp.earnings.cafeData.daysWorked} days
                          </span>
                        ) : emp.recordedShiftsAtSite === 0 && emp.shiftsAtSite === 0 ? (
                          <span className="font-mono text-[11px] text-slate-400">—</span>
                        ) : (
                          <ShiftAtSiteCell employee={emp} />
                        )}
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
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-1.5">
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

export default function FMPortalPage() {
  const [pinnedSites, setPinnedSites] = useState<Site[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [portfolioLoading, setPortfolioLoading] = useState(true);
  const [portfolioError, setPortfolioError] = useState<string | null>(null);
  const [payrollPeriod, setPayrollPeriod] = useState(FM_LIVE_PAYROLL_PERIOD);
  const [activeReport, setActiveReport] = useState<FmPortfolioReportKind | null>(null);
  const [workflowStatus, setWorkflowStatus] = useState<PayrollWorkflowStatus>(() =>
    getGroupWorkflow('security').status,
  );
  const [hqDeductionsLocked, setHqDeductionsLocked] = useState(true);

  const isLivePeriod = isLivePayrollPeriod(payrollPeriod);
  const livePayrollMonth = payrollMonthFromFmPeriod(FM_LIVE_PAYROLL_PERIOD);

  const refreshHqDeductionLock = useCallback(async () => {
    if (!isLivePayrollPeriod(payrollPeriod)) {
      setHqDeductionsLocked(true);
      return;
    }
    const status = await getDeductionMonthLockStatus(livePayrollMonth);
    const clientLockedAt =
      !status.locked && (status.isDemo || !status.tableReady)
        ? getClientDeductionMonthLockedAt(status.payrollMonth)
        : null;
    setHqDeductionsLocked(Boolean(status.locked || clientLockedAt));
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
    void getFmPortfolio(payrollPeriod).then((payload) => {
      if (cancelled) return;
      if (payload.error) {
        setPortfolioError(payload.error);
        setPinnedSites(initializeShiftState(MOCK_PINNED_GROUP_SITES_SEED));
        setSites(initializeShiftState(MOCK_SITES_SEED));
      } else {
        setPortfolioError(null);
        setPinnedSites(
          mergePortfolioAdjustments(
            initializeShiftState(payload.pinnedSites as SiteSeed[]),
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
      setPortfolioLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [payrollPeriod]);

  useEffect(() => subscribePayrollWorkflow(() => {
    setWorkflowStatus(getGroupWorkflow('security').status);
  }), []);

  useEffect(() => {
    void refreshHqDeductionLock();
    return subscribeDeductionMonthLock(() => void refreshHqDeductionLock());
  }, [refreshHqDeductionLock]);

  const payrollLocked = workflowStatus !== 'DRAFT';
  const payrollMdApproved = workflowStatus === 'APPROVED';

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

    if (siteId === 'group-cvs' || siteId === 'group-cvs-sm' || siteId === 'group-cafe') {
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

  // Simulate holiday calendar coverage check (in production this would read from DB)
  // Incomplete = poya/statutory dates not configured at least 1 year ahead
  const holidayCalendarIncomplete = true;

  const rosterCount =
    pinnedSites.reduce((s, site) => s + (site.displayEmployeeCount ?? site.employees.length), 0) +
    sites.reduce((s, site) => s + site.employees.length, 0);

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Dot-grid texture */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-0 opacity-25"
        style={{
          backgroundImage: 'radial-gradient(rgb(148 163 184 / 0.5) 1px, transparent 1px)',
          backgroundSize: '20px 20px',
        }}
      />

      <div className="relative z-10 mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">

        <FmSubnav holidayCalendarIncomplete={holidayCalendarIncomplete} />

        {/* ── Page Header ──────────────────────────────────────────────────── */}
        <div className="mb-8">
          <div className="mb-3 flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-blue-200 bg-blue-50">
              <DollarSign className="h-4 w-4 text-blue-700" />
            </div>
            <span className="text-[10px] font-bold uppercase tracking-widest text-blue-600">
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
                <span className="text-[10px] font-semibold text-blue-700">Loading live portfolio…</span>
              </div>
            )}
            {portfolioError && !portfolioLoading && (
              <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 shadow-sm">
                <span className="text-[10px] font-semibold text-amber-800">
                  Live data unavailable — showing fallback roster
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
            {isLivePeriod && !hqDeductionsLocked && (
              <Link
                href="/fm/batch"
                className="flex items-center gap-2 rounded-lg border border-violet-300 bg-violet-50 px-3 py-2 shadow-sm transition-colors hover:bg-violet-100/80"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-violet-500" />
                <span className="text-[10px] font-bold uppercase tracking-widest text-violet-900">
                  Deductions pending HQ lock
                </span>
              </Link>
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
        </div>

        <FmLedgerSummaryCards period={payrollPeriod} onOpenReport={setActiveReport} />

        {activeReport && (
          <FmPortfolioReportModal
            kind={activeReport}
            sites={sites}
            workflowStatus={workflowStatus}
            periodLabel={periodLabel}
            isLivePeriod={isLivePeriod}
            onClose={() => setActiveReport(null)}
          />
        )}

        {/* ── Site-by-Site Payroll Ledger ───────────────────────────────────── */}
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
              Site-by-Site Payroll Ledger
            </p>
            <p className="mt-0.5 text-[10px] font-semibold text-slate-500">
              Pinned payroll groups (CVS · CVS SM · Café) · client guard sites below
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <ChevronRight className="h-3 w-3 text-slate-400" />
            <span className="text-[10px] text-slate-400">Click any row to expand roster</span>
          </div>
        </div>

        <div className="sticky top-0 z-20 mb-4 space-y-3 border-b border-slate-200/70 bg-slate-50/95 pb-4 pt-1 backdrop-blur-md">
          {pinnedSites.map((site) => (
            <SiteRow
              key={site.id}
              site={site}
              pinned
              payrollLocked={payrollLocked}
              periodLabel={periodLabel}
              isLivePeriod={isLivePeriod}
              portfolioScale={portfolioScale}
              onShiftAdjust={(employeeId, delta, note) =>
                handleShiftAdjust(site.id, employeeId, delta, note)
              }
            />
          ))}
        </div>

        <div className="space-y-3">
          {sites.map((site) => (
            <SiteRow
              key={site.id}
              site={site}
              payrollLocked={payrollLocked}
              periodLabel={periodLabel}
              isLivePeriod={isLivePeriod}
              portfolioScale={portfolioScale}
              onShiftAdjust={(employeeId, delta, note) =>
                handleShiftAdjust(site.id, employeeId, delta, note)
              }
            />
          ))}
        </div>
      </div>
    </div>
  );
}
