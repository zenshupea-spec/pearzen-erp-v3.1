'use client';

import { useCallback, useEffect, useMemo, useState, useTransition } from 'react';
import FmSubnav from '../components/FmSubnav';
import FmBatchDeductionModal from '../components/FmBatchDeductionModal';
import FmWelfareFundModal from '../components/FmWelfareFundModal';
import { getWelfareFundSettings } from '../../executive/settings/welfare-fund-actions';
import {
  DEFAULT_WELFARE_FUND_SETTINGS,
  welfareFundTotalForPeriod,
} from '../../../../../packages/welfare-fund';
import FmPayrollMonthSelector from '../components/FmPayrollMonthSelector';
import {
  deductionLedgerTotal,
  getDeductionLedger,
  type BatchDeductionKind,
} from '../lib/batch-deductions-ledger';
import { generateMonthEndPayroll } from '../actions';
import { getDeductionMonthLockStatus } from '../../hq/deductions/actions';
import {
  getClientDeductionMonthLockedAt,
  payrollMonthFromFmPeriod,
  subscribeDeductionMonthLock,
} from '../../../lib/deduction-month-lock-storage';
import {
  AlertOctagon,
  ChevronRight,
  Download,
  CheckCircle2,
  Clock,
  Receipt,
  BarChart3,
  Lock,
  Unlock,
  Send,
  Sparkles,
  Banknote,
} from 'lucide-react';
import { ExecutiveGlassCard } from '../../../components/executive/ExecutiveVaultShell';
import { FM_PREV_MONTH_STOP_LIST } from '../lib/retention-lists';
import {
  type PayrollGroupId,
  type PayrollGroupWorkflow,
  type PayrollWorkflowStatus,
  generateBankTransferTxt,
  generateCashPayoutTxt,
  getPayrollWorkflowState,
  revertGroupToDraft,
  submitGroupForMdReview,
  subscribePayrollWorkflow,
  triggerBankTxtDownload,
} from '../../../lib/payroll-batch-workflow';
import {
  FM_LIVE_PAYROLL_PERIOD,
  formatPayrollPeriodLabel,
  historicalPortfolioScale,
} from '../lib/payroll-period';

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

// ─── Mock Data ────────────────────────────────────────────────────────────────

type SubBatchRunStatus = 'pending' | 'processing' | 'ready' | 'complete';
type SubBatchPayoutMethod = 'commercial_bank' | 'cash';

const BATCH_PERIOD = { month: 5, year: 2026, label: 'May 2026' } as const;
const BATCH_PAYROLL_MONTH = payrollMonthFromFmPeriod(BATCH_PERIOD);

interface PayrollSubBatch {
  label: string;
  description: string;
  progress: number;
  status: SubBatchRunStatus;
  gross: number;
  headcount: number;
  payoutMethod: SubBatchPayoutMethod;
}

interface PayrollGroupDefinition {
  id: PayrollGroupId;
  label: string;
  company: string;
  subBatches: PayrollSubBatch[];
  accent: 'indigo' | 'violet';
}

const PAYROLL_GROUPS_PENDING: PayrollGroupDefinition[] = [
  {
    id: 'security',
    label: 'Security Firm Personnel',
    company: 'Classic Venture Security',
    accent: 'indigo',
    subBatches: [
      {
        label: 'Guards & Sector Managers',
        description: 'Commercial Bank · field operations · 301 personnel',
        progress: 0,
        status: 'pending',
        gross: 14_620_000,
        headcount: 301,
        payoutMethod: 'commercial_bank',
      },
      {
        label: 'HQ Staff',
        description: 'Commercial Bank · administration · 24 personnel',
        progress: 0,
        status: 'pending',
        gross: 2_180_000,
        headcount: 24,
        payoutMethod: 'commercial_bank',
      },
      {
        label: 'Cash Payout — Other Bank / No Account',
        description: 'No bank account or non-Commercial Bank · 11 personnel',
        progress: 0,
        status: 'pending',
        gross: 200_000,
        headcount: 11,
        payoutMethod: 'cash',
      },
    ],
  },
  {
    id: 'cafe',
    label: 'Café Employees',
    company: 'Café Tasha',
    accent: 'violet',
    subBatches: [
      {
        label: 'Café Operations',
        description: 'Commercial Bank · baristas · counter · kitchen · 18 personnel',
        progress: 0,
        status: 'pending',
        gross: 1_450_000,
        headcount: 18,
        payoutMethod: 'commercial_bank',
      },
    ],
  },
];

