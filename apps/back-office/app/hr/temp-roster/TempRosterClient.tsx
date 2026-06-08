'use client';

import React, { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Users,
  Search,
  ArrowRightLeft,
  ArrowLeft,
  ShieldAlert,
  MapPin,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Plus,
  Trash2,
  Archive,
  FolderArchive,
  CalendarDays,
  Loader2,
} from 'lucide-react';
import {
  formatPayrollPeriodLabel,
  nextPayrollMonth,
  prevPayrollMonth,
  type PayrollPeriod,
} from '../../fm/lib/payroll-period';
import {
  addTempGuardAction,
  archiveTempGuardAction,
  removeTempGuardAction,
  type TempRosterDeskData,
} from './actions';
import type { SectorManagerRoster, TempGuard } from './types';
import { accruedPayForMonth } from './utils';

function formatLKR(amount: number) {
  return new Intl.NumberFormat('en-LK', {
    style: 'currency',
    currency: 'LKR',
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatDate(iso: string) {
  return new Date(iso + 'T12:00:00').toLocaleDateString('en-LK', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function totalShifts(guard: TempGuard) {
  return guard.shiftHistory.reduce((n, s) => n + s.shifts, 0);
}

function fieldIdentityToNameHint(identity: string): string | undefined {
  const trimmed = identity.trim();
  if (!trimmed || trimmed === '—') return undefined;
  return trimmed.replace(/\s*\(Pending\)\s*/i, '').trim();
}

function currentMonth(): PayrollPeriod {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

function isGuardActiveInMonth(guard: TempGuard, period: PayrollPeriod) {
  const monthStart = `${period.year}-${String(period.month).padStart(2, '0')}-01`;
  const lastDay = new Date(period.year, period.month, 0).getDate();
  const monthEnd = `${period.year}-${String(period.month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  const activeEnd = guard.activeTo ?? '9999-12-31';
  return guard.activeFrom <= monthEnd && activeEnd >= monthStart;
}

function comparePayrollPeriods(a: PayrollPeriod, b: PayrollPeriod) {
  if (a.year !== b.year) return a.year - b.year;
  return a.month - b.month;
}

function isPayrollPeriodOnOrBefore(period: PayrollPeriod, ceiling: PayrollPeriod) {
  return comparePayrollPeriods(period, ceiling) <= 0;
}

function liabilityMonthOptions(upTo: PayrollPeriod): PayrollPeriod[] {
  const options: PayrollPeriod[] = [];
  let cursor: PayrollPeriod = { year: 2025, month: 1 };
  while (isPayrollPeriodOnOrBefore(cursor, upTo)) {
    options.push(cursor);
    cursor = nextPayrollMonth(cursor);
  }
  return options;
}

export default function TempRosterClient({ initialData }: { initialData: TempRosterDeskData }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [guards, setGuards] = useState<TempGuard[]>(initialData.guards);
  const [sectorManagers] = useState<SectorManagerRoster[]>(initialData.sectorManagers);
  const shiftRateLkr = initialData.shiftRateLkr;
  const [search, setSearch] = useState('');
  const [expandedSm, setExpandedSm] = useState<Set<string>>(() => {
    const first = initialData.sectorManagers[0]?.smId;
    return first ? new Set([first]) : new Set();
  });
  const [expandedGuard, setExpandedGuard] = useState<string | null>(null);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [expandedArchived, setExpandedArchived] = useState<string | null>(null);
  const [liabilityMonth, setLiabilityMonth] = useState<PayrollPeriod>(currentMonth);
  const [actionError, setActionError] = useState<string | null>(null);
  const currentPayrollMonth = useMemo(() => currentMonth(), []);
  const selectableLiabilityMonths = useMemo(
    () => liabilityMonthOptions(currentPayrollMonth),
    [currentPayrollMonth],
  );
  const atCurrentLiabilityMonth = useMemo(
    () => comparePayrollPeriods(liabilityMonth, currentPayrollMonth) >= 0,
    [liabilityMonth, currentPayrollMonth],
  );

  const activeGuards = guards.filter((g) => g.status === 'ACTIVE');
  const archivedGuards = guards.filter((g) => g.status === 'ARCHIVED');

  const searchLower = search.trim().toLowerCase();

  const matchesSearch = (g: TempGuard, sm: SectorManagerRoster) => {
    if (!searchLower) return true;
    const blob = `${g.id} ${g.fieldIdentity} ${sm.name} ${sm.sector}`.toLowerCase();
    return blob.includes(searchLower);
  };

  const activeTemps = activeGuards.filter((g) => totalShifts(g) > 0).length;
  const totalAccrued = useMemo(
    () =>
      activeGuards
        .filter((g) => isGuardActiveInMonth(g, liabilityMonth))
        .reduce((acc, g) => acc + accruedPayForMonth(g, liabilityMonth, shiftRateLkr), 0),
    [activeGuards, liabilityMonth, shiftRateLkr],
  );

  const guardsBySm = useMemo(() => {
    const map = new Map<string, TempGuard[]>();
    for (const sm of sectorManagers) map.set(sm.smId, []);
    for (const g of activeGuards) {
      const list = map.get(g.smId) ?? [];
      list.push(g);
      map.set(g.smId, list);
    }
    for (const [, list] of map) {
      list.sort((a, b) => a.sequence - b.sequence);
    }
    return map;
  }, [activeGuards, sectorManagers]);

  const filteredArchived = archivedGuards.filter((g) => {
    const sm = sectorManagers.find((s) => s.smId === g.smId);
    return sm && matchesSearch(g, sm);
  });

  const toggleSm = (smId: string) => {
    setExpandedSm((prev) => {
      const next = new Set(prev);
      if (next.has(smId)) next.delete(smId);
      else next.add(smId);
      return next;
    });
  };

  const toggleGuardDetail = (id: string) => {
    setExpandedGuard((prev) => (prev === id ? null : id));
  };

  const toggleArchivedDetail = (id: string) => {
    setExpandedArchived((prev) => (prev === id ? null : id));
  };

  const addTempGuard = (smId: string) => {
    setActionError(null);
    startTransition(async () => {
      const result = await addTempGuardAction(smId);
      if (result.error) {
        setActionError(result.error);
        return;
      }
      if (result.guard) {
        setGuards((prev) => [...prev, result.guard!]);
        setExpandedSm((prev) => new Set(prev).add(smId));
        setExpandedGuard(result.guard.id);
        router.refresh();
      }
    });
  };

  const removeTempGuard = (id: string) => {
    const g = guards.find((x) => x.id === id);
    if (!g || g.status !== 'ACTIVE') return;
    if (totalShifts(g) > 0) {
      window.alert('Cannot remove a temp with logged shifts. Archive or merge first.');
      return;
    }
    setActionError(null);
    startTransition(async () => {
      const result = await removeTempGuardAction(id);
      if (result.error) {
        setActionError(result.error);
        return;
      }
      setGuards((prev) => prev.filter((x) => x.id !== id));
      if (expandedGuard === id) setExpandedGuard(null);
      router.refresh();
    });
  };

  const archiveTempGuard = (id: string) => {
    setActionError(null);
    startTransition(async () => {
      const result = await archiveTempGuardAction(id);
      if (result.error) {
        setActionError(result.error);
        return;
      }
      const today = new Date().toISOString().slice(0, 10);
      setGuards((prev) =>
        prev.map((g) =>
          g.id === id
            ? {
                ...g,
                status: 'ARCHIVED',
                activeTo: g.activeTo ?? today,
                archivedAt: today,
              }
            : g,
        ),
      );
      setExpandedGuard(null);
      setArchiveOpen(true);
      router.refresh();
    });
  };

  const mergeToMnr = (id: string) => {
    const g = guards.find((x) => x.id === id);
    if (!g || totalShifts(g) === 0) {
      window.alert('Assign shifts before merging, or remove empty slots instead.');
      return;
    }
    const params = new URLSearchParams({ temp: g.id });
    const nameHint = fieldIdentityToNameHint(g.fieldIdentity);
    if (nameHint) params.set('name', nameHint);
    router.push(`/hr/onboarding?${params.toString()}`);
  };

  const smVisible = (sm: SectorManagerRoster) => {
    if (!searchLower) return true;
    const list = guardsBySm.get(sm.smId) ?? [];
    if (`${sm.name} ${sm.sector}`.toLowerCase().includes(searchLower)) return true;
    return list.some((g) => matchesSearch(g, sm));
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 pb-12">
      <header className="sticky top-0 z-50 flex items-center justify-between border-b border-white/60 bg-white/45 px-8 py-4 backdrop-blur-xl shadow-[0_8px_32px_-12px_rgba(15,23,42,0.08)]">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-sm">
            <ArrowRightLeft className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-black uppercase tracking-tight text-slate-900">
              Shadow Roster Reconciliation
            </h1>
            <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-widest">
              Temp Guard Merge & Shift Transfer
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search SM or Temp ID..."
              className="pl-9 pr-4 py-2 rounded-xl border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 w-64"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Link
            href="/hr/mnr"
            className="inline-flex items-center gap-2 px-3 py-2 bg-white border border-slate-200 text-slate-600 text-xs font-bold rounded-xl hover:bg-slate-50 transition-all shadow-sm uppercase tracking-wide shrink-0"
          >
            <ArrowLeft className="w-4 h-4" />
            HR Hub
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-7xl p-8 space-y-8">
        {actionError && (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-5 py-3 text-sm font-semibold text-rose-800">
            {actionError}
          </div>
        )}

        {isPending && (
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-indigo-600">
            <Loader2 className="h-4 w-4 animate-spin" />
            Saving…
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1 bg-amber-500" />
            <div className="flex items-center justify-between mb-4">
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                Active Unmerged Temps
              </span>
              <Users className="h-4 w-4 text-amber-500" />
            </div>
            <div className="text-2xl font-black tabular-nums">{activeTemps} Slots</div>
            <div className="mt-1 text-xs font-semibold text-slate-500">
              Guards working without permanent profiles
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1 bg-indigo-500" />
            <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                Total Unreconciled Liability
              </span>
              <div className="flex items-center gap-1 rounded-lg border border-indigo-200 bg-indigo-50/60 px-1 py-1">
                <CalendarDays className="ml-1.5 h-3.5 w-3.5 shrink-0 text-indigo-500" aria-hidden />
                <button
                  type="button"
                  onClick={() => setLiabilityMonth((m) => prevPayrollMonth(m))}
                  aria-label="Previous month"
                  className="flex h-7 w-7 items-center justify-center rounded-md text-indigo-600 transition-colors hover:bg-indigo-100"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <label className="sr-only" htmlFor="liability-month-select">
                  Liability month
                </label>
                <select
                  id="liability-month-select"
                  value={`${liabilityMonth.year}-${liabilityMonth.month}`}
                  onChange={(e) => {
                    const [y, m] = e.target.value.split('-').map(Number);
                    setLiabilityMonth({ year: y, month: m });
                  }}
                  className="min-w-[6.5rem] cursor-pointer appearance-none rounded-md border-0 bg-transparent py-1 pl-1 pr-4 text-center text-[11px] font-black text-indigo-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/50"
                >
                  {selectableLiabilityMonths.map((p) => (
                    <option key={`${p.year}-${p.month}`} value={`${p.year}-${p.month}`}>
                      {formatPayrollPeriodLabel(p)}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => {
                    if (!atCurrentLiabilityMonth) {
                      setLiabilityMonth((m) => nextPayrollMonth(m));
                    }
                  }}
                  disabled={atCurrentLiabilityMonth}
                  aria-label="Next month"
                  className={`flex h-7 w-7 items-center justify-center rounded-md text-indigo-600 transition-colors ${
                    atCurrentLiabilityMonth
                      ? 'cursor-not-allowed opacity-40'
                      : 'hover:bg-indigo-100'
                  }`}
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div className="text-2xl font-black tabular-nums text-indigo-600">
              {formatLKR(totalAccrued)}
            </div>
            <div className="mt-1 text-xs font-semibold text-slate-500">
              Payroll trapped in shadow roster · {formatPayrollPeriodLabel(liabilityMonth, 'long')}
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-indigo-200 bg-indigo-50 p-4 flex items-start gap-4">
          <ShieldAlert className="h-5 w-5 text-indigo-600 shrink-0 mt-0.5" />
          <div>
            <h3 className="text-sm font-bold text-indigo-900 uppercase">Reconciliation Protocol</h3>
            <p className="text-sm font-semibold text-indigo-700 mt-1">
              Expand a Sector Manager to manage temp guards. Each temp receives a permanent unique ID
              (never reused). Merge opens{' '}
              <Link href="/hr/onboarding" className="underline font-bold">
                Onboarding
              </Link>{' '}
              to create the permanent profile and transfer shift history to{' '}
              <Link href="/hr/mnr" className="underline font-bold">
                Master Nominal Roll
              </Link>
              ; archive retains history in the folder below.
            </p>
          </div>
        </div>

        {/* SM-wise accordion */}
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 bg-slate-50 px-6 py-4">
            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-tight">
              Sector Managers — Temp Allocations
              <span className="text-indigo-600">
                {' '}
                · {formatPayrollPeriodLabel(liabilityMonth, 'long')}
              </span>
            </h2>
            <p className="text-xs font-semibold text-slate-500 mt-1">
              {formatPayrollPeriodLabel(liabilityMonth, 'long')} view · click a manager to expand ·
              click a temp row for shift history
            </p>
          </div>

          <div className="divide-y divide-slate-100">
            {sectorManagers.length === 0 && (
              <p className="px-6 py-10 text-center text-sm font-semibold text-slate-400">
                No active sector managers found. Onboard SMs first to allocate temp guard slots.
              </p>
            )}
            {sectorManagers.filter(smVisible).map((sm) => {
              const temps = (guardsBySm.get(sm.smId) ?? [])
                .filter((g) => isGuardActiveInMonth(g, liabilityMonth))
                .filter((g) => matchesSearch(g, sm));
              const isOpen = expandedSm.has(sm.smId);
              const activeWithShifts = temps.filter((t) => totalShifts(t) > 0).length;
              const smAccrued = temps.reduce(
                (n, t) => n + accruedPayForMonth(t, liabilityMonth, shiftRateLkr),
                0,
              );

              return (
                <div key={sm.smId}>
                  <button
                    type="button"
                    onClick={() => toggleSm(sm.smId)}
                    className="w-full flex items-center justify-between gap-4 px-6 py-4 text-left hover:bg-slate-50/80 transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {isOpen ? (
                        <ChevronDown className="h-5 w-5 text-indigo-500 shrink-0" />
                      ) : (
                        <ChevronRight className="h-5 w-5 text-slate-400 shrink-0" />
                      )}
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <MapPin className="h-4 w-4 text-slate-400 shrink-0" />
                          <span className="font-bold text-slate-900 uppercase tracking-tight truncate">
                            {sm.name}
                          </span>
                          <span className="text-xs font-semibold text-slate-500">
                            ({sm.sector})
                          </span>
                        </div>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mt-0.5 ml-6">
                          {temps.length} temp slot{temps.length !== 1 ? 's' : ''}
                          {activeWithShifts > 0 && ` · ${activeWithShifts} with shifts`}
                        </p>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-xs font-bold text-indigo-600 tabular-nums">
                        {formatLKR(smAccrued)}
                      </div>
                      <div className="text-[10px] font-semibold text-slate-400 uppercase">
                        SM liability
                      </div>
                    </div>
                  </button>

                  {isOpen && (
                    <div className="border-t border-slate-100 bg-slate-50/40 px-4 pb-4 pt-2 space-y-2">
                      <div className="flex justify-end px-2 pb-1">
                        <button
                          type="button"
                          onClick={() => addTempGuard(sm.smId)}
                          disabled={isPending}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-white px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-indigo-700 hover:bg-indigo-50 disabled:opacity-50 transition-colors"
                        >
                          <Plus className="h-3.5 w-3.5" /> Add temp guard
                        </button>
                      </div>

                      {temps.length === 0 && (
                        <p className="text-center text-xs font-semibold text-slate-400 py-6">
                          No temp guards for this SM. Add one to allocate a new unique ID.
                        </p>
                      )}

                      {temps.map((guard) => (
                        <GuardRow
                          key={guard.id}
                          guard={guard}
                          liabilityMonth={liabilityMonth}
                          shiftRateLkr={shiftRateLkr}
                          expanded={expandedGuard === guard.id}
                          onToggle={() => toggleGuardDetail(guard.id)}
                          onRemove={() => removeTempGuard(guard.id)}
                          onArchive={() => archiveTempGuard(guard.id)}
                          onMerge={() => mergeToMnr(guard.id)}
                          disabled={isPending}
                        />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Archive folder */}
        <div className="overflow-hidden rounded-2xl border border-slate-300 bg-slate-100/50 shadow-sm">
          <button
            type="button"
            onClick={() => setArchiveOpen((o) => !o)}
            className="w-full flex items-center justify-between gap-4 px-6 py-4 text-left hover:bg-slate-100 transition-colors"
          >
            <div className="flex items-center gap-3">
              {archiveOpen ? (
                <ChevronDown className="h-5 w-5 text-slate-600" />
              ) : (
                <ChevronRight className="h-5 w-5 text-slate-500" />
              )}
              <FolderArchive className="h-5 w-5 text-slate-600" />
              <div>
                <h2 className="text-sm font-bold text-slate-800 uppercase tracking-tight">
                  Archive
                </h2>
                <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest">
                  Closed temp IDs — history retained · IDs never reused
                </p>
              </div>
            </div>
            <span className="rounded-full bg-slate-200 px-3 py-1 text-xs font-black text-slate-700">
              {archivedGuards.length}
            </span>
          </button>

          {archiveOpen && (
            <div className="border-t border-slate-200 bg-white divide-y divide-slate-100">
              {filteredArchived.length === 0 ? (
                <p className="text-center text-xs font-semibold text-slate-400 py-8">
                  No archived temp guards.
                </p>
              ) : (
                filteredArchived.map((guard) => {
                  const sm = sectorManagers.find((s) => s.smId === guard.smId)!;
                  return (
                    <div key={guard.id} className="px-4 py-2">
                      <ArchivedGuardRow
                        guard={guard}
                        smLabel={`${sm.name} (${sm.sector})`}
                        liabilityMonth={liabilityMonth}
                        shiftRateLkr={shiftRateLkr}
                        expanded={expandedArchived === guard.id}
                        onToggle={() => toggleArchivedDetail(guard.id)}
                      />
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function ShiftHistoryPanel({
  guard,
  liabilityMonth,
  shiftRateLkr,
}: {
  guard: TempGuard;
  liabilityMonth: PayrollPeriod;
  shiftRateLkr: number;
}) {
  const shifts = totalShifts(guard);
  const periodEnd = guard.activeTo ? formatDate(guard.activeTo) : 'Present';
  const monthAccrued = accruedPayForMonth(guard, liabilityMonth, shiftRateLkr);

  return (
    <div className="mt-2 rounded-xl border border-slate-200 bg-white p-4 text-sm space-y-3">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-[10px] font-bold uppercase tracking-widest text-slate-500">
        <div>
          <span className="block text-slate-400">Active period</span>
          <span className="text-slate-800 normal-case font-semibold text-xs">
            {formatDate(guard.activeFrom)} → {periodEnd}
          </span>
        </div>
        <div>
          <span className="block text-slate-400">Total shifts</span>
          <span className="text-indigo-700 text-base font-black tabular-nums">{shifts}</span>
        </div>
        {guard.archivedAt && (
          <div>
            <span className="block text-slate-400">Archived</span>
            <span className="text-slate-800 normal-case font-semibold text-xs">
              {formatDate(guard.archivedAt)}
            </span>
          </div>
        )}
        {monthAccrued > 0 && (
          <div>
            <span className="block text-slate-400">
              Accrued · {formatPayrollPeriodLabel(liabilityMonth)}
            </span>
            <span className="text-indigo-600 font-black tabular-nums text-xs">
              {formatLKR(monthAccrued)}
            </span>
          </div>
        )}
      </div>
      {guard.shiftHistory.length > 0 ? (
        <ul className="divide-y divide-slate-100 rounded-lg border border-slate-100 overflow-hidden">
          {guard.shiftHistory.map((row) => (
            <li
              key={row.site}
              className="flex items-center justify-between px-3 py-2 bg-slate-50/80 text-xs font-semibold text-slate-700"
            >
              <span>{row.site}</span>
              <span className="font-black text-indigo-600 tabular-nums">{row.shifts} shifts</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs font-semibold text-slate-400">No shifts logged for this temp ID.</p>
      )}
    </div>
  );
}

function GuardRow({
  guard,
  liabilityMonth,
  shiftRateLkr,
  expanded,
  onToggle,
  onRemove,
  onArchive,
  onMerge,
  disabled,
}: {
  guard: TempGuard;
  liabilityMonth: PayrollPeriod;
  shiftRateLkr: number;
  expanded: boolean;
  onToggle: () => void;
  onRemove: () => void;
  onArchive: () => void;
  onMerge: () => void;
  disabled?: boolean;
}) {
  const shifts = totalShifts(guard);
  const hasWork = shifts > 0;
  const monthAccrued = accruedPayForMonth(guard, liabilityMonth, shiftRateLkr);

  return (
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm">
      <div className="flex flex-wrap items-center gap-2 px-4 py-3">
        <button
          type="button"
          onClick={onToggle}
          className="flex flex-1 min-w-[200px] items-center gap-2 text-left"
        >
          {expanded ? (
            <ChevronDown className="h-4 w-4 text-indigo-500 shrink-0" />
          ) : (
            <ChevronRight className="h-4 w-4 text-slate-400 shrink-0" />
          )}
          <span className="font-mono text-xs font-black text-slate-900 bg-slate-100 px-2 py-1 rounded-md">
            {guard.id}
          </span>
          <span className="text-xs font-bold uppercase text-slate-600 truncate">
            {guard.fieldIdentity}
          </span>
        </button>

        <div className="flex items-center gap-2 ml-auto shrink-0">
          {hasWork ? (
            <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2 py-1 rounded-md">
              {shifts} shifts · {formatLKR(monthAccrued)}
            </span>
          ) : (
            <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-md uppercase tracking-widest">
              Available
            </span>
          )}

          {hasWork && (
            <button
              type="button"
              onClick={onMerge}
              disabled={disabled}
              className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider text-white transition-colors"
            >
              <ArrowRightLeft className="h-3 w-3" /> Merge → MNR
            </button>
          )}

          {hasWork ? (
            <button
              type="button"
              onClick={onArchive}
              disabled={disabled}
              title="Archive temp guard"
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-50 px-2 py-1.5 text-[10px] font-bold uppercase text-slate-600 transition-colors"
            >
              <Archive className="h-3 w-3" />
            </button>
          ) : (
            <button
              type="button"
              onClick={onRemove}
              disabled={disabled}
              title="Remove empty slot"
              className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 hover:bg-rose-100 disabled:opacity-50 px-2 py-1.5 text-[10px] font-bold uppercase text-rose-700 transition-colors"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>

      {expanded && (
        <div className="px-4 pb-4">
          <ShiftHistoryPanel
            guard={guard}
            liabilityMonth={liabilityMonth}
            shiftRateLkr={shiftRateLkr}
          />
        </div>
      )}
    </div>
  );
}

function ArchivedGuardRow({
  guard,
  smLabel,
  liabilityMonth,
  shiftRateLkr,
  expanded,
  onToggle,
}: {
  guard: TempGuard;
  smLabel: string;
  liabilityMonth: PayrollPeriod;
  shiftRateLkr: number;
  expanded: boolean;
  onToggle: () => void;
}) {
  const shifts = totalShifts(guard);

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/50 overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex flex-wrap items-center gap-2 px-4 py-3 text-left hover:bg-slate-100/80 transition-colors"
      >
        {expanded ? (
          <ChevronDown className="h-4 w-4 text-slate-600 shrink-0" />
        ) : (
          <ChevronRight className="h-4 w-4 text-slate-400 shrink-0" />
        )}
        <span className="font-mono text-xs font-black text-slate-700 bg-slate-200/80 px-2 py-1 rounded-md">
          {guard.id}
        </span>
        <span className="text-xs font-bold uppercase text-slate-500">{guard.fieldIdentity}</span>
        <span className="text-[10px] font-semibold text-slate-400 ml-1">{smLabel}</span>
        <span className="ml-auto text-[10px] font-bold text-slate-500">
          {shifts} shifts · {formatDate(guard.activeFrom)} –{' '}
          {guard.activeTo ? formatDate(guard.activeTo) : '—'}
        </span>
      </button>
      {expanded && (
        <div className="px-4 pb-4">
          <ShiftHistoryPanel
            guard={guard}
            liabilityMonth={liabilityMonth}
            shiftRateLkr={shiftRateLkr}
          />
        </div>
      )}
    </div>
  );
}
