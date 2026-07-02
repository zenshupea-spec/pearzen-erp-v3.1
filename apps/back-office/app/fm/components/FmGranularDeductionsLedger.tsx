'use client';

import { useEffect, useMemo, useState } from 'react';
import { Receipt } from 'lucide-react';
import { ExecutiveGlassCard } from '../../../components/executive/ExecutiveVaultShell';
import {
  DEFAULT_WELFARE_FUND_SETTINGS,
  welfareFundTotalForPeriod,
} from '../../../../../packages/welfare-fund';
import FmBatchDeductionModal from './FmBatchDeductionModal';
import FmWelfareFundModal from './FmWelfareFundModal';
import FmPayrollMonthSelector from './FmPayrollMonthSelector';
import {
  deductionLedgerTotal,
  type BatchDeductionKind,
  type BatchDeductionRow,
} from '../lib/batch-deductions-ledger';
import {
  fetchFmBatchDeductionLedger,
  getFmWelfareFundSettings,
} from '../fm-batch-deductions-actions';
import {
  FM_LIVE_PAYROLL_PERIOD,
  formatPayrollPeriodLabel,
  type PayrollPeriod,
} from '../lib/payroll-period';

type DeductionColor = 'indigo' | 'violet' | 'amber' | 'rose' | 'teal';

const LEDGER_CARD_META: {
  kind: BatchDeductionKind | 'welfare';
  label: string;
  sublabel: string;
  color: DeductionColor;
  cta: string;
}[] = [
  {
    kind: 'meals',
    label: 'Meals Deductions',
    sublabel: 'Canteen & site meal recoveries',
    color: 'indigo',
    cta: 'View employee breakdown →',
  },
  {
    kind: 'uniform',
    label: 'Uniform Deductions',
    sublabel: 'Uniform & boot recovery schedule',
    color: 'violet',
    cta: 'View employee breakdown →',
  },
  {
    kind: 'advance',
    label: 'Advance Salary Deductions',
    sublabel: 'One-time salary advance recoveries',
    color: 'amber',
    cta: 'View employee breakdown →',
  },
  {
    kind: 'penalty',
    label: 'Penalty Deductions',
    sublabel: 'Disciplinary fines from SM penalty catalog',
    color: 'rose',
    cta: 'View employee breakdown →',
  },
  {
    kind: 'welfare',
    label: 'Welfare Fund',
    sublabel: 'Employee welfare fund — monthly payroll deduction',
    color: 'teal',
    cta: 'View monthly contributions →',
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

const EMPTY_LEDGER: Record<BatchDeductionKind, BatchDeductionRow[]> = {
  meals: [],
  uniform: [],
  advance: [],
  penalty: [],
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
  const [ledgerRows, setLedgerRows] = useState(EMPTY_LEDGER);
  const [ledgerLoading, setLedgerLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    getFmWelfareFundSettings().then((cfg) => {
      if (!cancelled) setWelfareFundSettings(cfg);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLedgerLoading(true);

    Promise.all([
      fetchFmBatchDeductionLedger('meals', deductionsPeriod.year, deductionsPeriod.month),
      fetchFmBatchDeductionLedger('uniform', deductionsPeriod.year, deductionsPeriod.month),
      fetchFmBatchDeductionLedger('advance', deductionsPeriod.year, deductionsPeriod.month),
      fetchFmBatchDeductionLedger('penalty', deductionsPeriod.year, deductionsPeriod.month),
    ])
      .then(([meals, uniform, advance, penalty]) => {
        if (cancelled) return;
        setLedgerRows({ meals, uniform, advance, penalty });
      })
      .catch((error) => {
        console.error('FmGranularDeductionsLedger:', error);
        if (!cancelled) setLedgerRows(EMPTY_LEDGER);
      })
      .finally(() => {
        if (!cancelled) setLedgerLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [deductionsPeriod.year, deductionsPeriod.month]);

  const deductionsPeriodLabel = formatPayrollPeriodLabel(deductionsPeriod);
  const welfareFundAmount = useMemo(
    () => welfareFundTotalForPeriod(welfareFundSettings, headcount, 1),
    [welfareFundSettings, headcount],
  );

  const allLedgerCards = useMemo((): LedgerCardItem[] => {
    return LEDGER_CARD_META.map((meta) => {
      if (meta.kind === 'welfare') {
        return {
          label: meta.label,
          sublabel: `${meta.sublabel} · ${welfareFundSettings.monthlyDeductionLkr.toLocaleString()} LKR × ${Math.max(1, headcount)} staff`,
          amount: welfareFundAmount,
          color: meta.color,
          kind: 'welfare' as const,
        };
      }

      const rows = ledgerRows[meta.kind];
      return {
        label: meta.label,
        sublabel: meta.sublabel,
        amount: deductionLedgerTotal(rows),
        color: meta.color,
        drillDown: meta.kind,
      };
    });
  }, [ledgerRows, welfareFundAmount, welfareFundSettings.monthlyDeductionLkr, headcount]);

  const totalDeductions = useMemo(
    () => allLedgerCards.reduce((sum, d) => sum + d.amount, 0),
    [allLedgerCards],
  );

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
            <span className="font-black text-slate-800">
              {ledgerLoading ? '…' : lkrFull(totalDeductions)}
            </span>
          </span>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {allLedgerCards.map((d) => {
            const c = colorMap[d.color as DeductionColor];
            const pct = totalDeductions > 0 ? Math.round((d.amount / totalDeductions) * 100) : 0;
            const isWelfare = 'kind' in d && d.kind === 'welfare';
            const meta = LEDGER_CARD_META.find((entry) => entry.label === d.label);
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
                  <p className={`mt-2 text-2xl font-black tabular-nums ${c.text}`}>
                    {ledgerLoading && !isWelfare ? '…' : lkr(d.amount)}
                  </p>
                  <p className="mt-1 text-[11px] font-semibold text-slate-500">{d.sublabel}</p>
                  <p className={`mt-2 text-[10px] font-bold ${c.icon} opacity-90`}>
                    {isWelfare ? meta?.cta : 'View employee breakdown →'}
                  </p>
                </div>
                <div className="px-5 pb-4 pt-3">
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Share of Total</span>
                    <span className="text-[11px] font-black tabular-nums text-slate-700">
                      {ledgerLoading && !isWelfare ? '…' : `${pct}%`}
                    </span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100/80">
                    <div
                      className={`h-full rounded-full ${c.bar}`}
                      style={{ width: ledgerLoading && !isWelfare ? '0%' : `${pct}%` }}
                    />
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
          rows={ledgerRows[deductionModal]}
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
