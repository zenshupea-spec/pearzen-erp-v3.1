'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  TrendingUp,
  TrendingDown,
  Activity,
  Settings,
  FileText,
  Grid3x3,
  Building2,
  Coffee,
  Home,
  AlertTriangle,
  BarChart3,
  Users,
  UserX,
  CheckCircle2,
  XCircle,
  Lock,
  Banknote,
  ShieldAlert,
  ArrowRight,
  BadgeAlert,
  CircleDot,
  ChevronDown,
  Siren,
  UserMinus,
} from 'lucide-react';
import { ExecutiveGlassCard } from '../../../components/executive/ExecutiveVaultShell';

// ─── Types ──────────────────────────────────────────────────────────────────

type CompanyKey = 'security' | 'cafe' | 'bnb';

interface BreakdownItem {
  label: string;
  value: number;
  sub?: string;
}

interface CompanyData {
  grossRevenue: number;
  grossLiabilities: number;
  netEbitda: number;
  targetInvoices: number;
  actualInvoices: number;
  cashReceived: number;
  upcomingPayroll: number;
  revenueBreakdown: BreakdownItem[];
  liabilityBreakdown: BreakdownItem[];
  ebitdaBreakdown: BreakdownItem[];
}

// ─── Static demo data ────────────────────────────────────────────────────────

const DEMO: Record<CompanyKey, CompanyData> = {
  security: {
    grossRevenue:    4_820_000,
    grossLiabilities: 3_210_000,
    netEbitda:       1_610_000,
    targetInvoices:  5_200_000,
    actualInvoices:  4_820_000,
    cashReceived:    3_650_000,
    upcomingPayroll: 2_900_000,
    revenueBreakdown: [
      { label: 'Security Invoicing',      value: 4_200_000 },
      { label: 'Client Visit Charges',    value:   420_000 },
      { label: 'Cafe POS Sales',          value:         0 },
      { label: 'Residence Rental Income', value:   200_000 },
    ],
    liabilityBreakdown: [
      { label: 'Guard Base Payroll',                                       value: 2_450_000 },
      { label: 'Statutory EPF (12%) & ETF (3%)', sub: 'Employer contribution liability', value: 269_500 },
      { label: 'HQ & Executive Payroll',       value:   340_500 },
      { label: 'Cleared OPEX & Vendor Bills',  value:   150_000 },
    ],
    ebitdaBreakdown: [
      { label: 'Security Division Margin', value: 1_350_000 },
      { label: 'Cafe Division Margin',     value:   170_000 },
      { label: 'Real Estate Margin',       value:    90_000 },
    ],
  },
  cafe: {
    grossRevenue:     680_000,
    grossLiabilities: 510_000,
    netEbitda:        170_000,
    targetInvoices:   720_000,
    actualInvoices:   680_000,
    cashReceived:     540_000,
    upcomingPayroll:  430_000,
    revenueBreakdown: [
      { label: 'Security Invoicing',      value:       0 },
      { label: 'Client Visit Charges',    value:  80_000 },
      { label: 'Cafe POS Sales',          value: 600_000 },
      { label: 'Residence Rental Income', value:       0 },
    ],
    liabilityBreakdown: [
      { label: 'Guard Base Payroll',                                       value:       0 },
      { label: 'Statutory EPF (12%) & ETF (3%)', sub: 'Employer contribution liability', value: 32_000 },
      { label: 'HQ & Executive Payroll',       value: 118_000 },
      { label: 'Cleared OPEX & Vendor Bills',  value: 360_000 },
    ],
    ebitdaBreakdown: [
      { label: 'Security Division Margin', value:       0 },
      { label: 'Cafe Division Margin',     value: 170_000 },
      { label: 'Real Estate Margin',       value:       0 },
    ],
  },
  bnb: {
    grossRevenue:     390_000,
    grossLiabilities: 210_000,
    netEbitda:        180_000,
    targetInvoices:   420_000,
    actualInvoices:   390_000,
    cashReceived:     310_000,
    upcomingPayroll:  170_000,
    revenueBreakdown: [
      { label: 'Security Invoicing',      value:       0 },
      { label: 'Client Visit Charges',    value:       0 },
      { label: 'Cafe POS Sales',          value:       0 },
      { label: 'Residence Rental Income', value: 390_000 },
    ],
    liabilityBreakdown: [
      { label: 'Guard Base Payroll',                                       value:       0 },
      { label: 'Statutory EPF (12%) & ETF (3%)', sub: 'Employer contribution liability', value: 0 },
      { label: 'HQ & Executive Payroll',       value:  85_000 },
      { label: 'Cleared OPEX & Vendor Bills',  value: 125_000 },
    ],
    ebitdaBreakdown: [
      { label: 'Security Division Margin', value:       0 },
      { label: 'Cafe Division Margin',     value:       0 },
      { label: 'Real Estate Margin',       value: 180_000 },
    ],
  },
};

const COMPANIES: { key: CompanyKey; label: string; short: string; Icon: React.ElementType }[] = [
  { key: 'security', label: 'Classic Venture Security', short: 'Security', Icon: Building2 },
  { key: 'cafe',     label: 'Cafe Tasha',         short: 'Cafe',     Icon: Coffee    },
  { key: 'bnb',      label: 'Shalom Residence',   short: 'Shalom',   Icon: Home      },
];

const MONTH_LABELS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

