'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Banknote, Loader2 } from 'lucide-react';
import FmSubnav from '../components/FmSubnav';
import FmAdvanceGroupRow from '../components/FmAdvanceGroupRow';
import FmPayrollMonthSelector from '../components/FmPayrollMonthSelector';
import { ExecutiveGlassCard } from '../../../components/executive/ExecutiveVaultShell';
import { getAdvanceSalarySettings } from '../../executive/settings/advance-salary-actions';
import {
  DEFAULT_ADVANCE_SALARY_SETTINGS,
  DEFAULT_FM_ADVANCE_AMOUNT_LKR,
  type AdvanceSalarySettings,
} from '../../../../../packages/advance-salary';
import { getFmAdvanceSelections, type FmAdvanceSelectionRecord } from '../advance-salary-actions';
import {
  getAdvanceBatchStatus,
  revertAdvanceGroupToDraft,
  submitAdvanceGroupForReview,
} from '../advance-run-actions';
import {
  isAdvanceWorkflowGroup,
  type AdvanceGroupWorkflow,
  type AdvancePayrollGroupId,
} from '../../../lib/advance-run-types';
import { getFmPortfolio, type FmPortfolioSiteSeed } from '../portfolio-actions';
import { ADVANCE_PAYROLL_SECTIONS } from '../lib/fm-payroll-group-theme';
import { ensurePinnedPayrollSites } from '../lib/pinned-payroll-sites';
import {
  FM_LIVE_PAYROLL_PERIOD,
  formatPayrollPeriodLabel,
  type PayrollPeriod,
} from '../lib/payroll-period';

function lkr(n: number) {
  return `LKR ${n.toLocaleString('en-LK')}`;
}

