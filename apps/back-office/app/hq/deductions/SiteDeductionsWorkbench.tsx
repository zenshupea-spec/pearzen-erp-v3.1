'use client';

import { useCallback, useEffect, useMemo, useState, useTransition } from 'react';
import {
  approveAllDraftForMonth,
  approveEmployeeDeductionEntry,
  getSiteDeductionGroups,
  saveEmployeeDeductionEntry,
} from './actions';
import { isCurrentPayrollMonth, payrollMonthFirstDay, payrollMonthLabel } from './lib/payroll-month';
import type { SiteDeductionGroup, SiteEmployeeDeductionRow } from './lib/types';
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Loader2,
  RefreshCw,
  Search,
} from 'lucide-react';

function formatLkr(n: number) {
  return n.toLocaleString('en-LK', { maximumFractionDigits: 0 });
}

function EmployeeRow({
  row,
  payrollMonth,
  onSaved,
  isDemo,
}: {
  row: SiteEmployeeDeductionRow;
  payrollMonth: string;
  onSaved: () => void;
  isDemo: boolean;
}) {
  const [meals, setMeals] = useState(String(row.mealsAmountLkr || ''));
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setMeals(String(row.mealsAmountLkr || ''));
  }, [row.employeeId, row.mealsAmountLkr]);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const save = () => {
    setError(null);
    setBusy(true);
    void saveEmployeeDeductionEntry({
      employeeId: row.employeeId,
      payrollMonth,
      mealsAmountLkr: parseFloat(meals) || 0,
    }).then((res) => {
      setBusy(false);
      if (!res.success) {
        setError(res.error ?? 'Save failed');
        return;
      }
      onSaved();
    });
  };

  const approve = () => {
    if (!row.entryId) {
      setError('Save amounts first, then approve.');
      return;
    }
    startTransition(() => {
      void approveEmployeeDeductionEntry(row.entryId!).then((res) => {
        if (!res.success) setError(res.error ?? 'Approve failed');
        else onSaved();
      });
    });
  };

  const status = row.status;
  const locked = status === 'APPROVED';

  return (
    <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 px-4 py-3 text-sm">
      <div className="min-w-[140px] flex-1">
        <p className="font-bold text-slate-900">{row.fullName}</p>
        <p className="font-mono text-[10px] text-slate-500">
          {row.empNumber}
          {row.rank ? ` · ${row.rank}` : ''}
          {row.shiftCount > 0 ? (
            <span className="text-slate-600">
              {' '}
              · {row.shiftCount} shift{row.shiftCount !== 1 ? 's' : ''} this site
            </span>
          ) : null}
          {row.monthMealCostLkr > 0 ? (
            <span className="text-indigo-700">
              {' '}
              · Meals {formatLkr(row.monthMealCostLkr)} this month (all sites)
            </span>
          ) : null}
        </p>
      </div>
      <label className="w-28">
        <span className="mb-0.5 block text-[9px] font-bold uppercase tracking-wider text-violet-600">
          Uniform
          {row.uniformFromIssue ? (
            <span className="ml-1 text-[8px] font-black text-violet-500">· issued</span>
          ) : row.uniformFromDefault ? (
            <span className="ml-1 text-[8px] font-black text-emerald-600">· default</span>
          ) : null}
        </span>
        <input
          type="number"
          min={0}
          readOnly
          disabled
          value={row.uniformAmountLkr || ''}
          title="Auto-filled from uniform issues — not editable here"
          className={`w-full cursor-not-allowed rounded-lg border px-2 py-1.5 font-mono text-xs disabled:bg-slate-50 ${
            row.uniformFromIssue
              ? 'border-violet-300 bg-violet-50/80 text-violet-950'
              : row.uniformFromDefault
                ? 'border-emerald-300 bg-emerald-50/80 text-emerald-950'
                : 'border-slate-200'
          }`}
        />
      </label>
      <label className="w-28">
        <span className="mb-0.5 block text-[9px] font-bold uppercase tracking-wider text-indigo-600">
          Meals
          {row.mealsFromShifts ? (
            <span className="ml-1 text-[8px] font-black text-indigo-500">· shifts</span>
          ) : null}
        </span>
        <input
          type="number"
          min={0}
          disabled={locked || isDemo}
          value={meals}
          onChange={(e) => setMeals(e.target.value)}
          title={
            row.mealsFromShifts
              ? 'Suggested from shifts × site food allowance — you can adjust before save'
              : undefined
          }
          className={`w-full rounded-lg border px-2 py-1.5 font-mono text-xs disabled:bg-slate-50 ${
            row.mealsFromShifts
              ? 'border-indigo-300 bg-indigo-50/80 text-indigo-950'
              : 'border-slate-200'
          }`}
        />
      </label>
      <div className="flex items-center gap-2">
        {status === 'APPROVED' ? (
          <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[9px] font-black uppercase text-emerald-800">
            Approved
          </span>
        ) : status === 'DRAFT' ? (
          <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[9px] font-black uppercase text-amber-800">
            Draft
          </span>
        ) : (
          <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[9px] font-black uppercase text-slate-500">
            New
          </span>
        )}
        {!locked && !isDemo && (
          <>
            <button
              type="button"
              onClick={save}
              disabled={busy}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[10px] font-bold uppercase text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              {busy ? '…' : 'Save'}
            </button>
            {row.entryId && (
              <button
                type="button"
                onClick={approve}
                disabled={isPending}
                className="rounded-lg bg-emerald-600 px-3 py-1.5 text-[10px] font-bold uppercase text-white hover:bg-emerald-500 disabled:opacity-50"
              >
                Approve
              </button>
            )}
          </>
        )}
      </div>
      {error ? <p className="w-full text-xs font-semibold text-rose-700">{error}</p> : null}
    </div>
  );
}

