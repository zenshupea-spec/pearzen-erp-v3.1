'use client';

import { useEffect, useMemo, useState } from 'react';
import { Receipt } from 'lucide-react';
import { ExecutiveGlassCard } from '../../../components/executive/ExecutiveVaultShell';
import { getWelfareFundSettings } from '../../executive/settings/welfare-fund-actions';
import {
  DEFAULT_WELFARE_FUND_SETTINGS,
  welfareFundTotalForPeriod,
} from '../../../../../packages/welfare-fund';
import FmBatchDeductionModal from './FmBatchDeductionModal';
import FmWelfareFundModal from './FmWelfareFundModal';
import FmPayrollMonthSelector from './FmPayrollMonthSelector';
import {
  deductionLedgerTotal,
  getDeductionLedger,
  type BatchDeductionKind,
} from '../lib/batch-deductions-ledger';
import {
  FM_LIVE_PAYROLL_PERIOD,
  formatPayrollPeriodLabel,
  historicalPortfolioScale,
  type PayrollPeriod,
} from '../lib/payroll-period';

type DeductionColor = 'indigo' | 'violet' | 'amber' | 'rose' | 'teal';

const WELFARE_FUND_CARD = {
  label: 'Welfare Fund',
  sublabel: 'Employee welfare fund — monthly payroll deduction',
  color: 'teal' as const,
  cta: 'View monthly contributions →',
};

const BASE_DEDUCTIONS: {
  label: string;
  sublabel: string;
  amount: number;
  color: DeductionColor;
  drillDown: BatchDeductionKind;
}[] = [
  {
    label: 'Meals Deductions',
    sublabel: 'Canteen & site meal recoveries',
    amount: deductionLedgerTotal(getDeductionLedger('meals')),
    color: 'indigo',
    drillDown: 'meals',
  },
  {
    label: 'Uniform Deductions',
    sublabel: 'Uniform & boot recovery schedule',
    amount: deductionLedgerTotal(getDeductionLedger('uniform')),
    color: 'violet',
    drillDown: 'uniform',
  },
  {
    label: 'Advance Salary Deductions',
    sublabel: 'One-time salary advance recoveries',
    amount: deductionLedgerTotal(getDeductionLedger('advance')),
    color: 'amber',
    drillDown: 'advance',
  },
  {
    label: 'Penalty Deductions',
    sublabel: 'Disciplinary fines & client pass-through',
    amount: deductionLedgerTotal(getDeductionLedger('penalty')),
    color: 'rose',
    drillDown: 'penalty',
  },
];

type LedgerCardItem = {
  label: string;
  sublabel: string;
  amount: number;
  color: DeductionColor;
  drillDown?: BatchDeductionKind;
  kind?: 'welfare';
};

const colorMap: Record<DeductionColor, { border: string; bg: string; icon: string; text: string; bar: string }> = {
  indigo: { border: 'border-indigo-200/70', bg: 'bg-indigo-50/60', icon: 'text-indigo-600', text: 'text-indigo-900', bar: 'bg-indigo-500' },
  violet: { border: 'border-violet-200/70', bg: 'bg-violet-50/60', icon: 'text-violet-600', text: 'text-violet-900', bar: 'bg-violet-500' },
  amber:  { border: 'border-amber-200/70',  bg: 'bg-amber-50/60',  icon: 'text-amber-600',  text: 'text-amber-900',  bar: 'bg-amber-500'  },
  rose:   { border: 'border-rose-200/70',   bg: 'bg-rose-50/60',   icon: 'text-rose-600',   text: 'text-rose-900',   bar: 'bg-rose-500'   },
  teal:   { border: 'border-teal-200/70',   bg: 'bg-teal-50/60',   icon: 'text-teal-600',   text: 'text-teal-900',   bar: 'bg-teal-500'   },
};

function lkr(n: number) {
  const abs = Math.abs(n);
  const sign = n < 0 ? '−' : '';
  if (abs >= 1_000_000) return `${sign}LKR ${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${sign}LKR ${(abs / 1_000).toFixed(1)}K`;
  return `${sign}LKR ${abs.toLocaleString()}`;
}

function lkrFull(n: number) {
  const abs = Math.abs(n);
  const sign = n < 0 ? '−' : '';
  return `${sign}LKR ${abs.toLocaleString('en-LK')}`;
}