const PAYROLL_GROUPS_GENERATED: PayrollGroupDefinition[] = [
  {
    id: 'security',
    label: 'Security Firm Personnel',
    company: 'Classic Venture Security',
    accent: 'indigo',
    subBatches: [
      {
        label: 'Guards & Sector Managers',
        description: 'Commercial Bank · field operations · 301 personnel',
        progress: 78,
        status: 'processing',
        gross: 14_620_000,
        headcount: 301,
        payoutMethod: 'commercial_bank',
      },
      {
        label: 'HQ Staff',
        description: 'Commercial Bank · administration · 24 personnel',
        progress: 95,
        status: 'ready',
        gross: 2_180_000,
        headcount: 24,
        payoutMethod: 'commercial_bank',
      },
      {
        label: 'Cash Payout — Other Bank / No Account',
        description: 'No bank account or non-Commercial Bank · 11 personnel',
        progress: 100,
        status: 'complete',
        gross: 200_000,
        headcount: 11,
        payoutMethod: 'cash',
      },
    ],
  },
  {
    id: 'cafe',
    label: 'Café Employees',
    company: 'Café Tasha',
    accent: 'violet',
    subBatches: [
      {
        label: 'Café Operations',
        description: 'Commercial Bank · baristas · counter · kitchen · 18 personnel',
        progress: 100,
        status: 'complete',
        gross: 1_450_000,
        headcount: 18,
        payoutMethod: 'commercial_bank',
      },
    ],
  },
];

type DeductionDrillDown = BatchDeductionKind;

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
  drillDown: DeductionDrillDown;
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

// ─── Sub-components ───────────────────────────────────────────────────────────

type DeductionColor = 'indigo' | 'violet' | 'amber' | 'rose' | 'teal';

const colorMap: Record<DeductionColor, { border: string; bg: string; icon: string; text: string; bar: string }> = {
  indigo: { border: 'border-indigo-200/70', bg: 'bg-indigo-50/60', icon: 'text-indigo-600', text: 'text-indigo-900', bar: 'bg-indigo-500' },
  violet: { border: 'border-violet-200/70', bg: 'bg-violet-50/60', icon: 'text-violet-600', text: 'text-violet-900', bar: 'bg-violet-500' },
  amber:  { border: 'border-amber-200/70',  bg: 'bg-amber-50/60',  icon: 'text-amber-600',  text: 'text-amber-900',  bar: 'bg-amber-500'  },
  rose:   { border: 'border-rose-200/70',   bg: 'bg-rose-50/60',   icon: 'text-rose-600',   text: 'text-rose-900',   bar: 'bg-rose-500'   },
  teal:   { border: 'border-teal-200/70',   bg: 'bg-teal-50/60',   icon: 'text-teal-600',   text: 'text-teal-900',   bar: 'bg-teal-500'   },
};

function BatchProgressBar({ progress, status }: { progress: number; status: SubBatchRunStatus }) {
  const colors: Record<SubBatchRunStatus, string> = {
    pending: 'bg-slate-300',
    processing: 'bg-indigo-500',
    ready: 'bg-amber-500',
    complete: 'bg-emerald-500',
  };
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100/80">
      <div
        className={`h-full rounded-full transition-all duration-700 ${colors[status]}`}
        style={{ width: `${progress}%` }}
      />
    </div>
  );
}

function BatchStatusBadge({ status }: { status: SubBatchRunStatus }) {
  const map = {
    pending:    { label: 'Not Generated', cls: 'border-slate-200 bg-slate-50/80 text-slate-600', Icon: Clock },
    processing: { label: 'Processing', cls: 'border-indigo-200 bg-indigo-50/80 text-indigo-800', Icon: Clock },
    ready:      { label: 'Ready for Approval', cls: 'border-amber-200 bg-amber-50/80 text-amber-800', Icon: ChevronRight },
    complete:   { label: 'Complete', cls: 'border-emerald-200 bg-emerald-50/80 text-emerald-800', Icon: CheckCircle2 },
  };
  const { label, cls, Icon } = map[status];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10px] font-black uppercase tracking-widest ${cls}`}>
      <Icon className="h-3 w-3" />
      {label}
    </span>
  );
}

function WorkflowStatusBadge({ status }: { status: PayrollWorkflowStatus }) {
  const map: Record<PayrollWorkflowStatus, { label: string; cls: string; Icon: typeof Clock }> = {
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
    <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10px] font-black uppercase tracking-widest ${cls}`}>
      <Icon className="h-3 w-3" />
      {label}
    </span>
  );
}

