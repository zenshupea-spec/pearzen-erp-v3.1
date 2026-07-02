'use client';

import React, { useState, useMemo, useEffect, useCallback, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  TrendingUp,
  TrendingDown,
  Activity,
  Building2,
  Coffee,
  Home,
  AlertTriangle,
  BarChart3,
  ChevronDown,
  UtensilsCrossed,
  BedDouble,
  ArrowRight,
} from 'lucide-react';
import { ExecutiveGlassCard } from '../../../components/executive/ExecutiveVaultShell';
import {
  ExecutivePageBody,
  ExecutivePageHeader,
  ExecutivePageLiveSubtitle,
  ExecutivePageLoading,
  ExecutivePageShell,
} from '../../../components/executive/ExecutivePageChrome';
import { CVS_BRAND_CLASSES } from '../../../lib/cvs-brand-tokens';
import { formatShalomCalendarMonthPeriod } from '../../../lib/shalom-calendar';
import {
  fetchMonetaryHealth,
  type CompanyKey,
  type MonetaryHealth,
} from '../actions';
import {
  fetchCafePortfolioGlance,
  fetchShalomHostGlance,
} from './finance-glance-actions';
import type { CafePortfolioGlance, ShalomHostGlance } from './finance-glance-types';
import FmHrPayrollExceptionRadar from '../../fm/components/FmHrPayrollExceptionRadar';
import {
  fetchFmHrPayrollExceptions,
  type ResignationDebtRecord,
  type SalaryOverrideRecord,
} from '../../fm/fm-payroll-exceptions-actions';
import { EXECUTIVE_SIDEBAR_NAV } from '../lib/executive-nav';

// ─── Types ──────────────────────────────────────────────────────────────────

interface BreakdownItem {
  label: string;
  value: number;
  sub?: string;
}

type CompanyData = MonetaryHealth;

const EMPTY_COMPANY_DATA: CompanyData = {
  grossRevenue: 0,
  grossLiabilities: 0,
  netEbitda: 0,
  targetInvoices: 0,
  proratedTargetInvoices: 0,
  actualInvoices: 0,
  cashReceived: 0,
  upcomingPayroll: 0,
  invoiceDispatchDay: 1,
  payrollTargetDay: 10,
  serviceMonthKey: '',
  payrollServiceMonthKey: '',
  collectionWarningActive: false,
  collectionCashShortfall: 0,
  collectionWarningDay: 6,
  disputesSilenced: false,
  revenueBreakdown: [],
  liabilityBreakdown: [],
  ebitdaBreakdown: [],
};

const COMPANIES: { key: CompanyKey; label: string; short: string; Icon: React.ElementType }[] = [
  { key: 'security', label: 'Classic Venture Security', short: 'Security', Icon: Building2 },
  { key: 'cafe',     label: 'Cafe Tasha',         short: 'Cafe',     Icon: Coffee    },
  { key: 'bnb',      label: 'Shalom Residence',   short: 'Shalom',   Icon: Home      },
];

const MONTH_LABELS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

const EMPTY_CAFE_GLANCE: CafePortfolioGlance = {
  branches: [],
  totals: {
    mtdSales: 0,
    laborCostMtd: 0,
    wastageMtd: 0,
    stockAlerts: 0,
    complianceAlerts: 0,
    staffCount: 0,
  },
};

const EMPTY_SHALOM_GLANCE: ShalomHostGlance = {
  properties: [],
  totalPaidRevenue: 0,
  totalPendingRevenue: 0,
  portfolioOccupancyPct: 0,
  totalBookedNights: 0,
  daysInMonth: 30,
  checkInsToday: 0,
  checkInsNext7d: 0,
  unenrichedBookings: 0,
  tableReady: false,
};

const GLANCE_FETCH_TIMEOUT_MS = 20_000;

async function loadGlanceWithTimeout<T>(promise: Promise<T>): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(
        new Error(
          'Portfolio data is taking too long. Try again or open the Shalom desk directly.',
        ),
      );
    }, GLANCE_FETCH_TIMEOUT_MS);
  });

  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

const COMMAND_MODULE_HREFS = [
  '/executive/settings',
  '/executive/matrix',
  '/executive/audit',
] as const;

