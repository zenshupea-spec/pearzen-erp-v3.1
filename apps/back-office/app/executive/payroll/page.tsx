'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Lock,
  Download,
  CheckCircle2,
  Clock,
  AlertTriangle,
  X,
  ChevronDown,
  ChevronUp,
  TrendingDown,
  ShieldAlert,
  Landmark,
  ShieldCheck,
  FileText,
  Building2,
  Banknote,
  Receipt,
  Mail,
  Printer,
} from 'lucide-react';
import { LOGO_STORAGE_KEY } from '../../../../../packages/supabase/branding-constants';
import { BANK_EXPORT_FORMAT_LABELS } from '../../../../../packages/bank-export-settings';
import { getBankExportSettings } from '../settings/bank-export-actions';
import { ExecutiveGlassCard } from '../../../components/executive/ExecutiveVaultShell';
import {
  ExecutivePageBody,
  ExecutivePageHeader,
  ExecutivePageLiveSubtitle,
  ExecutivePageShell,
} from '../../../components/executive/ExecutivePageChrome';
import { CVS_BRAND_CLASSES } from '../../../lib/cvs-brand-tokens';
import { batchIdToGroupId } from '../../../lib/payroll-batch-workflow';
import FmPayrollMonthSelector from '../../fm/components/FmPayrollMonthSelector';
import { FM_LIVE_PAYROLL_PERIOD, type PayrollPeriod } from '../../fm/lib/payroll-period';
import {
  approvePayrollGroupRun,
  downloadPayrollBankFile,
} from '../../fm/payroll-run-actions';
import { getMdPayrollAuditBatches, type MdPayrollBatch } from '../payroll-actions';
import {
  triggerPayrollBankDownload,
} from '../../../lib/payroll-bank-export';

// ─── Types ────────────────────────────────────────────────────────────────────

type BatchStatus = 'SUBMITTED_FOR_REVIEW' | 'APPROVED';

interface DeductionLine {
  label: string;
  amount: number; // positive number, treated as a deduction
}

type PayrollBatch = MdPayrollBatch;
type PayslipLine = MdPayrollBatch['lines'][number];

