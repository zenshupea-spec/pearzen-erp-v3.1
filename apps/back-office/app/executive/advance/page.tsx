'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Banknote,
  Building2,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Download,
  FileText,
  Lock,
  X,
} from 'lucide-react';
import { BANK_EXPORT_FORMAT_LABELS } from '../../../../../packages/bank-export-settings';
import { ExecutiveGlassCard } from '../../../components/executive/ExecutiveVaultShell';
import {
  advanceBankFilename,
  generateAdvanceBankCsv,
  generateAdvanceBankTxt,
  triggerAdvanceBankDownload,
} from '../../../lib/advance-bank-export';
import { ADVANCE_GROUP_LABELS } from '../../../lib/advance-run-types';
import { getBankExportSettings } from '../settings/bank-export-actions';
import {
  approveAdvanceGroupRun,
  getMdAdvanceBatches,
  markAdvanceGroupPaid,
  type MdAdvanceBatch,
} from '../../fm/advance-run-actions';
import FmPayrollMonthSelector from '../../fm/components/FmPayrollMonthSelector';
import {
  FM_LIVE_PAYROLL_PERIOD,
  formatPayrollPeriodLabel,
  type PayrollPeriod,
} from '../../fm/lib/payroll-period';

function lkr(n: number) {
  return `LKR ${n.toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function ConfirmModal({
  batch,
  onConfirm,
  onCancel,
}: {
  batch: MdAdvanceBatch | null;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!batch) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm"
      onClick={onCancel}
    >
      <div
        className="relative w-full max-w-md overflow-hidden rounded-3xl border border-white/75 bg-[#eef2f6] p-6 shadow-[0_32px_80px_-16px_rgba(15,23,42,0.4)]"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onCancel}
          className="absolute right-4 top-4 rounded-lg p-1 text-slate-500 hover:bg-slate-200/80"
        >
          <X className="h-4 w-4" />
        </button>
        <h3 className="text-lg font-black text-slate-900">Approve advance batch?</h3>
        <p className="mt-2 text-sm font-semibold text-slate-600">
          {batch.groupLabel} · {batch.lines.length} recipient
          {batch.lines.length === 1 ? '' : 's'} · {lkr(batch.totalAmount)}
        </p>
        <p className="mt-3 text-sm text-slate-500">
          After approval you can download the bank transfer file. Approved advances deduct on
          month-end payroll.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-black uppercase tracking-wider text-white"
          >
            Approve Batch
          </button>
        </div>
      </div>
    </div>
  );
}

function AdvanceBatchCard({
  batch,
  periodLabel,
  onApprove,
  onDownload,
}: {
  batch: MdAdvanceBatch;
  periodLabel: string;
  onApprove: (batch: MdAdvanceBatch) => void;
  onDownload: (batch: MdAdvanceBatch) => void;
}) {
  const [collapsed, setCollapsed] = useState(batch.status === 'APPROVED' || batch.status === 'PAID');
  const [lockedFormatLabel, setLockedFormatLabel] = useState(BANK_EXPORT_FORMAT_LABELS.commercial_csv);
  const [bankFormatLocked, setBankFormatLocked] = useState(true);
  const [masterFormatId, setMasterFormatId] = useState<'commercial_csv' | 'commercial_txt'>(
    'commercial_csv',
  );
  const isPending = batch.status === 'SUBMITTED';
  const isApproved = batch.status === 'APPROVED';
  const isPaid = batch.status === 'PAID';
  const otherBank = batch.groupId === 'guard_other_bank';

  useEffect(() => {
    getBankExportSettings().then((cfg) => {
      setBankFormatLocked(cfg.enforceFormatGlobally);
      setLockedFormatLabel(BANK_EXPORT_FORMAT_LABELS[cfg.masterFormatId]);
      setMasterFormatId(cfg.masterFormatId);
    });
  }, []);

  const exportLabel = otherBank
    ? 'Other Banks — TXT'
    : bankFormatLocked
      ? lockedFormatLabel
      : BANK_EXPORT_FORMAT_LABELS[masterFormatId];

  return (
    <ExecutiveGlassCard className="overflow-hidden">
      <div
        className={`flex flex-wrap items-center gap-4 border-b px-5 py-4 ${
          isPending ? 'border-amber-200/60 bg-amber-50/20' : 'border-emerald-200/60 bg-emerald-50/20'
        }`}
      >
        <div
          className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl border ${
            isPending ? 'border-amber-200/80 bg-amber-50/80' : 'border-emerald-200/80 bg-emerald-50/80'
          }`}
        >
          {isPending ? (
            <Clock className="h-5 w-5 text-amber-700" />
          ) : (
            <CheckCircle2 className="h-5 w-5 text-emerald-700" />
          )}
        </div>

        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-black text-slate-900">{batch.batchId}</p>
            <span
              className={`rounded-full border px-2.5 py-0.5 text-xs font-black uppercase tracking-widest ${
                isPending
                  ? 'border-amber-200 bg-amber-100/90 text-amber-900'
                  : 'border-emerald-200 bg-emerald-100/90 text-emerald-900'
              }`}
            >
              {isPending ? 'Awaiting MD Approval' : isPaid ? 'Bank File Downloaded' : 'Approved'}
            </span>
          </div>
          <p className="mt-0.5 text-sm font-semibold text-slate-600">
            {batch.groupLabel} · {periodLabel} · {batch.lines.length} recipient
            {batch.lines.length === 1 ? '' : 's'}
          </p>
        </div>

        <div className="text-right">
          <p className="text-xs font-bold uppercase tracking-widest text-slate-600">Total Advance</p>
          <p className="font-black tabular-nums text-emerald-900">{lkr(batch.totalAmount)}</p>
        </div>

        <button
          type="button"
          onClick={() => setCollapsed((value) => !value)}
          className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200/80 bg-white/70 text-slate-600"
        >
          {collapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
        </button>
      </div>

      {!collapsed && (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200/80 bg-slate-50/60 text-sm font-bold uppercase tracking-widest text-slate-600">
                <tr>
                  <th className="px-5 py-3">Emp No</th>
                  <th className="px-5 py-3">Name</th>
                  <th className="px-5 py-3 text-center">Rank</th>
                  <th className="px-5 py-3 text-right">Advance (LKR)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/60">
                {batch.lines.map((line) => (
                  <tr key={line.profileId} className="hover:bg-white/40">
                    <td className="px-5 py-3 font-mono text-sm font-bold text-slate-700">
                      {line.empNumber}
                    </td>
                    <td className="px-5 py-3 font-semibold text-slate-900">{line.name}</td>
                    <td className="px-5 py-3 text-center text-sm font-black text-slate-800">
                      {line.rank}
                    </td>
                    <td className="px-5 py-3 text-right font-mono font-black text-amber-900">
                      {lkr(line.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div
            className={`border-t-2 px-6 py-6 ${
              isPending
                ? 'border-slate-900/10 bg-gradient-to-b from-slate-50/60 to-white/30'
                : 'border-emerald-200/60 bg-emerald-50/20'
            }`}
          >
            {isPending ? (
              <div className="mx-auto max-w-xl space-y-4">
                <div className="flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-slate-600" />
                  <p className="text-sm font-black uppercase tracking-widest text-slate-700">
                    Enterprise Bank Lock
                  </p>
                </div>
                <div className="flex items-center gap-3 rounded-2xl border border-indigo-200/80 bg-indigo-50/60 px-4 py-3">
                  <Lock className="h-4 w-4 text-indigo-700" />
                  <div>
                    <p className="text-sm font-black uppercase tracking-widest text-indigo-700">
                      Format Locked by MD
                    </p>
                    <p className="mt-0.5 text-sm font-black text-indigo-900">{exportLabel}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onApprove(batch)}
                  className="flex w-full items-center justify-center gap-3 rounded-2xl bg-slate-900 px-8 py-5 text-sm font-black uppercase tracking-widest text-white shadow-xl"
                >
                  <Lock className="h-5 w-5" />
                  Approve Advance Batch
                  <FileText className="h-5 w-5 opacity-70" />
                </button>
              </div>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-emerald-200/80 bg-emerald-100/80">
                    <Lock className="h-5 w-5 text-emerald-700" />
                  </div>
                  <div>
                    <p className="text-sm font-black text-emerald-900">
                      {isPaid ? 'Bank file downloaded' : 'Approved — ready for bank export'}
                    </p>
                    <p className="mt-0.5 text-sm font-semibold text-slate-600">
                      Format: {exportLabel}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onDownload(batch)}
                  disabled={isPaid}
                  className="flex items-center gap-2 rounded-2xl border border-emerald-200/80 bg-emerald-50/80 px-5 py-3 text-sm font-black uppercase tracking-widest text-emerald-800 shadow-sm transition-all hover:bg-emerald-100/80 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Download className="h-4 w-4" />
                  Download Bank {otherBank || masterFormatId === 'commercial_txt' ? '.TXT' : '.CSV'}
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </ExecutiveGlassCard>
  );
}

export default function ExecutiveAdvancePage() {
  const [payrollPeriod, setPayrollPeriod] = useState<PayrollPeriod>(FM_LIVE_PAYROLL_PERIOD);
  const [batches, setBatches] = useState<MdAdvanceBatch[]>([]);
  const [confirmBatch, setConfirmBatch] = useState<MdAdvanceBatch | null>(null);
  const [approveError, setApproveError] = useState<string | null>(null);
  const [bankFormatId, setBankFormatId] = useState<'commercial_csv' | 'commercial_txt'>(
    'commercial_csv',
  );
  const periodLabel = formatPayrollPeriodLabel(payrollPeriod);

  const refreshBatches = useCallback(() => {
    void getMdAdvanceBatches(payrollPeriod.year, payrollPeriod.month).then((payload) => {
      setBatches(payload.batches);
    });
    getBankExportSettings().then((cfg) => setBankFormatId(cfg.masterFormatId));
  }, [payrollPeriod]);

  useEffect(() => {
    refreshBatches();
  }, [refreshBatches]);

  const pendingBatches = useMemo(
    () => batches.filter((batch) => batch.status === 'SUBMITTED'),
    [batches],
  );
  const approvedBatches = useMemo(
    () => batches.filter((batch) => batch.status === 'APPROVED' || batch.status === 'PAID'),
    [batches],
  );
  const totalPending = pendingBatches.reduce((sum, batch) => sum + batch.totalAmount, 0);

  const handleConfirmApprove = () => {
    if (!confirmBatch) return;
    setApproveError(null);
    void approveAdvanceGroupRun(
      confirmBatch.groupId,
      payrollPeriod.year,
      payrollPeriod.month,
    ).then((result) => {
      if (result.success) {
        refreshBatches();
      } else {
        setApproveError(result.error ?? 'Approval failed.');
      }
      setConfirmBatch(null);
    });
  };

  const handleDownload = (batch: MdAdvanceBatch) => {
    const periodSlug = `${batch.periodYear}${String(batch.periodMonth).padStart(2, '0')}`;
    const otherBank = batch.groupId === 'guard_other_bank';
    const formatId = otherBank ? 'commercial_txt' : bankFormatId;
    const bankLines = batch.lines.map((line) => ({
      empNumber: line.empNumber,
      name: line.name,
      amount: line.amount,
    }));
    const content = otherBank || formatId === 'commercial_txt'
      ? generateAdvanceBankTxt(batch.groupLabel, bankLines, otherBank)
      : generateAdvanceBankCsv(batch.groupLabel, bankLines);
    const filename = advanceBankFilename(
      ADVANCE_GROUP_LABELS[batch.groupId],
      periodSlug,
      formatId,
      otherBank,
    );
    triggerAdvanceBankDownload(filename, content, formatId);
    void markAdvanceGroupPaid(batch.groupId, batch.periodYear, batch.periodMonth).then(() => {
      refreshBatches();
    });
  };

  return (
    <>
      <ConfirmModal
        batch={confirmBatch}
        onConfirm={handleConfirmApprove}
        onCancel={() => setConfirmBatch(null)}
      />

      <div className="min-h-0 pb-24 font-sans">
        <header className="sticky top-0 z-40 border-b border-white/60 bg-white/45 px-6 py-4 shadow-[0_8px_32px_-12px_rgba(15,23,42,0.08)] backdrop-blur-xl backdrop-saturate-150">
          <div className="flex w-full flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-xl font-black uppercase tracking-tight text-slate-900 sm:text-2xl">
                Advance Salary Audit &amp; Bank Lock
              </h1>
              <p className="text-sm font-bold uppercase tracking-widest text-amber-700">
                Maker / Checker · MD Approval · Bank File per MD Settings
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <FmPayrollMonthSelector period={payrollPeriod} onChange={setPayrollPeriod} />
              <div className="flex items-center gap-2 rounded-2xl border border-amber-200/80 bg-amber-50/80 px-4 py-2">
                <Clock className="h-4 w-4 text-amber-700" />
                <span className="text-sm font-black text-amber-800">
                  {pendingBatches.length} batch{pendingBatches.length !== 1 ? 'es' : ''} pending
                </span>
              </div>
            </div>
          </div>
        </header>

        <div className="w-full space-y-6 px-6 py-8 lg:px-12 2xl:px-24">
          {approveError && (
            <div className="rounded-2xl border border-rose-200/80 bg-rose-50/80 px-4 py-3 text-sm font-semibold text-rose-800">
              {approveError}
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <ExecutiveGlassCard className="bg-gradient-to-br from-amber-50/60 to-white/60 p-5">
              <div className="flex items-start justify-between">
                <p className="text-sm font-semibold uppercase tracking-widest text-slate-600">
                  Pending MD Approval
                </p>
                <Banknote className="h-4 w-4 text-amber-600" />
              </div>
              <p className="mt-3 text-2xl font-black tabular-nums text-amber-900">
                {pendingBatches.length > 0 ? lkr(totalPending) : 'All Clear'}
              </p>
              <p className="mt-1 text-sm font-semibold text-slate-600">
                {periodLabel} · FM-submitted advance batches
              </p>
            </ExecutiveGlassCard>

            <ExecutiveGlassCard className="bg-gradient-to-br from-emerald-50/60 to-white/60 p-5">
              <div className="flex items-start justify-between">
                <p className="text-sm font-semibold uppercase tracking-widest text-slate-600">
                  Approved Batches
                </p>
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              </div>
              <p className="mt-3 text-2xl font-black tabular-nums text-emerald-900">
                {approvedBatches.length}
              </p>
              <p className="mt-1 text-sm font-semibold text-slate-600">
                Download bank TXT or CSV after approval
              </p>
            </ExecutiveGlassCard>
          </div>

          {pendingBatches.length > 0 && (
            <div className="space-y-4">
              <p className="flex items-center gap-2 text-sm font-black uppercase tracking-widest text-amber-800">
                <Clock className="h-3.5 w-3.5" />
                Awaiting Approval
              </p>
              {pendingBatches.map((batch) => (
                <AdvanceBatchCard
                  key={batch.batchId}
                  batch={batch}
                  periodLabel={periodLabel}
                  onApprove={setConfirmBatch}
                  onDownload={handleDownload}
                />
              ))}
            </div>
          )}

          <div className="space-y-4">
            <p className="flex items-center gap-2 text-sm font-black uppercase tracking-widest text-emerald-800">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Approved &amp; Locked
            </p>
            {approvedBatches.length === 0 ? (
              <div className="rounded-2xl border border-slate-200/60 bg-white/30 px-5 py-6 text-center text-sm font-semibold text-slate-600">
                No approved advance batches for {periodLabel}.
              </div>
            ) : (
              approvedBatches.map((batch) => (
                <AdvanceBatchCard
                  key={batch.batchId}
                  batch={batch}
                  periodLabel={periodLabel}
                  onApprove={setConfirmBatch}
                  onDownload={handleDownload}
                />
              ))
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-white/70 bg-white/40 px-5 py-3 text-sm font-semibold text-slate-700 backdrop-blur-md">
            <Lock className="h-4 w-4 text-slate-600 flex-shrink-0" />
            <span className="font-bold text-slate-800">Approval State Machine:</span>
            <span className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-slate-200 bg-slate-50/80 px-2.5 py-0.5 font-mono text-xs font-bold text-slate-700">
                DRAFT
              </span>
              <span>→ FM locks group →</span>
              <span className="rounded-full border border-amber-200 bg-amber-50/80 px-2.5 py-0.5 font-mono text-xs font-bold text-amber-800">
                SUBMITTED
              </span>
              <span>→ MD approves →</span>
              <span className="rounded-full border border-emerald-200 bg-emerald-50/80 px-2.5 py-0.5 font-mono text-xs font-bold text-emerald-800">
                APPROVED
              </span>
              <span>→ MD downloads bank file (TXT/CSV per settings).</span>
            </span>
          </div>
        </div>
      </div>
    </>
  );
}