const NAV_MODULES = COMMAND_MODULE_HREFS.map((href) => {
  const item = EXECUTIVE_SIDEBAR_NAV.find((nav) => nav.href === href);
  if (!item) {
    throw new Error(`Missing executive nav entry for ${href}`);
  }
  return { href: item.href, label: item.label, Icon: item.Icon };
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

function lkr(n: number) {
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 1_000_000) return `${sign}LKR ${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000)     return `${sign}LKR ${(abs / 1_000).toFixed(1)}K`;
  return `${sign}LKR ${abs.toLocaleString()}`;
}

function performanceCardCopy(company: CompanyKey, data: CompanyData) {
  if (company === 'cafe') {
    return {
      revenueSub: `${lkr(data.actualInvoices)} POS sales this period`,
      liabilitySub: `${lkr(data.upcomingPayroll)} café labor + OPEX`,
      ebitdaSub:
        data.netEbitda >= 0
          ? 'Profitable this period'
          : 'Below break-even — review café labor & OPEX',
    };
  }
  if (company === 'bnb') {
    return {
      revenueSub: `${lkr(data.actualInvoices)} booking revenue this period`,
      liabilitySub: `${lkr(data.upcomingPayroll)} Shalom payroll + OPEX`,
      ebitdaSub:
        data.netEbitda >= 0
          ? 'Profitable this period'
          : 'Below break-even — review residence OPEX',
    };
  }
  return {
    revenueSub: `${lkr(data.actualInvoices)} invoiced this period`,
    liabilitySub: `${lkr(data.upcomingPayroll)} payroll + OPEX`,
    ebitdaSub:
      data.netEbitda >= 0 ? 'Profitable this period' : 'Below break-even — review OPEX',
  };
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function CompanyToggle({ active, onChange }: { active: CompanyKey; onChange: (k: CompanyKey) => void }) {
  const accentStyles: Record<CompanyKey, { active: string; idle: string; ring: string }> = {
    security: {
      active: `${CVS_BRAND_CLASSES.mobileTabActive} border-transparent ring-1 ring-[color:var(--cvs-accent-muted)]`,
      idle: 'text-slate-600 hover:bg-[var(--cvs-accent-soft)] hover:text-[color:var(--cvs-accent)]',
      ring: 'ring-[color:var(--cvs-accent-muted)]',
    },
    cafe: {
      active: 'bg-amber-600 text-white shadow-lg shadow-amber-600/25 ring-amber-500/30',
      idle: 'text-slate-600 hover:bg-amber-50/80 hover:text-amber-900',
      ring: 'ring-amber-100',
    },
    bnb: {
      active: 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/25 ring-emerald-500/30',
      idle: 'text-slate-600 hover:bg-emerald-50/80 hover:text-emerald-900',
      ring: 'ring-emerald-100',
    },
  };

  return (
    <div
      role="tablist"
      aria-label="Select company"
      className="grid grid-cols-3 gap-2 rounded-2xl border border-slate-200/80 bg-slate-100/70 p-1.5 shadow-inner"
    >
      {COMPANIES.map(({ key, label, short, Icon }) => {
        const isActive = active === key;
        const styles = accentStyles[key];
        return (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(key)}
            className={`flex min-h-[3.25rem] flex-col items-center justify-center gap-1 rounded-xl px-2 py-2.5 text-center transition-all sm:min-h-[3.5rem] sm:flex-row sm:gap-2 sm:px-3 ${
              isActive
                ? `${styles.active} ring-1 ${styles.ring}`
                : styles.idle
            }`}
          >
            <Icon className={`h-4 w-4 flex-shrink-0 ${isActive ? 'text-white' : 'text-slate-500'}`} />
            <span className="text-[10px] font-black uppercase tracking-[0.14em] sm:text-xs">
              {short}
            </span>
            <span className={`hidden text-[9px] font-semibold normal-case tracking-normal xl:inline ${isActive ? 'text-white/80' : 'text-slate-400'}`}>
              {label}
            </span>
          </button>
        );
      })}
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
  accent: 'emerald' | 'rose' | 'indigo' | 'brand';
  breakdown: BreakdownItem[];
  isOpen: boolean;
  onToggle: () => void;
}) {
  const open = isOpen;

  const gradients = {
    emerald: 'from-white/70 to-emerald-50/60',
    rose:    'from-white/70 to-rose-50/60',
    indigo:  'from-white/70 to-indigo-50/60',
    brand:   'from-white/70 to-[var(--cvs-accent-soft)]',
  };
  const dots = {
    emerald: 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.85)]',
    rose:    'bg-rose-500    shadow-[0_0_10px_rgba(244,63,94,0.8)]',
    indigo:  'bg-indigo-500  shadow-[0_0_10px_rgba(99,102,241,0.8)]',
    brand:   'bg-[color:var(--cvs-accent)] shadow-[0_0_10px_var(--cvs-glow)]',
  };
  const barColors = {
    emerald: 'bg-emerald-500',
    rose:    'bg-rose-500',
    indigo:  'bg-indigo-500',
    brand:   'bg-[color:var(--cvs-accent)]',
  };
  const dividerColors = {
    emerald: 'divide-emerald-100/80 border-emerald-100/80',
    rose:    'divide-rose-100/80    border-rose-100/80',
    indigo:  'divide-indigo-100/80  border-indigo-100/80',
    brand:   'divide-[color:var(--cvs-accent-muted)]/40 border-[color:var(--cvs-accent-muted)]/40',
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

function safeNum(n: number) {
  return Number.isFinite(n) ? n : 0;
}

function GapBar({ label, value, max, color, sub }: { label: string; value: number; max: number; color: string; sub: string }) {
  const v = safeNum(value);
  const m = Math.max(safeNum(max), 1);
  const pct = m > 0 ? Math.min(100, Math.round((v / m) * 100)) : 0;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="font-semibold text-slate-700">{label}</span>
        <span className="font-black tabular-nums text-slate-900">{lkr(v)}</span>
      </div>
      <div className="h-3 w-full overflow-hidden rounded-full bg-slate-200/70">
        <div className={`h-full rounded-full transition-all duration-700 ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <p className="text-[10px] text-slate-500">{sub}</p>
    </div>
  );
}

