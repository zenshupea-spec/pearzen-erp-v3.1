import { AlertOctagon, Banknote, History, Receipt } from 'lucide-react';
import { ExecutiveGlassCard } from '../../../components/executive/ExecutiveVaultShell';
import type { FmPortfolioReportKind } from '../lib/fm-portfolio-report-builders';
import {
  formatPayrollPeriodLabel,
  historicalPortfolioScale,
  prevPayrollMonth,
  type PayrollPeriod,
} from '../lib/payroll-period';

const TOTAL_RECONCILED_DEDUCTIONS_LIVE = 2_450_000;
const PREV_MONTH_STOP_COUNT = 14;
const SALARY_MONTH_HALF_HOLD_COUNT = 8;
const PREV_MONTH_THRESHOLD = 18;
const SALARY_MONTH_THRESHOLD = 10;

function lkrCompact(n: number) {
  const abs = Math.abs(n);
  const sign = n < 0 ? '−' : '';
  if (abs >= 1_000_000) return `${sign}LKR ${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${sign}LKR ${(abs / 1_000).toFixed(1)}K`;
  return `${sign}LKR ${abs.toLocaleString()}`;
}

function DeductionsSummaryCard({
  amount,
  onOpen,
}: {
  amount: number;
  onOpen: () => void;
}) {
  return (
    <ExecutiveGlassCard
      onClick={onOpen}
      className="cursor-pointer p-5 transition-shadow hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl border border-emerald-200/70 bg-emerald-50/60">
          <Receipt className="h-5 w-5 text-emerald-600" />
        </div>
        <div className="min-w-0 flex-1 text-right">
          <p className="truncate text-[10px] font-bold uppercase tracking-widest text-slate-500">
            Total Reconciled Deductions
          </p>
          <p className="mt-1 text-2xl font-black tabular-nums leading-none text-emerald-900">
            {lkrCompact(amount)}
          </p>
          <p className="mt-1 text-[11px] font-semibold leading-tight text-slate-500">
            Meals · Uniform · Advances · Penalties
          </p>
        </div>
      </div>
    </ExecutiveGlassCard>
  );
}

type StopListCardProps = {
  count: number;
  threshold: number;
  monthLabel: string;
  title: string;
  subtitle: string;
  footer: string;
  icon: typeof History;
  tone: 'rose' | 'amber';
};

function StopListSummaryCard({
  count,
  threshold,
  monthLabel,
  title,
  subtitle,
  footer,
  icon: Icon,
  tone,
  onOpen,
}: StopListCardProps & { onOpen: () => void }) {
  const tones = {
    rose: {
      card: 'from-rose-50/60',
      iconBorder: 'border-rose-300/80',
      iconBg: 'bg-rose-100/80',
      icon: 'text-rose-700',
      label: 'text-rose-600',
      count: 'text-rose-900',
      subtitle: 'text-rose-700',
      footerBorder: 'border-rose-200/80',
      footerBg: 'bg-rose-100/60',
      footerText: 'text-rose-800',
      footerIcon: 'text-rose-700',
    },
    amber: {
      card: 'from-amber-50/60',
      iconBorder: 'border-amber-300/80',
      iconBg: 'bg-amber-100/80',
      icon: 'text-amber-700',
      label: 'text-amber-600',
      count: 'text-amber-900',
      subtitle: 'text-amber-700',
      footerBorder: 'border-amber-200/80',
      footerBg: 'bg-amber-100/60',
      footerText: 'text-amber-800',
      footerIcon: 'text-amber-700',
    },
  };
  const c = tones[tone];

  return (
    <ExecutiveGlassCard
      onClick={onOpen}
      className={`h-full cursor-pointer bg-gradient-to-br ${c.card} to-white/60 p-5 transition-shadow hover:shadow-md`}
    >
      <div className="flex items-start justify-between gap-3">
        <div
          className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl border ${c.iconBorder} ${c.iconBg}`}
        >
          <Icon className={`h-5 w-5 ${c.icon}`} />
        </div>
        <div className="min-w-0 flex-1 text-right">
          <p className={`text-[10px] font-bold uppercase tracking-widest ${c.label}`}>{title}</p>
          <p className={`mt-1 text-2xl font-black tabular-nums leading-none ${c.count}`}>
            {count} Guards
          </p>
          <p className={`mt-1 text-[11px] font-semibold leading-tight ${c.subtitle}`}>{subtitle}</p>
        </div>
      </div>
      <div
        className={`mt-3 flex items-center gap-2 rounded-xl border ${c.footerBorder} ${c.footerBg} px-3 py-2`}
      >
        <AlertOctagon className={`h-3.5 w-3.5 flex-shrink-0 ${c.footerIcon}`} />
        <span className={`text-[10px] font-black uppercase tracking-wider ${c.footerText}`}>
          {footer}
        </span>
      </div>
      <p className="mt-2 text-right text-[10px] font-semibold text-slate-400">
        {monthLabel} · threshold {threshold} shifts
      </p>
    </ExecutiveGlassCard>
  );
}

export default function FmLedgerSummaryCards({
  period,
  onOpenReport,
}: {
  period: PayrollPeriod;
  onOpenReport: (kind: FmPortfolioReportKind) => void;
}) {
  const scale = historicalPortfolioScale(period);
  const prevMonth = prevPayrollMonth(period);
  const periodLabel = formatPayrollPeriodLabel(period);
  const prevMonthLabel = formatPayrollPeriodLabel(prevMonth);
  const prevMonthShort = formatPayrollPeriodLabel(prevMonth, 'short').split(' ')[0];

  const deductionsTotal = Math.round(TOTAL_RECONCILED_DEDUCTIONS_LIVE * scale);
  const stopCount = Math.max(1, Math.round(PREV_MONTH_STOP_COUNT * scale));
  const halfHoldCount = Math.max(1, Math.round(SALARY_MONTH_HALF_HOLD_COUNT * scale));

  return (
    <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <DeductionsSummaryCard
        amount={deductionsTotal}
        onOpen={() => onOpenReport('deductions')}
      />
      <StopListSummaryCard
        count={stopCount}
        threshold={PREV_MONTH_THRESHOLD}
        monthLabel={prevMonthLabel}
        title="Active Stop List — Previous Month Threshold"
        subtitle={`Payment halted — ${prevMonthShort} shifts below threshold`}
        footer="Retention Engine — Hard Stop Active"
        icon={History}
        tone="rose"
        onOpen={() => onOpenReport('stop-list')}
      />
      <StopListSummaryCard
        count={halfHoldCount}
        threshold={SALARY_MONTH_THRESHOLD}
        monthLabel={periodLabel}
        title="Half Salary Hold — Salary Month Threshold"
        subtitle={`Half salary only — ${periodLabel.split(' ')[0]} shifts below threshold`}
        footer="Retention Engine — Half Salary Active"
        icon={Banknote}
        tone="amber"
        onOpen={() => onOpenReport('half-hold')}
      />
    </div>
  );
}