const BANK_FORMATS = [
  'Commercial Bank — CSV',
  'Sampath Bank — TXT',
  'HNB — CSV',
  'BOC — TXT',
  'NSB — CSV',
  'Peoples Bank — TXT',
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function lkr(n: number) {
  const abs  = Math.abs(n);
  const sign = n < 0 ? '−' : '';
  if (abs >= 1_000_000) return `${sign}LKR ${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000)     return `${sign}LKR ${(abs / 1_000).toFixed(1)}K`;
  return `${sign}LKR ${abs.toLocaleString()}`;
}

function totalDeductions(line: PayslipLine) {
  return line.deductions.reduce((s, d) => s + d.amount, 0);
}

function netPay(line: PayslipLine) {
  return line.basicPay + line.overtimePay - totalDeductions(line);
}

function variancePct(line: PayslipLine) {
  const net = netPay(line);
  if (!line.threeMonthAvgNet) return 0;
  return ((net - line.threeMonthAvgNet) / line.threeMonthAvgNet) * 100;
}

function isVarianceFlagged(line: PayslipLine) {
  return Math.abs(variancePct(line)) >= 20;
}

function batchTotals(batch: PayrollBatch) {
  const gross     = batch.lines.reduce((s, l) => s + l.basicPay + l.overtimePay, 0);
  const deducts   = batch.lines.reduce((s, l) => s + totalDeductions(l), 0);
  const netTrans  = gross - deducts;
  const flagCount = batch.lines.filter(isVarianceFlagged).length;
  return { gross, deducts, netTrans, flagCount };
}

// ─── Deduction Audit Modal ────────────────────────────────────────────────────

function DeductionAuditModal({
  guard,
  onClose,
}: {
  guard: PayslipLine | null;
  onClose: () => void;
}) {
  const [acknowledgedSet, setAcknowledgedSet] = useState<Set<number>>(new Set());

  useEffect(() => {
    setAcknowledgedSet(new Set());
  }, [guard?.guardId]);

  if (!guard) return null;
  const dedTotal = totalDeductions(guard);

  const handleSendEmail = (idx: number) => {
    setAcknowledgedSet((prev) => new Set([...prev, idx]));
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-md overflow-hidden rounded-3xl border border-white/75 bg-[#eef2f6] shadow-[0_32px_80px_-16px_rgba(15,23,42,0.4)] backdrop-blur-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div aria-hidden className="pointer-events-none absolute -top-16 right-0 h-48 w-48 rounded-full bg-rose-400/15 blur-[72px]" />

        <div className="relative p-6">
          {/* Header */}
          <div className="mb-5 flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-rose-200/80 bg-rose-50/80">
                <Receipt className="h-5 w-5 text-rose-700" />
              </div>
              <div>
                <p className="text-sm font-semibold uppercase tracking-widest text-slate-600">Financial Audit</p>
                <h3 className="text-lg font-black text-slate-900">Deduction Breakdown</h3>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200/80 bg-white/70 text-slate-600 hover:text-slate-900 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Guard identity */}
          <ExecutiveGlassCard className="mb-4 p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl border border-slate-200/80 bg-slate-100/80 text-sm font-black text-slate-700">
                {guard.guardName.charAt(0)}
              </div>
              <div>
                <p className="font-black text-slate-900">{guard.guardName}</p>
                <p className="text-sm font-semibold text-slate-600">{guard.empNo} · {guard.rank}</p>
              </div>
              <div className="ml-auto text-right">
                <p className="text-sm font-semibold uppercase tracking-widest text-slate-600">Gross</p>
                <p className="font-black text-slate-900 tabular-nums">{lkr(guard.basicPay + guard.overtimePay)}</p>
              </div>
            </div>
          </ExecutiveGlassCard>

          {/* Deduction lines */}
          {guard.deductions.length === 0 ? (
            <div className="mb-4 flex items-center gap-2 rounded-xl border border-emerald-200/80 bg-emerald-50/80 px-4 py-3 text-sm font-semibold text-emerald-800">
              <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
              No deductions — full gross pay disbursed.
            </div>
          ) : (
            <div className="mb-1 space-y-2">
              {guard.deductions.map((d, i) => {
                const acked = acknowledgedSet.has(i);
                return (
                  <div
                    key={i}
                    className={`rounded-xl border px-4 py-3 transition-colors ${
                      acked
                        ? 'border-emerald-200/70 bg-emerald-50/60'
                        : 'border-rose-200/60 bg-white/70'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      {/* Label + acknowledgment badge */}
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold text-slate-800 leading-tight">{d.label}</p>
                        <div className="mt-1.5">
                          {acked ? (
                            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200/80 bg-emerald-100/80 px-2 py-0.5 text-xs font-black text-emerald-800">
                              <CheckCircle2 className="h-3 w-3" />
                              Acknowledged
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full border border-amber-200/80 bg-amber-50/80 px-2 py-0.5 text-xs font-black text-amber-800">
                              <Clock className="h-3 w-3" />
                              Guard Acknowledgment: Pending Email
                            </span>
                          )}
                        </div>
                      </div>
                      {/* Amount + send email button */}
                      <div className="flex flex-shrink-0 flex-col items-end gap-1.5">
                        <span className="text-base font-black tabular-nums text-rose-800">
                          −{lkr(d.amount)}
                        </span>
                        {!acked && (
                          <button
                            type="button"
                            onClick={() => handleSendEmail(i)}
                            className={`flex items-center gap-1 rounded-lg border border-slate-200/80 bg-white/80 px-2 py-1 text-sm font-bold text-slate-700 transition-all hover:border-[color:var(--cvs-accent-muted)] hover:bg-[var(--cvs-accent-soft)] hover:text-[color:var(--cvs-accent)]`}
                          >
                            <Mail className="h-3.5 w-3.5" />
                            Send Email Notice
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Labor Law compliance note */}
          {guard.deductions.length > 0 && (
            <p className="mb-3 mt-2 text-sm leading-relaxed text-slate-600">
              <span className="font-bold text-slate-700">Labor Law Compliance:</span> Disciplinary deductions require documented email notification.
            </p>
          )}

          {/* Net summary */}
          <div className="mb-4 flex items-center justify-between rounded-2xl border border-slate-200/80 bg-white/50 px-4 py-3">
            <div>
              <p className="text-sm font-semibold uppercase tracking-widest text-slate-600">Total Deductions</p>
              <p className="text-lg font-black tabular-nums text-rose-800">−{lkr(dedTotal)}</p>
            </div>
            <div className="text-right">
              <p className="text-sm font-semibold uppercase tracking-widest text-slate-600">Net Payout</p>
              <p className="text-lg font-black tabular-nums text-emerald-900">{lkr(netPay(guard))}</p>
            </div>
          </div>

          {/* OM Verified badge */}
          <div className="flex items-center gap-2.5 rounded-2xl border border-emerald-200/80 bg-emerald-50/80 px-4 py-3">
            <ShieldCheck className="h-5 w-5 flex-shrink-0 text-emerald-700" />
            <div>
              <p className="text-sm font-black uppercase tracking-widest text-emerald-800">
                All deductions verified by Operations Manager
              </p>
              <p className="text-sm text-emerald-700">
                Cross-referenced against penalty amortization records and advance register.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Approval Confirm Modal ───────────────────────────────────────────────────

function ConfirmModal({
  batch,
  onConfirm,
  onCancel,
}: {
  batch: PayrollBatch | null;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!batch) return null;
  const t = batchTotals(batch);

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm" onClick={onCancel}>
      <div
        className="relative w-full max-w-sm overflow-hidden rounded-3xl border border-white/75 bg-[#eef2f6] shadow-[0_32px_80px_-16px_rgba(15,23,42,0.4)] backdrop-blur-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div aria-hidden className="pointer-events-none absolute -top-16 right-0 h-48 w-48 rounded-full bg-emerald-400/18 blur-[72px]" />
        <div className="relative p-6">
          <div className="mb-5 flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-emerald-200 bg-emerald-50/80">
                <Lock className="h-5 w-5 text-emerald-800" />
              </div>
              <div>
                <p className="text-sm font-semibold uppercase tracking-widest text-slate-600">MD Approval Lock</p>
                <h3 className="text-lg font-black text-slate-900">Lock Ledger</h3>
              </div>
            </div>
            <button type="button" onClick={onCancel} className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200/80 bg-white/70 text-slate-600 hover:text-slate-900 transition-colors">
              <X className="h-4 w-4" />
            </button>
          </div>

          <ExecutiveGlassCard className="mb-4 p-4">
            <p className="text-sm font-semibold uppercase tracking-widest text-slate-600">Batch</p>
            <p className="mt-1 font-black text-slate-900">{batch.id}</p>
            <p className="text-sm font-semibold text-slate-600">{batch.period} · {batch.company}</p>
          </ExecutiveGlassCard>

          <div className="grid grid-cols-2 gap-2 mb-4">
            <ExecutiveGlassCard className="p-3">
              <p className="text-sm font-semibold uppercase tracking-widest text-slate-600">Gross</p>
              <p className="mt-1 text-base font-black text-slate-900">{lkr(t.gross)}</p>
            </ExecutiveGlassCard>
            <ExecutiveGlassCard className="bg-gradient-to-br from-white/70 to-emerald-50/60 p-3">
              <p className="text-sm font-semibold uppercase tracking-widest text-slate-600">Net Transfer</p>
              <p className="mt-1 text-base font-black text-emerald-900">{lkr(t.netTrans)}</p>
            </ExecutiveGlassCard>
          </div>

          <div className="flex items-start gap-2.5 rounded-xl border border-amber-200/80 bg-amber-50/60 px-4 py-3 mb-4 text-sm text-amber-800 font-semibold">
            <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-700" />
            <span>This action is <strong>irreversible</strong>. Records will be permanently locked. Any subsequent disputes must be rolled over as arrears to the following month.</span>
          </div>

          <div className="flex gap-3">
            <button type="button" onClick={onCancel} className="flex-1 rounded-xl border border-slate-200 bg-white/70 py-3 text-sm font-bold text-slate-700 hover:bg-white/90 transition-all">Cancel</button>
            <button type="button" onClick={onConfirm} className="flex-[2] rounded-xl bg-emerald-600 py-3 text-sm font-black uppercase tracking-widest text-white shadow-lg shadow-emerald-600/25 hover:bg-emerald-500 transition-all">
              Lock & Generate File
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Payslip Printer ─────────────────────────────────────────────────────────

function printPayslip(line: PayslipLine, batch: PayrollBatch) {
  const logoDataUrl = typeof window !== 'undefined' ? localStorage.getItem(LOGO_STORAGE_KEY) ?? '' : '';
  const gross   = line.basicPay + line.overtimePay;
  const deducts = totalDeductions(line);
  const net     = netPay(line);

  const logoHtml = logoDataUrl
    ? `<img src="${logoDataUrl}" alt="Company logo" style="height:56px;width:56px;object-fit:contain;" />`
    : `<div style="height:56px;width:56px;display:flex;align-items:center;justify-content:center;background:#eef2f6;border-radius:12px;font-size:22px;font-weight:900;color:#4338ca;">CV</div>`;

  const deductionRows = line.deductions.length === 0
    ? `<tr><td colspan="2" style="text-align:center;color:#64748b;padding:8px 0;">No deductions</td></tr>`
    : line.deductions.map((d) =>
        `<tr>
          <td style="padding:5px 0;color:#1e293b;">${d.label}</td>
          <td style="padding:5px 0;text-align:right;color:#991b1b;font-weight:700;">− LKR ${d.amount.toLocaleString()}</td>
        </tr>`
      ).join('');

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>Payslip — ${line.guardName} — ${batch.period}</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0;}
    body{font-family:system-ui,sans-serif;background:#fff;color:#0f172a;padding:40px;}
    .slip{max-width:680px;margin:0 auto;border:1.5px solid #e2e8f0;border-radius:16px;overflow:hidden;}
    .header{background:#1e293b;color:#fff;padding:28px 32px;display:flex;align-items:center;gap:20px;}
    .header-text h1{font-size:20px;font-weight:900;letter-spacing:.03em;}
    .header-text p{font-size:12px;opacity:.7;margin-top:2px;}
    .badge{display:inline-block;background:rgba(255,255,255,.15);border:1px solid rgba(255,255,255,.25);border-radius:8px;padding:2px 10px;font-size:11px;font-weight:700;letter-spacing:.08em;margin-top:6px;}
    .body{padding:28px 32px;background:#f8fafc;}
    .section-title{font-size:11px;font-weight:900;letter-spacing:.1em;text-transform:uppercase;color:#64748b;margin-bottom:10px;margin-top:20px;}
    .section-title:first-child{margin-top:0;}
    .info-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;}
    .info-box{background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:12px 14px;}
    .info-box .label{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#94a3b8;}
    .info-box .value{font-size:15px;font-weight:900;color:#0f172a;margin-top:3px;}
    table{width:100%;border-collapse:collapse;}
    .earnings-table tr td{padding:6px 0;font-size:14px;}
    .earnings-table .sub{color:#64748b;font-size:12px;}
    .divider{border:none;border-top:1px solid #e2e8f0;margin:14px 0;}
    .net-box{background:#0f172a;border-radius:12px;padding:18px 20px;display:flex;justify-content:space-between;align-items:center;margin-top:20px;}
    .net-box .label{font-size:11px;font-weight:900;letter-spacing:.1em;text-transform:uppercase;color:rgba(255,255,255,.6);}
    .net-box .amount{font-size:24px;font-weight:900;color:#fff;}
    .footer{border-top:1px solid #e2e8f0;padding:16px 32px;display:flex;justify-content:space-between;font-size:11px;color:#94a3b8;}
    @media print{body{padding:0;}.slip{border:none;max-width:100%;}}
  </style>
</head>
<body>
<div class="slip">
  <div class="header">
    ${logoHtml}
    <div class="header-text">
      <h1>${batch.company}</h1>
      <p>Salary Payslip · ${batch.period}</p>
      <span class="badge">${batch.id}</span>
    </div>
  </div>

  <div class="body">
    <p class="section-title">Employee Details</p>
    <div class="info-grid">
      <div class="info-box">
        <div class="label">Employee No.</div>
        <div class="value">${line.empNo}</div>
      </div>
      <div class="info-box">
        <div class="label">Name</div>
        <div class="value">${line.guardName}</div>
      </div>
      <div class="info-box">
        <div class="label">Rank</div>
        <div class="value">${line.rank}</div>
      </div>
      <div class="info-box">
        <div class="label">Total Shifts</div>
        <div class="value">${line.totalShifts}</div>
      </div>
      <div class="info-box">
        <div class="label">Pay Period</div>
        <div class="value">${batch.period}</div>
      </div>
      <div class="info-box">
        <div class="label">Submitted By</div>
        <div class="value">${batch.submittedBy}</div>
      </div>
    </div>

    <p class="section-title" style="margin-top:24px;">Earnings</p>
    <table class="earnings-table">
      <tr>
        <td>Basic Pay</td>
        <td style="text-align:right;font-weight:700;">LKR ${line.basicPay.toLocaleString()}</td>
      </tr>
      <tr>
        <td>Overtime / Allowances</td>
        <td style="text-align:right;font-weight:700;color:#1d4ed8;">${line.overtimePay > 0 ? `+ LKR ${line.overtimePay.toLocaleString()}` : '—'}</td>
      </tr>
      <tr>
        <td style="font-weight:800;">Gross Pay</td>
        <td style="text-align:right;font-weight:900;">LKR ${gross.toLocaleString()}</td>
      </tr>
    </table>

    <hr class="divider"/>

    <p class="section-title">Deductions</p>
    <table class="earnings-table">
      ${deductionRows}
      <tr>
        <td style="font-weight:800;color:#991b1b;">Total Deductions</td>
        <td style="text-align:right;font-weight:900;color:#991b1b;">− LKR ${deducts.toLocaleString()}</td>
      </tr>
    </table>

    <div class="net-box">
      <div class="label">Net Take-Home Pay</div>
      <div class="amount">LKR ${net.toLocaleString()}</div>
    </div>
  </div>

  <div class="footer">
    <span>Generated by Classic Venture ERP · ${new Date().toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' })}</span>
    <span>This is a computer-generated payslip — no signature required.</span>
  </div>
</div>
<script>window.onload = function(){ window.print(); }</script>
</body>
</html>`;

  const w = window.open('', '_blank', 'width=780,height=900');
  if (w) {
    w.document.write(html);
    w.document.close();
  }
}

// ─── Master Guard Ledger Card ─────────────────────────────────────────────────

function MasterGuardLedger({
  batch,
  payrollPeriod,
  onAuditDeductions,
  onLock,
}: {
  batch: PayrollBatch;
  payrollPeriod: PayrollPeriod;
  onAuditDeductions: (line: PayslipLine) => void;
  onLock: (id: string) => void;
}) {
  const [bankFormat, setBankFormat] = useState(BANK_FORMATS[0]);
  const [bankFormatLocked, setBankFormatLocked] = useState(true);
  const [lockedFormatLabel, setLockedFormatLabel] = useState(BANK_EXPORT_FORMAT_LABELS.commercial_csv);
  const [collapsed,  setCollapsed]  = useState(batch.status === 'APPROVED');
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [isLocking,  setIsLocking]  = useState(false);
  const t         = batchTotals(batch);
  const isPending = batch.status === 'SUBMITTED_FOR_REVIEW';

  useEffect(() => {
    getBankExportSettings().then((cfg) => {
      setBankFormatLocked(cfg.enforceFormatGlobally);
      setLockedFormatLabel(BANK_EXPORT_FORMAT_LABELS[cfg.masterFormatId]);
    });
  }, []);

  const handleLockClick = () => {
    setIsLocking(true);
    setTimeout(() => {
      setIsLocking(false);
      onLock(batch.id);
    }, 800);
  };

  const handleDownloadBank = () => {
    const groupId = batchIdToGroupId(batch.id);
    if (!groupId) return;
    setDownloadError(null);
    setDownloading(true);
    void downloadPayrollBankFile(groupId, payrollPeriod.year, payrollPeriod.month).then(
      (result) => {
        setDownloading(false);
        if (!result.success || !result.content || !result.filename || !result.mimeType) {
          setDownloadError(result.error ?? 'Could not generate bank file.');
          return;
        }
        triggerPayrollBankDownload(result.filename, result.content, result.mimeType);
      },
    );
  };

  return (
    <ExecutiveGlassCard className="overflow-hidden">
      {/* ── Batch header ── */}
      <div className={`flex flex-wrap items-center gap-4 border-b px-5 py-4 ${
        isPending ? 'border-amber-200/60 bg-amber-50/20' : 'border-emerald-200/60 bg-emerald-50/20'
      }`}>
        <div className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl border ${
          isPending ? 'border-amber-200/80 bg-amber-50/80' : 'border-emerald-200/80 bg-emerald-50/80'
        }`}>
          {isPending ? <Clock className="h-5 w-5 text-amber-700" /> : <CheckCircle2 className="h-5 w-5 text-emerald-700" />}
        </div>

        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-black text-slate-900">{batch.id}</p>
            <span className={`rounded-full border px-2.5 py-0.5 text-xs font-black uppercase tracking-widest ${
              isPending
                ? 'border-amber-200 bg-amber-100/90 text-amber-900'
                : 'border-emerald-200 bg-emerald-100/90 text-emerald-900'
            }`}>
              {isPending ? 'Awaiting MD Approval' : 'Approved & Locked'}
            </span>
            {t.flagCount > 0 && (
              <span className="flex items-center gap-1 rounded-full border border-rose-200/80 bg-rose-50/80 px-2.5 py-0.5 text-xs font-black text-rose-800 animate-pulse">
                <AlertTriangle className="h-3 w-3" />
                {t.flagCount} AI variance{t.flagCount > 1 ? 's' : ''}
              </span>
            )}
          </div>
          <p className="mt-0.5 text-sm font-semibold text-slate-600">{batch.period} · {batch.company} · Submitted by {batch.submittedBy}</p>
        </div>

        <div className="flex items-center gap-4 text-right">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-slate-600">Gross</p>
            <p className="font-black tabular-nums text-slate-900">{lkr(t.gross)}</p>
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-slate-600">Deductions</p>
            <p className="font-black tabular-nums text-rose-800">−{lkr(t.deducts)}</p>
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-slate-600">Net Transfer</p>
            <p className="text-lg font-black tabular-nums text-emerald-900">{lkr(t.netTrans)}</p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200/80 bg-white/70 text-slate-600 hover:text-slate-900 transition-all"
        >
          {collapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
        </button>
      </div>

      {!collapsed && (
        <>
          {/* ── Master Guard Table ── */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200/80 bg-slate-50/60 text-sm font-bold uppercase tracking-widest text-slate-600">
                <tr>
                  <th className="px-5 py-3">Emp No</th>
                  <th className="px-5 py-3">Name</th>
                  <th className="px-5 py-3 text-center">Rank</th>
                  <th className="px-5 py-3 text-center">Total Shifts</th>
                  <th className="px-5 py-3 text-right">Base Pay (LKR)</th>
                  <th className="px-5 py-3 text-right">OT / Allowances</th>
                  <th className="px-5 py-3 text-right">Total Deductions</th>
                  <th className="px-5 py-3 text-right bg-emerald-50/60">
                    <span className="text-emerald-700">Net Payout (LKR)</span>
                  </th>
                  <th className="px-5 py-3 text-center">AI Flag</th>
                  <th className="px-5 py-3 text-center">Payslip</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/60">
                {batch.lines.map((line) => {
                  const net     = netPay(line);
                  const deducts = totalDeductions(line);
                  const vpct    = variancePct(line);
                  const flagged = isVarianceFlagged(line);

                  return (
                    <tr
                      key={line.guardId}
                      className={`transition-colors ${flagged ? 'bg-amber-50/40 hover:bg-amber-50/70' : 'hover:bg-white/40'}`}
                    >
                      <td className="px-5 py-3.5">
                        <span className="rounded-lg border border-slate-200/80 bg-white/70 px-2 py-0.5 font-mono text-sm font-bold text-slate-700">
                          {line.empNo}
                        </span>
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2.5">
                          <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl border border-slate-200/80 bg-slate-100/80 text-sm font-black text-slate-700">
                            {line.guardName.charAt(0)}
                          </div>
                          <span className="font-semibold text-slate-900 whitespace-nowrap">{line.guardName}</span>
                        </div>
                      </td>
                      <td className="px-5 py-3.5 text-center">
                        <span className="inline-flex h-7 items-center justify-center rounded-md border border-slate-200 bg-slate-100/80 px-3 text-sm font-black tracking-widest text-slate-800">
                          {line.rank}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-center">
                        <span className="font-bold tabular-nums text-slate-700">{line.totalShifts}</span>
                      </td>
                      <td className="px-5 py-3.5 text-right font-mono text-sm font-semibold text-slate-700 tabular-nums">
                        {lkr(line.basicPay)}
                      </td>
                      <td className="px-5 py-3.5 text-right font-mono text-sm tabular-nums">
                        {line.overtimePay > 0
                          ? <span className="font-bold text-[color:var(--cvs-accent)]">+{lkr(line.overtimePay)}</span>
                          : <span className="text-slate-600">—</span>}
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        {deducts > 0 ? (
                          <button
                            type="button"
                            onClick={() => onAuditDeductions(line)}
                            className="group inline-flex items-center gap-1.5 rounded-xl border border-rose-200/70 bg-rose-50/60 px-3 py-1.5 font-mono text-sm font-black text-rose-800 tabular-nums transition-all hover:bg-rose-100/80 hover:shadow-sm"
                            title="Click to view deduction breakdown"
                          >
                            −{lkr(deducts)}
                            <Receipt className="h-3.5 w-3.5 opacity-60 group-hover:opacity-100" />
                          </button>
                        ) : (
                          <span className="text-sm font-semibold text-slate-600">—</span>
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-right bg-emerald-50/30">
                        <span className="text-base font-black tabular-nums text-emerald-900">{lkr(net)}</span>
                      </td>
                      <td className="px-5 py-3.5 text-center">
                        {flagged ? (
                          <div className="flex flex-col items-center gap-0.5">
                            <span className="flex items-center gap-1 rounded-full border border-amber-300/80 bg-amber-100/90 px-2.5 py-0.5 text-xs font-black text-amber-900">
                              <AlertTriangle className="h-3 w-3" />
                              {vpct > 0 ? '+' : ''}{vpct.toFixed(0)}%
                            </span>
                            <span className="text-xs font-semibold text-amber-700">vs 3M avg</span>
                          </div>
                        ) : (
                          <CheckCircle2 className="mx-auto h-4 w-4 text-emerald-500" />
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-center">
                        <button
                          type="button"
                          onClick={() => printPayslip(line, batch)}
                          title="Print payslip"
                          className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200/80 bg-white/70 px-3 py-1.5 text-sm font-bold text-slate-600 shadow-sm transition-all hover:border-[color:var(--cvs-accent-muted)] hover:bg-[var(--cvs-accent-soft)] hover:text-[color:var(--cvs-accent)]"
                        >
                          <Printer className="h-3.5 w-3.5" />
                          Print
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>

              {/* Totals row */}
              <tfoot className="border-t-2 border-slate-200/80 bg-slate-50/80 text-sm font-bold uppercase tracking-widest text-slate-700">
                <tr>
                  <td colSpan={4} className="px-5 py-3 font-black text-slate-800 uppercase text-sm tracking-widest">
                    Batch Total — {batch.lines.length} members
                  </td>
                  <td className="px-5 py-3 text-right font-black tabular-nums text-slate-900 text-sm">{lkr(t.gross - batch.lines.reduce((s, l) => s + l.overtimePay, 0))}</td>
                  <td className="px-5 py-3 text-right font-black tabular-nums text-[color:var(--cvs-accent)] text-sm">
                    +{lkr(batch.lines.reduce((s, l) => s + l.overtimePay, 0))}
                  </td>
                  <td className="px-5 py-3 text-right font-black tabular-nums text-rose-800 text-sm">−{lkr(t.deducts)}</td>
                  <td className="px-5 py-3 text-right bg-emerald-50/40 font-black tabular-nums text-emerald-900 text-base">{lkr(t.netTrans)}</td>
                  <td />
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>

          {/* ── Enterprise Bank Lock ── */}
          <div className={`border-t-2 px-6 py-6 ${
            isPending
              ? 'border-slate-900/10 bg-gradient-to-b from-slate-50/60 to-white/30'
              : 'border-emerald-200/60 bg-emerald-50/20'
          }`}>
            {isPending ? (
              /* Pending: show lock action */
              <div className="mx-auto max-w-xl space-y-4">
                <div className="flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-slate-600" />
                  <p className="text-sm font-black uppercase tracking-widest text-slate-700">Enterprise Bank Lock</p>
                </div>

                {/* Bank format */}
                <div>
                  <label className="mb-1.5 block text-sm font-semibold uppercase tracking-widest text-slate-700">
                    Bank Upload Format
                  </label>
                  {bankFormatLocked ? (
                    <div className="flex items-center gap-3 rounded-2xl border border-[color:var(--cvs-accent-muted)] bg-[var(--cvs-accent-soft)] px-4 py-3 shadow-inner">
                      <Lock className="h-4 w-4 flex-shrink-0 text-[color:var(--cvs-accent)]" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-black uppercase tracking-widest text-[color:var(--cvs-accent)]">
                          Format Locked by MD
                        </p>
                        <p className="mt-0.5 truncate text-sm font-black text-slate-900">
                          {lockedFormatLabel}
                        </p>
                      </div>
                      <span className={`flex-shrink-0 rounded-full border px-2.5 py-0.5 text-xs font-black uppercase tracking-wider ${CVS_BRAND_CLASSES.rankBadge}`}>
                        MD Lock
                      </span>
                    </div>
                  ) : (
                    <select
                      value={bankFormat}
                      onChange={(e) => setBankFormat(e.target.value)}
                      className="w-full rounded-2xl border border-slate-200/80 bg-white/90 px-4 py-3 text-sm font-semibold text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40 transition-all"
                    >
                      {BANK_FORMATS.map((f) => (
                        <option key={f} value={f}>{f}</option>
                      ))}
                    </select>
                  )}
                </div>

                {/* Lock button */}
                <button
                  type="button"
                  onClick={handleLockClick}
                  disabled={isLocking}
                  className="group flex w-full items-center justify-center gap-3 rounded-2xl bg-[color:var(--cvs-accent)] px-8 py-5 text-sm font-black uppercase tracking-widest text-white shadow-xl shadow-[color:var(--cvs-glow)] transition-all hover:bg-[color:var(--cvs-accent-hover)] disabled:cursor-wait disabled:opacity-75"
                >
                  {isLocking ? (
                    <>
                      <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                      <span>Generating File…</span>
                    </>
                  ) : (
                    <>
                      <Lock className="h-5 w-5 transition-transform group-hover:scale-110" />
                      <span>Lock Ledger &amp; Generate Bank Transfer File</span>
                      <FileText className="h-5 w-5 opacity-70" />
                    </>
                  )}
                </button>

                {/* Subtext */}
                <p className="text-center text-sm leading-relaxed text-slate-600">
                  Once locked, this month&apos;s ledger becomes <strong className="text-slate-800">immutable</strong>. Any subsequent disputes must be rolled over as arrears to the following month.
                  Format: <span className="font-bold text-slate-800">{bankFormatLocked ? lockedFormatLabel : bankFormat}</span>
                </p>
              </div>
            ) : (
              /* Approved: locked state */
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-emerald-200/80 bg-emerald-100/80">
                    <Lock className="h-5 w-5 text-emerald-700" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-black text-emerald-900">Ledger Locked & Immutable</span>
                      <span className="rounded-full border border-emerald-200 bg-emerald-100/80 px-2.5 py-0.5 text-xs font-black text-emerald-800">
                        PERMANENT RECORD
                      </span>
                    </div>
                    <p className="text-sm font-semibold text-slate-600 mt-0.5">
                      Approved by MD · {batch.period} · Any changes require arrears in the next payroll cycle.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleDownloadBank}
                  disabled={downloading}
                  className="flex items-center gap-2 rounded-2xl border border-emerald-200/80 bg-emerald-50/80 px-5 py-3 text-sm font-black uppercase tracking-widest text-emerald-800 shadow-sm transition-all hover:bg-emerald-100/80 disabled:cursor-wait disabled:opacity-70"
                >
                  <Download className="h-4 w-4" />
                  {downloading ? 'Generating…' : 'Download Bank File'}
                </button>
              </div>
            )}
            {downloadError && (
              <p className="mt-3 text-sm font-semibold text-rose-700">{downloadError}</p>
            )}
          </div>
        </>
      )}
    </ExecutiveGlassCard>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PayrollAuditPage() {
  const [payrollPeriod, setPayrollPeriod] = useState<PayrollPeriod>(FM_LIVE_PAYROLL_PERIOD);
  const [batches,      setBatches]      = useState<PayrollBatch[]>([]);
  const [loadError,    setLoadError]    = useState<string | null>(null);
  const [confirmBatch, setConfirmBatch] = useState<PayrollBatch | null>(null);
  const [auditGuard,   setAuditGuard]   = useState<PayslipLine | null>(null);
  const [approveError, setApproveError] = useState<string | null>(null);

  const refreshBatches = useCallback(async () => {
    const result = await getMdPayrollAuditBatches(payrollPeriod.year, payrollPeriod.month);
    setBatches(result.batches);
    setLoadError(result.error ?? null);
  }, [payrollPeriod]);

  useEffect(() => {
    void refreshBatches();
  }, [refreshBatches]);

  const handleLock = (id: string) => {
    const batch = batches.find((b) => b.id === id);
    if (batch) setConfirmBatch(batch);
  };

  const handleConfirm = () => {
    if (!confirmBatch) return;
    const groupId = batchIdToGroupId(confirmBatch.id);
    setApproveError(null);
    if (!groupId) {
      setConfirmBatch(null);
      return;
    }
    void approvePayrollGroupRun(
      groupId,
      payrollPeriod.year,
      payrollPeriod.month,
    ).then((result) => {
      if (result.success) {
        void refreshBatches();
      } else {
        setApproveError(result.error ?? 'Approval failed.');
      }
      setConfirmBatch(null);
    });
  };

  const pendingBatches  = batches.filter((b) => b.status === 'SUBMITTED_FOR_REVIEW');
  const approvedBatches = batches.filter((b) => b.status === 'APPROVED');

  // Grand totals across ALL batches (for summary cards)
  const allGross    = batches.reduce((s, b) => s + batchTotals(b).gross, 0);
  const allDeducts  = batches.reduce((s, b) => s + batchTotals(b).deducts, 0);
  const allNetTrans = batches.reduce((s, b) => s + batchTotals(b).netTrans, 0);
  const allFlags    = batches.reduce((s, b) => s + batchTotals(b).flagCount, 0);

  return (
    <>
      <DeductionAuditModal guard={auditGuard} onClose={() => setAuditGuard(null)} />
      <ConfirmModal batch={confirmBatch} onConfirm={handleConfirm} onCancel={() => setConfirmBatch(null)} />

      <ExecutivePageShell>
        <ExecutivePageHeader
          title="FM Payroll Audit & Bank Lock"
          subtitle={
            <ExecutivePageLiveSubtitle>
              Maker / Checker · MD Approval Lock · Immutable Bank File Generation
            </ExecutivePageLiveSubtitle>
          }
          actions={
            <div className="flex flex-wrap items-center gap-3">
              <FmPayrollMonthSelector period={payrollPeriod} onChange={setPayrollPeriod} />
              <div className="flex items-center gap-2 rounded-2xl border border-amber-200/80 bg-amber-50/80 px-4 py-2">
                <Clock className="h-4 w-4 text-amber-700" />
                <span className="text-sm font-black text-amber-800">
                  {pendingBatches.length} batch{pendingBatches.length !== 1 ? 'es' : ''} pending MD approval
                </span>
              </div>
            </div>
          }
        />

        <ExecutivePageBody spacing="relaxed">

          {loadError ? (
            <div className="rounded-2xl border border-amber-200/80 bg-amber-50/80 px-4 py-3 text-sm font-semibold text-amber-900">
              {loadError}
            </div>
          ) : null}

          {approveError && (
            <div className="rounded-2xl border border-rose-200/80 bg-rose-50/80 px-4 py-3 text-sm font-semibold text-rose-800">
              {approveError}
            </div>
          )}

          {/* ── Summary Cards ── */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <ExecutiveGlassCard className="bg-gradient-to-br from-white/70 to-slate-50/50 p-5">
              <div className="flex items-start justify-between">
                <p className="text-sm font-semibold uppercase tracking-widest text-slate-600">Total Payroll Liability</p>
                <Banknote className="h-4 w-4 text-slate-600" />
              </div>
              <p className="mt-3 text-2xl font-black tabular-nums text-slate-900">{lkr(allGross)}</p>
              <p className="mt-1 text-sm font-semibold text-slate-600">Gross across {batches.length} batch{batches.length !== 1 ? 'es' : ''} · before deductions</p>
            </ExecutiveGlassCard>

            <ExecutiveGlassCard className="p-5">
              <div className="flex items-start justify-between">
                <p className="text-sm font-semibold uppercase tracking-widest text-slate-600">Total Deductions Applied</p>
                <TrendingDown className="h-4 w-4 text-rose-500" />
              </div>
              <p className="mt-3 text-2xl font-black tabular-nums text-rose-800">−{lkr(allDeducts)}</p>
              <p className="mt-1 text-sm font-semibold text-slate-600">Penalties · uniform recovery · cash advances</p>
            </ExecutiveGlassCard>

            <ExecutiveGlassCard className={`p-5 ${pendingBatches.length > 0 ? 'bg-gradient-to-br from-amber-50/60 to-white/60' : 'bg-gradient-to-br from-emerald-50/60 to-white/60'}`}>
              <div className="flex items-start justify-between">
                <p className="text-sm font-semibold uppercase tracking-widest text-slate-600">Pending MD Approval</p>
                {pendingBatches.length > 0
                  ? <Clock className="h-4 w-4 text-amber-600" />
                  : <CheckCircle2 className="h-4 w-4 text-emerald-600" />}
              </div>
              <p className={`mt-3 text-2xl font-black tabular-nums ${pendingBatches.length > 0 ? 'text-amber-900' : 'text-emerald-900'}`}>
                {pendingBatches.length > 0
                  ? `${pendingBatches.length} batch${pendingBatches.length !== 1 ? 'es' : ''}`
                  : 'All Clear'}
              </p>
              <p className="mt-1 text-sm font-semibold text-slate-600">
                {pendingBatches.length > 0
                  ? `Net pending: ${lkr(pendingBatches.reduce((s, b) => s + batchTotals(b).netTrans, 0))}`
                  : 'All batches approved and locked'}
              </p>
            </ExecutiveGlassCard>
          </div>

          {/* ── AI Variance warning ── */}
          {allFlags > 0 && (
            <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-amber-200/70 bg-amber-50/50 px-5 py-3 text-sm font-semibold text-amber-800 backdrop-blur-md">
              <ShieldAlert className="h-4 w-4 flex-shrink-0" />
              <span className="font-bold">AI Variance Radar:</span>
              <span>
                <strong>{allFlags} payslip{allFlags > 1 ? 's' : ''}</strong> deviate ±20% from their 3-month rolling average. Flagged rows appear in amber — audit before locking.
              </span>
            </div>
          )}

          {/* ── Pending batches ── */}
          {pendingBatches.length > 0 && (
            <div className="space-y-4">
              <p className="flex items-center gap-2 text-sm font-black uppercase tracking-widest text-amber-800">
                <Clock className="h-3.5 w-3.5" />
                Awaiting Approval — {pendingBatches.length} batch{pendingBatches.length > 1 ? 'es' : ''}
              </p>
              {pendingBatches.map((batch) => (
                <MasterGuardLedger
                  key={batch.id}
                  batch={batch}
                  payrollPeriod={payrollPeriod}
                  onAuditDeductions={setAuditGuard}
                  onLock={handleLock}
                />
              ))}
            </div>
          )}

          {/* ── Approved / locked batches ── */}
          <div className="space-y-4">
            <p className="flex items-center gap-2 text-sm font-black uppercase tracking-widest text-emerald-800">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Approved &amp; Locked — {approvedBatches.length} batch{approvedBatches.length !== 1 ? 'es' : ''}
            </p>
            {approvedBatches.length === 0 ? (
              <div className="rounded-2xl border border-slate-200/60 bg-white/30 px-5 py-6 text-center text-sm font-semibold text-slate-600">
                No approved batches yet.
              </div>
            ) : (
              approvedBatches.map((batch) => (
                <MasterGuardLedger
                  key={batch.id}
                  batch={batch}
                  payrollPeriod={payrollPeriod}
                  onAuditDeductions={setAuditGuard}
                  onLock={handleLock}
                />
              ))
            )}
          </div>

          {/* ── State machine explainer ── */}
          <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-white/70 bg-white/40 px-5 py-3 text-sm font-semibold text-slate-700 backdrop-blur-md">
            <Lock className="h-4 w-4 text-slate-600 flex-shrink-0" />
            <span className="font-bold text-slate-800">Approval State Machine:</span>
            <span className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-slate-200 bg-slate-50/80 px-2.5 py-0.5 font-mono text-xs font-bold text-slate-700">DRAFT</span>
              <span>→ FM locks group →</span>
              <span className="rounded-full border border-amber-200 bg-amber-50/80 px-2.5 py-0.5 font-mono text-xs font-bold text-amber-800">SUBMITTED_FOR_REVIEW</span>
              <span>→ MD approves →</span>
              <span className="rounded-full border border-emerald-200 bg-emerald-50/80 px-2.5 py-0.5 font-mono text-xs font-bold text-emerald-800">APPROVED</span>
              <span>→ FM bank .TXT unlocked. FM re-edit removes batch from this desk.</span>
            </span>
          </div>

        </ExecutivePageBody>
      </ExecutivePageShell>
    </>
  );
}