function formatServiceMonthLabel(monthKey: string): string {
  const [y, m] = monthKey.split('-').map(Number);
  if (!y || !m) return monthKey;
  return `${MONTH_LABELS[m - 1] ?? monthKey} ${y}`;
}

function CashflowAnalyzer({ d, embedded = false }: { d: CompanyData; embedded?: boolean }) {
  const targetInvoices = safeNum(d.targetInvoices);
  const proratedTarget = safeNum(d.proratedTargetInvoices);
  const gapTarget = proratedTarget > 0 ? proratedTarget : targetInvoices;
  const actualInvoices = safeNum(d.actualInvoices);
  const cashReceived = safeNum(d.cashReceived);
  const upcomingPayroll = safeNum(d.upcomingPayroll);
  const max = Math.max(targetInvoices, proratedTarget, actualInvoices, cashReceived, upcomingPayroll, 1);
  const gapPct = gapTarget > 0 ? Math.round(((gapTarget - cashReceived) / gapTarget) * 100) : 0;
  const coverPct = upcomingPayroll > 0 ? Math.round((cashReceived / upcomingPayroll) * 100) : 100;
  const isAlert = d.collectionWarningActive;
  const payrollMonthLabel = d.payrollServiceMonthKey
    ? formatServiceMonthLabel(d.payrollServiceMonthKey)
    : 'prior month';

  const body = (
    <>
      <div className="mb-5 flex items-start justify-between">
        <div>
          <h3 className="text-sm font-black uppercase tracking-widest text-slate-900">Cashflow Gap Analyzer</h3>
          <p className="mt-0.5 text-xs text-slate-500">
            Live AR vs. payroll — warning day {d.collectionWarningDay} · payroll day {d.payrollTargetDay}
            {d.disputesSilenced ? ' · dispute hold silencing alerts' : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isAlert && (
            <span className="flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50/90 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-rose-800">
              <AlertTriangle className="h-3 w-3" />
              Cash Buffer Alert · {lkr(d.collectionCashShortfall)} short
            </span>
          )}
          <BarChart3 className="h-5 w-5 text-slate-400" />
        </div>
      </div>

      <div className="space-y-5">
        <GapBar
          label="Target Invoices (prorated)"
          value={proratedTarget > 0 ? proratedTarget : targetInvoices}
          max={max}
          color="bg-slate-400"
          sub={
            proratedTarget > 0
              ? `Contracted ${lkr(targetInvoices)} · prorated to dispatch day ${d.invoiceDispatchDay}`
              : 'Contracted monthly billing target'
          }
        />
        <GapBar
          label="Actual Invoices Issued"
          value={actualInvoices}
          max={max}
          color="bg-[color:var(--cvs-accent)]"
          sub="Live Invoice Desk total for selected service month"
        />
        <GapBar
          label="Cash Received"
          value={cashReceived}
          max={max}
          color="bg-emerald-500"
          sub="Confirmed payments cleared for selected service month"
        />
        <GapBar
          label={`Payroll Liability (${payrollMonthLabel})`}
          value={upcomingPayroll}
          max={max}
          color="bg-rose-500"
          sub={`Prior service month payroll · target pay day ${d.payrollTargetDay}`}
        />
      </div>

      <div className="mt-6 grid grid-cols-3 divide-x divide-slate-200/80 overflow-hidden rounded-xl border border-slate-200/80 bg-slate-50/80">
        <div className="px-4 py-3 text-center">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Collection Gap</p>
          <p className="mt-1 text-lg font-black tabular-nums text-rose-800">{lkr(gapTarget - cashReceived)}</p>
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
    </>
  );

  if (embedded) return <div className="p-1">{body}</div>;
  return <ExecutiveGlassCard className="p-6">{body}</ExecutiveGlassCard>;
}

