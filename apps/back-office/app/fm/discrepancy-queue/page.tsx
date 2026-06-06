'use client';

import React, { useState, useMemo, useCallback } from 'react';
import Link from 'next/link';
import FmSubnav from '../components/FmSubnav';
import {
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  FileWarning,
  Info,
  Lock,
  Send,
  ShieldAlert,
  TrendingDown,
  Users,
  X,
  Search,
} from 'lucide-react';
import {
  computeRecoverySchedule,
  formatRecoveryDurationLabel,
  RECOVERY_COVERAGE_TOLERANCE_LKR,
} from '../../../lib/recovery-plan';

// ─── Glass Card ───────────────────────────────────────────────────────────────

function DarkGlassCard({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-2xl border border-slate-200 bg-white shadow-sm ring-1 ring-slate-100 ${className}`.trim()}
    >
      {children}
    </div>
  );
}

// ─── Types ────────────────────────────────────────────────────────────────────

type RankKey = 'CSO' | 'OIC' | 'SSO' | 'JSO' | 'LSO';
type DeficitStatus = 'UNRESOLVED' | 'SUBMITTED';

interface GuardProfile {
  empNo: string;
  name: string;
  rank: RankKey;
  basicSalary: number;
  unpaidShiftsLastMonth: number;
}

interface SubmittedStructure {
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
}

interface UnresolvedDeficit {
  deficitId: string;
  incidentRef: string;
  clientName: string;
  invoiceNo: string;
  invoiceMonth: string;
  deficitAmount: number;
  incidentDate: string;
  description: string;
  status: DeficitStatus;
  submittedStructure?: SubmittedStructure;
}

interface FormDraft {
  selectedEmpNos: string[];
  totalLoss: string;
  deductionMethod: 'MONTHLY' | 'CUT_SHIFTS';
  monthlyDeduction: string;
  durationMonths: string;
  guardPercentages: Record<string, string>;
  perShiftValueLkr: string;
  guardShiftsPerMonth: Record<string, string>;
  omNote: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const WB_WORKING_DAYS    = 26;

const RANK_STYLE: Record<RankKey, { pill: string }> = {
  CSO: { pill: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  OIC: { pill: 'bg-purple-50 text-purple-700 border-purple-200' },
  SSO: { pill: 'bg-blue-50   text-blue-700   border-blue-200'  },
  JSO: { pill: 'bg-sky-50    text-sky-700    border-sky-200'   },
  LSO: { pill: 'bg-slate-100 text-slate-600  border-slate-300' },
};

const INITIAL_DEFICITS: UnresolvedDeficit[] = [
  {
    deficitId: 'DEF-001',
    incidentRef: 'INC-2026-047',
    clientName: 'Arpico Supercentre',
    invoiceNo: 'INV-2605-003',
    invoiceMonth: 'May 2026',
    deficitAmount: 75_000,
    incidentDate: '2026-05-04',
    description: 'Unauthorized access via unmanned rear gate on night shift. Security post abandoned — client CCTV evidence submitted.',
    status: 'UNRESOLVED',
  },
  {
    deficitId: 'DEF-002',
    incidentRef: 'INC-2026-052',
    clientName: 'Lanka Hospitals',
    invoiceNo: 'INV-2605-002',
    invoiceMonth: 'May 2026',
    deficitAmount: 45_000,
    incidentDate: '2026-05-11',
    description: 'Guard confirmed asleep on duty during overnight shift. Client VIP corridor left unmonitored for 3+ hours. Formal complaint lodged.',
    status: 'UNRESOLVED',
  },
  {
    deficitId: 'DEF-003',
    incidentRef: 'INC-2026-031',
    clientName: 'Dialog Axiata HQ',
    invoiceNo: 'INV-2604-004',
    invoiceMonth: 'April 2026',
    deficitAmount: 32_500,
    incidentDate: '2026-04-28',
    description: 'Uniform violation and failure to conduct prescribed perimeter checks. Client raised formal written complaint referencing SLA Clause 7(b).',
    status: 'SUBMITTED',
    submittedStructure: {
      guardEmpNos: ['EMP-1091', 'EMP-1115'],
      totalLoss: 32_500,
      monthlyDeduction: 16_250,
      durationMonths: 2,
      deductionMethod: 'MONTHLY',
      omNote: 'Both guards confirmed on shift during the complaint window. Patrol log discrepancy noted. Training breach escalated to HR.',
      submittedAt: '2026-05-19T10:32:00Z',
    },
  },
];

const GUARD_ROSTER: GuardProfile[] = [
  { empNo: 'EMP-1042', name: 'Suresh Bandara',       rank: 'JSO', basicSalary: 32_000, unpaidShiftsLastMonth: 22 },
  { empNo: 'EMP-1087', name: 'Ranjith Perera',       rank: 'JSO', basicSalary: 32_000, unpaidShiftsLastMonth: 26 },
  { empNo: 'EMP-1103', name: 'Chaminda Silva',        rank: 'JSO', basicSalary: 32_000, unpaidShiftsLastMonth: 18 },
  { empNo: 'EMP-1024', name: 'Kasun Fernando',        rank: 'SSO', basicSalary: 42_000, unpaidShiftsLastMonth: 24 },
  { empNo: 'EMP-1056', name: 'Pradeep Rajapaksa',     rank: 'SSO', basicSalary: 42_000, unpaidShiftsLastMonth: 20 },
  { empNo: 'EMP-1078', name: 'Nimal Jayawardena',     rank: 'OIC', basicSalary: 52_000, unpaidShiftsLastMonth: 26 },
  { empNo: 'EMP-1091', name: 'Roshan Dissanayake',    rank: 'JSO', basicSalary: 32_000, unpaidShiftsLastMonth: 14 },
  { empNo: 'EMP-1115', name: 'Thilak Gunasekara',     rank: 'JSO', basicSalary: 32_000, unpaidShiftsLastMonth: 19 },
  { empNo: 'EMP-1033', name: 'Madhawa Seneviratne',   rank: 'SSO', basicSalary: 42_000, unpaidShiftsLastMonth: 25 },
  { empNo: 'EMP-1099', name: 'Vimukthi Bandara',      rank: 'LSO', basicSalary: 28_000, unpaidShiftsLastMonth: 16 },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

const lkr = (n: number) =>
  'LKR ' + n.toLocaleString('en-LK', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

const emptyDraft = (amount: number): FormDraft => ({
  selectedEmpNos: [],
  totalLoss: String(amount),
  deductionMethod: 'CUT_SHIFTS',
  monthlyDeduction: '',
  durationMonths: '',
  guardPercentages: {},
  perShiftValueLkr: '',
  guardShiftsPerMonth: {},
  omNote: '',
});

function fmtTs(iso: string) {
  const d = new Date(iso);
  return (
    d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) +
    ' · ' +
    d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  );
}

// ─── Guard Selector ───────────────────────────────────────────────────────────

function GuardSelector({ selected, onChange }: { selected: string[]; onChange: (empNos: string[]) => void }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const filtered = useMemo(
    () =>
      GUARD_ROSTER.filter(
        (g) =>
          g.name.toLowerCase().includes(search.toLowerCase()) ||
          g.empNo.toLowerCase().includes(search.toLowerCase()) ||
          g.rank.toLowerCase().includes(search.toLowerCase()),
      ),
    [search],
  );

  const toggle = (empNo: string) => {
    onChange(selected.includes(empNo) ? selected.filter((e) => e !== empNo) : [...selected, empNo]);
  };

  const selectedGuards = GUARD_ROSTER.filter((g) => selected.includes(g.empNo));

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`flex w-full items-center gap-2.5 rounded-xl border px-3.5 py-2.5 text-left transition-all ${
          open
            ? 'border-indigo-400 bg-indigo-50 shadow-sm'
            : 'border-slate-300 bg-white hover:border-slate-400 hover:bg-slate-50'
        }`}
      >
        <Users className={`h-4 w-4 flex-shrink-0 transition-colors ${open ? 'text-indigo-600' : 'text-slate-400'}`} />
        <span className={`flex-1 text-sm font-bold transition-colors ${open ? 'text-indigo-700' : 'text-slate-600'}`}>
          {selected.length === 0
            ? 'Select responsible guards…'
            : `${selected.length} guard${selected.length !== 1 ? 's' : ''} selected`}
        </span>
        <ChevronDown className={`h-4 w-4 flex-shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute z-20 top-full left-0 right-0 mt-1 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lg">
            <div className="border-b border-slate-100 p-2">
              <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                <Search className="h-3.5 w-3.5 flex-shrink-0 text-slate-400" />
                <input
                  type="text"
                  autoFocus
                  placeholder="Search by name, ID, or rank…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="flex-1 bg-transparent text-sm text-slate-700 placeholder-slate-400 outline-none"
                />
              </div>
            </div>
            <div className="max-h-64 overflow-y-auto p-2">
              {filtered.map((g) => {
                const isSelected = selected.includes(g.empNo);
                const rs = RANK_STYLE[g.rank];
                return (
                  <button
                    key={g.empNo}
                    type="button"
                    onClick={() => toggle(g.empNo)}
                    className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-all ${
                      isSelected ? 'bg-indigo-50' : 'hover:bg-slate-50'
                    }`}
                  >
                    <div className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded border transition-all ${
                      isSelected ? 'border-indigo-500 bg-indigo-600' : 'border-slate-300 bg-white'
                    }`}>
                      {isSelected && <Check className="h-3 w-3 text-white" />}
                    </div>
                    <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-slate-200 text-sm font-black text-slate-700">
                      {g.name.split(' ').map((n) => n[0]).join('')}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-slate-800">{g.name}</p>
                      <p className="font-mono text-sm text-slate-400">{g.empNo}</p>
                    </div>
                    <span className={`inline-flex flex-shrink-0 rounded-full border px-2 py-0.5 text-sm font-black ${rs.pill}`}>
                      {g.rank}
                    </span>
                  </button>
                );
              })}
              {filtered.length === 0 && (
                <p className="py-8 text-center text-sm text-slate-400">No guards match your search</p>
              )}
            </div>
          </div>
        </>
      )}

      {selectedGuards.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {selectedGuards.map((g) => {
            const rs = RANK_STYLE[g.rank];
            return (
              <span
                key={g.empNo}
                className="inline-flex items-center gap-1.5 rounded-xl border border-indigo-200 bg-indigo-50 py-1 pl-2 pr-1 text-sm font-bold text-indigo-700"
              >
                <span className={`inline-flex rounded-full border px-1.5 py-0.5 text-sm font-black ${rs.pill}`}>
                  {g.rank}
                </span>
                {g.name}
                <button
                  type="button"
                  onClick={() => toggle(g.empNo)}
                  className="ml-0.5 flex h-4 w-4 items-center justify-center rounded-full hover:bg-indigo-100 transition-colors"
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Deficit Queue Card ───────────────────────────────────────────────────────

function DeficitQueueCard({ deficit, isActive, onSelect }: { deficit: UnresolvedDeficit; isActive: boolean; onSelect: () => void }) {
  const isSubmitted = deficit.status === 'SUBMITTED';
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full rounded-2xl border p-4 text-left transition-all ${
        isActive
          ? isSubmitted
            ? 'border-emerald-300 bg-emerald-50 shadow-sm'
            : 'border-indigo-300 bg-indigo-50 shadow-sm'
          : 'border-slate-200 bg-white hover:bg-slate-50 hover:border-slate-300'
      }`}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-xl border ${
            isSubmitted ? 'border-emerald-200 bg-emerald-50' : 'border-rose-200 bg-rose-50'
          }`}>
            {isSubmitted
              ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
              : <FileWarning   className="h-3.5 w-3.5 text-rose-500"    />
            }
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-black text-slate-900">{deficit.clientName}</p>
            <p className="font-mono text-sm text-slate-400">{deficit.incidentRef}</p>
          </div>
        </div>
        <span className={`flex-shrink-0 inline-flex rounded-full border px-2 py-0.5 text-sm font-black ${
          isSubmitted
            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
            : 'bg-rose-50 text-rose-700 border-rose-200'
        }`}>
          {isSubmitted ? 'SUBMITTED' : 'UNRESOLVED'}
        </span>
      </div>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-slate-500">{deficit.invoiceNo} · {deficit.invoiceMonth}</p>
          <p className="text-base font-black text-slate-900 mt-0.5">{lkr(deficit.deficitAmount)}</p>
        </div>
        <ArrowRight className={`h-4 w-4 flex-shrink-0 transition-colors ${isActive ? 'text-indigo-600' : 'text-slate-400'}`} />
      </div>
    </button>
  );
}

// ─── Submitted View ───────────────────────────────────────────────────────────

function SubmittedView({ deficit }: { deficit: UnresolvedDeficit }) {
  const s = deficit.submittedStructure!;
  const guards = GUARD_ROSTER.filter((g) => s.guardEmpNos.includes(g.empNo));
  const isCutShifts = s.deductionMethod === 'CUT_SHIFTS';
  const multiGuard  = guards.length > 1;

  const getGuardMonthly = (empNo: string) => {
    if (isCutShifts) {
      const shifts = s.guardShiftsPerMonth?.[empNo] ?? 0;
      const guard = GUARD_ROSTER.find((g) => g.empNo === empNo);
      const perShift = s.perShiftValuesLkr?.[empNo]
        ?? (guard ? guard.basicSalary / WB_WORKING_DAYS : (s.perShiftValueLkr ?? 0));
      return shifts * perShift;
    }
    if (multiGuard) {
      const pct = s.guardPercentages?.[empNo] ?? 0;
      return s.monthlyDeduction * pct / 100;
    }
    return guards.length > 0 ? s.monthlyDeduction / guards.length : 0;
  };

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
        <CheckCircle2 className="mt-0.5 h-5 w-5 flex-shrink-0 text-emerald-600" />
        <div>
          <p className="text-base font-black text-emerald-800">Recovery Structure Submitted to MD Vault</p>
          <p className="mt-0.5 text-sm text-emerald-600">
            Submitted {fmtTs(s.submittedAt)} · The Pass-Through Penalty Bridge in the MD&apos;s invoice drill-down now reflects this amortization plan.
          </p>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 space-y-4">
        <div className="flex items-center gap-3">
          <p className="text-sm font-black uppercase tracking-widest text-slate-500">Submitted Recovery Plan</p>
          <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-black ${
            isCutShifts ? 'border-indigo-200 bg-indigo-50 text-indigo-700' : 'border-slate-200 bg-white text-slate-600'
          }`}>
            {isCutShifts ? 'Cut Shifts' : 'Monthly Deduction'}
          </span>
        </div>
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Total Loss',        value: lkr(s.totalLoss) },
            { label: isCutShifts ? 'Monthly Recovery' : 'Monthly Deduction', value: lkr(s.monthlyDeduction) },
            { label: 'Duration',          value: `${s.durationMonths} month${s.durationMonths !== 1 ? 's' : ''}` },
          ].map((kv) => (
            <div key={kv.label} className="rounded-xl border border-slate-200 bg-white p-3">
              <p className="text-sm font-bold uppercase tracking-wider text-slate-500">{kv.label}</p>
              <p className="mt-0.5 text-base font-black text-slate-900">{kv.value}</p>
            </div>
          ))}
        </div>

        <div>
          <p className="mb-2 text-sm font-bold uppercase tracking-wider text-slate-500">Responsible Guards ({guards.length})</p>
          <div className="space-y-1.5">
            {guards.map((g) => {
              const rs = RANK_STYLE[g.rank];
              const monthly = getGuardMonthly(g.empNo);
              const shifts  = s.guardShiftsPerMonth?.[g.empNo] ?? 0;
              const pct     = s.guardPercentages?.[g.empNo] ?? 0;
              return (
                <div key={g.empNo} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2">
                  <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-slate-200 text-sm font-black text-slate-700">
                    {g.name.split(' ').map((n) => n[0]).join('')}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-slate-900">{g.name}</p>
                    <p className="font-mono text-sm text-slate-400">{g.empNo}</p>
                  </div>
                  <span className={`inline-flex rounded-full border px-1.5 py-0.5 text-sm font-black ${rs.pill}`}>{g.rank}</span>
                  {isCutShifts && (
                    <span className="text-xs text-slate-500 font-mono">{shifts} shift{shifts !== 1 ? 's' : ''}/mo</span>
                  )}
                  {!isCutShifts && multiGuard && (
                    <span className="text-xs font-black text-indigo-600">{pct}%</span>
                  )}
                  <span className="text-sm font-black text-slate-700">
                    {lkr(Math.round(monthly))}<span className="font-medium text-slate-400">/mo</span>
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {s.omNote && (
          <div className="rounded-xl border border-slate-200 bg-white p-3">
            <p className="mb-1 text-sm font-bold uppercase tracking-wider text-slate-500">FM Internal Note</p>
            <p className="text-sm italic text-slate-500">&ldquo;{s.omNote}&rdquo;</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Recovery Config Form ─────────────────────────────────────────────────────

function RecoveryConfigForm({
  deficit,
  draft,
  onFieldChange,
  onSubmit,
  isSubmitting,
}: {
  deficit: UnresolvedDeficit;
  draft: FormDraft;
  onFieldChange: <K extends keyof FormDraft>(key: K, value: FormDraft[K]) => void;
  onSubmit: () => void;
  isSubmitting: boolean;
}) {
  const selectedGuards = GUARD_ROSTER.filter((g) => draft.selectedEmpNos.includes(g.empNo));
  const multiGuard = selectedGuards.length > 1;
  const isCutShifts = (draft.deductionMethod ?? 'CUT_SHIFTS') === 'CUT_SHIFTS';

  const calc = useMemo(() => {
    const totalLossNum    = parseFloat(draft.totalLoss) || 0;
    const guardsCount     = selectedGuards.length;

    let totalMonthlyRecovery = 0;
    let monthlyDeductionNum  = 0;
    let durationNum          = 0;
    let totalPlan            = 0;
    let shortfall            = 0;
    let finalMonthDeductionLkr: number | null = null;
    let fullMonths           = 0;

    const perGuardMonthlyMap: Record<string, number> = {};
    const perShiftValueMap: Record<string, number> = {};

    const shiftsMap = draft.guardShiftsPerMonth ?? {};
    const pctMap    = draft.guardPercentages ?? {};

    if (isCutShifts) {
      selectedGuards.forEach((g) => {
        const perShiftValue = g.basicSalary / WB_WORKING_DAYS;
        perShiftValueMap[g.empNo] = perShiftValue;
        const shifts = parseInt(shiftsMap[g.empNo] ?? '0') || 0;
        const monthly = shifts * perShiftValue;
        perGuardMonthlyMap[g.empNo] = monthly;
        totalMonthlyRecovery += monthly;
      });
      monthlyDeductionNum = totalMonthlyRecovery;
      const schedule = computeRecoverySchedule(totalLossNum, totalMonthlyRecovery);
      durationNum = schedule.durationMonths;
      totalPlan = schedule.totalPlan;
      shortfall = schedule.shortfall;
      finalMonthDeductionLkr = schedule.finalMonthDeductionLkr;
      fullMonths = schedule.fullMonths;
    } else {
      monthlyDeductionNum = parseFloat(draft.monthlyDeduction) || 0;
      totalMonthlyRecovery = monthlyDeductionNum;
      selectedGuards.forEach((g) => {
        const pct = multiGuard ? (parseFloat(pctMap[g.empNo] ?? '0') || 0) : 100;
        perGuardMonthlyMap[g.empNo] = monthlyDeductionNum * pct / 100;
      });
      const schedule = computeRecoverySchedule(totalLossNum, monthlyDeductionNum);
      durationNum = schedule.durationMonths;
      totalPlan = schedule.totalPlan;
      shortfall = schedule.shortfall;
      finalMonthDeductionLkr = schedule.finalMonthDeductionLkr;
      fullMonths = schedule.fullMonths;
    }

    const coveragePct  = totalLossNum > 0 ? Math.min(200, Math.round((totalPlan / totalLossNum) * 100)) : 0;

    const percentageSum = multiGuard && !isCutShifts
      ? selectedGuards.reduce((s, g) => s + (parseFloat(pctMap[g.empNo] ?? '0') || 0), 0)
      : 100;

    return {
      totalLossNum, monthlyDeductionNum, durationNum, guardsCount, totalMonthlyRecovery,
      perGuardMonthlyMap, perShiftValueMap, totalPlan, shortfall, coveragePct, percentageSum,
      finalMonthDeductionLkr, fullMonths,
      percentageValid: Math.abs(percentageSum - 100) < 0.5,
      isFullyCovered: totalLossNum > 0 && Math.abs(shortfall) <= RECOVERY_COVERAGE_TOLERANCE_LKR,
      isUnderCovered: shortfall > RECOVERY_COVERAGE_TOLERANCE_LKR,
      isOverCovered:  shortfall < -RECOVERY_COVERAGE_TOLERANCE_LKR,
    };
  }, [draft, selectedGuards, multiGuard, isCutShifts]);

  const canSubmit =
    draft.selectedEmpNos.length > 0 &&
    calc.totalLossNum > 0 &&
    calc.monthlyDeductionNum > 0 &&
    calc.durationNum > 0 &&
    (!multiGuard || isCutShifts || calc.percentageValid);

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-rose-200 bg-rose-50/60 p-4">
        <div className="flex items-start gap-3">
          <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl border border-rose-200 bg-rose-50">
            <TrendingDown className="h-4 w-4 text-rose-500" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-base font-black text-slate-900">{deficit.incidentRef}</p>
              <span className="inline-flex rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-sm font-black text-rose-700">UNASSIGNED DEFICIT</span>
            </div>
            <p className="mt-0.5 text-sm text-slate-500">
              <span className="font-bold text-slate-700">{deficit.clientName}</span>{' · '}{deficit.invoiceNo} · {deficit.invoiceMonth}
            </p>
            <p className="mt-1.5 text-sm italic text-slate-500">&ldquo;{deficit.description}&rdquo;</p>
          </div>
          <p className="flex-shrink-0 text-lg font-black text-rose-600">{lkr(deficit.deficitAmount)}</p>
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-black uppercase tracking-wider text-slate-500">Recovery Method</p>
        <div className="grid grid-cols-2 gap-2">
          {([
            { value: 'MONTHLY'    as const, label: 'Monthly Deduction', desc: 'Fixed LKR amount deducted from payslip each month' },
            { value: 'CUT_SHIFTS' as const, label: 'Cut Shifts',        desc: 'Deduct by reducing paid shifts per month' },
          ]).map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => onFieldChange('deductionMethod', opt.value)}
              className={`text-left rounded-xl border px-3.5 py-3 transition-all ${
                draft.deductionMethod === opt.value
                  ? 'border-indigo-400 bg-indigo-50 shadow-sm'
                  : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
              }`}
            >
              <p className={`text-sm font-black ${draft.deductionMethod === opt.value ? 'text-indigo-700' : 'text-slate-700'}`}>{opt.label}</p>
              <p className={`mt-0.5 text-xs ${draft.deductionMethod === opt.value ? 'text-indigo-500' : 'text-slate-400'}`}>{opt.desc}</p>
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2.5">
        <div className="flex items-center gap-2">
          <div className="flex h-5 w-5 items-center justify-center rounded-full bg-indigo-600 text-sm font-black text-white">1</div>
          <p className="text-sm font-black uppercase tracking-wider text-slate-700">Select Responsible Guards</p>
        </div>
        <GuardSelector selected={draft.selectedEmpNos} onChange={(empNos) => onFieldChange('selectedEmpNos', empNos)} />

        {selectedGuards.length > 0 && (isCutShifts || multiGuard) && (
          <div className="mt-2 space-y-2">
            {selectedGuards.map((g) => {
              const rs = RANK_STYLE[g.rank];
              const guardMonthly   = calc.perGuardMonthlyMap[g.empNo] ?? 0;
              const perShiftValue  = calc.perShiftValueMap[g.empNo] ?? 0;
              const shiftsCount    = parseInt((draft.guardShiftsPerMonth ?? {})[g.empNo] ?? '0') || 0;
              const unpaidShifts   = g.unpaidShiftsLastMonth;

              if (isCutShifts) {
                return (
                  <div
                    key={g.empNo}
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 space-y-2.5"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-black text-slate-600">
                        {g.name.split(' ').map((n: string) => n[0]).join('')}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold text-slate-900 truncate">{g.name}</p>
                        <p className="text-xs text-slate-400 font-mono">{g.empNo}</p>
                      </div>
                      <span className={`inline-flex flex-shrink-0 rounded-full border px-1.5 py-0.5 text-xs font-black ${rs.pill}`}>{g.rank}</span>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <label className="text-xs text-slate-500 whitespace-nowrap">Shifts to cut</label>
                        <input
                          type="number"
                          min={0}
                          max={31}
                          value={(draft.guardShiftsPerMonth ?? {})[g.empNo] ?? ''}
                          onChange={(e) => onFieldChange('guardShiftsPerMonth', { ...(draft.guardShiftsPerMonth ?? {}), [g.empNo]: e.target.value })}
                          placeholder="0"
                          className="w-14 rounded-lg border border-slate-300 bg-slate-50 px-2 py-1 text-sm font-black text-slate-900 text-center outline-none focus:border-indigo-400 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 border-t border-slate-100 pt-2 text-xs">
                      <div>
                        <p className="text-slate-400 uppercase tracking-wider font-bold mb-0.5">Per-shift value</p>
                        <p className="font-black text-slate-700 font-mono">{perShiftValue > 0 ? lkr(Math.round(perShiftValue)) : '—'}</p>
                        <p className="text-slate-400 mt-0.5">
                          {unpaidShifts} shift{unpaidShifts !== 1 ? 's' : ''} worked · salary pending
                        </p>
                      </div>
                      <div>
                        <p className="text-slate-400 uppercase tracking-wider font-bold mb-0.5">Monthly deduction</p>
                        <p className="font-black font-mono text-slate-700">
                          {shiftsCount > 0 ? lkr(Math.round(guardMonthly)) : '—'}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              }

              return (
                <div key={g.empNo} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5">
                  <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-black text-slate-600">
                    {g.name.split(' ').map((n: string) => n[0]).join('')}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-slate-900 truncate">{g.name}</p>
                    <p className="text-xs text-slate-400 font-mono">{g.empNo}</p>
                  </div>
                  <span className={`inline-flex flex-shrink-0 rounded-full border px-1.5 py-0.5 text-xs font-black ${rs.pill}`}>{g.rank}</span>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={(draft.guardPercentages ?? {})[g.empNo] ?? ''}
                      onChange={(e) => onFieldChange('guardPercentages', { ...(draft.guardPercentages ?? {}), [g.empNo]: e.target.value })}
                      placeholder="0"
                      className={`w-16 rounded-lg border px-2 py-1 text-sm font-black text-center outline-none focus:border-indigo-400 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none ${
                        calc.percentageValid ? 'border-slate-300 bg-slate-50 text-slate-900' : 'border-amber-300 bg-amber-50 text-amber-800'
                      }`}
                    />
                    <span className="text-sm font-bold text-slate-500">%</span>
                    {guardMonthly > 0 && (
                      <span className="text-xs text-slate-500 whitespace-nowrap font-mono">{lkr(Math.round(guardMonthly))}/mo</span>
                    )}
                  </div>
                </div>
              );
            })}

            {!isCutShifts && multiGuard && (
              <div className={`flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold ${
                calc.percentageValid ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
              }`}>
                <span>{calc.percentageValid ? '✓' : '⚠'}</span>
                <span>Total: {calc.percentageSum}%{!calc.percentageValid && ' — must equal 100%'}</span>
              </div>
            )}
          </div>
        )}

        {selectedGuards.length > 0 && !isCutShifts && !multiGuard && (
          <p className="text-sm text-slate-500">
            1 guard assigned — full monthly deduction applied.
          </p>
        )}
      </div>

      <div className="space-y-2.5">
        <div className="flex items-center gap-2">
          <div className="flex h-5 w-5 items-center justify-center rounded-full bg-indigo-600 text-sm font-black text-white">2</div>
          <p className="text-sm font-black uppercase tracking-wider text-slate-700">Define Recovery Parameters</p>
        </div>

        {isCutShifts ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="block text-sm font-bold uppercase tracking-wider text-slate-500">Total Loss (LKR)</label>
              <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
                <span className="text-sm font-bold text-slate-400">LKR</span>
                <input
                  type="number"
                  min={0}
                  value={draft.totalLoss}
                  onChange={(e) => onFieldChange('totalLoss', e.target.value)}
                  className="flex-1 bg-transparent text-sm font-black text-slate-900 outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                />
              </div>
              <p className="text-xs text-slate-400">Pre-filled from invoice deduction</p>
            </div>
            <div className="space-y-1.5">
              <label className="block text-sm font-bold uppercase tracking-wider text-slate-500">Months to Recover</label>
              <div className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 ${
                calc.durationNum > 0 ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-slate-50'
              }`}>
                <p className={`flex-1 text-base font-black ${calc.durationNum > 0 ? 'text-emerald-700' : 'text-slate-400'}`}>
                  {formatRecoveryDurationLabel({
                    durationMonths: calc.durationNum,
                    totalPlan: calc.totalPlan,
                    shortfall: calc.shortfall,
                    finalMonthDeductionLkr: calc.finalMonthDeductionLkr,
                    fullMonths: calc.fullMonths,
                  })}
                </p>
              </div>
              <p className="text-xs text-slate-400">
                {calc.finalMonthDeductionLkr != null
                  ? `Final month prorated to ${lkr(Math.round(calc.finalMonthDeductionLkr))} — no over-recovery`
                  : calc.totalMonthlyRecovery > 0
                    ? `${lkr(Math.round(calc.totalMonthlyRecovery))}/mo total recovery`
                    : 'Set shifts to cut per guard above'}
              </p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <label className="block text-sm font-bold uppercase tracking-wider text-slate-500">Total Loss (LKR)</label>
              <div className="flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2.5">
                <span className="text-sm font-bold text-slate-400">LKR</span>
                <input
                  type="number"
                  min={0}
                  value={draft.totalLoss}
                  onChange={(e) => onFieldChange('totalLoss', e.target.value)}
                  className="flex-1 bg-transparent text-sm font-black text-slate-900 outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                />
              </div>
              <p className="text-sm text-slate-400">Pre-filled from invoice deduction</p>
            </div>
            <div className="space-y-1.5">
              <label className="block text-sm font-bold uppercase tracking-wider text-slate-500">Monthly Deduction (LKR)</label>
              <div className="flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2.5">
                <span className="text-sm font-bold text-slate-400">LKR</span>
                <input
                  type="number"
                  min={0}
                  placeholder="e.g. 37500"
                  value={draft.monthlyDeduction}
                  onChange={(e) => onFieldChange('monthlyDeduction', e.target.value)}
                  className="flex-1 bg-transparent text-sm font-black text-slate-900 outline-none placeholder-slate-400 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                />
              </div>
              <p className="text-sm text-slate-400">Total across all selected guards</p>
            </div>
            <div className="space-y-1.5">
              <label className="block text-sm font-bold uppercase tracking-wider text-slate-500">Duration (Months)</label>
              <div className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 ${
                calc.durationNum > 0 ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-slate-50'
              }`}>
                <p className={`flex-1 text-base font-black ${calc.durationNum > 0 ? 'text-emerald-700' : 'text-slate-400'}`}>
                  {calc.durationNum > 0
                    ? formatRecoveryDurationLabel({
                        durationMonths: calc.durationNum,
                        totalPlan: calc.totalPlan,
                        shortfall: calc.shortfall,
                        finalMonthDeductionLkr: calc.finalMonthDeductionLkr,
                        fullMonths: calc.fullMonths,
                      })
                    : '— enter monthly deduction'}
                </p>
              </div>
              <p className="text-sm text-slate-400">
                {calc.finalMonthDeductionLkr != null
                  ? `Final month prorated to ${lkr(Math.round(calc.finalMonthDeductionLkr))} — no over-recovery`
                  : calc.monthlyDeductionNum > 0
                    ? 'Auto-calculated from loss ÷ monthly deduction'
                    : 'Set monthly deduction above'}
              </p>
            </div>
          </div>
        )}
      </div>

      {calc.guardsCount > 0 && calc.monthlyDeductionNum > 0 && calc.durationNum > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 space-y-3">
          <p className="text-sm font-black uppercase tracking-widest text-slate-500">Live Calculation Preview</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {[
              {
                label: isCutShifts ? 'Monthly Recovery' : 'Per-Guard / Month',
                value: isCutShifts ? lkr(Math.round(calc.totalMonthlyRecovery)) : lkr(Math.round(calc.monthlyDeductionNum / Math.max(1, calc.guardsCount))),
                sub: isCutShifts ? `across ${calc.guardsCount} guard${calc.guardsCount !== 1 ? 's' : ''}` : `÷ ${calc.guardsCount} guard${calc.guardsCount !== 1 ? 's' : ''}`,
              },
              { label: 'Total Plan Value',  value: lkr(calc.totalPlan), sub: calc.finalMonthDeductionLkr != null
                  ? `${lkr(Math.round(calc.monthlyDeductionNum))} × ${calc.fullMonths} + ${lkr(Math.round(calc.finalMonthDeductionLkr))} final`
                  : `${lkr(calc.monthlyDeductionNum)} × ${calc.durationNum} mo` },
              {
                label: 'Coverage',
                value: `${calc.coveragePct}%`,
                sub: calc.isFullyCovered ? 'Fully covered' : calc.isOverCovered ? `Over by ${lkr(Math.abs(calc.shortfall))}` : `Short by ${lkr(calc.shortfall)}`,
                valueClass: calc.isFullyCovered ? 'text-emerald-600' : calc.isOverCovered ? 'text-blue-600' : 'text-amber-600',
              },
            ].map((kv) => (
              <div key={kv.label} className="rounded-xl border border-slate-200 bg-white p-3">
                <p className="text-sm font-bold uppercase tracking-wider text-slate-500">{kv.label}</p>
                <p className={`mt-0.5 text-base font-black ${'valueClass' in kv ? kv.valueClass : 'text-slate-900'}`}>{kv.value}</p>
                <p className="text-sm text-slate-400">{kv.sub}</p>
              </div>
            ))}
          </div>
          <div className="space-y-1">
            <div className="h-2 overflow-hidden rounded-full bg-slate-200">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  calc.isFullyCovered ? 'bg-emerald-500' : calc.isOverCovered ? 'bg-blue-500' : 'bg-amber-400'
                }`}
                style={{ width: `${Math.min(100, calc.coveragePct)}%` }}
              />
            </div>
            <div className="flex justify-between text-sm text-slate-400">
              <span>0%</span>
              <span className={`font-bold ${calc.isFullyCovered ? 'text-emerald-600' : calc.isOverCovered ? 'text-blue-600' : 'text-amber-600'}`}>
                {calc.isFullyCovered ? 'Full Recovery' : calc.isOverCovered ? 'Over-Recovery — Adjust Duration' : `Under-Recovery — ${lkr(calc.shortfall)} uncovered`}
              </span>
              <span>100%</span>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-1.5">
        <label className="block text-sm font-bold uppercase tracking-wider text-slate-500">
          FM Internal Note <span className="font-medium normal-case text-slate-400">(optional)</span>
        </label>
        <textarea
          rows={3}
          value={draft.omNote}
          onChange={(e) => onFieldChange('omNote', e.target.value)}
          placeholder="Describe the incident, evidence reviewed, and rationale for guard selection..."
          className="w-full resize-none rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-700 placeholder-slate-400 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/20 transition-all"
        />
        <p className="text-sm text-slate-400">This note is attached to the MD Vault audit trail and is not visible to guards.</p>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white">
              <Lock className="h-3.5 w-3.5 text-slate-400" />
            </div>
            <div>
              <p className="text-sm font-black text-slate-900">Submit Recovery Structure to MD Vault</p>
              <p className="text-sm text-slate-500">Sends to MD for approval · Activates amortization schedule on next payroll cycle</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onSubmit}
            disabled={!canSubmit || isSubmitting}
            className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-black transition-all ${
              canSubmit && !isSubmitting
                ? 'bg-indigo-600 text-white shadow-sm hover:bg-indigo-700 active:scale-[0.98]'
                : 'cursor-not-allowed bg-slate-200 text-slate-400'
            }`}
          >
            {isSubmitting ? (
              <>
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                Submitting...
              </>
            ) : (
              <>
                <Send className="h-3.5 w-3.5" />
                Submit to MD Vault
              </>
            )}
          </button>
        </div>
        {!canSubmit && !isSubmitting && (
          <div className="mt-3 space-y-1">
            {draft.selectedEmpNos.length === 0 && (
              <p className="flex items-center gap-1.5 text-sm text-slate-500">
                <ArrowRight className="h-3 w-3 text-slate-400" /> Select at least one responsible guard
              </p>
            )}
            {(calc.totalLossNum === 0 || calc.monthlyDeductionNum === 0 || calc.durationNum === 0) && (
              <p className="flex items-center gap-1.5 text-sm text-slate-500">
                <ArrowRight className="h-3 w-3 text-slate-400" /> Complete all recovery parameter fields
              </p>
            )}
            {!isCutShifts && multiGuard && !calc.percentageValid && (
              <p className="flex items-center gap-1.5 text-sm text-amber-600">
                <ArrowRight className="h-3 w-3 text-amber-500" /> Guard percentages must sum to 100% (currently {calc.percentageSum}%)
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DiscrepancyQueuePage() {
  const holidayCalendarIncomplete = true;

  const [deficits, setDeficits]       = useState<UnresolvedDeficit[]>(INITIAL_DEFICITS);
  const [activeId, setActiveId]       = useState<string>(INITIAL_DEFICITS[0].deficitId);
  const [draft, setDraft]             = useState<FormDraft>(emptyDraft(INITIAL_DEFICITS[0].deficitAmount));
  const [isSubmitting, setIsSubmitting] = useState(false);

  const activeDeficit = useMemo(
    () => deficits.find((d) => d.deficitId === activeId) ?? null,
    [deficits, activeId],
  );

  const stats = useMemo(() => {
    const unresolved = deficits.filter((d) => d.status === 'UNRESOLVED');
    return {
      unresolvedCount:    unresolved.length,
      submittedCount:     deficits.filter((d) => d.status === 'SUBMITTED').length,
      totalUnresolvedLkr: unresolved.reduce((s, d) => s + d.deficitAmount, 0),
    };
  }, [deficits]);

  const handleSelectDeficit = useCallback((d: UnresolvedDeficit) => {
    setActiveId(d.deficitId);
    if (d.status === 'UNRESOLVED') setDraft(emptyDraft(d.deficitAmount));
  }, []);

  const handleFieldChange = useCallback(
    <K extends keyof FormDraft>(key: K, value: FormDraft[K]) => {
      setDraft((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  const handleSubmit = useCallback(async () => {
    if (!activeDeficit) return;
    setIsSubmitting(true);
    await new Promise((r) => setTimeout(r, 1100));

    const totalLossNum    = parseFloat(draft.totalLoss) || 0;
    let monthlyDeductNum  = parseFloat(draft.monthlyDeduction) || 0;
    let durationNum       = parseInt(draft.durationMonths) || 0;
    let finalMonthDeductionLkr: number | null = null;

    const drafShifts = draft.guardShiftsPerMonth ?? {};
    const draftPct   = draft.guardPercentages ?? {};

    const perShiftValuesLkr: Record<string, number> = {};
    draft.selectedEmpNos.forEach((empNo) => {
      const guard = GUARD_ROSTER.find((g) => g.empNo === empNo);
      if (guard) perShiftValuesLkr[empNo] = guard.basicSalary / WB_WORKING_DAYS;
    });

    if ((draft.deductionMethod ?? 'CUT_SHIFTS') === 'CUT_SHIFTS') {
      const totalMonthly = draft.selectedEmpNos.reduce((sum, empNo) => {
        const shifts = parseInt(drafShifts[empNo] ?? '0') || 0;
        const perShift = perShiftValuesLkr[empNo] ?? 0;
        return sum + shifts * perShift;
      }, 0);
      monthlyDeductNum = totalMonthly;
    }

    const schedule = computeRecoverySchedule(totalLossNum, monthlyDeductNum);
    durationNum = schedule.durationMonths;
    finalMonthDeductionLkr = schedule.finalMonthDeductionLkr;

    const guardPercentages: Record<string, number> = {};
    draft.selectedEmpNos.forEach((empNo) => {
      guardPercentages[empNo] = parseFloat(draftPct[empNo] ?? '0') || 0;
    });

    const guardShiftsPerMonth: Record<string, number> = {};
    draft.selectedEmpNos.forEach((empNo) => {
      guardShiftsPerMonth[empNo] = parseInt(drafShifts[empNo] ?? '0') || 0;
    });

    const submittedStructure: SubmittedStructure = {
      guardEmpNos:        draft.selectedEmpNos,
      totalLoss:          totalLossNum,
      monthlyDeduction:   monthlyDeductNum,
      durationMonths:     durationNum,
      finalMonthDeductionLkr,
      deductionMethod:    draft.deductionMethod ?? 'CUT_SHIFTS',
      guardPercentages:   guardPercentages,
      guardShiftsPerMonth: guardShiftsPerMonth,
      perShiftValuesLkr:  perShiftValuesLkr,
      omNote:             draft.omNote,
      submittedAt:        new Date().toISOString(),
    };

    setDeficits((prev) =>
      prev.map((d) =>
        d.deficitId === activeDeficit.deficitId
          ? { ...d, status: 'SUBMITTED' as DeficitStatus, submittedStructure }
          : d,
      ),
    );

    setIsSubmitting(false);
  }, [activeDeficit, draft]);

  return (
    <div className="min-h-screen bg-slate-50">
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-0 opacity-25"
        style={{
          backgroundImage: 'radial-gradient(rgb(148 163 184 / 0.5) 1px, transparent 1px)',
          backgroundSize: '20px 20px',
        }}
      />

      <div className="relative z-10 mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">

        <FmSubnav
          holidayCalendarIncomplete={holidayCalendarIncomplete}
          discrepancyCount={stats.unresolvedCount}
        />

        {/* Page Header */}
        <div className="mb-8">
          <div className="mb-3 flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-blue-200 bg-blue-50">
              <ClipboardList className="h-4 w-4 text-blue-700" />
            </div>
            <span className="text-[10px] font-bold uppercase tracking-widest text-blue-600">
              Finance Manager Portal
            </span>
          </div>
          <h1 className="text-3xl font-black tracking-tight text-slate-900">
            Discrepancy Queue — Client Deficit Recovery
          </h1>
          <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-slate-500">
            Configure guard-level recovery plans for client-imposed invoice penalties. Submit to the MD Vault for approval and activate amortization schedules on the next payroll cycle.
          </p>
        </div>

        <div className="mb-6 border-t border-slate-200" />

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          {[
            { label: 'Unresolved Deficits',    value: String(stats.unresolvedCount),           sub: 'Pending FM action',          color: stats.unresolvedCount > 0 ? 'text-rose-600' : 'text-emerald-600',  dot: stats.unresolvedCount > 0 ? 'bg-rose-500' : 'bg-emerald-500' },
            { label: 'Total Unresolved LKR',   value: lkr(stats.totalUnresolvedLkr),           sub: 'Unrecovered client loss',     color: 'text-slate-900',                                                   dot: 'bg-amber-500' },
            { label: 'Submitted to MD Vault',  value: String(stats.submittedCount),             sub: 'Awaiting MD approval',        color: 'text-emerald-600',                                                 dot: 'bg-emerald-500' },
          ].map((s) => (
            <DarkGlassCard key={s.label} className="p-4">
              <div className="flex items-center gap-1.5 mb-1.5">
                <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
                <p className="text-sm font-bold uppercase tracking-widest text-slate-500">{s.label}</p>
              </div>
              <p className={`text-2xl font-black ${s.color}`}>{s.value}</p>
              <p className="mt-0.5 text-sm text-slate-400">{s.sub}</p>
            </DarkGlassCard>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[320px_1fr]">
          <div className="space-y-3">
            <div className="flex items-center gap-2 mb-1">
              <ClipboardList className="h-4 w-4 text-slate-400" />
              <p className="text-sm font-black uppercase tracking-wider text-slate-500">Client Deficit Queue</p>
              {stats.unresolvedCount > 0 && (
                <span className="inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-rose-600 px-1 text-sm font-black text-white">
                  {stats.unresolvedCount}
                </span>
              )}
            </div>

            {deficits.map((d) => (
              <DeficitQueueCard
                key={d.deficitId}
                deficit={d}
                isActive={d.deficitId === activeId}
                onSelect={() => handleSelectDeficit(d)}
              />
            ))}

            <div className="rounded-2xl border border-sky-200 bg-sky-50 p-3 mt-2">
              <div className="flex items-start gap-2">
                <Info className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-sky-500" />
                <p className="text-sm text-sky-700">
                  Each row is a client-imposed penalty deduction applied to an invoice. Configure a guard-level recovery plan and submit it to the MD&apos;s invoice audit vault for approval.
                </p>
              </div>
            </div>
          </div>

          <DarkGlassCard className="p-5 lg:p-6">
            {!activeDeficit ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <FileWarning className="h-12 w-12 text-slate-300 mb-3" />
                <p className="text-base font-bold text-slate-400">Select a deficit from the queue</p>
              </div>
            ) : activeDeficit.status === 'SUBMITTED' ? (
              <>
                <div className="mb-5 flex items-center gap-2 border-b border-slate-200 pb-4">
                  <CheckCircle2 className="text-emerald-600" style={{ width: 18, height: 18 }} />
                  <p className="text-sm font-black text-slate-900">{activeDeficit.clientName} · {activeDeficit.incidentRef}</p>
                </div>
                <SubmittedView deficit={activeDeficit} />
              </>
            ) : (
              <>
                <div className="mb-5 flex items-center gap-2 border-b border-slate-200 pb-4">
                  <ShieldAlert className="text-rose-500" style={{ width: 18, height: 18 }} />
                  <p className="text-sm font-black text-slate-900">Configure Recovery Plan</p>
                  <span className="ml-auto text-sm font-bold text-slate-500">Incident dated {activeDeficit.incidentDate}</span>
                </div>
                <RecoveryConfigForm
                  deficit={activeDeficit}
                  draft={draft}
                  onFieldChange={handleFieldChange}
                  onSubmit={handleSubmit}
                  isSubmitting={isSubmitting}
                />
              </>
            )}
          </DarkGlassCard>
        </div>
      </div>
    </div>
  );
}