function SiteCard({
  group,
  payrollMonth,
  expanded,
  onToggle,
  onRefresh,
  isDemo,
}: {
  group: SiteDeductionGroup;
  payrollMonth: string;
  expanded: boolean;
  onToggle: () => void;
  onRefresh: () => void;
  isDemo: boolean;
}) {
  const totalUniform = group.employees.reduce((s, e) => s + e.uniformAmountLkr, 0);
  const totalMeals = group.employees.reduce((s, e) => s + e.mealsAmountLkr, 0);

  return (
    <article className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm ring-1 ring-slate-100">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-3 px-4 py-4 text-left hover:bg-slate-50/80"
      >
        {expanded ? (
          <ChevronDown className="h-5 w-5 shrink-0 text-slate-400" />
        ) : (
          <ChevronRight className="h-5 w-5 shrink-0 text-slate-400" />
        )}
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-black text-slate-900">{group.siteName}</h3>
          <p className="text-xs text-slate-500">
            {group.employees.length} guard{group.employees.length !== 1 ? 's' : ''}
            {(() => {
              const shifts = group.employees.reduce((s, e) => s + e.shiftCount, 0);
              return shifts > 0
                ? ` · ${shifts} shift${shifts !== 1 ? 's' : ''}`
                : '';
            })()}
            {group.mealSupplierName ? ` · ${group.mealSupplierName}` : ' · No meal supplier'}
          </p>
        </div>
        <div className="hidden text-right sm:block">
          <p className="font-mono text-xs text-violet-700">U {formatLkr(totalUniform)}</p>
          <p className="font-mono text-xs text-indigo-700">M {formatLkr(totalMeals)}</p>
        </div>
        {group.pendingCount > 0 && (
          <span className="shrink-0 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[9px] font-black uppercase text-amber-900">
            {group.pendingCount} pending
          </span>
        )}
      </button>
      {expanded &&
        group.employees.map((emp) => (
          <EmployeeRow
            key={emp.employeeId}
            row={emp}
            payrollMonth={payrollMonth}
            onSaved={onRefresh}
            isDemo={isDemo}
          />
        ))}
    </article>
  );
}

