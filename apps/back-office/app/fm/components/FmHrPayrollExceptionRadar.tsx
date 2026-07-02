'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  BadgeAlert,
  Banknote,
  CheckCircle2,
  ChevronDown,
  CircleDot,
  Lock,
  ShieldAlert,
  UserX,
  Users,
  XCircle,
  ArrowRight,
} from 'lucide-react';

import {
  approveFmSalaryOverride,
  confirmFmOffboardingRecovery,
  rejectFmSalaryOverride,
  writeOffFmResignationDebt,
  type ResignationDebtRecord,
  type SalaryOverrideRecord,
} from '../fm-payroll-exceptions-actions';

type DebtCategory = 'AWOL' | 'RESIGNED';
type ResignationDebt = ResignationDebtRecord;
type SalaryOverride = SalaryOverrideRecord;

const FULL_MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function lkr(n: number) {
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 1_000_000) return `${sign}LKR ${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${sign}LKR ${(abs / 1_000).toFixed(1)}K`;
  return `${sign}LKR ${abs.toLocaleString()}`;
}

function debtMonthLabel(yyyyMM: string): string {
  const [y, m] = yyyyMM.split('-');
  return `${FULL_MONTH_NAMES[parseInt(m, 10) - 1]} ${y}`;
}

function guardInitials(name: string) {
  return name
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
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
  return list
    .filter((d) => d.status !== 'WRITTEN_OFF')
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

function FmGlassCard({
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

function AccordionCategory({
  list,
  label,
  sub,
  accent,
  isOpen,
  onToggle,
  onWriteOff,
  onConfirmRecovery,
  readOnly = false,
}: {
  list: ResignationDebt[];
  label: string;
  sub: string;
  accent: 'amber' | 'rose';
  isOpen: boolean;
  onToggle: () => void;
  onWriteOff: (id: string) => void;
  onConfirmRecovery: (id: string) => void;
  readOnly?: boolean;
}) {
  const total = sumDebt(list);
  const count = list.length;
  const groups = groupByMonth(list);

  const cls =
    accent === 'amber'
      ? {
          border: 'border-amber-200/70',
          headerBg: 'bg-amber-50/50',
          pill: 'border-amber-200/80 bg-amber-50/80 text-amber-900',
        }
      : {
          border: 'border-rose-200/70',
          headerBg: 'bg-rose-50/40',
          pill: 'border-rose-200/80 bg-rose-50/80 text-rose-900',
        };

  return (
    <div
      className={`overflow-hidden rounded-2xl border transition-all ${isOpen ? cls.border : 'border-slate-200/60'}`}
    >
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
        <span
          className={`flex-shrink-0 rounded-full border px-2.5 py-0.5 text-[10px] font-black ${cls.pill}`}
        >
          {count} guard{count !== 1 ? 's' : ''}
        </span>
        <span className="flex-shrink-0 text-xs font-black tabular-nums text-rose-900">
          {lkr(total)}
        </span>
        <ChevronDown
          className={`h-4 w-4 flex-shrink-0 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
        />
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
                  const rowTotal = d.uniformDebt + d.advanceDebt;
                  const isLocked = d.status === 'LOCKED';
                  const isPending = d.status === 'PENDING_WRITEOFF';
                  const isDone = d.status === 'WRITTEN_OFF';
                  const avatarCls = AVATAR_PALETTES[idx % AVATAR_PALETTES.length];
                  const breakdown =
                    d.uniformDebt > 0 && d.advanceDebt > 0
                      ? 'Uniform + Advance'
                      : d.uniformDebt > 0
                        ? 'Uniform debt'
                        : 'Advance debt';

                  return (
                    <div
                      key={d.id}
                      className={`flex items-center gap-3 border-b border-slate-200/40 px-4 py-3 last:border-0 transition-colors ${
                        isDone ? 'opacity-45' : 'hover:bg-white/50'
                      }`}
                    >
                      <div
                        className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl border border-white/80 bg-gradient-to-br text-[11px] font-black shadow-sm ${avatarCls}`}
                      >
                        {guardInitials(d.name)}
                      </div>

                      <div className="min-w-0 flex-1">
                        <p
                          className={`text-sm font-bold leading-tight ${isDone ? 'line-through text-slate-400' : 'text-slate-900'}`}
                        >
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
                        <p
                          className={`text-sm font-black tabular-nums ${isDone ? 'line-through text-slate-300' : 'text-rose-800'}`}
                        >
                          {lkr(rowTotal)}
                        </p>
                        <p className="text-[9px] text-slate-400">{breakdown}</p>
                      </div>

                      <div className="flex-shrink-0">
                        {isDone && <CheckCircle2 className="h-4 w-4 text-slate-300" />}
                        {isLocked && !readOnly && (
                          <button
                            type="button"
                            onClick={() => onConfirmRecovery(d.id)}
                            className="flex items-center gap-1 whitespace-nowrap rounded-xl bg-emerald-600 px-2.5 py-1 text-[9px] font-black uppercase tracking-wide text-white transition-all hover:bg-emerald-500"
                          >
                            Confirm recovery
                          </button>
                        )}
                        {isLocked && readOnly && (
                          <span title="Confirm recovery in FM Exceptions portal">
                            <Lock className="h-4 w-4 text-rose-300" />
                          </span>
                        )}
                        {isPending && !readOnly && (
                          <button
                            type="button"
                            onClick={() => onWriteOff(d.id)}
                            className="flex items-center gap-1 whitespace-nowrap rounded-xl bg-slate-800 px-2.5 py-1 text-[9px] font-black uppercase tracking-wide text-white transition-all hover:bg-slate-700"
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

function PendingDebtPanel({
  allDebts,
  onWriteOff,
  onConfirmRecovery,
  readOnly = false,
}: {
  allDebts: ResignationDebt[];
  onWriteOff: (id: string) => void;
  onConfirmRecovery: (id: string) => void;
  readOnly?: boolean;
}) {
  const [expanded, setExpanded] = useState<DebtCategory | null>(null);
  const [periodFilter, setPeriodFilter] = useState<string>('ALL');

  const availablePeriods = useMemo(() => {
    const months = new Set(allDebts.map((d) => d.inactiveDate.slice(0, 7)));
    return Array.from(months).sort().reverse();
  }, [allDebts]);

  const filtered =
    periodFilter === 'ALL'
      ? allDebts
      : allDebts.filter((d) => d.inactiveDate.startsWith(periodFilter));

  const awolList = filtered.filter((d) => d.category === 'AWOL');
  const resignedList = filtered.filter((d) => d.category === 'RESIGNED');

  const toggle = (cat: DebtCategory) => setExpanded((prev) => (prev === cat ? null : cat));

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
            className="rounded-xl border border-slate-200/80 bg-white/80 px-2.5 py-1 text-[11px] font-bold text-slate-700 shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-rose-400/30"
          >
            <option value="ALL">All Periods</option>
            {availablePeriods.map((p) => (
              <option key={p} value={p}>
                {debtMonthLabel(p)}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="space-y-3 p-4">
        <AccordionCategory
          list={awolList}
          label="Category A — Absent / AWOL"
          sub="Insufficient shifts to recover outstanding uniform & advance debt"
          accent="amber"
          isOpen={expanded === 'AWOL'}
          onToggle={() => toggle('AWOL')}
          onWriteOff={onWriteOff}
          onConfirmRecovery={onConfirmRecovery}
          readOnly={readOnly}
        />
        <AccordionCategory
          list={resignedList}
          label="Category B — Resigned"
          sub="Unrecovered debt post-termination clearance"
          accent="rose"
          isOpen={expanded === 'RESIGNED'}
          onToggle={() => toggle('RESIGNED')}
          onWriteOff={onWriteOff}
          onConfirmRecovery={onConfirmRecovery}
          readOnly={readOnly}
        />
      </div>

      {!readOnly ? (
        <div className="mt-auto border-t border-slate-200/60 bg-slate-50/60 px-5 py-2.5 text-[10px] text-slate-500">
          <Lock className="mr-1 inline h-3 w-3" />
          Confirm recovery in Payroll, then write off cleared balances here.
        </div>
      ) : (
        <div className="mt-auto border-t border-slate-200/60 bg-slate-50/60 px-5 py-2.5 text-[10px] text-slate-500">
          <Link href="/fm/exceptions" className="font-bold text-indigo-700 hover:text-indigo-900">
            Open FM Exceptions portal →
          </Link>
        </div>
      )}
    </div>
  );
}

export default function FmHrPayrollExceptionRadar({
  overrides,
  debts,
  onRefresh,
  readOnly = false,
}: {
  overrides: SalaryOverride[];
  debts: ResignationDebt[];
  onRefresh: () => void;
  readOnly?: boolean;
}) {
  const pendingCount = overrides.filter((o) => o.status === 'PENDING').length;
  const lockedCount = debts.filter((d) => d.status === 'LOCKED').length;
  const pendingWO = debts.filter((d) => d.status === 'PENDING_WRITEOFF').length;
  const totalDebt = debts
    .filter((d) => d.status !== 'WRITTEN_OFF')
    .reduce((s, d) => s + d.uniformDebt + d.advanceDebt, 0);

  const approveOverride = (id: string) => {
    void approveFmSalaryOverride(id).then((result) => {
      if (result.success) onRefresh();
    });
  };
  const rejectOverride = (id: string) => {
    void rejectFmSalaryOverride(id).then((result) => {
      if (result.success) onRefresh();
    });
  };
  const writeOffDebt = (id: string) => {
    void writeOffFmResignationDebt(id).then((result) => {
      if (result.success) onRefresh();
    });
  };
  const confirmRecovery = (id: string) => {
    void confirmFmOffboardingRecovery(id).then((result) => {
      if (result.success) onRefresh();
    });
  };

  return (
    <FmGlassCard className="overflow-hidden">
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
                {readOnly
                  ? 'Read-only view — FM actions in Exceptions portal'
                  : 'Salary overrides bypassing rank defaults · Termination debt pending clearance'}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {pendingCount > 0 && (
              <span className="flex items-center gap-1.5 rounded-full border border-amber-200/80 bg-amber-50/80 px-3 py-1 text-[10px] font-black text-amber-800">
                <CircleDot className="h-2.5 w-2.5" />
                {pendingCount} override{pendingCount > 1 ? 's' : ''} awaiting FM
              </span>
            )}
            {lockedCount > 0 && (
              <span className="flex items-center gap-1.5 rounded-full border border-rose-200/80 bg-rose-50/80 px-3 py-1 text-[10px] font-black text-rose-800">
                <Lock className="h-2.5 w-2.5" />
                {lockedCount} debt{lockedCount > 1 ? 's' : ''} recovery pending
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
              Salary Overrides — Pending FM Approval
            </span>
            {pendingCount > 0 && (
              <span className="ml-auto rounded-full bg-amber-500 px-2 py-0.5 text-[9px] font-black text-white">
                {pendingCount}
              </span>
            )}
          </div>

          <div className="divide-y divide-slate-200/50">
            {overrides.length === 0 ? (
              <p className="px-5 py-8 text-center text-[11px] text-slate-400">
                No salary overrides awaiting FM approval.
              </p>
            ) : (
              overrides.map((o) => {
                const delta = o.overridePay - o.defaultPay;
                const deltaPct =
                  o.defaultPay > 0 ? Math.round((delta / o.defaultPay) * 100) : 0;
                const isPending = o.status === 'PENDING';
                const isApproved = o.status === 'APPROVED';

                return (
                  <div
                    key={o.id}
                    className={`px-5 py-4 transition-colors ${
                      isPending
                        ? o.requiresMdFlag
                          ? 'border-l-4 border-amber-400 bg-amber-50/40 hover:bg-amber-50/60'
                          : 'hover:bg-amber-50/30'
                        : isApproved
                          ? 'bg-emerald-50/20'
                          : 'bg-slate-50/30 opacity-60'
                    }`}
                  >
                    <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-slate-900">{o.name}</span>
                          <span className="rounded-lg border border-slate-200/80 bg-slate-100/80 px-1.5 py-0.5 text-[9px] font-black tracking-widest text-slate-700">
                            {o.rank}
                          </span>
                          <span
                            className={`rounded-full px-2 py-0.5 text-[9px] font-bold ${
                              o.company === 'Security'
                                ? 'bg-indigo-100/80 text-indigo-800'
                                : 'bg-amber-100/80 text-amber-800'
                            }`}
                          >
                            {o.company}
                          </span>
                        </div>
                        <p className="mt-0.5 line-clamp-1 text-[10px] text-slate-500">{o.reason}</p>
                      </div>

                      {!isPending && (
                        <span
                          className={`flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10px] font-black ${
                            isApproved
                              ? 'border-emerald-200 bg-emerald-50/90 text-emerald-800'
                              : 'border-rose-200 bg-rose-50/90 text-rose-800'
                          }`}
                        >
                          {isApproved ? (
                            <>
                              <CheckCircle2 className="h-3 w-3" /> Approved
                            </>
                          ) : (
                            <>
                              <XCircle className="h-3 w-3" /> Rejected
                            </>
                          )}
                        </span>
                      )}
                    </div>

                    <div className="mb-3 flex items-center gap-2 rounded-xl border border-slate-200/60 bg-white/50 px-3 py-2">
                      <div className="text-center">
                        <p className="text-[9px] font-bold uppercase tracking-widest text-slate-500">
                          Rank Default
                        </p>
                        <p className="font-mono text-xs font-black text-slate-700">
                          {lkr(o.defaultPay)}
                        </p>
                      </div>
                      <ArrowRight className="h-3.5 w-3.5 flex-shrink-0 text-slate-300" />
                      <div className="text-center">
                        <p className="text-[9px] font-bold uppercase tracking-widest text-slate-500">
                          Override Pay
                        </p>
                        <p className="font-mono text-xs font-black text-amber-900">
                          {lkr(o.overridePay)}
                        </p>
                      </div>
                      <div className="ml-auto flex items-center gap-1 rounded-lg border border-amber-200/80 bg-amber-50/80 px-2 py-1">
                        <BadgeAlert className="h-3 w-3 text-amber-700" />
                        <span className="text-[10px] font-black text-amber-900">
                          +{deltaPct}% (+{lkr(delta)})
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-[10px] text-slate-500">
                        <span className="font-semibold text-slate-600">{o.requestedBy}</span> ·{' '}
                        {o.date}
                      </p>
                      {isPending && !readOnly && (
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => rejectOverride(o.id)}
                            className="flex items-center gap-1 rounded-xl border border-rose-200/80 bg-white/70 px-2.5 py-1.5 text-[10px] font-bold text-rose-700 transition-all hover:bg-rose-50/70"
                          >
                            <XCircle className="h-3 w-3" />
                            Reject
                          </button>
                          <button
                            type="button"
                            onClick={() => approveOverride(o.id)}
                            className="flex items-center gap-1 rounded-xl bg-emerald-600 px-3 py-1.5 text-[10px] font-black uppercase tracking-wide text-white shadow-sm shadow-emerald-600/25 transition-all hover:bg-emerald-500"
                          >
                            <CheckCircle2 className="h-3 w-3" />
                            Approve Exception
                          </button>
                        </div>
                      )}
                      {isPending && readOnly && (
                        <Link
                          href="/fm/exceptions"
                          className="rounded-xl border border-indigo-200/80 bg-indigo-50/80 px-3 py-1.5 text-[10px] font-black uppercase tracking-wide text-indigo-800 transition-all hover:bg-indigo-100/80"
                        >
                          Review in FM
                        </Link>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <PendingDebtPanel
          allDebts={debts}
          onWriteOff={writeOffDebt}
          onConfirmRecovery={confirmRecovery}
          readOnly={readOnly}
        />
      </div>
    </FmGlassCard>
  );
}
