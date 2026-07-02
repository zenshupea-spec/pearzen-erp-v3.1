'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  getPendingDiscrepancies,
  resolveDiscrepancy,
  getActiveRecoveryPlan,
  getRecoveryPlanHistory,
  saveRecoveryPlan,
  getCompanyEmployees,
  getComplianceSettings,
} from '../../app/actions/integrity';

// ─── Types ───────────────────────────────────────────────────────────────────

type SiteProfilesEmbed = { site_name: string } | { site_name: string }[] | null;

type EmployeesEmbed =
  | { full_name: string; rank: string; basic_salary: number | null }
  | { full_name: string; rank: string; basic_salary: number | null }[]
  | null;

type GuardEntry = {
  guard_id: string;
  guard_name: string;
  rank_enum: string;
  percentage: number;       // used for MONTHLY (0–100)
  shifts_per_month: number; // used for CUT_SHIFTS
  basic_salary: number;     // auto-sourced from employee record
};

type EmployeeOption = {
  id: string;
  first_name: string;
  last_name: string;
  rank_enum: string;
  basic_salary: number;
};

type ComplianceSettings = {
  wb_working_days: number;   // divisor for per-shift calculation (default 26)
  max_deduction_pct: number; // max % of basic that can be deducted per month (default 20)
};

type Discrepancy = {
  id: string;
  guard_id: string;
  shift_date: string;
  rostered_start: string;
  biometric_check_in: string;
  is_overlap_conflict: boolean;
  employees: EmployeesEmbed;
  site_profiles: SiteProfilesEmbed;
};

type RecoveryPlan = {
  id: string;
  attendance_log_id: string;
  deduction_method: 'CUT_SHIFTS' | 'MONTHLY';
  recovery_amount_lkr: number;
  months_to_recover: number;
  shifts_per_month: number;
  per_shift_value_lkr: number;
  guard_configs: GuardEntry[];
  notes: string | null;
  status: 'ACTIVE' | 'SUPERSEDED' | 'COMPLETED' | 'CANCELLED';
  created_by: string;
  created_by_name: string;
  updated_by: string | null;
  updated_by_name: string | null;
  created_at: string;
  updated_at: string;
};

