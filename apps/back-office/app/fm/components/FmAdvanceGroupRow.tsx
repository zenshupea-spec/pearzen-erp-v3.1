'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Clock,
  Loader2,
  Lock,
  Pin,
  Save,
  Send,
  Unlock,
  Users,
} from 'lucide-react';
import {
  DEFAULT_FM_ADVANCE_AMOUNT_LKR,
  type AdvanceSalarySettings,
} from '../../../../../packages/advance-salary';
import {
  buildAdvanceRowsForSite,
  eligibleAdvanceRows,
  type AdvancePortfolioEmployee,
} from '../lib/fm-advance-eligibility';
import { isGuardPayrollCohort } from '../lib/guard-payroll-cohorts';
import { payrollGroupTheme } from '../lib/fm-payroll-group-theme';
import {
  isAdvanceWorkflowGroup,
  type AdvanceGroupWorkflow,
  type AdvanceWorkflowStatus,
} from '../../../lib/advance-run-types';
import {
  saveFmAdvanceSelections,
  type FmAdvanceSelectionRecord,
} from '../advance-salary-actions';
import type { PayrollPeriod } from '../lib/payroll-period';

type FmAdvanceGroupRowProps = {
  id: string;
  name: string;
  location: string;
  payrollGroup?: string;
  displayEmployeeCount?: number;
  employees: AdvancePortfolioEmployee[];
  settings: AdvanceSalarySettings;
  payrollPeriod: PayrollPeriod;
  recordedAdvances: FmAdvanceSelectionRecord[];
  groupWorkflow?: AdvanceGroupWorkflow;
  onSaved?: () => void;
  onSubmit?: () => void;
  onReedit?: () => void;
  submitting?: boolean;
};

type AdvanceDraft = {
  selected: boolean;
  amount: string;
};

function lkr(n: number) {
  return `LKR ${n.toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function WorkflowStatusBadge({ status }: { status: AdvanceWorkflowStatus }) {
  const map: Record<AdvanceWorkflowStatus, { label: string; cls: string; Icon: typeof Clock }> = {
    DRAFT: {
      label: 'Draft',
      cls: 'border-amber-200 bg-amber-100/80 text-amber-900',
      Icon: Clock,
    },
    SUBMITTED_FOR_REVIEW: {
      label: 'With MD',
      cls: 'border-indigo-200 bg-indigo-100/80 text-indigo-900',
      Icon: Send,
    },
    APPROVED: {
      label: 'MD Approved',
      cls: 'border-emerald-200 bg-emerald-100/80 text-emerald-900',
      Icon: CheckCircle2,
    },
  };
  const { label, cls, Icon } = map[status];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10px] font-black uppercase tracking-widest ${cls}`}
    >
      <Icon className="h-3 w-3" />
      {label}
    </span>
  );
}

function buildDraftState(
  rows: ReturnType<typeof eligibleAdvanceRows>,
  recordedAdvances: FmAdvanceSelectionRecord[],
): Record<string, AdvanceDraft> {
  const recordedByProfile = new Map(
    recordedAdvances.map((row) => [row.profileId, row.amount]),
  );
  const drafts: Record<string, AdvanceDraft> = {};

  rows.forEach((row) => {
    const savedAmount = recordedByProfile.get(row.id);
    drafts[row.id] = {
      selected: savedAmount != null,
      amount:
        savedAmount != null
          ? String(savedAmount)
          : String(DEFAULT_FM_ADVANCE_AMOUNT_LKR),
    };
  });

  return drafts;
}