const NAV_MODULES = [
  { href: '/executive/settings', label: 'Dynamic Settings',    Icon: Settings, accent: 'indigo' },
  { href: '/executive/matrix',   label: 'Compensation Matrix', Icon: Grid3x3,  accent: 'emerald' },
  { href: '/executive/audit',    label: 'Universal Audit Log', Icon: FileText, accent: 'rose'    },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function lkr(n: number) {
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 1_000_000) return `${sign}LKR ${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000)     return `${sign}LKR ${(abs / 1_000).toFixed(1)}K`;
  return `${sign}LKR ${abs.toLocaleString()}`;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function CompanyToggle({ active, onChange }: { active: CompanyKey; onChange: (k: CompanyKey) => void }) {
  return (
    <div className="flex items-center gap-1 rounded-2xl border border-white/70 bg-white/50 p-1 shadow-inner backdrop-blur-xl">
      {COMPANIES.map(({ key, short, Icon }) => (
        <button
          key={key}
          type="button"
          onClick={() => onChange(key)}
          className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold uppercase tracking-wider transition-all ${
            active === key
              ? 'bg-white shadow-md text-slate-900 ring-1 ring-slate-900/10'
              : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          <Icon className="h-3.5 w-3.5" />
          {short}
        </button>
      ))}
    </div>
  );
}

function ExpandablePerfCard({
  label,
  value,
  sub,
  trend,
  accent,
  breakdown,
  isOpen,
  onToggle,
}: {
  label: string;
  value: string;
  sub: string;
  trend: 'up' | 'down' | 'neutral';
  accent: 'emerald' | 'rose' | 'indigo';
  breakdown: BreakdownItem[];
  isOpen: boolean;
  onToggle: () => void;
}) {
  const open = isOpen;

  const gradients = {
    emerald: 'from-white/70 to-emerald-50/60',
    rose:    'from-white/70 to-rose-50/60',
    indigo:  'from-white/70 to-indigo-50/60',
  };
  const dots = {
    emerald: 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.85)]',
    rose:    'bg-rose-500    shadow-[0_0_10px_rgba(244,63,94,0.8)]',
    indigo:  'bg-indigo-500  shadow-[0_0_10px_rgba(99,102,241,0.8)]',
  };
  const barColors = {
    emerald: 'bg-emerald-500',
    rose:    'bg-rose-500',
    indigo:  'bg-indigo-500',
  };
  const dividerColors = {
    emerald: 'divide-emerald-100/80 border-emerald-100/80',
    rose:    'divide-rose-100/80    border-rose-100/80',
    indigo:  'divide-indigo-100/80  border-indigo-100/80',
  };

  const total = breakdown.reduce((s, b) => s + b.value, 0);

  return (
    <ExecutiveGlassCard className={`bg-gradient-to-br ${gradients[accent]} overflow-hidden`}>
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full flex-col gap-0 p-5 text-left"
      >
        <div className="flex items-start justify-between">
          <span className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-slate-600">
            <span className={`inline-block h-1.5 w-1.5 rounded-full ${dots[accent]}`} />
            {label}
          </span>
          <div className="flex items-center gap-1.5">
            {trend === 'up'      && <TrendingUp  className="h-4 w-4 text-emerald-600" />}
            {trend === 'down'    && <TrendingDown className="h-4 w-4 text-rose-600" />}
            {trend === 'neutral' && <Activity    className="h-4 w-4 text-slate-400" />}
            <ChevronDown
              className={`h-3.5 w-3.5 text-slate-400 transition-transform duration-300 ${open ? 'rotate-180' : ''}`}
            />
          </div>
        </div>
        <p className="mt-3 text-2xl font-black tabular-nums tracking-tight text-slate-900">{value}</p>
        <p className={`mt-1 text-xs font-semibold ${trend === 'up' ? 'text-emerald-700' : trend === 'down' ? 'text-rose-700' : 'text-slate-500'}`}>
          {sub}
        </p>
      </button>

      <div className={`grid transition-all duration-300 ease-in-out ${open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
        <div className="overflow-hidden">
          <div className={`border-t ${dividerColors[accent]} divide-y`}>
            {breakdown.map((item) => {
              const pct = total > 0 ? Math.round((item.value / total) * 100) : 0;
              return (
                <div key={item.label} className="px-5 py-2.5">
                  <div className="mb-1.5 flex items-center justify-between">
                    <div>
                      <span className="text-[10px] font-semibold text-slate-600">{item.label}</span>
                      {item.sub && (
                        <p className="text-[9px] font-medium text-slate-400">{item.sub}</p>
                      )}
                    </div>
                    <span className="font-mono text-[10px] font-black tabular-nums text-slate-800">
                      {item.value === 0 ? '—' : lkr(item.value)}
                    </span>
                  </div>
                  <div className="h-1 w-full overflow-hidden rounded-full bg-slate-200/60">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${barColors[accent]} ${item.value === 0 ? 'opacity-0' : ''}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  {item.value > 0 && (
                    <p className="mt-0.5 text-right text-[9px] font-bold text-slate-400">{pct}%</p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </ExecutiveGlassCard>
  );
}

// ─── Live Operations Radar ─────────────────────────────────────────────────────

interface OpsKpi {
  Icon: React.ElementType;
  label: string;
  value: number;
  subtext: string;
  accent: 'rose' | 'amber' | 'orange';
}

const OPS_KPIS: OpsKpi[] = [
  {
    Icon: UserMinus,
    label: 'Active Guard Deficits',
    value: 12,
    subtext: 'Requires immediate OM triage',
    accent: 'rose',
  },
  {
    Icon: Siren,
    label: 'Unresolved Field Incidents',
    value: 3,
    subtext: 'Awaiting MD/OD Acknowledgement',
    accent: 'amber',
  },
  {
    Icon: ShieldAlert,
    label: 'Pending Shift Spillovers',
    value: 8,
    subtext: 'Unassigned post-call-offs',
    accent: 'orange',
  },
];

const OPS_ACCENT = {
  rose: {
    gradient: 'from-white/70 to-rose-50/60',
    icon:     'border-rose-200/80 bg-rose-50/80',
    iconFg:   'text-rose-700',
    dot:      'bg-rose-500 shadow-[0_0_10px_rgba(244,63,94,0.80)]',
    subtext:  'text-rose-700',
  },
  amber: {
    gradient: 'from-white/70 to-amber-50/60',
    icon:     'border-amber-200/80 bg-amber-50/80',
    iconFg:   'text-amber-700',
    dot:      'bg-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.80)]',
    subtext:  'text-amber-700',
  },
  orange: {
    gradient: 'from-white/70 to-orange-50/60',
    icon:     'border-orange-200/80 bg-orange-50/80',
    iconFg:   'text-orange-700',
    dot:      'bg-orange-500 shadow-[0_0_10px_rgba(249,115,22,0.80)]',
    subtext:  'text-orange-700',
  },
};

function OpsRadarCard({ kpi }: { kpi: OpsKpi }) {
  const c = OPS_ACCENT[kpi.accent];
  return (
    <Link href="/executive">
      <ExecutiveGlassCard
        className={`bg-gradient-to-br ${c.gradient} overflow-hidden cursor-pointer transition-all duration-200 hover:scale-[1.01] hover:border-slate-700/50 hover:shadow-[0_16px_56px_-12px_rgba(15,23,42,0.18)]`}
      >
        <div className="p-5">
          <div className="flex items-start justify-between">
            <span className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-slate-600">
              <span className={`inline-block h-1.5 w-1.5 rounded-full ${c.dot}`} />
              {kpi.label}
            </span>
            <div className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl border ${c.icon}`}>
              <kpi.Icon className={`h-4 w-4 ${c.iconFg}`} />
            </div>
          </div>
          <p className="mt-3 text-2xl font-black tabular-nums tracking-tight text-slate-900">
            {kpi.value}
          </p>
          <p className={`mt-1 text-xs font-semibold ${c.subtext}`}>
            {kpi.subtext}
          </p>
        </div>
      </ExecutiveGlassCard>
    </Link>
  );
}

function GapBar({ label, value, max, color, sub }: { label: string; value: number; max: number; color: string; sub: string }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="font-semibold text-slate-700">{label}</span>
        <span className="font-black tabular-nums text-slate-900">{lkr(value)}</span>
      </div>
      <div className="h-3 w-full overflow-hidden rounded-full bg-slate-200/70">
        <div className={`h-full rounded-full transition-all duration-700 ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <p className="text-[10px] text-slate-500">{sub}</p>
    </div>
  );
}

function CashflowAnalyzer({ d }: { d: CompanyData }) {
  const max = Math.max(d.targetInvoices, d.actualInvoices, d.cashReceived, d.upcomingPayroll, 1);
  const gapPct = d.targetInvoices > 0 ? Math.round(((d.targetInvoices - d.cashReceived) / d.targetInvoices) * 100) : 0;
  const coverPct = d.upcomingPayroll > 0 ? Math.round((d.cashReceived / d.upcomingPayroll) * 100) : 100;
  const isAlert = d.cashReceived < d.upcomingPayroll;

  return (
    <ExecutiveGlassCard className="p-6">
      <div className="mb-5 flex items-start justify-between">
        <div>
          <h3 className="text-sm font-black uppercase tracking-widest text-slate-900">Cashflow Gap Analyzer</h3>
          <p className="mt-0.5 text-xs text-slate-500">Billing pipeline vs. payroll liability — month-to-date</p>
        </div>
        <div className="flex items-center gap-2">
          {isAlert && (
            <span className="flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50/90 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-rose-800">
              <AlertTriangle className="h-3 w-3" />
              Cash Buffer Alert
            </span>
          )}
          <BarChart3 className="h-5 w-5 text-slate-400" />
        </div>
      </div>

      <div className="space-y-5">
        <GapBar label="Target Invoices"      value={d.targetInvoices}  max={max} color="bg-slate-400"   sub="Contracted monthly billing target" />
        <GapBar label="Actual Invoices Issued" value={d.actualInvoices} max={max} color="bg-indigo-500"  sub="Invoices raised this period" />
        <GapBar label="Cash Received"         value={d.cashReceived}    max={max} color="bg-emerald-500" sub="Confirmed payments cleared" />
        <GapBar
          label="Previous Month Payroll Liability"
          value={d.upcomingPayroll}
          max={max}
          color="bg-rose-500"
          sub="Matches payroll cost against the invoices generated for those shifts."
        />
      </div>

      <div className="mt-6 grid grid-cols-3 divide-x divide-slate-200/80 overflow-hidden rounded-xl border border-slate-200/80 bg-slate-50/80">
        <div className="px-4 py-3 text-center">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Collection Gap</p>
          <p className="mt-1 text-lg font-black tabular-nums text-rose-800">{lkr(d.targetInvoices - d.cashReceived)}</p>
        </div>
        <div className="px-4 py-3 text-center">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Gap %</p>
          <p className={`mt-1 text-lg font-black tabular-nums ${gapPct > 30 ? 'text-rose-800' : 'text-amber-800'}`}>{gapPct}%</p>
        </div>
        <div className="px-4 py-3 text-center">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Payroll Cover</p>
          <p className={`mt-1 text-lg font-black tabular-nums ${coverPct >= 100 ? 'text-emerald-800' : 'text-rose-800'}`}>{coverPct}%</p>
        </div>
      </div>
    </ExecutiveGlassCard>
  );
}

// ─── HR & Payroll Exception Radar — Types & Data ─────────────────────────────

type OverrideStatus = 'PENDING' | 'APPROVED' | 'REJECTED';
type DebtStatus     = 'LOCKED'  | 'PENDING_WRITEOFF' | 'WRITTEN_OFF';

interface SalaryOverride {
  id: string;
  name: string;
  rank: string;
  company: string;
  defaultPay: number;
  overridePay: number;
  requestedBy: string;
  reason: string;
  date: string;
  status: OverrideStatus;
}

type DebtCategory = 'AWOL' | 'RESIGNED';

interface ResignationDebt {
  id: string;
  empNo: string;
  name: string;
  rank: string;
  company: string;
  inactiveDate: string;
  category: DebtCategory;
  uniformDebt: number;
  advanceDebt: number;
  fmConfirmed: boolean;
  status: DebtStatus;
}

const INITIAL_OVERRIDES: SalaryOverride[] = [
  {
    id: 'O1', name: 'Kasun Jayawardena', rank: 'SSO', company: 'Security',
    defaultPay: 58_000, overridePay: 72_000,
    requestedBy: 'HR Admin', reason: 'Promoted but pending rank cert — bridge pay requested',
    date: '2026-05-18', status: 'PENDING',
  },
  {
    id: 'O2', name: 'Amara Gunasekara', rank: 'JSO', company: 'Security',
    defaultPay: 42_000, overridePay: 52_000,
    requestedBy: 'HR Admin', reason: 'Client site requiring higher-grade guard — cost absorbed by client',
    date: '2026-05-19', status: 'PENDING',
  },
  {
    id: 'O3', name: 'Thilini Madushani', rank: 'LSO', company: 'Cafe',
    defaultPay: 36_000, overridePay: 41_000,
    requestedBy: 'FM Roshani', reason: 'Weekend schedule regularization — extended shift hours',
    date: '2026-05-15', status: 'PENDING',
  },
  {
    id: 'O4', name: 'Roshan Perera', rank: 'OIC', company: 'Security',
    defaultPay: 72_000, overridePay: 85_000,
    requestedBy: 'Ops Manager', reason: 'Covering SM duties during leave — acting SM allowance',
    date: '2026-05-12', status: 'PENDING',
  },
];

const INITIAL_DEBTS: ResignationDebt[] = [
  { id: 'D1', empNo: 'CVS-0142', name: 'Dilan Wickramasinghe', rank: 'JSO', company: 'Security',
    inactiveDate: '2026-05-10', category: 'AWOL', uniformDebt: 8_500, advanceDebt: 15_000,
    fmConfirmed: false, status: 'LOCKED' },
  { id: 'D2', empNo: 'CVS-0175', name: 'Thilak Mendis',         rank: 'LSO', company: 'Security',
    inactiveDate: '2026-05-22', category: 'AWOL', uniformDebt: 5_000, advanceDebt: 9_500,
    fmConfirmed: false, status: 'LOCKED' },
  { id: 'D3', empNo: 'CVS-0156', name: 'Kasun Pathirana',       rank: 'LSO', company: 'Security',
    inactiveDate: '2026-04-22', category: 'AWOL', uniformDebt: 6_200, advanceDebt: 0,
    fmConfirmed: true,  status: 'PENDING_WRITEOFF' },
  { id: 'D4', empNo: 'CVS-0163', name: 'Ranjith Dissanayake',   rank: 'JSO', company: 'Security',
    inactiveDate: '2026-04-08', category: 'AWOL', uniformDebt: 9_800, advanceDebt: 8_000,
    fmConfirmed: true,  status: 'PENDING_WRITEOFF' },
  { id: 'D5', empNo: 'CVS-0118', name: 'Nimal Senevirathne',    rank: 'LSO', company: 'Security',
    inactiveDate: '2026-03-15', category: 'AWOL', uniformDebt: 4_500, advanceDebt: 12_000,
    fmConfirmed: false, status: 'LOCKED' },
  { id: 'D6', empNo: 'CVS-0109', name: 'Priyantha Gunasekara',  rank: 'LSO', company: 'Security',
    inactiveDate: '2026-03-28', category: 'AWOL', uniformDebt: 3_200, advanceDebt: 6_500,
    fmConfirmed: false, status: 'LOCKED' },
  { id: 'D7', empNo: 'CVS-0189', name: 'Pradeep Nilantha',      rank: 'LSO', company: 'Security',
    inactiveDate: '2026-05-03', category: 'RESIGNED', uniformDebt: 6_200, advanceDebt: 0,
    fmConfirmed: true,  status: 'PENDING_WRITEOFF' },
  { id: 'D8', empNo: 'CVS-0207', name: 'Sachini Fernando',      rank: 'LSO', company: 'Security',
    inactiveDate: '2026-05-14', category: 'RESIGNED', uniformDebt: 3_800, advanceDebt: 8_000,
    fmConfirmed: true,  status: 'PENDING_WRITEOFF' },
  { id: 'D9', empNo: 'CVS-0201', name: 'Kavinda Samarasinghe',  rank: 'SSO', company: 'Security',
    inactiveDate: '2026-04-28', category: 'RESIGNED', uniformDebt: 12_000, advanceDebt: 22_000,
    fmConfirmed: false, status: 'LOCKED' },
  { id: 'D10', empNo: 'CVS-0182', name: 'Nuwan Bandara',        rank: 'JSO', company: 'Security',
    inactiveDate: '2026-04-11', category: 'RESIGNED', uniformDebt: 7_500, advanceDebt: 14_000,
    fmConfirmed: false, status: 'LOCKED' },
  { id: 'D11', empNo: 'CVS-0099', name: 'Chaminda Ranatunga',   rank: 'JSO', company: 'Security',
    inactiveDate: '2026-03-20', category: 'RESIGNED', uniformDebt: 7_200, advanceDebt: 18_500,
    fmConfirmed: false, status: 'LOCKED' },
  { id: 'D12', empNo: 'CVS-0091', name: 'Sampath Wijeratne',    rank: 'LSO', company: 'Security',
    inactiveDate: '2026-03-05', category: 'RESIGNED', uniformDebt: 4_800, advanceDebt: 0,
    fmConfirmed: true,  status: 'PENDING_WRITEOFF' },
];

// ─── Debt Panel helpers ────────────────────────────────────────────────────────

const FULL_MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];

function debtMonthLabel(yyyyMM: string): string {
  const [y, m] = yyyyMM.split('-');
  return `${FULL_MONTH_NAMES[parseInt(m) - 1]} ${y}`;
}

function guardInitials(name: string) {
  return name.split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase();
}

const AVATAR_PALETTES = [
  'from-indigo-100 to-indigo-200/80 text-indigo-700',
  'from-violet-100 to-violet-200/80 text-violet-700',
  'from-sky-100 to-sky-200/80 text-sky-700',
  'from-teal-100 to-teal-200/80 text-teal-700',
  'from-emerald-100 to-emerald-200/80 text-emerald-700',
  'from-slate-100 to-slate-200/80 text-slate-600',
];

function sumDebt(list: ResignationDebt[]) {
  return list.filter((d) => d.status !== 'WRITTEN_OFF')
             .reduce((s, d) => s + d.uniformDebt + d.advanceDebt, 0);
}

function groupByMonth(list: ResignationDebt[]) {
  const map: Record<string, ResignationDebt[]> = {};
  for (const d of list) {
    const key = d.inactiveDate.slice(0, 7);
    (map[key] ||= []).push(d);
  }
  return Object.entries(map).sort(([a], [b]) => b.localeCompare(a));
}

// ─── AccordionCategory ────────────────────────────────────────────────────────

interface AccordionCategoryProps {
  category: DebtCategory;
  list: ResignationDebt[];
  label: string;
  sub: string;
  accent: 'amber' | 'rose';
  isOpen: boolean;
  onToggle: () => void;
  onWriteOff: (id: string) => void;
}

function AccordionCategory({
  category, list, label, sub, accent, isOpen, onToggle, onWriteOff,
}: AccordionCategoryProps) {
  const total  = sumDebt(list);
  const count  = list.length;
  const groups = groupByMonth(list);

  const cls = accent === 'amber'
    ? { border: 'border-amber-200/70', headerBg: 'bg-amber-50/50', pill: 'border-amber-200/80 bg-amber-50/80 text-amber-900' }
    : { border: 'border-rose-200/70',  headerBg: 'bg-rose-50/40',  pill: 'border-rose-200/80  bg-rose-50/80  text-rose-900'  };

  return (
    <div className={`overflow-hidden rounded-2xl border transition-all ${isOpen ? cls.border : 'border-slate-200/60'}`}>
      <button
        type="button"
        onClick={onToggle}
        className={`flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors ${
          isOpen ? cls.headerBg : 'bg-white/40 hover:bg-white/70'
        }`}
      >
        <div className="min-w-0 flex-1">
          <p className="text-xs font-black uppercase tracking-tight text-slate-900">{label}</p>
          <p className="text-[10px] text-slate-500">{sub}</p>
        </div>
        <span className={`flex-shrink-0 rounded-full border px-2.5 py-0.5 text-[10px] font-black ${cls.pill}`}>
          {count} guard{count !== 1 ? 's' : ''}
        </span>
        <span className="flex-shrink-0 text-xs font-black tabular-nums text-rose-900">
          {lkr(total)}
        </span>
        <ChevronDown className={`h-4 w-4 flex-shrink-0 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="border-t border-slate-200/60 bg-white/30">
          {count === 0 ? (
            <p className="px-5 py-5 text-center text-[11px] text-slate-400">
              No records for the selected period.
            </p>
          ) : (
            groups.map(([monthKey, guards]) => (
              <div key={monthKey}>
                <div className="flex items-center gap-3 border-b border-slate-200/50 bg-slate-50/70 px-4 py-1.5">
                  <span className="text-[9px] font-black uppercase tracking-widest text-slate-500">
                    {debtMonthLabel(monthKey)}
                  </span>
                  <div className="flex-1 border-t border-slate-200/50" />
                  <span className="text-[9px] text-slate-400">
                    {guards.length} record{guards.length > 1 ? 's' : ''}
                  </span>
                </div>

                {guards.map((d, idx) => {
                  const rowTotal   = d.uniformDebt + d.advanceDebt;
                  const isLocked   = d.status === 'LOCKED';
                  const isPending  = d.status === 'PENDING_WRITEOFF';
                  const isDone     = d.status === 'WRITTEN_OFF';
                  const avatarCls  = AVATAR_PALETTES[idx % AVATAR_PALETTES.length];
                  const breakdown  =
                    d.uniformDebt > 0 && d.advanceDebt > 0 ? 'Uniform + Advance'
                    : d.uniformDebt > 0 ? 'Uniform debt'
                    : 'Advance debt';

                  return (
                    <div
                      key={d.id}
                      className={`flex items-center gap-3 border-b border-slate-200/40 px-4 py-3 last:border-0 transition-colors ${
                        isDone ? 'opacity-45' : 'hover:bg-white/50'
                      }`}
                    >
                      <div className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl border border-white/80 bg-gradient-to-br text-[11px] font-black shadow-sm ${avatarCls}`}>
                        {guardInitials(d.name)}
                      </div>

                      <div className="min-w-0 flex-1">
                        <p className={`text-sm font-bold leading-tight ${isDone ? 'line-through text-slate-400' : 'text-slate-900'}`}>
                          {d.name}
                        </p>
                        <div className="mt-0.5 flex items-center gap-1.5">
                          <span className="font-mono text-[9px] text-slate-400">{d.empNo}</span>
                          <span className="rounded border border-slate-200/60 bg-slate-100/70 px-1 py-px text-[8px] font-black tracking-wide text-slate-600">
                            {d.rank}
                          </span>
                        </div>
                      </div>

                      <div className="flex-shrink-0 text-right">
                        <p className={`text-sm font-black tabular-nums ${isDone ? 'line-through text-slate-300' : 'text-rose-800'}`}>
                          {lkr(rowTotal)}
                        </p>
                        <p className="text-[9px] text-slate-400">{breakdown}</p>
                      </div>

                      <div className="flex-shrink-0">
                        {isDone && <CheckCircle2 className="h-4 w-4 text-slate-300" />}
                        {isLocked && (
                          <span title="FM Recovery Confirmation Pending">
                            <Lock className="h-4 w-4 text-rose-300" />
                          </span>
                        )}
                        {isPending && (
                          <button
                            type="button"
                            onClick={() => onWriteOff(d.id)}
                            className="flex items-center gap-1 rounded-xl bg-slate-800 px-2.5 py-1 text-[9px] font-black uppercase tracking-wide text-white hover:bg-slate-700 transition-all whitespace-nowrap"
                          >
                            Write-off
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ─── PendingDebtPanel ─────────────────────────────────────────────────────────

function PendingDebtPanel({
  allDebts,
  onWriteOff,
}: {
  allDebts: ResignationDebt[];
  onWriteOff: (id: string) => void;
}) {
  const [expanded,     setExpanded]     = useState<DebtCategory | null>(null);
  const [periodFilter, setPeriodFilter] = useState<string>('ALL');

  const availablePeriods = useMemo(() => {
    const months = new Set(allDebts.map((d) => d.inactiveDate.slice(0, 7)));
    return Array.from(months).sort().reverse();
  }, [allDebts]);

  const filtered = periodFilter === 'ALL'
    ? allDebts
    : allDebts.filter((d) => d.inactiveDate.startsWith(periodFilter));

  const awolList     = filtered.filter((d) => d.category === 'AWOL');
  const resignedList = filtered.filter((d) => d.category === 'RESIGNED');

  const toggle = (cat: DebtCategory) =>
    setExpanded((prev) => (prev === cat ? null : cat));

  return (
    <div className="flex flex-col">
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-200/60 bg-rose-50/30 px-5 py-3">
        <UserX className="h-3.5 w-3.5 flex-shrink-0 text-rose-700" />
        <span className="text-[10px] font-black uppercase tracking-widest text-rose-900">
          Pending Resignation Debt
        </span>

        <div className="ml-auto flex items-center gap-2">
          <span className="text-[10px] font-bold text-slate-500">Period:</span>
          <select
            value={periodFilter}
            onChange={(e) => setPeriodFilter(e.target.value)}
            className="rounded-xl border border-slate-200/80 bg-white/80 px-2.5 py-1 text-[11px] font-bold text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-rose-400/30 transition-all"
          >
            <option value="ALL">All Periods</option>
            {availablePeriods.map((p) => (
              <option key={p} value={p}>{debtMonthLabel(p)}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="space-y-3 p-4">
        <AccordionCategory
          category="AWOL"
          list={awolList}
          label="Category A — Absent / AWOL"
          sub="Insufficient shifts to recover outstanding uniform & advance debt"
          accent="amber"
          isOpen={expanded === 'AWOL'}
          onToggle={() => toggle('AWOL')}
          onWriteOff={onWriteOff}
        />
        <AccordionCategory
          category="RESIGNED"
          list={resignedList}
          label="Category B — Resigned"
          sub="Unrecovered debt post-termination clearance"
          accent="rose"
          isOpen={expanded === 'RESIGNED'}
          onToggle={() => toggle('RESIGNED')}
          onWriteOff={onWriteOff}
        />
      </div>

      <div className="mt-auto border-t border-slate-200/60 bg-slate-50/60 px-5 py-2.5 text-[10px] text-slate-500">
        <Lock className="mr-1 inline h-3 w-3" />
        Write-offs unlock only after FM submits recovery confirmation in the Payroll module.
      </div>
    </div>
  );
}

// ─── HR & Payroll Exception Radar — Component ─────────────────────────────────

function HRPayrollExceptionRadar() {
  const [overrides, setOverrides] = useState<SalaryOverride[]>(INITIAL_OVERRIDES);
  const [debts,     setDebts]     = useState<ResignationDebt[]>(INITIAL_DEBTS);

  const pendingCount  = overrides.filter((o) => o.status === 'PENDING').length;
  const lockedCount   = debts.filter((d) => d.status === 'LOCKED').length;
  const pendingWO     = debts.filter((d) => d.status === 'PENDING_WRITEOFF').length;
  const totalDebt     = debts
    .filter((d) => d.status !== 'WRITTEN_OFF')
    .reduce((s, d) => s + d.uniformDebt + d.advanceDebt, 0);

  const approveOverride = (id: string) =>
    setOverrides((p) => p.map((o) => o.id === id ? { ...o, status: 'APPROVED' } : o));
  const rejectOverride = (id: string) =>
    setOverrides((p) => p.map((o) => o.id === id ? { ...o, status: 'REJECTED' } : o));
  const writeOffDebt = (id: string) =>
    setDebts((p) => p.map((d) => d.id === id ? { ...d, status: 'WRITTEN_OFF' } : d));

  return (
    <ExecutiveGlassCard className="overflow-hidden">

      <div className="border-b border-slate-200/80 bg-slate-50/80 px-6 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl border border-amber-200/80 bg-amber-50/80">
              <ShieldAlert className="h-5 w-5 text-amber-700" />
            </div>
            <div>
              <h3 className="text-sm font-black uppercase tracking-tight text-slate-900">
                HR &amp; Payroll Exception Radar
              </h3>
              <p className="text-[10px] text-slate-500">
                Salary overrides bypassing rank defaults · Termination debt pending clearance
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {pendingCount > 0 && (
              <span className="flex items-center gap-1.5 rounded-full border border-amber-200/80 bg-amber-50/80 px-3 py-1 text-[10px] font-black text-amber-800">
                <CircleDot className="h-2.5 w-2.5" />
                {pendingCount} override{pendingCount > 1 ? 's' : ''} awaiting MD
              </span>
            )}
            {lockedCount > 0 && (
              <span className="flex items-center gap-1.5 rounded-full border border-rose-200/80 bg-rose-50/80 px-3 py-1 text-[10px] font-black text-rose-800">
                <Lock className="h-2.5 w-2.5" />
                {lockedCount} debt{lockedCount > 1 ? 's' : ''} FM-locked
              </span>
            )}
            {pendingWO > 0 && (
              <span className="flex items-center gap-1.5 rounded-full border border-slate-200/80 bg-white/70 px-3 py-1 text-[10px] font-black text-slate-700">
                <Banknote className="h-2.5 w-2.5" />
                {lkr(totalDebt)} total exposure
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 divide-y divide-slate-200/70 md:grid-cols-2 md:divide-x md:divide-y-0">

        <div className="flex flex-col">
          <div className="flex items-center gap-2 border-b border-slate-200/60 bg-amber-50/30 px-5 py-3">
            <Users className="h-3.5 w-3.5 text-amber-700" />
            <span className="text-[10px] font-black uppercase tracking-widest text-amber-900">
              Salary Overrides — Pending MD Approval
            </span>
            {pendingCount > 0 && (
              <span className="ml-auto rounded-full bg-amber-500 px-2 py-0.5 text-[9px] font-black text-white">
                {pendingCount}
              </span>
            )}
          </div>

          <div className="divide-y divide-slate-200/50">
            {overrides.map((o) => {
              const delta    = o.overridePay - o.defaultPay;
              const deltaPct = Math.round((delta / o.defaultPay) * 100);
              const isPending  = o.status === 'PENDING';
              const isApproved = o.status === 'APPROVED';

              return (
                <div
                  key={o.id}
                  className={`px-5 py-4 transition-colors ${
                    isPending  ? 'hover:bg-amber-50/30' :
                    isApproved ? 'bg-emerald-50/20'     :
                    'bg-slate-50/30 opacity-60'
                  }`}
                >
                  <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-slate-900">{o.name}</span>
                        <span className="rounded-lg border border-slate-200/80 bg-slate-100/80 px-1.5 py-0.5 text-[9px] font-black tracking-widest text-slate-700">
                          {o.rank}
                        </span>
                        <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold ${
                          o.company === 'Security' ? 'bg-indigo-100/80 text-indigo-800' : 'bg-amber-100/80 text-amber-800'
                        }`}>
                          {o.company}
                        </span>
                      </div>
                      <p className="mt-0.5 text-[10px] text-slate-500 line-clamp-1">{o.reason}</p>
                    </div>

                    {!isPending && (
                      <span className={`flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10px] font-black ${
                        isApproved
                          ? 'border-emerald-200 bg-emerald-50/90 text-emerald-800'
                          : 'border-rose-200 bg-rose-50/90 text-rose-800'
                      }`}>
                        {isApproved
                          ? <><CheckCircle2 className="h-3 w-3" /> Approved</>
                          : <><XCircle className="h-3 w-3" /> Rejected</>
                        }
                      </span>
                    )}
                  </div>

                  <div className="mb-3 flex items-center gap-2 rounded-xl border border-slate-200/60 bg-white/50 px-3 py-2">
                    <div className="text-center">
                      <p className="text-[9px] font-bold uppercase tracking-widest text-slate-500">Rank Default</p>
                      <p className="font-mono text-xs font-black text-slate-700">{lkr(o.defaultPay)}</p>
                    </div>
                    <ArrowRight className="h-3.5 w-3.5 flex-shrink-0 text-slate-300" />
                    <div className="text-center">
                      <p className="text-[9px] font-bold uppercase tracking-widest text-slate-500">Override Pay</p>
                      <p className="font-mono text-xs font-black text-amber-900">{lkr(o.overridePay)}</p>
                    </div>
                    <div className="ml-auto flex items-center gap-1 rounded-lg border border-amber-200/80 bg-amber-50/80 px-2 py-1">
                      <BadgeAlert className="h-3 w-3 text-amber-700" />
                      <span className="text-[10px] font-black text-amber-900">+{deltaPct}% (+{lkr(delta)})</span>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-[10px] text-slate-500">
                      <span className="font-semibold text-slate-600">{o.requestedBy}</span> · {o.date}
                    </p>
                    {isPending && (
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => rejectOverride(o.id)}
                          className="flex items-center gap-1 rounded-xl border border-rose-200/80 bg-white/70 px-2.5 py-1.5 text-[10px] font-bold text-rose-700 hover:bg-rose-50/70 transition-all"
                        >
                          <XCircle className="h-3 w-3" />
                          Reject
                        </button>
                        <button
                          type="button"
                          onClick={() => approveOverride(o.id)}
                          className="flex items-center gap-1 rounded-xl bg-emerald-600 px-3 py-1.5 text-[10px] font-black uppercase tracking-wide text-white shadow-sm shadow-emerald-600/25 hover:bg-emerald-500 transition-all"
                        >
                          <CheckCircle2 className="h-3 w-3" />
                          Approve Exception
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <PendingDebtPanel allDebts={debts} onWriteOff={writeOffDebt} />

      </div>
    </ExecutiveGlassCard>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function FinancialOverviewPage() {
  const searchParams = useSearchParams();
  const [company, setCompany] = useState<CompanyKey>('security');
  const [isPerformanceExpanded, setIsPerformanceExpanded] = useState(false);

  const { displayMonth, displayYear } = useMemo(() => {
    const param = searchParams.get('period');
    if (param) {
      const [y, m] = param.split('-').map(Number);
      if (y && m && m >= 1 && m <= 12) return { displayYear: y, displayMonth: m };
    }
    const now = new Date();
    return { displayYear: now.getFullYear(), displayMonth: now.getMonth() + 1 };
  }, [searchParams]);

  const data   = DEMO[company];
  const active = COMPANIES.find((c) => c.key === company)!;
  const periodLabel = `${MONTH_LABELS[displayMonth - 1]} ${displayYear}`;

  return (
    <div className="min-h-0 pb-24 font-sans">
      {/* Sticky Header */}
      <header className="sticky top-0 z-50 border-b border-white/60 bg-white/45 px-4 py-4 shadow-[0_8px_32px_-12px_rgba(15,23,42,0.08)] backdrop-blur-xl backdrop-saturate-150 sm:px-6">
        <div className="w-full">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full border border-white/80 bg-white/70 text-xs font-black text-slate-800 shadow-inner ring-1 ring-slate-900/5">
                MD
              </div>
              <div>
                <h1 className="text-xl font-black uppercase tracking-tight text-slate-900 sm:text-2xl">
                  Executive Vault
                </h1>
                <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-emerald-700">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.85)]" />
                  Global Bypass Active — {active.label}
                </p>
              </div>
            </div>

          </div>

          <div className="mt-3">
            <CompanyToggle active={company} onChange={setCompany} />
          </div>
        </div>
      </header>

      <div className="w-full space-y-8 px-6 lg:px-12 2xl:px-24 py-8">

        {/* Live Operations Radar — Security Division */}
        <section>
          <div className="mb-4 flex items-center gap-2">
            <h2 className="text-xs font-bold uppercase tracking-widest text-slate-600">
              Live Operations Radar —
            </h2>
            <span className="text-xs font-bold text-slate-900">Security Division</span>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {OPS_KPIS.map((kpi) => (
              <OpsRadarCard key={kpi.label} kpi={kpi} />
            ))}
          </div>
        </section>

        {/* Enterprise Performance Cards */}
        <section>
          <div className="mb-4 flex items-center gap-2">
            <h2 className="text-xs font-bold uppercase tracking-widest text-slate-600">
              Enterprise Performance —
            </h2>
            <span className="text-xs font-bold text-slate-900">
              {periodLabel} · {active.label}
            </span>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <ExpandablePerfCard
              label="Gross Accrued Revenue"
              value={lkr(data.grossRevenue)}
              sub={`${lkr(data.actualInvoices)} invoiced this period`}
              trend="up"
              accent="emerald"
              breakdown={data.revenueBreakdown}
              isOpen={isPerformanceExpanded}
              onToggle={() => setIsPerformanceExpanded((p) => !p)}
            />
            <ExpandablePerfCard
              label="Gross Corporate Liabilities"
              value={lkr(data.grossLiabilities)}
              sub={`${lkr(data.upcomingPayroll)} payroll + OPEX`}
              trend="down"
              accent="rose"
              breakdown={data.liabilityBreakdown}
              isOpen={isPerformanceExpanded}
              onToggle={() => setIsPerformanceExpanded((p) => !p)}
            />
            <ExpandablePerfCard
              label="Net EBITDA"
              value={lkr(data.netEbitda)}
              sub={data.netEbitda >= 0 ? 'Profitable this period' : 'Below break-even — review OPEX'}
              trend={data.netEbitda >= 0 ? 'up' : 'down'}
              accent="indigo"
              breakdown={data.ebitdaBreakdown}
              isOpen={isPerformanceExpanded}
              onToggle={() => setIsPerformanceExpanded((p) => !p)}
            />
          </div>
        </section>

        {/* Cashflow Gap Analyzer */}
        <section>
          <CashflowAnalyzer d={data} />
        </section>

        {/* HR & Payroll Exception Radar */}
        {company === 'security' && (
          <section>
            <div className="mb-4 flex items-center gap-2">
              <h2 className="text-xs font-bold uppercase tracking-widest text-slate-600">HR &amp; Payroll Exceptions</h2>
              <span className="flex items-center gap-1 rounded-full border border-amber-200/70 bg-amber-50/60 px-2 py-0.5 text-[9px] font-black text-amber-800">
                <AlertTriangle className="h-2.5 w-2.5" />
                Requires MD Action
              </span>
            </div>
            <HRPayrollExceptionRadar />
          </section>
        )}

        {/* Command Module Quick Links */}
        <section>
          <h2 className="mb-4 text-xs font-bold uppercase tracking-widest text-slate-600">
            Command Modules
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {NAV_MODULES.map(({ href, label, Icon }) => (
              <Link
                key={href}
                href={href}
                className="group flex items-center gap-4 rounded-2xl border border-white/75 bg-white/50 p-5 shadow-[0_12px_48px_-14px_rgba(15,23,42,0.12)] backdrop-blur-2xl backdrop-saturate-[1.35] ring-1 ring-slate-900/[0.045] transition-all hover:bg-white/70 hover:shadow-[0_16px_56px_-12px_rgba(15,23,42,0.18)]"
              >
                <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl border border-slate-200/80 bg-slate-100/80 transition-transform group-hover:scale-110">
                  <Icon className="h-5 w-5 text-slate-700" />
                </div>
                <span className="font-bold text-slate-900">{label}</span>
              </Link>
            ))}
          </div>
        </section>

      </div>
    </div>
  );
}