type PlanForm = {
  deductionMethod: 'CUT_SHIFTS' | 'MONTHLY';
  recoveryAmountLkr: string;
  monthsToRecover: string; // MONTHLY: user-entered
  notes: string;
  guards: GuardEntry[];
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function asSingle<T>(v: T | T[] | null | undefined): T | null {
  if (v == null) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

function siteLabel(sp: SiteProfilesEmbed): string {
  return asSingle(sp)?.site_name ?? '—';
}

function employeeNames(emb: EmployeesEmbed) {
  const e = asSingle(emb);
  const full = String(e?.full_name ?? '').trim();
  const parts = full.split(/\s+/);
  return {
    first_name: parts[0] ?? '—',
    last_name: parts.slice(1).join(' '),
    rank_enum: e?.rank ?? '—',
    basic_salary: e?.basic_salary ?? 0,
  };
}

function formatTime(timeStr: string) {
  if (!timeStr) return '—';
  if (timeStr.includes('T')) {
    return new Date(timeStr).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });
  }
  return new Date(`1970-01-01T${timeStr}`).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDateTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatLKR(amount: number) {
  return new Intl.NumberFormat('en-LK', {
    style: 'currency',
    currency: 'LKR',
    maximumFractionDigits: 2,
  }).format(amount);
}

// ─── Guard Selector Dropdown ──────────────────────────────────────────────────

function GuardSelectorDropdown({
  employees,
  addedIds,
  loading,
  onSelect,
  onClose,
}: {
  employees: EmployeeOption[];
  addedIds: Set<string>;
  loading: boolean;
  onSelect: (emp: EmployeeOption) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const filtered = employees
    .filter((e) => !addedIds.has(e.id))
    .filter((e) =>
      `${e.first_name} ${e.last_name} ${e.rank_enum}`
        .toLowerCase()
        .includes(search.toLowerCase())
    );

  return (
    <div className="absolute right-0 top-full mt-1 z-30 bg-neutral-800 border border-neutral-600 rounded-xl shadow-2xl w-64 flex flex-col overflow-hidden">
      <div className="px-3 py-2 border-b border-neutral-700">
        <input
          ref={inputRef}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search guard…"
          className="w-full bg-transparent text-sm text-white placeholder-slate-600 focus:outline-none"
        />
      </div>
      <div className="overflow-y-auto max-h-44">
        {loading ? (
          <p className="px-3 py-3 text-xs text-slate-500 animate-pulse">
            Loading employees…
          </p>
        ) : filtered.length === 0 ? (
          <p className="px-3 py-3 text-xs text-slate-500">
            {employees.length === 0 ? 'No employees found.' : 'All guards already added.'}
          </p>
        ) : (
          filtered.map((emp) => (
            <button
              key={emp.id}
              type="button"
              onClick={() => {
                onSelect(emp);
                onClose();
              }}
              className="w-full text-left px-3 py-2 text-sm hover:bg-neutral-700 text-white flex items-center gap-2 transition-colors"
            >
              <span className="flex-1 truncate">
                {emp.first_name} {emp.last_name}
              </span>
              <span className="text-[10px] text-slate-500 uppercase tracking-wider shrink-0">
                {emp.rank_enum}
              </span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}

// ─── History Modal ────────────────────────────────────────────────────────────

function HistoryModal({
  history,
  employeeName,
  onClose,
}: {
  history: RecoveryPlan[];
  employeeName: string;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="bg-neutral-900 border border-neutral-700 rounded-2xl w-full max-w-2xl max-h-[80vh] flex flex-col shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-800">
          <div>
            <h2 className="text-white font-bold text-lg uppercase tracking-wide">
              Recovery Plan History
            </h2>
            <p className="text-slate-400 text-sm mt-0.5">{employeeName}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-500 hover:text-white transition-colors text-2xl leading-none"
          >
            ×
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-6 space-y-4">
          {history.length === 0 ? (
            <p className="text-slate-500 text-sm text-center py-8">
              No recovery plans recorded yet.
            </p>
          ) : (
            history.map((plan, idx) => {
              const isActive = plan.status === 'ACTIVE';
              const configs: GuardEntry[] = Array.isArray(plan.guard_configs)
                ? (plan.guard_configs as GuardEntry[])
                : [];
              const monthlyAmt =
                plan.months_to_recover > 0
                  ? plan.recovery_amount_lkr / plan.months_to_recover
                  : 0;
              const editorName = plan.updated_by_name ?? plan.created_by_name;
              const editorTime = plan.updated_by ? plan.updated_at : plan.created_at;

              return (
                <div
                  key={plan.id}
                  className={`rounded-xl border p-4 space-y-3 ${
                    isActive
                      ? 'border-indigo-500/50 bg-indigo-950/30'
                      : 'border-neutral-800 bg-neutral-950/50 opacity-70'
                  }`}
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className={`text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full ${
                        isActive
                          ? 'bg-indigo-600 text-white'
                          : plan.status === 'SUPERSEDED'
                          ? 'bg-neutral-700 text-slate-400'
                          : plan.status === 'COMPLETED'
                          ? 'bg-emerald-900 text-emerald-300'
                          : 'bg-red-900 text-red-300'
                      }`}
                    >
                      {isActive ? 'Active' : plan.status.toLowerCase()}
                    </span>
                    {idx === 0 && !isActive && (
                      <span className="text-[10px] text-slate-500 uppercase tracking-wider">
                        Latest
                      </span>
                    )}
                    <span className="ml-auto text-[10px] text-slate-500 font-mono">
                      #{history.length - idx}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
                    <div>
                      <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-0.5">
                        Method
                      </p>
                      <p className="text-white font-medium">
                        {plan.deduction_method === 'CUT_SHIFTS'
                          ? 'Cut Shifts'
                          : 'Monthly'}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-0.5">
                        Total Recovery
                      </p>
                      <p className="text-amber-400 font-mono font-semibold">
                        {formatLKR(plan.recovery_amount_lkr)}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-0.5">
                        Duration
                      </p>
                      <p className="text-white font-medium">
                        {plan.months_to_recover}{' '}
                        {plan.months_to_recover === 1 ? 'month' : 'months'}
                      </p>
                    </div>
                    {plan.deduction_method === 'CUT_SHIFTS' && plan.per_shift_value_lkr > 0 && (
                      <div>
                        <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-0.5">
                          Per-Shift Value
                        </p>
                        <p className="text-emerald-400 font-mono font-semibold">
                          {formatLKR(plan.per_shift_value_lkr)}
                        </p>
                      </div>
                    )}
                    {plan.deduction_method === 'MONTHLY' && (
                      <div>
                        <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-0.5">
                          Per Month (total)
                        </p>
                        <p className="text-emerald-400 font-mono font-semibold">
                          {formatLKR(monthlyAmt)}
                        </p>
                      </div>
                    )}
                    {plan.notes && (
                      <div className="col-span-2 sm:col-span-3">
                        <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-0.5">
                          Notes
                        </p>
                        <p className="text-slate-300 text-sm">{plan.notes}</p>
                      </div>
                    )}
                  </div>

                  {/* Guard config summary */}
                  {configs.length > 0 && (
                    <div className="pt-2 border-t border-neutral-800/60">
                      <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1.5">
                        Guards
                      </p>
                      <div className="space-y-1">
                        {configs.map((g) => (
                          <div
                            key={g.guard_id}
                            className="flex items-center justify-between text-xs"
                          >
                            <div className="flex items-center gap-2">
                              <span className="text-slate-300">{g.guard_name}</span>
                              <span className="text-[9px] text-slate-600 uppercase">
                                {g.rank_enum}
                              </span>
                            </div>
                            {plan.deduction_method === 'MONTHLY' && configs.length > 1 ? (
                              <span className="text-indigo-300 font-mono">
                                {g.percentage}%
                                <span className="text-slate-500 ml-1">
                                  ({formatLKR((plan.recovery_amount_lkr * g.percentage) / 100 / plan.months_to_recover)}/mo)
                                </span>
                              </span>
                            ) : plan.deduction_method === 'CUT_SHIFTS' ? (
                              <span className="text-indigo-300 font-mono">
                                {g.shifts_per_month} shift{g.shifts_per_month !== 1 ? 's' : ''}/mo
                                {plan.per_shift_value_lkr > 0 && (
                                  <span className="text-slate-500 ml-1">
                                    ({formatLKR(g.shifts_per_month * plan.per_shift_value_lkr)}/mo)
                                  </span>
                                )}
                              </span>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="pt-2 border-t border-neutral-800 flex items-center gap-2 text-[11px] text-slate-500">
                    <span className="text-slate-400 font-medium">{editorName}</span>
                    <span>·</span>
                    <span>{formatDateTime(editorTime)}</span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Recovery Plan Panel ──────────────────────────────────────────────────────

function RecoveryPlanPanel({
  log,
  companyId,
}: {
  log: Discrepancy;
  companyId: string;
}) {
  const emp = employeeNames(log.employees);
  const fullName = `${emp.first_name} ${emp.last_name}`.trim();

  const primaryGuard: GuardEntry = {
    guard_id: log.guard_id,
    guard_name: fullName,
    rank_enum: emp.rank_enum,
    percentage: 100,
    shifts_per_month: 1,
    basic_salary: emp.basic_salary,
  };

  const [activePlan, setActivePlan] = useState<RecoveryPlan | null>(null);
  const [history, setHistory] = useState<RecoveryPlan[]>([]);
  const [loadingPlan, setLoadingPlan] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [saved, setSaved] = useState(false);

  const [complianceSettings, setComplianceSettings] = useState<ComplianceSettings>({
    wb_working_days: 26,
    max_deduction_pct: 20,
  });

  // Guard selector state
  const [availableGuards, setAvailableGuards] = useState<EmployeeOption[]>([]);
  const [loadingGuards, setLoadingGuards] = useState(false);
  const [showGuardSelector, setShowGuardSelector] = useState(false);
  const guardSelectorRef = useRef<HTMLDivElement>(null);

  const [form, setForm] = useState<PlanForm>({
    deductionMethod: 'CUT_SHIFTS',
    recoveryAmountLkr: '',
    monthsToRecover: '1',
    notes: '',
    guards: [primaryGuard],
  });

  // Close guard selector on outside click
  useEffect(() => {
    if (!showGuardSelector) return;
    function handleClick(e: MouseEvent) {
      if (
        guardSelectorRef.current &&
        !guardSelectorRef.current.contains(e.target as Node)
      ) {
        setShowGuardSelector(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showGuardSelector]);

  const loadPlan = useCallback(async () => {
    setLoadingPlan(true);
    try {
      const plan = await getActiveRecoveryPlan(log.id);
      setActivePlan(plan as RecoveryPlan | null);
      if (plan) {
        const p = plan as RecoveryPlan;
        const configs: GuardEntry[] = Array.isArray(p.guard_configs) && p.guard_configs.length > 0
          ? (p.guard_configs as GuardEntry[]).map((g) => ({
              ...g,
              basic_salary: (g as GuardEntry & { basic_salary?: number }).basic_salary ?? primaryGuard.basic_salary,
            }))
          : [{ ...primaryGuard, shifts_per_month: p.shifts_per_month ?? 1, percentage: 100 }];

        setForm({
          deductionMethod: p.deduction_method,
          recoveryAmountLkr: String(p.recovery_amount_lkr),
          monthsToRecover: String(p.months_to_recover),
          notes: p.notes ?? '',
          guards: configs,
        });
      }
    } catch {
      // ignore — table may not exist yet
    } finally {
      setLoadingPlan(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [log.id]);

  useEffect(() => {
    loadPlan();
  }, [loadPlan]);

  useEffect(() => {
    getComplianceSettings(companyId)
      .then(setComplianceSettings)
      .catch(() => {/* use defaults */});
  }, [companyId]);

  const loadGuards = async () => {
    if (availableGuards.length > 0 || loadingGuards) return;
    setLoadingGuards(true);
    try {
      const data = await getCompanyEmployees(companyId);
      setAvailableGuards(data);
    } catch {
      // ignore
    } finally {
      setLoadingGuards(false);
    }
  };

  const addedGuardIds = new Set(form.guards.map((g) => g.guard_id));

  const handleAddGuard = (emp: EmployeeOption) => {
    const newGuard: GuardEntry = {
      guard_id: emp.id,
      guard_name: `${emp.first_name} ${emp.last_name}`.trim(),
      rank_enum: emp.rank_enum,
      percentage: 0,
      shifts_per_month: 1,
      basic_salary: emp.basic_salary,
    };
    setForm((f) => ({ ...f, guards: [...f.guards, newGuard] }));
  };

  const handleRemoveGuard = (guardId: string) => {
    setForm((f) => ({
      ...f,
      guards: f.guards.filter((g) => g.guard_id !== guardId),
    }));
  };

  const updateGuard = (guardId: string, patch: Partial<GuardEntry>) => {
    setForm((f) => ({
      ...f,
      guards: f.guards.map((g) =>
        g.guard_id === guardId ? { ...g, ...patch } : g
      ),
    }));
  };

  // ── Calculations ──
  const amount = parseFloat(form.recoveryAmountLkr) || 0;
  const months = parseInt(form.monthsToRecover, 10) || 1;
  const { wb_working_days, max_deduction_pct } = complianceSettings;

  // Per-guard: per-shift value auto-computed from basic salary
  const guardCalcs = form.guards.map((g) => {
    const perShiftValue = g.basic_salary > 0 ? g.basic_salary / wb_working_days : 0;
    const monthlyDeduction = g.shifts_per_month * perShiftValue;
    const maxAllowed = g.basic_salary * (max_deduction_pct / 100);
    const salaryAfterCuts = g.basic_salary - monthlyDeduction;
    const exceedsLimit = monthlyDeduction > maxAllowed;
    const approachingLimit = !exceedsLimit && maxAllowed > 0 && monthlyDeduction / maxAllowed >= 0.8;
    return { perShiftValue, monthlyDeduction, maxAllowed, salaryAfterCuts, exceedsLimit, approachingLimit };
  });

  const totalMonthlyShiftRecovery = guardCalcs.reduce((sum, g) => sum + g.monthlyDeduction, 0);
  const calculatedMonths =
    totalMonthlyShiftRecovery > 0 ? Math.ceil(amount / totalMonthlyShiftRecovery) : 0;
  const anyGuardExceedsLimit = guardCalcs.some((g) => g.exceedsLimit);

  const percentageSum = form.guards.reduce((sum, g) => sum + g.percentage, 0);
  const percentageValid = Math.abs(percentageSum - 100) < 0.5;
  const multiGuard = form.guards.length > 1;

  // ── Save ──
  const handleSave = async () => {
    if (isNaN(amount) || amount <= 0) {
      alert('Enter a valid recovery amount.');
      return;
    }

    let monthsToSave: number;
    if (form.deductionMethod === 'CUT_SHIFTS') {
      if (totalMonthlyShiftRecovery <= 0) {
        alert('At least one guard must have shifts to cut per month.');
        return;
      }
      if (anyGuardExceedsLimit) {
        alert(
          `Statutory Deduction Limit Exceeded — one or more guards breach the ${max_deduction_pct}% monthly deduction cap. Reduce shifts to cut before saving.`
        );
        return;
      }
      monthsToSave = calculatedMonths;
    } else {
      if (isNaN(months) || months < 1) {
        alert('Months to recover must be at least 1.');
        return;
      }
      if (multiGuard && !percentageValid) {
        alert(`Guard percentages must sum to 100%. Current total: ${percentageSum}%`);
        return;
      }
      monthsToSave = months;
    }

    setSaving(true);
    try {
      await saveRecoveryPlan({
        attendanceLogId: log.id,
        companyId,
        guardId: log.guard_id,
        deductionMethod: form.deductionMethod,
        recoveryAmountLkr: amount,
        monthsToRecover: monthsToSave,
        shiftsPerMonth: form.guards[0]?.shifts_per_month ?? 1,
        perShiftValueLkr: guardCalcs[0]?.perShiftValue ?? 0,
        guardConfigs: form.guards,
        notes: form.notes.trim() || undefined,
      });
      await loadPlan();
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      alert('Failed to save recovery plan. ' + String(err));
    } finally {
      setSaving(false);
    }
  };

  const handleViewHistory = async () => {
    try {
      const h = await getRecoveryPlanHistory(log.id);
      setHistory(h as RecoveryPlan[]);
      setShowHistory(true);
    } catch {
      alert('Failed to load history.');
    }
  };

  const lastEditor = activePlan?.updated_by_name ?? activePlan?.created_by_name;
  const lastEditTime = activePlan?.updated_by
    ? activePlan.updated_at
    : activePlan?.created_at;

  return (
    <>
      {showHistory && (
        <HistoryModal
          history={history}
          employeeName={fullName}
          onClose={() => setShowHistory(false)}
        />
      )}

      <div className="mt-4 border-t border-neutral-800 pt-4">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-xs font-bold uppercase tracking-widest text-slate-400">
            Recovery Plan
          </h4>
          <button
            type="button"
            onClick={handleViewHistory}
            className="text-[11px] text-indigo-400 hover:text-indigo-300 underline underline-offset-2 transition-colors"
          >
            View History
          </button>
        </div>

        {loadingPlan ? (
          <p className="text-xs text-slate-600 animate-pulse">Loading plan…</p>
        ) : (
          <div className="space-y-4">
            {/* ── Method Toggle ── */}
            <div>
              <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-2 font-bold">
                Deduction Method
              </p>
              <div className="flex gap-2">
                {(
                  [
                    {
                      value: 'CUT_SHIFTS' as const,
                      label: 'Cut Shifts',
                      desc: 'Cuts deducted from shift roster',
                    },
                    {
                      value: 'MONTHLY' as const,
                      label: 'Monthly Deduction',
                      desc: 'Spread across monthly payslips',
                    },
                  ]
                ).map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() =>
                      setForm((f) => ({ ...f, deductionMethod: opt.value }))
                    }
                    className={`flex-1 text-left px-3 py-2.5 rounded-lg border text-xs transition-all ${
                      form.deductionMethod === opt.value
                        ? 'bg-indigo-600 border-indigo-500 text-white'
                        : 'bg-neutral-800 border-neutral-700 text-slate-400 hover:border-neutral-600'
                    }`}
                  >
                    <span className="font-bold block">{opt.label}</span>
                    <span
                      className={
                        form.deductionMethod === opt.value
                          ? 'text-indigo-200 text-[10px]'
                          : 'text-slate-600 text-[10px]'
                      }
                    >
                      {opt.desc}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* ── Recovery Amount ── */}
            <div className={`grid gap-3 ${form.deductionMethod === 'MONTHLY' ? 'grid-cols-2' : 'grid-cols-1'}`}>
              <div>
                <label className="text-[10px] text-slate-500 uppercase tracking-wider font-bold block mb-1.5">
                  Total Recovery Amount (LKR)
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.recoveryAmountLkr}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, recoveryAmountLkr: e.target.value }))
                  }
                  placeholder="0.00"
                  className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-white text-sm font-mono placeholder-slate-600 focus:outline-none focus:border-indigo-500 transition-colors"
                />
              </div>

              {form.deductionMethod === 'MONTHLY' && (
                <div>
                  <label className="text-[10px] text-slate-500 uppercase tracking-wider font-bold block mb-1.5">
                    Months to Recover
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="24"
                    step="1"
                    value={form.monthsToRecover}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, monthsToRecover: e.target.value }))
                    }
                    className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-white text-sm font-mono focus:outline-none focus:border-indigo-500 transition-colors"
                  />
                </div>
              )}
            </div>

            {/* ── Guards Section ── */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-[10px] text-slate-500 uppercase tracking-wider font-bold">
                  Guards
                  {multiGuard && (
                    <span className="ml-2 text-indigo-400 normal-case font-normal">
                      {form.guards.length} assigned
                    </span>
                  )}
                </p>
                <div className="relative" ref={guardSelectorRef}>
                  <button
                    type="button"
                    onClick={() => {
                      setShowGuardSelector((v) => !v);
                      loadGuards();
                    }}
                    className="text-[11px] text-indigo-400 hover:text-indigo-300 flex items-center gap-1 transition-colors"
                  >
                    <span className="text-base leading-none">+</span> Add Guard
                  </button>
                  {showGuardSelector && (
                    <GuardSelectorDropdown
                      employees={availableGuards}
                      addedIds={addedGuardIds}
                      loading={loadingGuards}
                      onSelect={handleAddGuard}
                      onClose={() => setShowGuardSelector(false)}
                    />
                  )}
                </div>
              </div>

              <div className="space-y-2">
                {form.guards.map((guard, idx) => {
                  const isPrimary = idx === 0;
                  const calc = guardCalcs[idx];

                  if (form.deductionMethod === 'CUT_SHIFTS') {
                    const { perShiftValue, monthlyDeduction, maxAllowed, salaryAfterCuts, exceedsLimit, approachingLimit } = calc ?? {
                      perShiftValue: 0, monthlyDeduction: 0, maxAllowed: 0, salaryAfterCuts: 0, exceedsLimit: false, approachingLimit: false,
                    };

                    return (
                      <div
                        key={guard.guard_id}
                        className={`rounded-lg border px-3 py-2.5 space-y-2 ${
                          exceedsLimit
                            ? 'border-red-500/50 bg-red-950/20'
                            : approachingLimit
                            ? 'border-amber-500/40 bg-amber-950/10'
                            : isPrimary
                            ? 'border-neutral-700 bg-neutral-800/60'
                            : 'border-neutral-700/60 bg-neutral-800/30'
                        }`}
                      >
                        {/* Top row: identity + shifts input + remove */}
                        <div className="flex items-center gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-medium text-white truncate">
                                {guard.guard_name}
                              </span>
                              <span className="text-[9px] px-1.5 py-0.5 bg-neutral-700 text-slate-400 rounded uppercase tracking-wider shrink-0">
                                {guard.rank_enum}
                              </span>
                              {isPrimary && (
                                <span className="text-[9px] text-indigo-400 uppercase tracking-widest shrink-0">
                                  Primary
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <label className="text-[10px] text-slate-500 whitespace-nowrap">
                              Shifts to cut
                            </label>
                            <input
                              type="number"
                              min="0"
                              max="31"
                              step="1"
                              value={guard.shifts_per_month}
                              onChange={(e) =>
                                updateGuard(guard.guard_id, {
                                  shifts_per_month: parseInt(e.target.value, 10) || 0,
                                })
                              }
                              className="w-14 bg-neutral-900 border border-neutral-600 rounded-md px-2 py-1 text-white text-sm font-mono text-center focus:outline-none focus:border-indigo-500 transition-colors"
                            />
                            {!isPrimary && (
                              <button
                                type="button"
                                onClick={() => handleRemoveGuard(guard.guard_id)}
                                className="text-[10px] text-red-400 hover:text-red-300 uppercase tracking-wider ml-1 transition-colors"
                              >
                                Remove
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Salary breakdown row */}
                        <div className="grid grid-cols-3 gap-2 text-[10px] pt-1 border-t border-neutral-700/50">
                          <div>
                            <p className="text-slate-600 uppercase tracking-wider mb-0.5">
                              Per-shift value
                            </p>
                            <p className="text-slate-300 font-mono font-semibold">
                              {perShiftValue > 0 ? formatLKR(perShiftValue) : '—'}
                            </p>
                            <p className="text-slate-600 mt-0.5">
                              {guard.basic_salary > 0
                                ? `${formatLKR(guard.basic_salary)} ÷ ${wb_working_days}`
                                : 'No salary on file'}
                            </p>
                          </div>
                          <div>
                            <p className="text-slate-600 uppercase tracking-wider mb-0.5">
                              Monthly deduction
                            </p>
                            <p className={`font-mono font-semibold ${
                              exceedsLimit ? 'text-red-400' : approachingLimit ? 'text-amber-400' : 'text-white'
                            }`}>
                              {monthlyDeduction > 0 ? formatLKR(monthlyDeduction) : '—'}
                            </p>
                            <p className={`mt-0.5 ${
                              exceedsLimit ? 'text-red-500' : approachingLimit ? 'text-amber-600' : 'text-slate-600'
                            }`}>
                              Max: {formatLKR(maxAllowed)} ({max_deduction_pct}%)
                            </p>
                          </div>
                          <div>
                            <p className="text-slate-600 uppercase tracking-wider mb-0.5">
                              Salary left
                            </p>
                            <p className={`font-mono font-semibold ${
                              exceedsLimit ? 'text-red-400' : 'text-emerald-400'
                            }`}>
                              {guard.basic_salary > 0 ? formatLKR(salaryAfterCuts) : '—'}
                            </p>
                            {exceedsLimit && (
                              <p className="text-red-500 mt-0.5 font-semibold">Exceeds legal cap</p>
                            )}
                            {approachingLimit && !exceedsLimit && (
                              <p className="text-amber-500 mt-0.5">Approaching limit</p>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  }

                  // ── MONTHLY method guard row ──
                  const guardMonthly =
                    multiGuard && months > 0
                      ? (amount * guard.percentage) / 100 / months
                      : months > 0
                      ? amount / months
                      : null;

                  return (
                    <div
                      key={guard.guard_id}
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border ${
                        isPrimary
                          ? 'border-neutral-700 bg-neutral-800/60'
                          : 'border-neutral-700/60 bg-neutral-800/30'
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium text-white truncate">
                            {guard.guard_name}
                          </span>
                          <span className="text-[9px] px-1.5 py-0.5 bg-neutral-700 text-slate-400 rounded uppercase tracking-wider shrink-0">
                            {guard.rank_enum}
                          </span>
                          {isPrimary && (
                            <span className="text-[9px] text-indigo-400 uppercase tracking-widest shrink-0">
                              Primary
                            </span>
                          )}
                        </div>
                        {guardMonthly !== null && guardMonthly > 0 && (
                          <p className="text-[10px] text-slate-500 mt-0.5 font-mono">
                            {formatLKR(guardMonthly)}/month
                          </p>
                        )}
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {multiGuard && (
                          <div className="flex items-center gap-1">
                            <input
                              type="number"
                              min="0"
                              max="100"
                              step="1"
                              value={guard.percentage}
                              onChange={(e) =>
                                updateGuard(guard.guard_id, {
                                  percentage: parseFloat(e.target.value) || 0,
                                })
                              }
                              className={`w-16 bg-neutral-900 border rounded-md px-2 py-1 text-sm font-mono text-center focus:outline-none transition-colors ${
                                percentageValid
                                  ? 'border-neutral-600 text-white focus:border-indigo-500'
                                  : 'border-amber-600/60 text-amber-300 focus:border-amber-500'
                              }`}
                            />
                            <span className="text-slate-400 text-sm">%</span>
                          </div>
                        )}
                        {!isPrimary && (
                          <button
                            type="button"
                            onClick={() => handleRemoveGuard(guard.guard_id)}
                            className="text-[10px] text-red-400 hover:text-red-300 uppercase tracking-wider ml-1 transition-colors"
                          >
                            Remove
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Percentage validation for MONTHLY multi-guard */}
              {form.deductionMethod === 'MONTHLY' && multiGuard && (
                <div
                  className={`mt-2 flex items-center gap-2 text-xs px-2 py-1 rounded-md ${
                    percentageValid
                      ? 'text-emerald-400 bg-emerald-950/30'
                      : 'text-amber-400 bg-amber-950/30'
                  }`}
                >
                  <span>{percentageValid ? '✓' : '⚠'}</span>
                  <span>
                    Total: <span className="font-mono font-bold">{percentageSum}%</span>
                    {!percentageValid && ` — must equal 100%`}
                  </span>
                </div>
              )}
            </div>

            {/* ── Preview ── */}
            {amount > 0 && (
              <div className="bg-neutral-800/60 border border-neutral-700/50 rounded-lg px-4 py-3 space-y-2">
                {form.deductionMethod === 'CUT_SHIFTS' ? (
                  <>
                    {totalMonthlyShiftRecovery > 0 && (
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-[10px] text-slate-500 uppercase tracking-wider font-bold">
                            Total monthly recovery
                          </p>
                          <p className="text-amber-400 font-mono font-bold text-base mt-0.5">
                            {formatLKR(totalMonthlyShiftRecovery)}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-[10px] text-slate-500 uppercase tracking-wider font-bold">
                            Months to recover
                          </p>
                          <p className="text-white font-bold text-base mt-0.5">
                            {calculatedMonths > 0 ? `${calculatedMonths} month${calculatedMonths !== 1 ? 's' : ''}` : '—'}
                          </p>
                        </div>
                      </div>
                    )}
                    {totalMonthlyShiftRecovery <= 0 && (
                      <p className="text-[11px] text-slate-500">
                        Set shifts to cut per guard to see recovery estimate.
                      </p>
                    )}
                    {/* Compliance warning banner */}
                    {anyGuardExceedsLimit && (
                      <div className="mt-1 rounded-md bg-red-950/40 border border-red-500/40 px-3 py-2 text-[11px] text-red-300">
                        <p className="font-bold uppercase tracking-wider mb-0.5">
                          Statutory Deduction Limit Exceeded — Cannot Submit
                        </p>
                        <p className="text-red-400/80">
                          Sri Lanka Wages Boards Ordinance — max deduction per employee:{' '}
                          <span className="font-bold">{max_deduction_pct}% of basic salary</span> per month.
                        </p>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[10px] text-slate-500 uppercase tracking-wider font-bold">
                        {multiGuard ? 'Total per payslip' : 'Per payslip deduction'}
                      </p>
                      <p className="text-amber-400 font-mono font-bold text-base mt-0.5">
                        {formatLKR(months > 0 ? amount / months : 0)}
                      </p>
                    </div>
                    {months > 1 && (
                      <div className="text-right">
                        <p className="text-[10px] text-slate-500 uppercase tracking-wider font-bold">
                          Over
                        </p>
                        <p className="text-slate-300 font-bold text-sm">
                          {months} months
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* ── Notes ── */}
            <div>
              <label className="text-[10px] text-slate-500 uppercase tracking-wider font-bold block mb-1.5">
                Notes (optional)
              </label>
              <textarea
                rows={2}
                value={form.notes}
                onChange={(e) =>
                  setForm((f) => ({ ...f, notes: e.target.value }))
                }
                placeholder="Reason for recovery, context, instructions…"
                className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-white text-sm placeholder-slate-600 focus:outline-none focus:border-indigo-500 transition-colors resize-none"
              />
            </div>

            {/* ── Last editor stamp ── */}
            {activePlan && lastEditor && lastEditTime && (
              <p className="text-[11px] text-slate-500 flex items-center gap-1.5">
                <span className="text-slate-400 font-medium">{lastEditor}</span>
                <span>·</span>
                <span>{formatDateTime(lastEditTime)}</span>
                {activePlan.updated_by && (
                  <span className="text-slate-600 ml-1">(edited)</span>
                )}
              </p>
            )}

            {/* ── Save ── */}
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || (form.deductionMethod === 'CUT_SHIFTS' && anyGuardExceedsLimit)}
              className={`w-full py-2.5 rounded-lg text-sm font-bold uppercase tracking-wide transition-all ${
                saved
                  ? 'bg-emerald-700 text-white'
                  : form.deductionMethod === 'CUT_SHIFTS' && anyGuardExceedsLimit
                  ? 'bg-red-900/40 border border-red-500/40 text-red-400 cursor-not-allowed'
                  : 'bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-50'
              }`}
            >
              {saving
                ? 'Saving…'
                : saved
                ? '✓ Plan Saved'
                : form.deductionMethod === 'CUT_SHIFTS' && anyGuardExceedsLimit
                ? 'Deduction Limit Exceeded — Adjust Shifts'
                : activePlan
                ? 'Update Recovery Plan'
                : 'Save Recovery Plan'}
            </button>
          </div>
        )}
      </div>
    </>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────

export default function DiscrepancyDashboard({ companyId }: { companyId: string }) {
  const [logs, setLogs] = useState<Discrepancy[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [expandedPlanId, setExpandedPlanId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadDiscrepancies() {
      setIsLoading(true);
      try {
        const data = await getPendingDiscrepancies();
        const rows = (data ?? []) as unknown as Discrepancy[];
        if (!cancelled) setLogs(rows);
      } catch (err) {
        console.error('Failed to load discrepancies', err);
        if (!cancelled) setLogs([]);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    loadDiscrepancies();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleResolve = async (
    id: string,
    resolutionType: 'TRUST_FORM' | 'TRUST_CHECK_IN'
  ) => {
    setProcessingId(id);
    try {
      await resolveDiscrepancy(id, resolutionType);
      setLogs((prev) => prev.filter((log) => log.id !== id));
    } catch {
      alert('Failed to process override. Check database connection.');
    } finally {
      setProcessingId(null);
    }
  };

  if (isLoading) {
    return (
      <div className="p-8 text-slate-400 font-medium animate-pulse">
        Loading Integrity Engine…
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-950 text-slate-200 p-6 md:p-8 shadow-sm">
      <div className="max-w-7xl mx-auto">
        {logs.length === 0 ? (
          <div className="bg-neutral-900 border border-emerald-900/40 text-emerald-200 p-8 rounded-2xl flex items-center gap-4">
            <span className="text-3xl">✓</span>
            <div>
              <h3 className="font-bold text-white uppercase tracking-wide">
                Queue clear
              </h3>
              <p className="text-sm text-slate-400 mt-1">
                No attendance rows in{' '}
                <code className="text-emerald-400/90">PENDING_RESOLUTION</code>.
              </p>
            </div>
          </div>
        ) : (
          <div className="grid gap-4">
            {logs.map((log) => {
              const emp = employeeNames(log.employees);
              const isPlanOpen = expandedPlanId === log.id;

              return (
                <div
                  key={log.id}
                  className={`rounded-2xl border transition-all bg-neutral-900/80
                    ${log.is_overlap_conflict
                      ? 'border-red-500/60 ring-1 ring-red-500/20'
                      : isPlanOpen
                      ? 'border-indigo-500/40'
                      : 'border-neutral-800'
                    }
                  `}
                >
                  {/* Card top row */}
                  <div className="p-6 flex flex-col md:flex-row items-center justify-between gap-6">
                    {/* Employee info */}
                    <div className="flex-1 w-full md:w-auto">
                      <div className="flex flex-wrap items-center gap-3 mb-1">
                        <h3 className="font-bold text-lg text-white">
                          {emp.first_name} {emp.last_name}
                        </h3>
                        <span className="text-xs px-2 py-1 bg-neutral-800 text-slate-300 rounded-md font-medium uppercase tracking-wider">
                          {emp.rank_enum}
                        </span>
                        {log.is_overlap_conflict && (
                          <span className="text-xs px-2 py-1 bg-red-950 text-red-300 rounded-md font-bold uppercase">
                            Overlap
                          </span>
                        )}
                      </div>
                      <p className="text-slate-400 text-sm">
                        {siteLabel(log.site_profiles)} ·{' '}
                        {new Date(log.shift_date).toLocaleDateString()}
                      </p>
                    </div>

                    {/* Time comparison */}
                    <div className="flex flex-1 flex-col sm:flex-row items-stretch justify-center gap-6 border-y md:border-y-0 md:border-x border-neutral-800 py-4 md:py-0 md:px-8 w-full md:w-auto">
                      <div className="text-center flex-1 min-w-[140px]">
                        <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider mb-1">
                          Sector form
                        </p>
                        <p className="text-xl font-mono text-white">
                          {formatTime(log.rostered_start)}
                        </p>
                      </div>
                      <div className="hidden sm:flex items-center text-slate-600 text-2xl font-light">
                        vs
                      </div>
                      <div className="text-center flex-1 min-w-[140px]">
                        <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider mb-1">
                          Biometric check-in
                        </p>
                        <p className="text-xl font-mono text-indigo-400 font-semibold">
                          {formatTime(log.biometric_check_in)}
                        </p>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex flex-wrap gap-3 justify-end w-full md:w-auto">
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedPlanId(isPlanOpen ? null : log.id)
                        }
                        className={`px-4 py-2 rounded-lg text-sm font-bold uppercase tracking-wide transition-colors border ${
                          isPlanOpen
                            ? 'bg-indigo-900/50 border-indigo-500/50 text-indigo-300'
                            : 'bg-neutral-800 border-neutral-700 text-slate-400 hover:text-white hover:border-indigo-500/50'
                        }`}
                      >
                        {isPlanOpen ? 'Close Plan' : 'Recovery Plan'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleResolve(log.id, 'TRUST_FORM')}
                        disabled={processingId === log.id}
                        className="px-4 py-2 bg-neutral-800 hover:bg-emerald-700 text-white rounded-lg text-sm font-bold uppercase tracking-wide transition-colors disabled:opacity-50 border border-neutral-700"
                      >
                        Trust form
                      </button>
                      <button
                        type="button"
                        onClick={() => handleResolve(log.id, 'TRUST_CHECK_IN')}
                        disabled={processingId === log.id}
                        className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-bold uppercase tracking-wide shadow-sm transition-colors disabled:opacity-50"
                      >
                        Trust check-in
                      </button>
                    </div>
                  </div>

                  {/* Recovery Plan Panel (expandable) */}
                  {isPlanOpen && (
                    <div className="px-6 pb-6">
                      <RecoveryPlanPanel
                        log={log}
                        companyId={companyId}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