export default function FmGranularDeductionsLedger({
  headcount,
  defaultPeriod = FM_LIVE_PAYROLL_PERIOD,
}: {
  headcount: number;
  defaultPeriod?: PayrollPeriod;
}) {
  const [deductionsPeriod, setDeductionsPeriod] = useState(defaultPeriod);
  const [deductionModal, setDeductionModal] = useState<BatchDeductionKind | null>(null);
  const [welfareModalOpen, setWelfareModalOpen] = useState(false);
  const [welfareFundSettings, setWelfareFundSettings] = useState(DEFAULT_WELFARE_FUND_SETTINGS);
  useEffect(() => {
    let cancelled = false;
    getWelfareFundSettings().then((cfg) => {
      if (!cancelled) setWelfareFundSettings(cfg);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const deductionsScale = historicalPortfolioScale(deductionsPeriod);
  const deductionsPeriodLabel = formatPayrollPeriodLabel(deductionsPeriod);
  const welfareFundAmount = useMemo(
    () => welfareFundTotalForPeriod(welfareFundSettings, headcount, deductionsScale),
    [welfareFundSettings, headcount, deductionsScale],
  );
  const scaledDeductions = useMemo(
    () =>
      BASE_DEDUCTIONS.map((d) => ({
        ...d,
        amount: Math.round(d.amount * deductionsScale),
      })),
    [deductionsScale],
  );
  const allLedgerCards = useMemo((): LedgerCardItem[] => {
    return [
      ...scaledDeductions,
      {
        label: WELFARE_FUND_CARD.label,
        sublabel: `${WELFARE_FUND_CARD.sublabel} · ${welfareFundSettings.monthlyDeductionLkr.toLocaleString()} LKR × ${Math.max(1, Math.round(headcount * deductionsScale))} staff`,
        amount: welfareFundAmount,
        color: WELFARE_FUND_CARD.color,
        kind: 'welfare' as const,
      },
    ];
  }, [
    scaledDeductions,
    welfareFundAmount,
    welfareFundSettings.monthlyDeductionLkr,
    headcount,
    deductionsScale,
  ]);

  const totalDeductions = useMemo(
    () => allLedgerCards.reduce((sum, d) => sum + d.amount, 0),
    [allLedgerCards],
  );
  const scaledLedgerRows = (kind: BatchDeductionKind) =>
    getDeductionLedger(kind).map((r) => ({
      ...r,
      amountLkr: Math.round(r.amountLkr * deductionsScale),
    }));

  return (
    <>
      <div className="mt-8 border-t border-slate-200/70 pt-8">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Receipt className="h-4 w-4 text-slate-600" />
          <h2 className="text-[11px] font-black uppercase tracking-widest text-slate-700">
            Granular Deductions Ledger
          </h2>
          <FmPayrollMonthSelector period={deductionsPeriod} onChange={setDeductionsPeriod} />
          <span className="ml-auto text-[11px] font-bold text-slate-500">
            Total ({deductionsPeriodLabel}):{' '}
            <span className="font-black text-slate-800">{lkrFull(totalDeductions)}</span>
          </span>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {allLedgerCards.map((d) => {
            const c = colorMap[d.color as DeductionColor];
            const pct = totalDeductions > 0 ? Math.round((d.amount / totalDeductions) * 100) : 0;
            const isWelfare = 'kind' in d && d.kind === 'welfare';
            return (
              <ExecutiveGlassCard
                key={d.label}
                className={`overflow-hidden border ${c.border} cursor-pointer transition-shadow hover:shadow-[0_16px_56px_-12px_rgba(15,23,42,0.18)]`}
                onClick={() =>
                  isWelfare
                    ? setWelfareModalOpen(true)
                    : d.drillDown
                      ? setDeductionModal(d.drillDown)
                      : undefined
                }
              >
                <div className={`px-5 py-4 ${c.bg}`}>
                  <p className={`text-[10px] font-black uppercase tracking-widest ${c.icon}`}>{d.label}</p>
                  <p className={`mt-2 text-2xl font-black tabular-nums ${c.text}`}>{lkr(d.amount)}</p>
                  <p className="mt-1 text-[11px] font-semibold text-slate-500">{d.sublabel}</p>
                  <p className={`mt-2 text-[10px] font-bold ${c.icon} opacity-90`}>
                    {isWelfare ? WELFARE_FUND_CARD.cta : 'View employee breakdown →'}
                  </p>
                </div>
                <div className="px-5 pb-4 pt-3">
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Share of Total</span>
                    <span className="text-[11px] font-black tabular-nums text-slate-700">{pct}%</span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100/80">
                    <div className={`h-full rounded-full ${c.bar}`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              </ExecutiveGlassCard>
            );
          })}
        </div>
      </div>

      {deductionModal && (
        <FmBatchDeductionModal
          kind={deductionModal}
          periodLabel={deductionsPeriodLabel}
          rows={scaledLedgerRows(deductionModal)}
          onClose={() => setDeductionModal(null)}
        />
      )}

      {welfareModalOpen && (
        <FmWelfareFundModal
          settings={welfareFundSettings}
          liveHeadcount={headcount}
          highlightPeriod={deductionsPeriod}
          onClose={() => setWelfareModalOpen(false)}
        />
      )}
    </>
  );
}