export default function SiteDeductionsWorkbench({
  initialGroups,
  initialPayrollMonth,
  initialIsDemo,
}: {
  initialGroups: SiteDeductionGroup[];
  initialPayrollMonth: string;
  initialIsDemo: boolean;
}) {
  const [groups, setGroups] = useState(initialGroups);
  const [payrollMonth, setPayrollMonth] = useState(initialPayrollMonth);
  const [isDemo, setIsDemo] = useState(initialIsDemo);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const monthInput = payrollMonth.slice(0, 7);
  const viewingCurrentMonth = isCurrentPayrollMonth(payrollMonth);

  const refresh = useCallback(async (month?: string) => {
    setLoading(true);
    const result = await getSiteDeductionGroups(month ?? payrollMonth.slice(0, 7));
    setGroups(result.groups);
    setPayrollMonth(result.payrollMonth);
    setIsDemo(result.isDemo);
    setLoading(false);
  }, [payrollMonth]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return groups;
    return groups.filter(
      (g) =>
        g.siteName.toLowerCase().includes(q) ||
        g.employees.some(
          (e) =>
            e.fullName.toLowerCase().includes(q) ||
            e.empNumber.toLowerCase().includes(q),
        ),
    );
  }, [groups, search]);

  const pendingTotal = useMemo(
    () => groups.reduce((s, g) => s + g.pendingCount, 0),
    [groups],
  );

  const toggle = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const approveAll = async () => {
    setBulkBusy(true);
    setMessage(null);
    const res = await approveAllDraftForMonth(payrollMonth);
    setBulkBusy(false);
    if (!res.success) {
      setMessage(res.error ?? 'Bulk approve failed');
      return;
    }
    setMessage(`Approved ${res.approved} draft entr${res.approved === 1 ? 'y' : 'ies'}.`);
    await refresh();
  };

  return (
    <div className="space-y-4">
      {isDemo && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">
          Deductions tables are not migrated on this environment. Run{' '}
          <code className="text-xs">npm run db:apply-deductions-admin</code>, then refresh to
          edit live monthly entries.
        </p>
      )}

      {!viewingCurrentMonth && (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-900">
          Viewing historical payroll —{' '}
          <span className="font-black">{payrollMonthLabel(payrollMonth)}</span>. Uniform amounts
          from stock issues are shown when not yet saved on the monthly entry.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <label className="flex items-center gap-2">
          <span
            className={`text-[10px] font-bold uppercase tracking-widest ${
              viewingCurrentMonth ? 'text-slate-500' : 'text-red-700'
            }`}
          >
            Payroll month
          </span>
          <input
            type="month"
            value={monthInput}
            onChange={(e) => {
              const m = payrollMonthFirstDay(e.target.value);
              setPayrollMonth(m);
              void refresh(e.target.value);
            }}
            className={`rounded-lg border px-3 py-2 text-sm font-semibold ${
              viewingCurrentMonth
                ? 'border-slate-200 text-slate-900'
                : 'border-red-300 bg-red-50 text-red-900 ring-1 ring-red-200/80'
            }`}
          />
        </label>
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            placeholder="Search site or guard…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-sm"
          />
        </div>
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold uppercase text-slate-600 hover:bg-slate-50"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Refresh
        </button>
        {!isDemo && viewingCurrentMonth && pendingTotal > 0 && (
          <button
            type="button"
            onClick={() => void approveAll()}
            disabled={bulkBusy}
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-bold uppercase text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            <CheckCircle2 className="h-4 w-4" />
            Approve all drafts ({pendingTotal})
          </button>
        )}
      </div>

      {message ? (
        <p className="text-sm font-semibold text-indigo-800">{message}</p>
      ) : null}

      <div className="space-y-3">
        {filtered.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-6 py-12 text-center text-sm text-slate-500">
            No sites or guards match your search.
          </p>
        ) : (
          filtered.map((g) => (
            <SiteCard
              key={g.siteKey}
              group={g}
              payrollMonth={payrollMonth}
              expanded={expanded.has(g.siteKey)}
              onToggle={() => toggle(g.siteKey)}
              onRefresh={() => void refresh()}
              isDemo={isDemo}
            />
          ))
        )}
      </div>
    </div>
  );
}