export default function FmAdvanceGroupRow({
  name,
  location,
  payrollGroup,
  displayEmployeeCount,
  employees,
  settings,
  payrollPeriod,
  recordedAdvances,
  groupWorkflow,
  onSaved,
  onSubmit,
  onReedit,
  submitting = false,
}: FmAdvanceGroupRowProps) {
  const [expanded, setExpanded] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, AdvanceDraft>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [saveOk, setSaveOk] = useState(false);

  const rows = useMemo(
    () => buildAdvanceRowsForSite(employees, payrollGroup, settings),
    [employees, payrollGroup, settings],
  );
  const eligibleRows = useMemo(() => eligibleAdvanceRows(rows), [rows]);
  const isGuardGroup = isGuardPayrollCohort(payrollGroup);
  const employeeCount = displayEmployeeCount ?? employees.length;
  const totalShifts = eligibleRows.reduce((sum, row) => sum + row.shiftsAtSite, 0);
  const selectedCount = eligibleRows.filter((row) => drafts[row.id]?.selected).length;
  const showWorkflow = isAdvanceWorkflowGroup(payrollGroup);
  const workflowStatus = groupWorkflow?.status ?? 'DRAFT';
  const isDraft = workflowStatus === 'DRAFT';
  const isWithMd = workflowStatus === 'SUBMITTED_FOR_REVIEW';
  const isApproved = workflowStatus === 'APPROVED';
  const isPaid = Boolean(groupWorkflow?.paidAt);
  const selectionsLocked = showWorkflow && !isDraft;
  const canSubmit = showWorkflow && isDraft && selectedCount > 0;
  const canReedit = showWorkflow && (isWithMd || isApproved) && !isPaid;
  const theme = payrollGroupTheme(payrollGroup);

  const groupRecordedAdvances = useMemo(
    () =>
      recordedAdvances.filter((record) =>
        eligibleRows.some((row) => row.id === record.profileId),
      ),
    [eligibleRows, recordedAdvances],
  );

  useEffect(() => {
    setDrafts(buildDraftState(eligibleRows, groupRecordedAdvances));
  }, [eligibleRows, groupRecordedAdvances]);

  const toggleSelected = (rowId: string) => {
    setDrafts((prev) => {
      const current = prev[rowId] ?? {
        selected: false,
        amount: String(DEFAULT_FM_ADVANCE_AMOUNT_LKR),
      };
      const nextSelected = !current.selected;
      return {
        ...prev,
        [rowId]: {
          selected: nextSelected,
          amount: nextSelected
            ? current.amount || String(DEFAULT_FM_ADVANCE_AMOUNT_LKR)
            : current.amount,
        },
      };
    });
    setSaveOk(false);
  };

  const updateAmount = (rowId: string, raw: string) => {
    if (raw !== '' && !/^\d+$/.test(raw)) return;
    setDrafts((prev) => ({
      ...prev,
      [rowId]: {
        selected: prev[rowId]?.selected ?? false,
        amount: raw,
      },
    }));
    setSaveOk(false);
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveError('');
    setSaveOk(false);

    const selections = eligibleRows
      .filter((row) => drafts[row.id]?.selected)
      .map((row) => {
        const draft = drafts[row.id];
        const parsed = Math.max(
          1,
          Math.min(
            row.maxAdvanceLkr,
            Number.parseInt(draft?.amount ?? '', 10) || DEFAULT_FM_ADVANCE_AMOUNT_LKR,
          ),
        );
        return {
          profileId: row.id,
          empNumber: row.empNumber,
          amount: parsed,
        };
      });

    const result = await saveFmAdvanceSelections({
      period: payrollPeriod,
      payrollGroup,
      selections,
      eligibleProfileIds: eligibleRows.map((row) => row.id),
    });

    setSaving(false);
    if (!result.success) {
      setSaveError(result.error);
      return;
    }

    setSaveOk(true);
    onSaved?.();
    setTimeout(() => setSaveOk(false), 2500);
  };

  return (
    <div
      className={`overflow-hidden rounded-2xl border border-l-4 bg-white shadow-sm ring-1 ${theme.stripe} ${theme.card}`}
    >
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        className={`flex w-full items-center gap-4 px-6 py-4 text-left transition-colors ${theme.headerBg} ${theme.headerHover}`}
      >
        <div
          className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg border transition-all ${
            expanded ? theme.chevronExpanded : theme.chevronCollapsed
          }`}
        >
          <ChevronDown
            className={`h-4 w-4 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
          />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-black tracking-tight text-slate-900">{name}</p>
            <span
              className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-black uppercase tracking-widest ${theme.badge}`}
            >
              <Pin className="h-2.5 w-2.5" />
              {theme.label}
            </span>
          </div>
          <p className="mt-0.5 text-[11px] text-slate-400">{location}</p>
        </div>

        <div className="hidden items-center gap-8 md:flex">
          {isGuardGroup && (
            <div className="text-right">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                Shifts Billed
              </p>
              <p className="mt-0.5 font-mono text-xs font-bold text-slate-800">{totalShifts}</p>
            </div>
          )}
          <div className="text-right">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
              Eligible
            </p>
            <p className="mt-0.5 font-mono text-xs font-bold text-emerald-700">
              {eligibleRows.length} / {employeeCount}
            </p>
          </div>
          <div className="text-right">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
              Selected
            </p>
            <p className="mt-0.5 font-mono text-xs font-bold text-amber-800">{selectedCount}</p>
          </div>
        </div>

        <div className="ml-2 flex-shrink-0">
          <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-600">
            <Users className="h-3 w-3" />
            {employeeCount}
          </span>
        </div>
      </button>

      {showWorkflow && (
        <div
          className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 bg-slate-50/80 px-6 py-3"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex flex-wrap items-center gap-2">
            <WorkflowStatusBadge status={workflowStatus} />
            {isPaid && (
              <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-100 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-widest text-slate-600">
                Bank file downloaded
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onSubmit}
              disabled={!canSubmit || submitting}
              title={
                canSubmit
                  ? 'Lock selections and send to MD for approval'
                  : isWithMd
                    ? 'Awaiting MD approval on the executive advance desk'
                    : isApproved
                      ? 'MD has approved this batch'
                      : 'Save at least one selection before submitting'
              }
              className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-[10px] font-black uppercase tracking-wider shadow-sm transition-all ${
                canSubmit && !submitting
                  ? 'border border-indigo-200/80 bg-indigo-600 text-white hover:bg-indigo-500'
                  : 'cursor-not-allowed border border-slate-200/80 bg-slate-100/80 text-slate-400'
              }`}
            >
              {submitting ? (
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              ) : (
                <Lock className="h-3.5 w-3.5" />
              )}
              Lock &amp; Send to MD
            </button>
            {canReedit && (
              <button
                type="button"
                onClick={onReedit}
                title="Unlock for editing — removes batch from MD portal"
                className="inline-flex items-center gap-1.5 rounded-xl border border-amber-200/80 bg-amber-50/90 px-3 py-2 text-[10px] font-black uppercase tracking-wider text-amber-900 shadow-sm transition-all hover:bg-amber-100/90"
              >
                <Unlock className="h-3.5 w-3.5" />
                Re-edit
              </button>
            )}
          </div>
        </div>
      )}

      {showWorkflow && isWithMd && (
        <div className="border-t border-indigo-200/50 bg-indigo-50/40 px-6 py-2 text-[10px] font-semibold text-indigo-800">
          Locked and queued on the MD advance salary desk — awaiting approval.
        </div>
      )}
      {showWorkflow && isApproved && !isPaid && (
        <div className="border-t border-emerald-200/50 bg-emerald-50/40 px-6 py-2 text-[10px] font-semibold text-emerald-800">
          MD approved — bank transfer file is ready for MD download.
        </div>
      )}

      {expanded && (
        <div className="border-t border-slate-100 bg-slate-50/50 px-6 py-4">
          {isGuardGroup ? (
            <p className="mb-3 text-[11px] font-semibold text-slate-600">
              Only guards with at least{' '}
              <span className="font-black text-slate-800">{settings.guardMinShifts} shifts</span>{' '}
              appear here. Select who receives an advance — default{' '}
              <span className="font-black text-amber-800">{lkr(DEFAULT_FM_ADVANCE_AMOUNT_LKR)}</span>
              , deducted on month-end payroll and shown on the payslip.
            </p>
          ) : (
            <p className="mb-3 text-[11px] font-semibold text-slate-600">
              Select staff who receive an advance this month — default{' '}
              <span className="font-black text-amber-800">{lkr(DEFAULT_FM_ADVANCE_AMOUNT_LKR)}</span>
              , cap{' '}
              <span className="font-black text-amber-800">
                {lkr(settings.otherEmployeeMaxAdvanceLkr)}
              </span>
              . Advances are paid early; they are recovered on month-end payroll and are not
              subject to the voluntary deduction cap.
            </p>
          )}

          {eligibleRows.length === 0 ? (
            <p className="py-6 text-center text-sm font-semibold text-slate-500">
              {isGuardGroup
                ? `No guards meet the ${settings.guardMinShifts}-shift minimum for this payroll month.`
                : 'No employees in this payroll group.'}
            </p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50">
                    {[
                      'Select',
                      'Employee',
                      'Rank',
                      ...(isGuardGroup ? ['Shifts'] : []),
                      'Gross',
                      'Advance (LKR)',
                      'Max Cap',
                    ].map((col) => (
                      <th
                        key={col}
                        className={`px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-slate-500 ${
                          col === 'Employee' || col === 'Rank' || col === 'Select'
                            ? 'text-left'
                            : 'text-right'
                        }`}
                      >
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {eligibleRows.map((row) => {
                    const draft = drafts[row.id] ?? {
                      selected: false,
                      amount: String(DEFAULT_FM_ADVANCE_AMOUNT_LKR),
                    };
                    return (
                      <tr key={row.id} className="hover:bg-slate-50/80">
                        <td className="px-4 py-3">
                          <input
                            type="checkbox"
                            checked={draft.selected}
                            disabled={selectionsLocked}
                            onChange={() => toggleSelected(row.id)}
                            className="h-4 w-4 rounded border-slate-300 text-amber-600 focus:ring-amber-500/40 disabled:cursor-not-allowed disabled:opacity-50"
                            aria-label={`Select ${row.name} for advance`}
                          />
                        </td>
                        <td className="px-4 py-3">
                          <p className="text-[12px] font-bold text-slate-900">{row.name}</p>
                          <p className="font-mono text-[10px] text-slate-400">{row.empNumber}</p>
                        </td>
                        <td className="px-4 py-3 text-[12px] font-semibold text-slate-700">
                          {row.rank}
                        </td>
                        {isGuardGroup && (
                          <td className="px-4 py-3 text-right font-mono text-xs font-bold text-slate-800">
                            {row.shiftsAtSite}
                          </td>
                        )}
                        <td className="px-4 py-3 text-right font-mono text-xs font-semibold text-slate-800">
                          {lkr(row.totalGross)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <input
                            type="number"
                            min={1}
                            max={row.maxAdvanceLkr}
                            step={500}
                            disabled={!draft.selected || selectionsLocked}
                            value={draft.amount}
                            onChange={(e) => updateAmount(row.id, e.target.value)}
                            className="w-28 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-right font-mono text-xs font-bold text-amber-900 shadow-sm disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                          />
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-xs font-bold text-amber-800">
                          {lkr(row.maxAdvanceLkr)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {saveError && (
            <p className="mt-3 flex items-center gap-1.5 text-xs font-bold text-rose-700">
              <AlertTriangle className="h-3.5 w-3.5" />
              {saveError}
            </p>
          )}

          {eligibleRows.length > 0 && (
            <div className="mt-4 flex items-center justify-between gap-3">
              <p className="text-[11px] font-medium text-slate-500">
                {selectedCount} selected ·{' '}
                {selectionsLocked
                  ? 'Selections locked until MD approves or you re-edit the batch'
                  : 'Save selections, then lock and send to MD for approval'}
              </p>
              <button
                type="button"
                onClick={() => void handleSave()}
                disabled={saving || selectionsLocked}
                className="inline-flex items-center gap-2 rounded-xl border border-amber-200/80 bg-amber-600 px-4 py-2 text-xs font-black uppercase tracking-widest text-white shadow-sm transition hover:bg-amber-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : saveOk ? (
                  <CheckCircle2 className="h-3.5 w-3.5" />
                ) : (
                  <Save className="h-3.5 w-3.5" />
                )}
                {saving ? 'Saving…' : saveOk ? 'Saved' : 'Save Group Advances'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