function groupTotals(group: PayrollGroupDefinition) {
  const gross = group.subBatches.reduce((s, b) => s + b.gross, 0);
  const headcount = group.subBatches.reduce((s, b) => s + b.headcount, 0);
  const progressWeighted = group.subBatches.reduce((s, b) => s + b.progress * b.headcount, 0);
  return {
    gross,
    headcount,
    progress: headcount > 0 ? Math.round(progressWeighted / headcount) : 0,
  };
}

function payoutChannelTotals(group: PayrollGroupDefinition, method: SubBatchPayoutMethod) {
  const batches = group.subBatches.filter((b) => b.payoutMethod === method);
  return {
    gross: batches.reduce((s, b) => s + b.gross, 0),
    headcount: batches.reduce((s, b) => s + b.headcount, 0),
  };
}

function PayrollGroupPanel({
  group,
  workflow,
  payrollGenerated,
  hqDeductionsLocked,
  onLock,
  onReedit,
  onDownloadBank,
  onDownloadCash,
  locking,
}: {
  group: PayrollGroupDefinition;
  workflow: PayrollGroupWorkflow;
  payrollGenerated: boolean;
  hqDeductionsLocked: boolean;
  onLock: () => void;
  onReedit: () => void;
  onDownloadBank: () => void;
  onDownloadCash: () => void;
  locking: boolean;
}) {
  const totals = groupTotals(group);
  const bankTotals = payoutChannelTotals(group, 'commercial_bank');
  const cashTotals = payoutChannelTotals(group, 'cash');
  const hasCashPayout = cashTotals.headcount > 0;
  const accentBorder = group.accent === 'indigo' ? 'border-indigo-200/70' : 'border-violet-200/70';
  const accentBg = group.accent === 'indigo' ? 'bg-indigo-50/30' : 'bg-violet-50/30';
  const isDraft = workflow.status === 'DRAFT';
  const isWithMd = workflow.status === 'SUBMITTED_FOR_REVIEW';
  const isApproved = workflow.status === 'APPROVED';
  const canLock = isDraft && payrollGenerated && hqDeductionsLocked;
  const canReedit = isWithMd || isApproved;
  const canDownload = isApproved;

  return (
    <div className={`rounded-2xl border ${accentBorder} ${accentBg} overflow-hidden`}>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200/50 px-5 py-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-black text-slate-900">{group.label}</p>
            <WorkflowStatusBadge status={workflow.status} />
          </div>
          <p className="mt-0.5 text-[11px] font-semibold text-slate-500">
            {group.company} · {totals.headcount} personnel · {lkr(totals.gross)}
          </p>
        </div>
        <div className="flex flex-shrink-0 flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onLock}
            disabled={!canLock || locking}
            title={
              !hqDeductionsLocked
                ? 'Deductions pending HQ lock — wait for Deductions Admin to lock the month and send to FM'
                : !payrollGenerated
                  ? 'Generate payroll for this period before locking'
                  : canLock
                    ? 'Lock batch and send to MD for approval'
                    : 'Batch already submitted or approved'
            }
            className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-[10px] font-black uppercase tracking-wider shadow-sm transition-all ${
              canLock && !locking
                ? 'border border-indigo-200/80 bg-indigo-600 text-white hover:bg-indigo-500'
                : 'cursor-not-allowed border border-slate-200/80 bg-slate-100/80 text-slate-400'
            }`}
          >
            {locking ? (
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
            ) : (
              <Lock className="h-3.5 w-3.5" />
            )}
            Lock &amp; Send to MD
          </button>
          <button
            type="button"
            onClick={onDownloadBank}
            disabled={!canDownload || bankTotals.headcount === 0}
            title={
              canDownload
                ? `Commercial Bank transfer · ${bankTotals.headcount} recipients`
                : 'Available only after MD approves this batch'
            }
            className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-[10px] font-black uppercase tracking-wider shadow-sm transition-all ${
              canDownload && bankTotals.headcount > 0
                ? 'border border-emerald-200/80 bg-emerald-600 text-white hover:bg-emerald-500'
                : 'cursor-not-allowed border border-slate-200/80 bg-slate-100/80 text-slate-400'
            }`}
          >
            <Download className="h-3.5 w-3.5" />
            Bank .TXT
          </button>
          {hasCashPayout && (
            <button
              type="button"
              onClick={onDownloadCash}
              disabled={!canDownload}
              title={
                canDownload
                  ? `Cash payout schedule · ${cashTotals.headcount} employees (no Commercial acct / other bank)`
                  : 'Available only after MD approves this batch'
              }
              className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-[10px] font-black uppercase tracking-wider shadow-sm transition-all ${
                canDownload
                  ? 'border border-amber-200/80 bg-amber-600 text-white hover:bg-amber-500'
                  : 'cursor-not-allowed border border-slate-200/80 bg-slate-100/80 text-slate-400'
              }`}
            >
              <Banknote className="h-3.5 w-3.5" />
              Cash .TXT
            </button>
          )}
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

      <div className="divide-y divide-slate-200/50 px-5">
        {group.subBatches.map((batch) => {
          const isCash = batch.payoutMethod === 'cash';
          return (
            <div
              key={batch.label}
              className={`py-4 ${isCash ? 'bg-amber-50/30 -mx-5 px-5' : ''}`}
            >
              <div className="mb-2 flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-sm font-black text-slate-900">{batch.label}</p>
                    {isCash && (
                      <span className="inline-flex items-center gap-1 rounded-full border border-amber-200/80 bg-amber-100/80 px-2 py-0.5 text-[9px] font-black uppercase tracking-widest text-amber-900">
                        <Banknote className="h-2.5 w-2.5" />
                        Cash desk
                      </span>
                    )}
                  </div>
                  <p className="truncate text-[11px] font-semibold text-slate-500">{batch.description}</p>
                </div>
                <div className="flex flex-shrink-0 items-center gap-2">
                  <span
                    className={`text-[11px] font-black tabular-nums ${isCash ? 'text-amber-900' : 'text-slate-700'}`}
                  >
                    {lkr(batch.gross)}
                  </span>
                  <BatchStatusBadge status={batch.status} />
                </div>
              </div>
              <div className="flex items-center gap-3">
                <BatchProgressBar progress={batch.progress} status={batch.status} />
                <span className="w-8 flex-shrink-0 text-right text-[11px] font-black tabular-nums text-slate-600">
                  {batch.progress}%
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {isWithMd && (
        <div className="border-t border-indigo-200/50 bg-indigo-50/40 px-5 py-2.5 text-[10px] font-semibold text-indigo-800">
          Locked and queued on the MD payroll audit desk — awaiting approval.
        </div>
      )}
      {isApproved && (
        <div className="border-t border-emerald-200/50 bg-emerald-50/40 px-5 py-2.5 text-[10px] font-semibold text-emerald-800">
          MD approved —{' '}
          {hasCashPayout
            ? 'Commercial Bank .TXT and cash payout schedule are ready for download.'
            : 'bank transfer file is ready for download.'}
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function FMBatchExecutionPage() {
  const [deductionsPeriod, setDeductionsPeriod] = useState(FM_LIVE_PAYROLL_PERIOD);
  const [deductionModal, setDeductionModal] = useState<BatchDeductionKind | null>(null);
  const [welfareModalOpen, setWelfareModalOpen] = useState(false);
  const [welfareFundSettings, setWelfareFundSettings] = useState(DEFAULT_WELFARE_FUND_SETTINGS);
  const [workflow, setWorkflow] = useState<PayrollGroupWorkflow[]>(() =>
    typeof window !== 'undefined' ? getPayrollWorkflowState() : [],
  );
  const [payrollGroups, setPayrollGroups] = useState<PayrollGroupDefinition[]>(PAYROLL_GROUPS_PENDING);
  const [payrollGenerated, setPayrollGenerated] = useState(false);
  const [generateMessage, setGenerateMessage] = useState<string | null>(null);
  const [lockingGroup, setLockingGroup] = useState<PayrollGroupId | null>(null);
  const [isGenerating, startGenerateTransition] = useTransition();
  const [hqDeductionsLocked, setHqDeductionsLocked] = useState(false);
  const [hqDeductionsLockLoading, setHqDeductionsLockLoading] = useState(true);

  const refreshHqDeductionLock = useCallback(async () => {
    setHqDeductionsLockLoading(true);
    const status = await getDeductionMonthLockStatus(BATCH_PAYROLL_MONTH);
    const clientLockedAt =
      !status.locked && (status.isDemo || !status.tableReady)
        ? getClientDeductionMonthLockedAt(status.payrollMonth)
        : null;
    setHqDeductionsLocked(Boolean(status.locked || clientLockedAt));
    setHqDeductionsLockLoading(false);
  }, []);

  useEffect(() => {
    setWorkflow(getPayrollWorkflowState());
    return subscribePayrollWorkflow(() => setWorkflow(getPayrollWorkflowState()));
  }, []);

  useEffect(() => {
    void refreshHqDeductionLock();
    return subscribeDeductionMonthLock(() => void refreshHqDeductionLock());
  }, [refreshHqDeductionLock]);

  useEffect(() => {
    let cancelled = false;
    getWelfareFundSettings().then((cfg) => {
      if (!cancelled) setWelfareFundSettings(cfg);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const workflowFor = (groupId: PayrollGroupId) =>
    workflow.find((w) => w.groupId === groupId) ?? { groupId, batchId: '', status: 'DRAFT' as const };

  const handleLockGroup = (groupId: PayrollGroupId) => {
    setLockingGroup(groupId);
    setTimeout(() => {
      submitGroupForMdReview(groupId);
      setLockingGroup(null);
    }, 900);
  };

  const handleReeditGroup = (groupId: PayrollGroupId) => {
    revertGroupToDraft(groupId);
  };

  const handleDownloadBankFile = (group: PayrollGroupDefinition) => {
    const totals = payoutChannelTotals(group, 'commercial_bank');
    const txt = generateBankTransferTxt(group.label, totals.gross, totals.headcount);
    triggerBankTxtDownload(`Commercial_Bank_${group.id}_May2026.txt`, txt);
  };

  const handleDownloadCashFile = (group: PayrollGroupDefinition) => {
    const totals = payoutChannelTotals(group, 'cash');
    const txt = generateCashPayoutTxt(group.label, totals.gross, totals.headcount);
    triggerBankTxtDownload(`Cash_Payout_${group.id}_May2026.txt`, txt);
  };

  const handleGeneratePayroll = () => {
    setGenerateMessage(null);
    setPayrollGroups((groups) =>
      groups.map((g) => ({
        ...g,
        subBatches: g.subBatches.map((b) => ({ ...b, status: 'processing' as const, progress: 12 })),
      })),
    );

    startGenerateTransition(async () => {
      const formData = new FormData();
      formData.set('month', String(BATCH_PERIOD.month));
      formData.set('year', String(BATCH_PERIOD.year));

      const result = await generateMonthEndPayroll(formData);
      if (result.success) {
        setPayrollGroups(PAYROLL_GROUPS_GENERATED);
        setPayrollGenerated(true);
        setGenerateMessage(
          `Generated ${result.count} draft payslip${result.count === 1 ? '' : 's'} for ${BATCH_PERIOD.label}.`,
        );
      } else {
        setPayrollGroups(PAYROLL_GROUPS_PENDING);
        setPayrollGenerated(false);
        setGenerateMessage('Payroll generation failed. Check server logs and try again.');
      }
    });
  };

  const totalGross = payrollGroups.reduce((sum, g) => sum + groupTotals(g).gross, 0);
  const pendingMdCount = workflow.filter((w) => w.status === 'SUBMITTED_FOR_REVIEW').length;
  const approvedCount = workflow.filter((w) => w.status === 'APPROVED').length;
  const headerStage =
    !hqDeductionsLockLoading && !hqDeductionsLocked
      ? 'DEDUCTIONS PENDING HQ LOCK'
      : pendingMdCount > 0
        ? `${pendingMdCount} BATCH${pendingMdCount !== 1 ? 'ES' : ''} WITH MD`
        : approvedCount === payrollGroups.length
          ? 'ALL BATCHES APPROVED'
          : payrollGenerated
            ? 'DRAFT STAGE — AWAITING LOCK'
            : 'AWAITING PAYROLL GENERATION';
  const deductionsScale = historicalPortfolioScale(deductionsPeriod);
  const deductionsPeriodLabel = formatPayrollPeriodLabel(deductionsPeriod);
  const payrollHeadcount = useMemo(
    () => payrollGroups.reduce((sum, g) => sum + groupTotals(g).headcount, 0),
    [payrollGroups],
  );
  const welfareFundAmount = useMemo(
    () =>
      welfareFundTotalForPeriod(
        welfareFundSettings,
        payrollHeadcount,
        deductionsScale,
      ),
    [welfareFundSettings, payrollHeadcount, deductionsScale],
  );
  const scaledDeductions = useMemo(
    () =>
      BASE_DEDUCTIONS.map((d) => ({
        ...d,
        amount: Math.round(d.amount * deductionsScale),
      })),
    [deductionsScale],
  );
  const ledgerCards = useMemo(
    () => [
      ...scaledDeductions,
      {
        label: WELFARE_FUND_CARD.label,
        sublabel: `${WELFARE_FUND_CARD.sublabel} · ${welfareFundSettings.monthlyDeductionLkr.toLocaleString()} LKR × ${Math.max(1, Math.round(payrollHeadcount * deductionsScale))} staff`,
        amount: welfareFundAmount,
        color: WELFARE_FUND_CARD.color,
        kind: 'welfare' as const,
      },
    ],
    [scaledDeductions, welfareFundAmount, welfareFundSettings.monthlyDeductionLkr, payrollHeadcount, deductionsScale],
  );
  const totalDeductions = useMemo(
    () => ledgerCards.reduce((sum, d) => sum + d.amount, 0),
    [ledgerCards],
  );
  const scaledLedgerRows = (kind: BatchDeductionKind) =>
    getDeductionLedger(kind).map((r) => ({
      ...r,
      amountLkr: Math.round(r.amountLkr * deductionsScale),
    }));
  const stopListCount = FM_PREV_MONTH_STOP_LIST.length;

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Dot-grid texture */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-0 opacity-25"
        style={{
          backgroundImage: 'radial-gradient(rgb(148 163 184 / 0.5) 1px, transparent 1px)',
          backgroundSize: '20px 20px',
        }}
      />

      <div className="relative z-10 mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">

        <FmSubnav />

        {/* ── Header ── */}
        <header className="sticky top-0 z-40 border-b border-white/60 bg-white/45 px-6 py-4 shadow-[0_8px_32px_-12px_rgba(15,23,42,0.08)] backdrop-blur-xl backdrop-saturate-150 rounded-2xl mb-8">
          <div className="flex w-full flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-xl font-black uppercase tracking-tight text-slate-900 sm:text-2xl">
                Batch Execution Desk
              </h1>
              <p className="text-[11px] font-bold uppercase tracking-widest text-indigo-700">
                May 2026 — Execution Engine · Statutory Compliance · Bank Dispatch
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div
                className={`flex items-center gap-2 rounded-2xl border px-4 py-2 ${
                  !hqDeductionsLockLoading && !hqDeductionsLocked
                    ? 'border-violet-200/80 bg-violet-50/90'
                    : 'border-amber-200/80 bg-amber-50/80'
                }`}
              >
                <Clock
                  className={`h-4 w-4 ${
                    !hqDeductionsLockLoading && !hqDeductionsLocked
                      ? 'text-violet-700'
                      : 'text-amber-700'
                  }`}
                />
                <span
                  className={`text-[11px] font-black ${
                    !hqDeductionsLockLoading && !hqDeductionsLocked
                      ? 'text-violet-900'
                      : 'text-amber-800'
                  }`}
                >
                  {headerStage}
                </span>
              </div>
              <div className="flex items-center gap-2 rounded-2xl border border-rose-200/80 bg-rose-50/80 px-4 py-2">
                <AlertOctagon className="h-4 w-4 text-rose-700" />
                <span className="text-[11px] font-black text-rose-800">{stopListCount} Guards on Stop List</span>
              </div>
            </div>
          </div>
        </header>

        <div className="space-y-8">

          {/* ─── Section 2: Payroll Batch Processing ──────────────────────────── */}
          <ExecutiveGlassCard className="overflow-hidden">
            <div className="border-b border-slate-200/70 bg-slate-50/50 px-6 py-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-indigo-200/80 bg-indigo-50/80">
                    <BarChart3 className="h-[18px] w-[18px] text-indigo-700" />
                  </div>
                  <div>
                    <p className="text-sm font-black uppercase tracking-tight text-slate-900">Payroll Batch Processing</p>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                      {BATCH_PERIOD.label} — {payrollGenerated ? 'DRAFT STAGE' : 'AWAITING GENERATION'}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full border border-amber-200 bg-amber-100/80 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-amber-900">
                    Draft
                  </span>
                  <button
                    type="button"
                    onClick={handleGeneratePayroll}
                    disabled={isGenerating || payrollGenerated}
                    title={
                      payrollGenerated
                        ? 'Payroll already generated for this period'
                        : `Generate draft payslips for ${BATCH_PERIOD.label}`
                    }
                    className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-[10px] font-black uppercase tracking-wider shadow-sm transition-all ${
                      !isGenerating && !payrollGenerated
                        ? 'border border-indigo-200/80 bg-indigo-600 text-white hover:bg-indigo-500'
                        : 'cursor-not-allowed border border-slate-200/80 bg-slate-100/80 text-slate-400'
                    }`}
                  >
                    {isGenerating ? (
                      <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                    ) : (
                      <Sparkles className="h-3.5 w-3.5" />
                    )}
                    {isGenerating ? 'Generating…' : 'Generate Payroll'}
                  </button>
                </div>
              </div>
            </div>

            {!hqDeductionsLockLoading && !hqDeductionsLocked && (
              <div className="border-b border-violet-200/60 bg-violet-50/60 px-6 py-3 text-[11px] font-semibold text-violet-900">
                <span className="font-black uppercase tracking-wider">Deductions pending HQ lock.</span>{' '}
                Finance must finish monthly entries on Deductions Admin and use{' '}
                <span className="font-black">Lock month &amp; send to FM</span> for {BATCH_PERIOD.label}{' '}
                before you can lock payroll batches.
              </div>
            )}

            {generateMessage && (
              <div
                className={`border-b px-6 py-2.5 text-[11px] font-semibold ${
                  payrollGenerated
                    ? 'border-emerald-200/60 bg-emerald-50/50 text-emerald-800'
                    : 'border-rose-200/60 bg-rose-50/50 text-rose-800'
                }`}
              >
                {generateMessage}
              </div>
            )}

            <div className="space-y-4 px-6 py-5">
              {payrollGroups.map((group) => (
                <PayrollGroupPanel
                  key={group.id}
                  group={group}
                  workflow={workflowFor(group.id)}
                  payrollGenerated={payrollGenerated}
                  hqDeductionsLocked={hqDeductionsLocked}
                  onLock={() => handleLockGroup(group.id)}
                  onReedit={() => handleReeditGroup(group.id)}
                  onDownloadBank={() => handleDownloadBankFile(group)}
                  onDownloadCash={() => handleDownloadCashFile(group)}
                  locking={lockingGroup === group.id}
                />
              ))}
            </div>

            <div className="border-t border-slate-200/70 bg-slate-50/40 px-6 py-3">
              <div className="flex items-center justify-between text-[11px] font-bold text-slate-600">
                <span className="uppercase tracking-widest">Total Gross (Both Groups)</span>
                <span className="text-base font-black tabular-nums text-slate-900">{lkrFull(totalGross)}</span>
              </div>
            </div>

            <div className="px-6 pb-6 pt-3">
              <p className="text-center text-[10px] font-semibold leading-relaxed text-slate-500">
                Generate payroll for {BATCH_PERIOD.label}, then lock each group for MD review. Bank .TXT downloads unlock only after MD approval. Re-editing a locked batch removes it from the MD portal.
              </p>
            </div>
          </ExecutiveGlassCard>

          {/* ─── Section 3: Granular Deductions Ledger ────────────────────────── */}
          <div>
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
              {ledgerCards.map((d) => {
                const c = colorMap[d.color as DeductionColor];
                const pct = totalDeductions > 0 ? Math.round((d.amount / totalDeductions) * 100) : 0;
                const isWelfare = 'kind' in d && d.kind === 'welfare';
                return (
                  <ExecutiveGlassCard
                    key={d.label}
                    className={`overflow-hidden border ${c.border} cursor-pointer transition-shadow hover:shadow-[0_16px_56px_-12px_rgba(15,23,42,0.18)]`}
                    onClick={() =>
                      isWelfare ? setWelfareModalOpen(true) : setDeductionModal(d.drillDown)
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
          liveHeadcount={payrollHeadcount}
          highlightPeriod={deductionsPeriod}
          onClose={() => setWelfareModalOpen(false)}
        />
      )}
    </div>
  );
}