export default function FmAdvancePage() {
  const [payrollPeriod, setPayrollPeriod] = useState<PayrollPeriod>(FM_LIVE_PAYROLL_PERIOD);
  const [pinnedSites, setPinnedSites] = useState<FmPortfolioSiteSeed[]>([]);
  const [portfolioError, setPortfolioError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<AdvanceSalarySettings>(DEFAULT_ADVANCE_SALARY_SETTINGS);
  const [recordedAdvances, setRecordedAdvances] = useState<FmAdvanceSelectionRecord[]>([]);
  const [advanceWorkflow, setAdvanceWorkflow] = useState<AdvanceGroupWorkflow[]>([]);
  const [submittingGroup, setSubmittingGroup] = useState<AdvancePayrollGroupId | null>(null);
  const [workflowMessage, setWorkflowMessage] = useState<string | null>(null);
  const periodLabel = formatPayrollPeriodLabel(payrollPeriod);

  const refreshAdvanceDesk = useCallback(() => {
    void getFmAdvanceSelections(payrollPeriod).then((rows) => {
      setRecordedAdvances(rows);
    });
    void getAdvanceBatchStatus(payrollPeriod.year, payrollPeriod.month).then((payload) => {
      setAdvanceWorkflow(payload.runs);
    });
  }, [payrollPeriod]);

  useEffect(() => {
    let cancelled = false;
    getAdvanceSalarySettings().then((cfg) => {
      if (!cancelled) setSettings(cfg);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    refreshAdvanceDesk();
  }, [refreshAdvanceDesk]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void getFmPortfolio(payrollPeriod).then((payload) => {
      if (cancelled) return;
      if (payload.error) {
        setPortfolioError(payload.error);
        setPinnedSites([]);
      } else {
        setPortfolioError(null);
        setPinnedSites(ensurePinnedPayrollSites(payload.pinnedSites));
      }
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [payrollPeriod]);

  const workflowByGroup = useMemo(() => {
    const map = new Map<AdvancePayrollGroupId, AdvanceGroupWorkflow>();
    for (const run of advanceWorkflow) {
      map.set(run.groupId, run);
    }
    return map;
  }, [advanceWorkflow]);

  const handleSubmitGroup = (groupId: AdvancePayrollGroupId) => {
    setWorkflowMessage(null);
    setSubmittingGroup(groupId);
    void submitAdvanceGroupForReview(groupId, payrollPeriod.year, payrollPeriod.month).then(
      (result) => {
        setSubmittingGroup(null);
        if (result.success) {
          refreshAdvanceDesk();
        } else {
          setWorkflowMessage(result.error ?? 'Could not submit batch for MD review.');
        }
      },
    );
  };

  const handleReeditGroup = (groupId: AdvancePayrollGroupId) => {
    setWorkflowMessage(null);
    void revertAdvanceGroupToDraft(groupId, payrollPeriod.year, payrollPeriod.month).then(
      (result) => {
        if (result.success) {
          refreshAdvanceDesk();
        } else {
          setWorkflowMessage(result.error ?? 'Could not unlock batch for editing.');
        }
      },
    );
  };

  const advanceSections = useMemo(() => {
    return ADVANCE_PAYROLL_SECTIONS.map((section) => ({
      ...section,
      sites: pinnedSites.filter((site) => section.matches(site.payrollGroup)),
    })).filter((section) => section.sites.length > 0);
  }, [pinnedSites]);

  const renderAdvanceGroupRow = (site: FmPortfolioSiteSeed) => (
    <FmAdvanceGroupRow
      key={site.id}
      id={site.id}
      name={site.name}
      location={site.location}
      payrollGroup={site.payrollGroup}
      displayEmployeeCount={site.displayEmployeeCount}
      employees={site.employees}
      settings={settings}
      payrollPeriod={payrollPeriod}
      recordedAdvances={recordedAdvances}
      groupWorkflow={
        isAdvanceWorkflowGroup(site.payrollGroup)
          ? workflowByGroup.get(site.payrollGroup)
          : undefined
      }
      onSaved={refreshAdvanceDesk}
      onSubmit={
        isAdvanceWorkflowGroup(site.payrollGroup)
          ? () => handleSubmitGroup(site.payrollGroup as AdvancePayrollGroupId)
          : undefined
      }
      onReedit={
        isAdvanceWorkflowGroup(site.payrollGroup)
          ? () => handleReeditGroup(site.payrollGroup as AdvancePayrollGroupId)
          : undefined
      }
      submitting={submittingGroup === site.payrollGroup}
    />
  );

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="relative z-10 mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <FmSubnav />

        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black tracking-tight text-slate-900">Advance Salary</h1>
            <p className="mt-1 text-sm font-semibold text-slate-500">
              Eligibility by payroll group for {periodLabel} — bank cohorts lock to MD; no-bank staff
              are paid in cash
            </p>
          </div>
          <FmPayrollMonthSelector period={payrollPeriod} onChange={setPayrollPeriod} />
        </div>

        <ExecutiveGlassCard className="mb-6 bg-gradient-to-br from-amber-50/60 to-white/60 p-5">
          <div className="flex flex-wrap items-start gap-4">
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl border border-amber-300/80 bg-amber-100/80">
              <Banknote className="h-5 w-5 text-amber-700" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-bold uppercase tracking-widest text-amber-600">
                MD advance rules — {periodLabel}
              </p>
              <div className="mt-2 flex flex-wrap gap-3 text-[11px] font-semibold text-slate-700">
                <span className="rounded-lg border border-emerald-200/80 bg-emerald-50/80 px-3 py-1.5">
                  Guards: min <strong>{settings.guardMinShifts} shifts</strong> · cap{' '}
                  <strong>{lkr(settings.guardMaxAdvanceLkr)}</strong>
                </span>
                <span className="rounded-lg border border-indigo-200/80 bg-indigo-50/80 px-3 py-1.5">
                  Other staff: cap <strong>{lkr(settings.otherEmployeeMaxAdvanceLkr)}</strong>
                </span>
              </div>
              <p className="mt-2 text-[11px] font-medium text-slate-500">
                FM selects eligible staff per group, saves selections, then locks and sends to MD.
                After MD approval she downloads the bank file (TXT or CSV per MD settings). Default
                advance <strong>{lkr(DEFAULT_FM_ADVANCE_AMOUNT_LKR)}</strong>. Configure thresholds
                in{' '}
                <a href="/executive/settings" className="font-bold text-amber-800 underline">
                  MD Settings → Finance &amp; Compensation
                </a>
              </p>
            </div>
          </div>
        </ExecutiveGlassCard>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm font-semibold text-slate-500">
            <Loader2 className="h-5 w-5 animate-spin" />
            Loading payroll groups…
          </div>
        ) : portfolioError ? (
          <ExecutiveGlassCard className="border-rose-200/80 bg-rose-50/60 p-6">
            <p className="text-sm font-bold text-rose-900">Could not load payroll groups</p>
            <p className="mt-2 text-sm text-rose-800">{portfolioError}</p>
          </ExecutiveGlassCard>
        ) : advanceSections.length === 0 ? (
          <ExecutiveGlassCard className="p-6">
            <p className="text-sm font-bold text-slate-800">No payroll groups for {periodLabel}</p>
            <p className="mt-2 text-sm text-slate-600">
              Add active employees in HR Master Nominal Roll and ensure company context is set, then
              refresh.
            </p>
          </ExecutiveGlassCard>
        ) : (
          <div className="sticky top-0 z-20 mb-4 space-y-5 border-b border-slate-200/70 bg-slate-50/95 pb-4 pt-1 backdrop-blur-md">
            {workflowMessage && (
              <div className="rounded-xl border border-rose-200/80 bg-rose-50/80 px-4 py-3 text-sm font-semibold text-rose-800">
                {workflowMessage}
              </div>
            )}
            {advanceSections.map((section) => (
              <section
                key={section.id}
                className={`overflow-hidden rounded-2xl border shadow-sm ${section.border} ${section.bg}`}
              >
                <div className="flex items-start gap-3 border-b border-inherit px-4 py-3 sm:px-5">
                  <div
                    className={`mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-xs font-black ${section.iconBg}`}
                  >
                    {section.id === 'ho'
                      ? 'HO'
                      : section.id === 'sm'
                        ? 'SM'
                        : section.id === 'cafe'
                          ? 'CF'
                          : 'GD'}
                  </div>
                  <div className="min-w-0">
                    <p
                      className={`text-[11px] font-black uppercase tracking-widest ${section.titleColor}`}
                    >
                      {section.title}
                    </p>
                    <p className={`mt-0.5 text-[11px] font-medium ${section.subtitleColor}`}>
                      {section.subtitle}
                    </p>
                  </div>
                </div>
                <div className="space-y-3 p-3 sm:p-4">{section.sites.map(renderAdvanceGroupRow)}</div>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