function CafePortfolioPulse({
  glance,
  embedded = false,
}: {
  glance: CafePortfolioGlance;
  embedded?: boolean;
}) {
  const { totals, branches } = glance;
  const max = Math.max(totals.mtdSales, totals.laborCostMtd + totals.wastageMtd, totals.stockAlerts * 10_000, 1);
  const foodCostPct = totals.mtdSales > 0
    ? Math.round(((totals.laborCostMtd + totals.wastageMtd) / totals.mtdSales) * 100)
    : 0;
  const hasAlerts = totals.stockAlerts > 0 || totals.complianceAlerts > 0;

  const body = (
    <>
      {glance.error ? (
        <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50/90 px-3 py-2 text-center text-xs font-semibold text-amber-900">
          {glance.error}
        </p>
      ) : null}
      <div className="mb-5 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-black uppercase tracking-widest text-slate-900">Café Portfolio Pulse</h3>
          <p className="mt-0.5 text-xs text-slate-500">
            All branches — sales, labor, stock &amp; compliance at a glance
          </p>
        </div>
        <div className="flex items-center gap-2">
          {hasAlerts && (
            <span className="flex items-center gap-1 rounded-lg border border-amber-200 bg-amber-50/90 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-amber-900">
              <AlertTriangle className="h-3 w-3" />
              {totals.stockAlerts + totals.complianceAlerts} alert{totals.stockAlerts + totals.complianceAlerts !== 1 ? 's' : ''}
            </span>
          )}
          <Coffee className="h-5 w-5 text-amber-600" />
        </div>
      </div>

      <div className="space-y-5">
        <GapBar
          label="MTD POS Sales"
          value={totals.mtdSales}
          max={max}
          color="bg-amber-500"
          sub={`Across ${branches.length} branch${branches.length !== 1 ? 'es' : ''} · month-to-date`}
        />
        <GapBar
          label="Labor Cost MTD"
          value={totals.laborCostMtd}
          max={max}
          color="bg-rose-500"
          sub={`${totals.staffCount} active staff · daily rate × days worked`}
        />
        <GapBar
          label="Logged Wastage"
          value={totals.wastageMtd}
          max={max}
          color="bg-orange-500"
          sub="Staff-logged wastage with photo proof"
        />
        <GapBar
          label="Stock Alerts"
          value={totals.stockAlerts}
          max={Math.max(totals.stockAlerts, 5)}
          color="bg-violet-500"
          sub="Lots expiring ≤3 days + ingredients below minimum"
        />
      </div>

      {branches.length > 0 && (
        <div className="mt-5 space-y-2 rounded-xl border border-slate-200/80 bg-slate-50/60 p-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">By branch</p>
          {branches.map((b) => {
            const branchAlerts = b.expiringSoon + b.lowStock + b.overdueTasks + b.flaggedVoids;
            return (
              <div key={b.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white/70 px-3 py-2">
                <span className="text-xs font-bold text-slate-800">{b.name}</span>
                <div className="flex flex-wrap items-center gap-2 text-[10px] font-semibold text-slate-600">
                  <span className="tabular-nums">{lkr(b.mtdSales)} sales</span>
                  <span>·</span>
                  <span>{b.staffCount} staff</span>
                  {branchAlerts > 0 && (
                    <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 font-black text-amber-900">
                      {branchAlerts} alert{branchAlerts !== 1 ? 's' : ''}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-6 grid grid-cols-3 divide-x divide-slate-200/80 overflow-hidden rounded-xl border border-slate-200/80 bg-slate-50/80">
        <div className="px-4 py-3 text-center">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Food Cost %</p>
          <p className={`mt-1 text-lg font-black tabular-nums ${foodCostPct > 45 ? 'text-rose-800' : 'text-emerald-800'}`}>
            {foodCostPct}%
          </p>
        </div>
        <div className="px-4 py-3 text-center">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Overdue Tasks</p>
          <p className={`mt-1 text-lg font-black tabular-nums ${totals.complianceAlerts > 0 ? 'text-amber-800' : 'text-slate-700'}`}>
            {branches.reduce((s, b) => s + b.overdueTasks, 0)}
          </p>
        </div>
        <div className="px-4 py-3 text-center">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Branches</p>
          <p className="mt-1 text-lg font-black tabular-nums text-slate-900">{branches.length}</p>
        </div>
      </div>

      <Link
        href="/executive/cafe"
        className="mt-4 flex items-center justify-center gap-1.5 rounded-xl border border-amber-200/80 bg-amber-50/60 py-2.5 text-[11px] font-black uppercase tracking-wide text-amber-900 transition-colors hover:bg-amber-100/80"
      >
        <UtensilsCrossed className="h-3.5 w-3.5" />
        Open Café Backoffice
        <ArrowRight className="h-3.5 w-3.5" />
      </Link>
    </>
  );

  if (embedded) return <div className="p-1">{body}</div>;
  return <ExecutiveGlassCard className="p-6">{body}</ExecutiveGlassCard>;
}

function ShalomHostPulse({
  glance,
  embedded = false,
}: {
  glance: ShalomHostGlance;
  embedded?: boolean;
}) {
  const max = Math.max(
    glance.totalPaidRevenue,
    glance.totalPendingRevenue,
    glance.totalBookedNights * 5_000,
    1,
  );
  const collectionRate = glance.totalPaidRevenue + glance.totalPendingRevenue > 0
    ? Math.round((glance.totalPaidRevenue / (glance.totalPaidRevenue + glance.totalPendingRevenue)) * 100)
    : 100;
  const onTarget = glance.portfolioOccupancyPct >= (glance.properties[0]?.occupancyTarget ?? 60);

  const body = (
    <>
      {glance.error ? (
        <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50/90 px-3 py-2 text-center text-xs font-semibold text-amber-900">
          {glance.error}
        </p>
      ) : !glance.tableReady ? (
        <p className="mb-4 rounded-xl border border-slate-200 bg-slate-50/90 px-3 py-2 text-center text-xs font-semibold text-slate-600">
          Shalom residence tables are not applied yet — run Supabase migrations to load live host data.
        </p>
      ) : null}
      <div className="mb-5 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-black uppercase tracking-widest text-slate-900">Host Portfolio Pulse</h3>
          <p className="mt-0.5 text-xs text-slate-500">
            All residences — occupancy, revenue &amp; guest arrivals at a glance
          </p>
        </div>
        <div className="flex items-center gap-2">
          {glance.unenrichedBookings > 0 && (
            <span className="flex items-center gap-1 rounded-lg border border-blue-200 bg-blue-50/90 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-blue-900">
              <AlertTriangle className="h-3 w-3" />
              {glance.unenrichedBookings} iCal sync
            </span>
          )}
          <Home className="h-5 w-5 text-emerald-600" />
        </div>
      </div>

      <div className="space-y-5">
        <GapBar
          label="Paid Revenue MTD"
          value={glance.totalPaidRevenue}
          max={max}
          color="bg-emerald-500"
          sub="Confirmed guest payments cleared"
        />
        <GapBar
          label="Pending Collection"
          value={glance.totalPendingRevenue}
          max={max}
          color="bg-amber-500"
          sub="Bookings with balance due on check-in"
        />
        <GapBar
          label="Booked Nights"
          value={glance.totalBookedNights}
          max={Math.max(glance.daysInMonth * glance.properties.length, glance.totalBookedNights, 1)}
          color="bg-teal-500"
          sub={`${glance.portfolioOccupancyPct}% portfolio occupancy · ${glance.daysInMonth} days in month`}
        />
        <GapBar
          label="Arrivals Next 7 Days"
          value={glance.checkInsNext7d}
          max={Math.max(glance.checkInsNext7d, 5)}
          color="bg-indigo-500"
          sub={`${glance.checkInsToday} check-in${glance.checkInsToday !== 1 ? 's' : ''} today across all properties`}
        />
      </div>

      {glance.properties.length > 0 && (
        <div className="mt-5 space-y-2 rounded-xl border border-slate-200/80 bg-slate-50/60 p-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">By property</p>
          {glance.properties.map((p) => {
            const meetsTarget = p.occupancyPct >= p.occupancyTarget;
            return (
              <div key={p.id} className="rounded-lg bg-white/70 px-3 py-2.5">
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-slate-800">{p.name}</span>
                  <span className={`text-[10px] font-black tabular-nums ${meetsTarget ? 'text-emerald-800' : 'text-amber-800'}`}>
                    {p.occupancyPct}% occ
                  </span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200/70">
                  <div
                    className={`h-full rounded-full ${meetsTarget ? 'bg-emerald-500' : 'bg-amber-500'}`}
                    style={{ width: `${Math.min(p.occupancyPct, 100)}%` }}
                  />
                </div>
                <div className="mt-1 flex flex-wrap gap-2 text-[10px] font-semibold text-slate-500">
                  <span className="tabular-nums text-emerald-800">{lkr(p.paidRevenue)} paid</span>
                  {p.pendingRevenue > 0 && (
                    <span className="tabular-nums text-amber-800">{lkr(p.pendingRevenue)} pending</span>
                  )}
                  <span>{p.bookedNights} nights</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-6 grid grid-cols-3 divide-x divide-slate-200/80 overflow-hidden rounded-xl border border-slate-200/80 bg-slate-50/80">
        <div className="px-4 py-3 text-center">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Collection Rate</p>
          <p className={`mt-1 text-lg font-black tabular-nums ${collectionRate >= 80 ? 'text-emerald-800' : 'text-amber-800'}`}>
            {collectionRate}%
          </p>
        </div>
        <div className="px-4 py-3 text-center">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Occupancy</p>
          <p className={`mt-1 text-lg font-black tabular-nums ${onTarget ? 'text-emerald-800' : 'text-amber-800'}`}>
            {glance.portfolioOccupancyPct}%
          </p>
        </div>
        <div className="px-4 py-3 text-center">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Properties</p>
          <p className="mt-1 text-lg font-black tabular-nums text-slate-900">{glance.properties.length}</p>
        </div>
      </div>

      <Link
        href="/executive/shalom"
        className="mt-4 flex items-center justify-center gap-1.5 rounded-xl border border-emerald-200/80 bg-emerald-50/60 py-2.5 text-[11px] font-black uppercase tracking-wide text-emerald-900 transition-colors hover:bg-emerald-100/80"
      >
        <BedDouble className="h-3.5 w-3.5" />
        Open Shalom Residences
        <ArrowRight className="h-3.5 w-3.5" />
      </Link>
    </>
  );

  if (embedded) return <div className="p-1">{body}</div>;
  return <ExecutiveGlassCard className="p-6">{body}</ExecutiveGlassCard>;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function FinancialOverviewPage() {
  return (
    <Suspense
      fallback={
        <ExecutivePageShell>
          <ExecutivePageBody>
            <ExecutivePageLoading message="Loading executive finance…" />
          </ExecutivePageBody>
        </ExecutivePageShell>
      }
    >
      <FinancialOverviewPageInner />
    </Suspense>
  );
}

function FinancialOverviewPageInner() {
  const searchParams = useSearchParams();
  const [company, setCompany] = useState<CompanyKey>('security');
  const [isPerformanceExpanded, setIsPerformanceExpanded] = useState(false);
  const [data, setData] = useState<CompanyData>(EMPTY_COMPANY_DATA);
  const [cafeGlance, setCafeGlance] = useState<CafePortfolioGlance | null>(null);
  const [shalomGlance, setShalomGlance] = useState<ShalomHostGlance | null>(null);
  const [loading, setLoading] = useState(true);
  const [glanceLoading, setGlanceLoading] = useState(false);
  const [exceptionOverrides, setExceptionOverrides] = useState<SalaryOverrideRecord[]>([]);
  const [exceptionDebts, setExceptionDebts] = useState<ResignationDebtRecord[]>([]);
  const [exceptionsLoading, setExceptionsLoading] = useState(false);

  const refreshExceptions = useCallback(() => {
    return fetchFmHrPayrollExceptions().then(({ overrides, debts }) => {
      setExceptionOverrides(overrides);
      setExceptionDebts(debts);
    });
  }, []);

  const { displayMonth, displayYear } = useMemo(() => {
    const param = searchParams.get('period');
    if (param) {
      const [y, m] = param.split('-').map(Number);
      if (y && m && m >= 1 && m <= 12) return { displayYear: y, displayMonth: m };
    }
    const now = new Date();
    return { displayYear: now.getFullYear(), displayMonth: now.getMonth() + 1 };
  }, [searchParams]);

  useEffect(() => {
    let cancelled = false;

    const refreshHealth = () => {
      setLoading(true);
      void fetchMonetaryHealth(company, displayYear, displayMonth)
        .then((health) => {
          if (!cancelled) setData(health);
        })
        .catch(() => {
          if (!cancelled) setData(EMPTY_COMPANY_DATA);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    };

    refreshHealth();

    // Refresh policy: refetch on focus/visibility and every 60s so Invoice Desk dispatch updates MD cards.
    const onFocus = () => refreshHealth();
    const onVisibility = () => {
      if (document.visibilityState === 'visible') refreshHealth();
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);
    const poll = window.setInterval(refreshHealth, 60_000);

    return () => {
      cancelled = true;
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
      window.clearInterval(poll);
    };
  }, [company, displayYear, displayMonth]);

  useEffect(() => {
    if (company === 'security') {
      setGlanceLoading(false);
      return;
    }

    let glanceRequestSeq = 0;
    const activeCompany = company;

    const refreshGlance = () => {
      const seq = ++glanceRequestSeq;
      setGlanceLoading(true);

      const glancePromise =
        activeCompany === 'cafe'
          ? loadGlanceWithTimeout(fetchCafePortfolioGlance(displayYear, displayMonth))
          : loadGlanceWithTimeout(fetchShalomHostGlance(displayYear, displayMonth));

      void glancePromise
        .then((glance) => {
          if (seq !== glanceRequestSeq) return;
          if (activeCompany === 'cafe') {
            setCafeGlance(glance as CafePortfolioGlance);
          } else {
            setShalomGlance(glance as ShalomHostGlance);
          }
        })
        .catch((err: unknown) => {
          if (seq !== glanceRequestSeq) return;
          const message =
            err instanceof Error ? err.message : 'Failed to load portfolio data.';
          if (activeCompany === 'cafe') {
            setCafeGlance({ ...EMPTY_CAFE_GLANCE, error: message });
          } else {
            setShalomGlance({ ...EMPTY_SHALOM_GLANCE, error: message });
          }
        })
        .finally(() => {
          if (seq === glanceRequestSeq) setGlanceLoading(false);
        });
    };

    refreshGlance();

    const onFocus = () => refreshGlance();
    const onVisibility = () => {
      if (document.visibilityState === 'visible') refreshGlance();
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);
    const poll = window.setInterval(refreshGlance, 60_000);

    return () => {
      glanceRequestSeq += 1;
      setGlanceLoading(false);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
      window.clearInterval(poll);
    };
  }, [company, displayYear, displayMonth]);

  useEffect(() => {
    if (company !== 'security') {
      setExceptionOverrides([]);
      setExceptionDebts([]);
      setExceptionsLoading(false);
      return;
    }

    let cancelled = false;
    setExceptionsLoading(true);

    void fetchFmHrPayrollExceptions()
      .then(({ overrides, debts }) => {
        if (!cancelled) {
          setExceptionOverrides(overrides);
          setExceptionDebts(debts);
        }
      })
      .finally(() => {
        if (!cancelled) setExceptionsLoading(false);
      });

    const onFocus = () => {
      void refreshExceptions();
    };
    window.addEventListener('focus', onFocus);
    const poll = window.setInterval(() => {
      void refreshExceptions();
    }, 60_000);

    return () => {
      cancelled = true;
      window.removeEventListener('focus', onFocus);
      window.clearInterval(poll);
    };
  }, [company, refreshExceptions]);

  const active = COMPANIES.find((c) => c.key === company)!;
  const periodLabel = `${MONTH_LABELS[displayMonth - 1]} ${displayYear}`;
  const shalomPeriodLabel = formatShalomCalendarMonthPeriod(displayYear, displayMonth);
  const perfCopy = performanceCardCopy(company, data);

  return (
    <ExecutivePageShell>
      <ExecutivePageHeader
        title="Executive Vault"
        leading={
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full border border-white/80 bg-white/70 text-xs font-black text-slate-800 shadow-inner ring-1 ring-slate-900/5">
            MD
          </div>
        }
        subtitle={
          <ExecutivePageLiveSubtitle>
            Global Bypass Active — {active.label}
          </ExecutivePageLiveSubtitle>
        }
      />

      <ExecutivePageBody spacing="relaxed">
        {loading ? (
          <ExecutivePageLoading message="Loading live financial data…" />
        ) : null}

        {/* Enterprise Performance Cards */}
        <section>
          <ExecutiveGlassCard className="overflow-hidden bg-gradient-to-br from-white/75 to-slate-50/50">
            <div className="border-b border-slate-200/70 bg-white/50 px-4 py-4 sm:px-6 sm:py-5">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
                <div className="min-w-0">
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
                    Enterprise performance
                  </p>
                  <h2 className="mt-1 text-base font-black text-slate-900 sm:text-lg">
                    {periodLabel}
                  </h2>
                  <p className="mt-1 text-xs font-semibold text-slate-500">
                    Viewing <span className="text-slate-800">{active.label}</span>
                    {company === 'bnb' ? (
                      <>
                        {' '}
                        · calendar month{' '}
                        <span className="text-slate-800">{shalomPeriodLabel}</span>
                      </>
                    ) : null}
                    {' '}
                    — owner ops appear below; tap any KPI card for breakdowns.
                  </p>
                </div>
                <div className="w-full xl:max-w-xl xl:flex-shrink-0">
                  <CompanyToggle active={company} onChange={setCompany} />
                </div>
              </div>
            </div>

            <div className="border-b border-slate-200/70 bg-gradient-to-b from-white/40 to-slate-50/30 px-4 py-4 sm:px-6 sm:py-5">
              {company === 'security' ? (
                <CashflowAnalyzer embedded d={data} />
              ) : glanceLoading ? (
                <ExecutivePageLoading
                  message={`Loading ${active.label} operations…`}
                  className="min-h-[8rem] py-6"
                />
              ) : company === 'cafe' ? (
                <CafePortfolioPulse embedded glance={cafeGlance ?? EMPTY_CAFE_GLANCE} />
              ) : (
                <ShalomHostPulse embedded glance={shalomGlance ?? EMPTY_SHALOM_GLANCE} />
              )}
            </div>

            <div className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-3 sm:p-5">
              <ExpandablePerfCard
                label="Gross Accrued Revenue"
                value={lkr(data.grossRevenue)}
                sub={perfCopy.revenueSub}
                trend="up"
                accent="emerald"
                breakdown={data.revenueBreakdown}
                isOpen={isPerformanceExpanded}
                onToggle={() => setIsPerformanceExpanded((p) => !p)}
              />
              <ExpandablePerfCard
                label="Gross Corporate Liabilities"
                value={lkr(data.grossLiabilities)}
                sub={perfCopy.liabilitySub}
                trend="down"
                accent="rose"
                breakdown={data.liabilityBreakdown}
                isOpen={isPerformanceExpanded}
                onToggle={() => setIsPerformanceExpanded((p) => !p)}
              />
              <ExpandablePerfCard
                label="Net EBITDA"
                value={lkr(data.netEbitda)}
                sub={perfCopy.ebitdaSub}
                trend={data.netEbitda >= 0 ? 'up' : 'down'}
                accent="brand"
                breakdown={data.ebitdaBreakdown}
                isOpen={isPerformanceExpanded}
                onToggle={() => setIsPerformanceExpanded((p) => !p)}
              />
            </div>
          </ExecutiveGlassCard>
        </section>

        {company === 'security' && !exceptionsLoading ? (
          <section>
            <FmHrPayrollExceptionRadar
              overrides={exceptionOverrides}
              debts={exceptionDebts}
              onRefresh={() => {
                void refreshExceptions();
              }}
              readOnly
            />
          </section>
        ) : null}

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
                className="group flex items-center gap-4 rounded-2xl border border-white/75 bg-white/50 p-5 shadow-[0_12px_48px_-14px_rgba(15,23,42,0.12)] backdrop-blur-2xl backdrop-saturate-[1.35] ring-1 ring-slate-900/[0.045] transition-all hover:border-[color:var(--cvs-accent-muted)] hover:bg-white/70 hover:shadow-[0_16px_56px_-12px_rgba(15,23,42,0.18)]"
              >
                <div className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl border border-slate-200/80 bg-slate-100/80 transition-all group-hover:scale-110 group-hover:border-[color:var(--cvs-accent-muted)] group-hover:bg-[var(--cvs-accent-soft)]`}>
                  <Icon className="h-5 w-5 text-slate-700 transition-colors group-hover:text-[color:var(--cvs-accent)]" />
                </div>
                <span className="font-bold text-slate-900 transition-colors group-hover:text-[color:var(--cvs-accent)]">{label}</span>
              </Link>
            ))}
          </div>
        </section>

      </ExecutivePageBody>
    </ExecutivePageShell>
  );
}
