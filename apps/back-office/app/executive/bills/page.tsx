'use client';

import React, { useState, useMemo, useEffect } from 'react';
import {
  Receipt,
  CheckCircle2,
  XCircle,
  Eye,
  X,
  AlertTriangle,
  Building2,
  Coffee,
  Home,
  Clock,
  TrendingDown,
  Filter,
  ChevronDown,
  Archive,
  Trash2,
  Lock,
  Info,
  Plus,
  Upload,
  Scissors,
  BarChart3,
  Calendar,
} from 'lucide-react';
import { ExecutiveGlassCard } from '../../../components/executive/ExecutiveVaultShell';
import {
  approveExpenseBill,
  fetchExpenseBills,
  rejectExpenseBill,
  submitExpenseBill,
  type ExpenseBillRecord,
} from '../bill-actions';
import { useMonthYear } from '../month-context';

// ─── Types ────────────────────────────────────────────────────────────────────

type BillStatus  = 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED';
type CostCenter  = 'Security' | 'Café' | 'BnB';
type CompanyKey  = 'ALL' | 'Security' | 'Café Tasha' | 'Shalom Residence';

interface Bill extends ExpenseBillRecord {}

interface SplitAllocation {
  Security: number;
  Café: number;
  BnB: number;
}

interface NewBillForm {
  date: string;
  description: string;
  amount: string;
  costCenterMode: 'SINGLE' | 'SPLIT';
  singleCostCenter: CostCenter;
  splitEnabled: { Security: boolean; Café: boolean; BnB: boolean };
  splitAllocations: SplitAllocation;
}

// ─── Business rule constant ───────────────────────────────────────────────────

const PERMANENT_RECORD_THRESHOLD = 30_000;
const RECEIPT_AUTO_PURGE_DAYS    = 60;

const isPermanentRecord = (bill: Bill) => bill.amount > PERMANENT_RECORD_THRESHOLD;

function purgeDate(dateStr: string) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + RECEIPT_AUTO_PURGE_DAYS);
  return d.toLocaleDateString('en-CA');
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function lkr(n: number) {
  if (n >= 1_000_000) return `LKR ${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000)     return `LKR ${(n / 1_000).toFixed(1)}K`;
  return `LKR ${n.toLocaleString()}`;
}

const STATUS_META: Record<BillStatus, { label: string; cls: string }> = {
  PENDING_APPROVAL: { label: 'Pending Approval', cls: 'bg-amber-100/90 text-amber-900 border-amber-200'   },
  APPROVED:         { label: 'Approved',          cls: 'bg-emerald-100/90 text-emerald-900 border-emerald-200' },
  REJECTED:         { label: 'Rejected',          cls: 'bg-rose-100/90    text-rose-900    border-rose-200'   },
};

const COST_CENTER_META: Record<CostCenter, { label: string; company: string; Icon: React.ElementType; cls: string; bar: string }> = {
  Security: { label: 'Security', company: 'Security',          Icon: Building2, cls: 'text-indigo-700 bg-indigo-50/80 border-indigo-200/80', bar: 'bg-indigo-500' },
  Café:     { label: 'Café',     company: 'Café Tasha',        Icon: Coffee,    cls: 'text-amber-700  bg-amber-50/80  border-amber-200/80',   bar: 'bg-amber-500'  },
  BnB:      { label: 'BnB',      company: 'Shalom Residence',  Icon: Home,      cls: 'text-teal-700   bg-teal-50/80   border-teal-200/80',    bar: 'bg-teal-500'   },
};

const COST_CENTERS: CostCenter[] = ['Security', 'Café', 'BnB'];

const COMPANY_TO_CC: Record<CompanyKey, CostCenter | null> = {
  'ALL': null,
  'Security': 'Security',
  'Café Tasha': 'Café',
  'Shalom Residence': 'BnB',
};
const COMPANY_OPTIONS: CompanyKey[] = ['ALL', 'Security', 'Café Tasha', 'Shalom Residence'];

const STATUS_FILTERS: Array<BillStatus | 'ALL'> = ['ALL', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED'];
const STATUS_FILTER_LABELS: Record<BillStatus | 'ALL', string> = {
  ALL: 'All Bills', PENDING_APPROVAL: 'Pending', APPROVED: 'Approved', REJECTED: 'Rejected',
};

const BLANK_FORM: NewBillForm = {
  date: new Date().toISOString().slice(0, 10),
  description: '',
  amount: '',
  costCenterMode: 'SINGLE',
  singleCostCenter: 'Security',
  splitEnabled: { Security: true, Café: false, BnB: false },
  splitAllocations: { Security: 100, Café: 0, BnB: 0 },
};

// ─── Company Filter Dropdown ──────────────────────────────────────────────────

function CompanyFilterDropdown({ value, onChange }: { value: CompanyKey; onChange: (v: CompanyKey) => void }) {
  const [open, setOpen] = useState(false);
  const ICONS: Record<CompanyKey, React.ElementType> = { ALL: Filter, Security: Building2, 'Café Tasha': Coffee, 'Shalom Residence': Home };
  const Icon = ICONS[value];
  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex items-center gap-2 rounded-2xl border border-white/70 bg-white/55 px-4 py-2 text-sm font-bold text-slate-800 shadow-sm backdrop-blur-xl hover:bg-white/70 transition-all">
        <Icon className="h-4 w-4 text-slate-500" />
        <span>{value === 'ALL' ? 'All Companies' : value}</span>
        <ChevronDown className={`h-3.5 w-3.5 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full z-40 mt-1.5 min-w-[180px] overflow-hidden rounded-2xl border border-white/75 bg-white/90 shadow-[0_16px_48px_-12px_rgba(15,23,42,0.18)] backdrop-blur-2xl">
            {COMPANY_OPTIONS.map((opt) => {
              const OptionIcon = ICONS[opt];
              const active = value === opt;
              return (
                <button key={opt} type="button" onClick={() => { onChange(opt); setOpen(false); }} className={`flex w-full items-center gap-2.5 px-4 py-2.5 text-sm font-bold text-left transition-colors ${active ? 'bg-emerald-50/80 text-emerald-900' : 'text-slate-700 hover:bg-slate-50/80'}`}>
                  <OptionIcon className={`h-4 w-4 ${active ? 'text-emerald-700' : 'text-slate-400'}`} />
                  {opt === 'ALL' ? 'All Companies' : opt}
                  {active && <CheckCircle2 className="ml-auto h-3.5 w-3.5 text-emerald-600" />}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Date Range Filter ────────────────────────────────────────────────────────

function DateRangeFilter({
  from, to, onFrom, onTo,
}: { from: string; to: string; onFrom: (v: string) => void; onTo: (v: string) => void }) {
  const inputCls = 'rounded-xl border border-white/70 bg-white/55 px-3 py-2 text-xs font-semibold text-slate-800 shadow-sm backdrop-blur-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/40 transition-all cursor-pointer';
  return (
    <div className="flex items-center gap-2 rounded-2xl border border-white/70 bg-white/55 px-3 py-2 shadow-sm backdrop-blur-xl">
      <Calendar className="h-3.5 w-3.5 flex-shrink-0 text-slate-400" />
      <input type="date" value={from} onChange={(e) => onFrom(e.target.value)} className={inputCls} />
      <span className="text-[10px] font-bold text-slate-400">→</span>
      <input type="date" value={to}   onChange={(e) => onTo(e.target.value)}   className={inputCls} />
    </div>
  );
}

// ─── Receipt Modal ────────────────────────────────────────────────────────────

function ReceiptModal({ bill, onClose }: { bill: Bill | null; onClose: () => void }) {
  if (!bill) return null;
  const cc        = COST_CENTER_META[bill.costCenter];
  const permanent = isPermanentRecord(bill);
  const purge     = permanent ? null : purgeDate(bill.date);
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="relative w-full max-w-sm overflow-hidden rounded-3xl border border-white/75 bg-[#eef2f6] shadow-[0_32px_80px_-16px_rgba(15,23,42,0.35)] backdrop-blur-2xl" onClick={(e) => e.stopPropagation()}>
        <div aria-hidden className="pointer-events-none absolute -top-16 right-0 h-48 w-48 rounded-full bg-emerald-400/20 blur-[72px]" />
        <div className="relative p-6">
          <div className="mb-5 flex items-start justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Bill Receipt — {bill.id}</p>
              <h3 className="mt-0.5 text-lg font-black text-slate-900">{bill.description}</h3>
            </div>
            <button type="button" onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200/80 bg-white/70 text-slate-500 hover:text-slate-900 transition-colors"><X className="h-4 w-4" /></button>
          </div>
          <ExecutiveGlassCard className="flex flex-col items-center justify-center gap-3 py-12">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-slate-200/80 bg-slate-100/80"><Receipt className="h-7 w-7 text-slate-400" /></div>
            <p className="text-xs font-semibold text-slate-500">Physical receipt photo</p>
            <p className="text-[10px] text-slate-400">Uploaded by {bill.submittedBy}</p>
          </ExecutiveGlassCard>
          {permanent ? (
            <div className="mt-3 flex items-center gap-2 rounded-xl border border-violet-200/80 bg-violet-50/60 px-3 py-2 text-[10px] text-violet-900 font-semibold">
              <Lock className="h-3.5 w-3.5 flex-shrink-0 text-violet-700" />
              <span><strong>Permanent Record</strong> — Receipt retained indefinitely. Bill exceeds {lkr(PERMANENT_RECORD_THRESHOLD)} threshold.</span>
            </div>
          ) : (
            <div className="mt-3 flex items-center gap-2 rounded-xl border border-slate-200/80 bg-slate-50/60 px-3 py-2 text-[10px] text-slate-600 font-semibold">
              <Trash2 className="h-3.5 w-3.5 flex-shrink-0 text-slate-400" />
              <span>Receipt auto-deletes on <strong>{purge}</strong> ({RECEIPT_AUTO_PURGE_DAYS}-day rule).</span>
            </div>
          )}
          <div className="mt-4 grid grid-cols-2 gap-3">
            <ExecutiveGlassCard className="p-3"><p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Amount</p><p className="mt-1 text-lg font-black tabular-nums text-slate-900">{lkr(bill.amount)}</p></ExecutiveGlassCard>
            <ExecutiveGlassCard className="p-3"><p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Cost Centre</p><div className={`mt-1 inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-xs font-bold ${cc.cls}`}><cc.Icon className="h-3 w-3" />{bill.costCenter}</div></ExecutiveGlassCard>
            <ExecutiveGlassCard className="p-3"><p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Submitted By</p><p className="mt-1 text-sm font-bold text-slate-900">{bill.submittedBy}</p></ExecutiveGlassCard>
            <ExecutiveGlassCard className="p-3"><p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Date</p><p className="mt-1 text-sm font-bold text-slate-900">{bill.date}</p></ExecutiveGlassCard>
          </div>
          <button type="button" onClick={onClose} className="mt-4 w-full rounded-xl border border-slate-200 bg-white/70 py-2.5 text-sm font-bold text-slate-700 hover:bg-white/90 transition-all">Close</button>
        </div>
      </div>
    </div>
  );
}

// ─── Submit Bill Modal ────────────────────────────────────────────────────────

function SubmitBillModal({
  open,
  onClose,
  onSubmit,
  activeLabel,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (form: NewBillForm) => void;
  activeLabel: string;
}) {
  const [form, setForm]       = useState<NewBillForm>(BLANK_FORM);
  const [fileHover, setFileHover] = useState(false);
  const [fileName, setFileName]   = useState<string | null>(null);

  const set = <K extends keyof NewBillForm>(k: K, v: NewBillForm[K]) =>
    setForm((p) => ({ ...p, [k]: v }));

  const setSplitAlloc = (cc: CostCenter, val: number) =>
    setForm((p) => ({ ...p, splitAllocations: { ...p.splitAllocations, [cc]: val } }));

  const setSplitEnabled = (cc: CostCenter, val: boolean) =>
    setForm((p) => ({ ...p, splitEnabled: { ...p.splitEnabled, [cc]: val } }));

  const activeCCs = COST_CENTERS.filter((cc) => form.splitEnabled[cc]);

  const allocTotal = activeCCs.reduce((s, cc) => s + (form.splitAllocations[cc] || 0), 0);
  const allocValid = allocTotal === 100 && activeCCs.length > 0;

  const canSubmit =
    form.date &&
    form.description.trim() &&
    parseFloat(form.amount) > 0 &&
    (form.costCenterMode === 'SINGLE' || allocValid);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    onSubmit(form);
    setForm(BLANK_FORM);
    setFileName(null);
    onClose();
  };

  const inputCls = 'w-full rounded-xl border border-slate-200 bg-white/95 px-3 py-2 text-sm font-semibold text-slate-900 shadow-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 transition-all';
  const labelCls = 'mb-1 block text-[10px] font-bold uppercase tracking-widest text-slate-600';

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        className="relative w-full max-w-xl max-h-[92vh] overflow-y-auto rounded-3xl border border-white/75 bg-[#eef2f6] shadow-[0_32px_80px_-16px_rgba(15,23,42,0.35)] backdrop-blur-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div aria-hidden className="pointer-events-none absolute -top-20 right-0 h-64 w-64 rounded-full bg-emerald-400/18 blur-[80px]" />

        <div className="relative p-6">
          {/* Header */}
          <div className="mb-6 flex items-start justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                Accounts Payable · {activeLabel}
              </p>
              <h2 className="mt-0.5 text-xl font-black uppercase tracking-tight text-slate-900">
                Submit New Bill
              </h2>
              <p className="text-xs text-slate-500">MD / OD / Executive Admin only</p>
            </div>
            <button type="button" onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200/80 bg-white/70 text-slate-500 hover:text-slate-900 transition-colors">
              <X className="h-4 w-4" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">

            {/* Date + Description */}
            <ExecutiveGlassCard className="p-5">
              <p className="mb-4 text-[10px] font-bold uppercase tracking-widest text-indigo-800">Bill Details</p>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className={labelCls}>Date</label>
                  <input type="date" value={form.date} onChange={(e) => set('date', e.target.value)} className={inputCls} required />
                </div>
                <div>
                  <label className={labelCls}>Amount (LKR)</label>
                  <div className="relative">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[10px] font-mono text-slate-400">LKR</span>
                    <input type="number" min="0" step="0.01" placeholder="0.00" value={form.amount} onChange={(e) => set('amount', e.target.value)} className={`${inputCls} pl-10`} required />
                  </div>
                  {parseFloat(form.amount) > PERMANENT_RECORD_THRESHOLD && (
                    <p className="mt-1 flex items-center gap-1 text-[10px] font-bold text-violet-700">
                      <Lock className="h-2.5 w-2.5" />
                      Exceeds LKR 30K — receipt will be retained permanently.
                    </p>
                  )}
                </div>
                <div className="sm:col-span-2">
                  <label className={labelCls}>Description</label>
                  <input type="text" placeholder="e.g. Shalom — Monthly Electricity (CEB)" value={form.description} onChange={(e) => set('description', e.target.value)} className={inputCls} required />
                </div>
              </div>
            </ExecutiveGlassCard>

            {/* Receipt Upload Zone */}
            <ExecutiveGlassCard className="overflow-hidden">
              <div
                onDragOver={(e) => { e.preventDefault(); setFileHover(true); }}
                onDragLeave={() => setFileHover(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setFileHover(false);
                  const f = e.dataTransfer.files[0];
                  if (f) setFileName(f.name);
                }}
                className={`flex flex-col items-center justify-center gap-3 py-8 transition-all ${fileHover ? 'bg-emerald-50/60' : ''}`}
              >
                <div className={`flex h-12 w-12 items-center justify-center rounded-2xl border transition-all ${fileHover ? 'border-emerald-300 bg-emerald-100/80' : 'border-slate-200/80 bg-slate-100/80'}`}>
                  <Upload className={`h-6 w-6 transition-colors ${fileHover ? 'text-emerald-700' : 'text-slate-400'}`} />
                </div>
                <div className="text-center">
                  <p className="text-xs font-bold text-slate-700">
                    {fileName ? fileName : 'Drag receipt photo here or'}
                  </p>
                  {!fileName && (
                    <label className="mt-1 cursor-pointer text-[10px] font-bold text-emerald-700 underline underline-offset-2">
                      click to upload
                      <input type="file" accept="image/*" className="sr-only" onChange={(e) => { if (e.target.files?.[0]) setFileName(e.target.files[0].name); }} />
                    </label>
                  )}
                  {fileName && (
                    <button type="button" onClick={() => setFileName(null)} className="mt-1 text-[10px] font-bold text-rose-600 underline">remove</button>
                  )}
                </div>
                <p className="text-[9px] text-slate-400">JPG, PNG or PDF · max 10 MB</p>
              </div>
            </ExecutiveGlassCard>

            {/* Cost Center Allocation */}
            <ExecutiveGlassCard className="p-5">
              <div className="mb-4 flex items-center justify-between">
                <p className="text-[10px] font-bold uppercase tracking-widest text-rose-800">Cost Centre Allocation</p>
                {/* Split toggle */}
                <button
                  type="button"
                  onClick={() => set('costCenterMode', form.costCenterMode === 'SINGLE' ? 'SPLIT' : 'SINGLE')}
                  className={`flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-[10px] font-bold transition-all ${
                    form.costCenterMode === 'SPLIT'
                      ? 'border-rose-200/80 bg-rose-50/80 text-rose-800'
                      : 'border-slate-200/80 bg-white/70 text-slate-600 hover:bg-white/90'
                  }`}
                >
                  <Scissors className="h-3 w-3" />
                  {form.costCenterMode === 'SPLIT' ? 'Split Active' : 'Split Bill'}
                </button>
              </div>

              {form.costCenterMode === 'SINGLE' ? (
                /* Single company selector */
                <div className="grid grid-cols-3 gap-2">
                  {COST_CENTERS.map((cc) => {
                    const meta = COST_CENTER_META[cc];
                    const active = form.singleCostCenter === cc;
                    return (
                      <button
                        key={cc}
                        type="button"
                        onClick={() => set('singleCostCenter', cc)}
                        className={`flex flex-col items-center gap-2 rounded-2xl border py-3 transition-all ${
                          active
                            ? `${meta.cls} shadow-md`
                            : 'border-slate-200/60 bg-white/40 hover:bg-white/70 text-slate-600'
                        }`}
                      >
                        <meta.Icon className={`h-5 w-5 ${active ? '' : 'text-slate-400'}`} />
                        <span className={`text-xs font-black ${active ? '' : 'text-slate-600'}`}>{meta.company}</span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                /* Split allocation matrix */
                <div className="space-y-3">
                  <p className="text-[10px] text-slate-500">Check companies and assign percentages. Must total exactly 100%.</p>
                  {COST_CENTERS.map((cc) => {
                    const meta    = COST_CENTER_META[cc];
                    const enabled = form.splitEnabled[cc];
                    const pct     = form.splitAllocations[cc] || 0;
                    return (
                      <div key={cc} className={`rounded-2xl border p-3 transition-all ${enabled ? `${meta.cls} border-opacity-80` : 'border-slate-200/60 bg-white/30'}`}>
                        <div className="flex items-center gap-3">
                          {/* Checkbox */}
                          <button
                            type="button"
                            onClick={() => setSplitEnabled(cc, !enabled)}
                            className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-md border-2 transition-all ${enabled ? 'border-current bg-current' : 'border-slate-300 bg-white'}`}
                          >
                            {enabled && <CheckCircle2 className="h-3 w-3 text-white" />}
                          </button>

                          <meta.Icon className={`h-4 w-4 flex-shrink-0 ${enabled ? '' : 'text-slate-400'}`} />
                          <span className={`flex-1 text-xs font-bold ${enabled ? '' : 'text-slate-500'}`}>{meta.company}</span>

                          {/* Percentage input */}
                          <div className="flex items-center gap-1">
                            <input
                              type="number"
                              min={0}
                              max={100}
                              disabled={!enabled}
                              value={enabled ? pct : ''}
                              onChange={(e) => setSplitAlloc(cc, parseInt(e.target.value) || 0)}
                              placeholder="0"
                              className="w-16 rounded-lg border border-current/30 bg-white/80 px-2 py-1 text-center text-sm font-black text-current placeholder:text-slate-300 focus:outline-none focus:ring-1 focus:ring-current/40 disabled:opacity-30 transition-all"
                            />
                            <span className={`text-sm font-bold ${enabled ? '' : 'text-slate-400'}`}>%</span>
                          </div>
                        </div>

                        {/* Progress bar */}
                        {enabled && (
                          <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-current/10">
                            <div className={`h-full rounded-full ${meta.bar} transition-all`} style={{ width: `${Math.min(pct, 100)}%` }} />
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {/* Total indicator */}
                  <div className={`flex items-center justify-between rounded-xl border px-3 py-2 text-xs font-bold ${
                    allocTotal === 100 ? 'border-emerald-200/80 bg-emerald-50/70 text-emerald-800'
                    : allocTotal > 100  ? 'border-rose-200/80   bg-rose-50/70   text-rose-800 animate-pulse'
                    :                    'border-amber-200/80  bg-amber-50/70  text-amber-800'
                  }`}>
                    <span className="flex items-center gap-1.5">
                      <BarChart3 className="h-3.5 w-3.5" />
                      Allocation Total
                    </span>
                    <span className="text-base font-black tabular-nums">{allocTotal}%</span>
                  </div>

                  {allocTotal !== 100 && activeCCs.length > 0 && (
                    <p className="text-[10px] font-semibold text-amber-700">
                      {allocTotal > 100 ? `Over-allocated by ${allocTotal - 100}%` : `Remaining ${100 - allocTotal}% unallocated`}. Adjust percentages to total exactly 100%.
                    </p>
                  )}
                </div>
              )}
            </ExecutiveGlassCard>

            {/* EBITDA impact note */}
            <div className="flex items-start gap-2.5 rounded-2xl border border-emerald-200/70 bg-emerald-50/50 px-4 py-3 text-[11px] text-emerald-800 backdrop-blur-md">
              <Info className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-emerald-600" />
              <span>
                Once the MD <strong>approves</strong> this bill, the amount will be automatically deducted from the selected {form.costCenterMode === 'SPLIT' ? "companies'" : "company's"} <strong>Net EBITDA</strong> in the 3-Company Monetary Health Dashboard for <strong>{activeLabel}</strong>.
              </span>
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-1">
              <button type="button" onClick={onClose} className="flex-1 rounded-xl border border-slate-200 bg-white/70 py-3 text-sm font-bold text-slate-700 hover:bg-white/90 transition-all">Cancel</button>
              <button
                type="submit"
                disabled={!canSubmit}
                className="flex-[2] rounded-xl bg-emerald-600 py-3 text-sm font-bold uppercase tracking-widest text-white shadow-lg shadow-emerald-600/25 hover:bg-emerald-500 transition-all disabled:cursor-not-allowed disabled:opacity-40"
              >
                Submit for MD Approval
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AccountsPayablePage() {
  const { label: activeLabel } = useMonthYear();
  const now = new Date();
  const defaultFrom = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  const defaultTo = now.toISOString().slice(0, 10);

  const [bills, setBills]               = useState<Bill[]>([]);
  const [loadError, setLoadError]       = useState<string | null>(null);
  const [billsLoading, setBillsLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<BillStatus | 'ALL'>('ALL');
  const [companyFilter, setCompanyFilter] = useState<CompanyKey>('ALL');
  const [dateFrom, setDateFrom]           = useState(defaultFrom);
  const [dateTo,   setDateTo]             = useState(defaultTo);
  const [receiptBill, setReceiptBill]     = useState<Bill | null>(null);
  const [submitOpen, setSubmitOpen]       = useState(false);
  const [showStorageInfo, setShowStorageInfo] = useState(false);

  const refreshBills = async () => {
    setBillsLoading(true);
    const result = await fetchExpenseBills();
    setBills(result.bills);
    setLoadError(result.error ?? null);
    setBillsLoading(false);
  };

  useEffect(() => {
    void refreshBills();
  }, []);

  const pending       = bills.filter((b) => b.status === 'PENDING_APPROVAL');
  const totalApproved = bills.filter((b) => b.status === 'APPROVED').reduce((s, b) => s + b.amount, 0);

  const visible = useMemo(() => {
    const cc = COMPANY_TO_CC[companyFilter];
    return bills.filter((b) => {
      const passCompany = cc === null || b.costCenter === cc;
      const passStatus  = statusFilter === 'ALL' || b.status === statusFilter;
      const passDate    = (!dateFrom || b.date >= dateFrom) && (!dateTo || b.date <= dateTo);
      return passCompany && passStatus && passDate;
    });
  }, [bills, companyFilter, statusFilter, dateFrom, dateTo]);

  const filteredPending = useMemo(() => {
    const cc = COMPANY_TO_CC[companyFilter];
    return bills.filter((b) => b.status === 'PENDING_APPROVAL' && (cc === null || b.costCenter === cc));
  }, [bills, companyFilter]);

  const approve = (id: string) => {
    void approveExpenseBill(id).then((result) => {
      if (result.success) void refreshBills();
    });
  };

  const reject = (id: string) => {
    void rejectExpenseBill(id).then((result) => {
      if (result.success) void refreshBills();
    });
  };

  const handleNewBill = (form: NewBillForm) => {
    const isSplit = form.costCenterMode === 'SPLIT';
    const enabledCCs = COST_CENTERS.filter((cc) => form.splitEnabled[cc]);
    const primaryCC: CostCenter = isSplit
      ? (enabledCCs[0] ?? 'Security')
      : form.singleCostCenter;

    const newBill: Bill = {
      id: `B${String(Date.now()).slice(-4)}`,
      date:        form.date,
      submittedBy: 'Executive Admin',
      costCenter:  primaryCC,
      description: form.description,
      amount:      parseFloat(form.amount) || 0,
      receiptUrl:  '',
      status:      'PENDING_APPROVAL',
      isSplit,
      splitAllocations: isSplit
        ? Object.fromEntries(enabledCCs.map((cc) => [cc, form.splitAllocations[cc]])) as Partial<Record<CostCenter, number>>
        : undefined,
    };
    void submitExpenseBill({
      date: newBill.date,
      description: newBill.description,
      amount: newBill.amount,
      costCenter: newBill.costCenter,
      submittedBy: newBill.submittedBy,
      isSplit: newBill.isSplit,
      splitAllocations: newBill.splitAllocations,
    }).then((result) => {
      if (result.success) {
        setSubmitOpen(false);
        void refreshBills();
      }
    });
  };

  return (
    <>
      <ReceiptModal bill={receiptBill} onClose={() => setReceiptBill(null)} />
      <SubmitBillModal open={submitOpen} onClose={() => setSubmitOpen(false)} onSubmit={handleNewBill} activeLabel={activeLabel} />

      <div className="w-full flex-grow flex flex-col pb-12 font-sans">

        {/* ── Header ── */}
        <header className="sticky top-0 z-40 border-b border-white/60 bg-white/45 px-6 md:px-12 2xl:px-24 py-4 shadow-[0_8px_32px_-12px_rgba(15,23,42,0.08)] backdrop-blur-xl backdrop-saturate-150">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl md:text-3xl font-black text-slate-900 uppercase tracking-tight">Accounts Payable</h1>
              <p className="text-sm font-bold text-slate-500 uppercase tracking-widest mt-1">
                OpEx & Bills Ledger · Execution Lock · {activeLabel}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {/* Company Filter */}
              <CompanyFilterDropdown value={companyFilter} onChange={setCompanyFilter} />
              {/* Date Range */}
              <DateRangeFilter from={dateFrom} to={dateTo} onFrom={setDateFrom} onTo={setDateTo} />
              {/* Submit button */}
              <button
                type="button"
                onClick={() => setSubmitOpen(true)}
                className="flex items-center gap-2 rounded-2xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white shadow-lg shadow-emerald-600/25 hover:bg-emerald-500 transition-all"
              >
                <Plus className="h-4 w-4" />
                Submit Bill
              </button>
            </div>
          </div>
        </header>

        <div className="px-6 md:px-12 2xl:px-24 space-y-6 pt-8">

          {loadError ? (
            <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">
              {loadError}
            </p>
          ) : null}
          {billsLoading ? (
            <p className="text-sm font-semibold text-slate-500">Loading bills from Supabase…</p>
          ) : null}

          {/* ── Summary Cards ── */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <ExecutiveGlassCard className="bg-gradient-to-br from-white/70 to-amber-50/50 p-5">
              <div className="flex items-start justify-between">
                <span className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-slate-600">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.8)]" />
                  Total Pending OpEx
                </span>
                <AlertTriangle className="h-4 w-4 text-amber-600" />
              </div>
              <p className="mt-3 text-3xl font-black tabular-nums text-amber-900">
                {lkr(filteredPending.reduce((s, b) => s + b.amount, 0))}
              </p>
              <p className="mt-1 text-xs font-semibold text-amber-700">
                {filteredPending.length} bill{filteredPending.length !== 1 ? 's' : ''} awaiting MD approval
                {companyFilter !== 'ALL' && ` · ${companyFilter}`}
              </p>
            </ExecutiveGlassCard>

            <ExecutiveGlassCard className="bg-gradient-to-br from-white/70 to-emerald-50/50 p-5">
              <div className="flex items-start justify-between">
                <span className="text-[10px] font-bold uppercase tracking-widest text-slate-600">Approved This Period</span>
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              </div>
              <p className="mt-3 text-3xl font-black tabular-nums text-emerald-900">{lkr(totalApproved)}</p>
              <p className="mt-1 text-xs font-semibold text-emerald-700">{bills.filter((b) => b.status === 'APPROVED').length} bills released to FM</p>
            </ExecutiveGlassCard>

            <ExecutiveGlassCard className="p-5">
              <div className="flex items-start justify-between">
                <span className="text-[10px] font-bold uppercase tracking-widest text-slate-600">Total Bill Volume</span>
                <TrendingDown className="h-4 w-4 text-slate-400" />
              </div>
              <p className="mt-3 text-3xl font-black tabular-nums text-slate-900">{lkr(bills.reduce((s, b) => s + b.amount, 0))}</p>
              <p className="mt-1 text-xs text-slate-500">{bills.length} submissions total</p>
            </ExecutiveGlassCard>
          </div>

          {/* ── Storage Optimization Rule Banner ── */}
          <div className="rounded-2xl border border-violet-200/70 bg-violet-50/50 px-5 py-3 backdrop-blur-md">
            <button type="button" onClick={() => setShowStorageInfo((v) => !v)} className="flex w-full items-center gap-3 text-left">
              <Archive className="h-4 w-4 flex-shrink-0 text-violet-700" />
              <span className="flex-1 text-xs font-bold text-violet-900">Storage Optimization Rule Active</span>
              <span className="flex items-center gap-1.5 rounded-full border border-violet-200/80 bg-white/60 px-2.5 py-0.5 text-[10px] font-bold text-violet-800"><Lock className="h-2.5 w-2.5" />&gt;LKR 30K = Permanent</span>
              <span className="flex items-center gap-1.5 rounded-full border border-slate-200/80 bg-white/60 px-2.5 py-0.5 text-[10px] font-semibold text-slate-600"><Trash2 className="h-2.5 w-2.5" />≤LKR 30K = 60-day purge</span>
              <Info className={`h-4 w-4 text-violet-500 transition-transform ${showStorageInfo ? 'rotate-180' : ''}`} />
            </button>
            {showStorageInfo && (
              <div className="mt-3 space-y-1.5 border-t border-violet-200/60 pt-3 text-[11px] text-violet-800">
                <p><strong>Rule:</strong> All receipt photos are automatically deleted <strong>{RECEIPT_AUTO_PURGE_DAYS} days</strong> after upload to conserve server storage.</p>
                <p><strong>Exception:</strong> Bills exceeding <strong>LKR {PERMANENT_RECORD_THRESHOLD.toLocaleString()}</strong> are retained indefinitely for audit compliance and are exempt from the auto-purge schedule.</p>
              </div>
            )}
          </div>

          {/* ── Status Filter tabs ── */}
          <div className="flex items-center gap-2">
            <Filter className="h-3.5 w-3.5 text-slate-400" />
            <div className="flex items-center gap-1 rounded-2xl border border-white/70 bg-white/50 p-1 shadow-inner backdrop-blur-xl">
              {STATUS_FILTERS.map((f) => (
                <button key={f} type="button" onClick={() => setStatusFilter(f)} className={`rounded-xl px-3 py-1.5 text-xs font-bold transition-all ${statusFilter === f ? 'bg-white shadow-md text-slate-900 ring-1 ring-slate-900/10' : 'text-slate-500 hover:text-slate-800'}`}>
                  {STATUS_FILTER_LABELS[f]}
                  {f === 'PENDING_APPROVAL' && pending.length > 0 && (
                    <span className="ml-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-500 px-1 text-[9px] font-black text-white">{pending.length}</span>
                  )}
                </button>
              ))}
            </div>
            <span className="ml-auto text-[10px] text-slate-400">
              {dateFrom} → {dateTo}
            </span>
          </div>

          {/* ── Inbound Bill Queue ── */}
          <ExecutiveGlassCard className="overflow-hidden">
            <div className="border-b border-slate-200/80 bg-slate-50/80 px-5 py-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-800 uppercase">Inbound Bill Queue</h2>
              <span className="text-[10px] text-slate-500">{visible.length} entries</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-200/80 bg-slate-50/60">
                  <tr>
                    <th className="px-5 py-5 text-xs font-bold text-slate-500 uppercase tracking-wider">Date</th>
                    <th className="px-5 py-5 text-xs font-bold text-slate-500 uppercase tracking-wider">Description</th>
                    <th className="px-5 py-5 text-xs font-bold text-slate-500 uppercase tracking-wider">Submitted By</th>
                    <th className="px-5 py-5 text-xs font-bold text-slate-500 uppercase tracking-wider">Cost Centre</th>
                    <th className="px-5 py-5 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Amount</th>
                    <th className="px-5 py-5 text-xs font-bold text-slate-500 uppercase tracking-wider">Receipt</th>
                    <th className="px-5 py-5 text-xs font-bold text-slate-500 uppercase tracking-wider">Status</th>
                    <th className="px-5 py-5 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200/60">
                  {visible.length === 0 ? (
                    <tr><td colSpan={8} className="px-5 py-10 text-center text-sm text-slate-500">No bills match the current filters.</td></tr>
                  ) : (
                    visible.map((bill) => {
                      const cc        = COST_CENTER_META[bill.costCenter];
                      const st        = STATUS_META[bill.status];
                      const isPending = bill.status === 'PENDING_APPROVAL';
                      const permanent = isPermanentRecord(bill);
                      return (
                        <tr key={bill.id} className={`transition-colors hover:bg-white/40 ${isPending ? 'bg-amber-50/20' : ''}`}>
                          <td className="px-5 py-6 text-sm font-medium text-slate-800 font-mono whitespace-nowrap">{bill.date}</td>

                          <td className="px-5 py-6 text-sm font-medium text-slate-800 max-w-[200px]">
                            <div className="flex items-start gap-1.5">
                              {bill.isSplit && (
                                <span title="Split bill across companies" className="mt-0.5 flex-shrink-0 rounded-md border border-rose-200/80 bg-rose-50/80 px-1 py-0.5 text-[8px] font-black text-rose-700">
                                  SPLIT
                                </span>
                              )}
                              <div>
                                <p className="font-semibold text-slate-900 leading-tight">{bill.description}</p>
                                <p className="text-[10px] text-slate-400 font-mono">{bill.id}</p>
                                {bill.isSplit && bill.splitAllocations && (
                                  <div className="mt-1 flex flex-wrap gap-1">
                                    {(Object.entries(bill.splitAllocations) as [CostCenter, number][]).map(([cc2, pct]) => (
                                      <span key={cc2} className={`inline-flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-[8px] font-bold ${COST_CENTER_META[cc2].cls}`}>
                                        {cc2} {pct}%
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>
                          </td>

                          <td className="px-5 py-6 text-sm font-medium text-slate-800 whitespace-nowrap">{bill.submittedBy}</td>

                          <td className="px-5 py-6 text-sm font-medium text-slate-800">
                            <span className={`inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-[10px] font-bold ${cc.cls}`}>
                              <cc.Icon className="h-3 w-3" />
                              {bill.costCenter}
                            </span>
                          </td>

                          <td className="px-5 py-6 text-sm font-medium text-slate-800 text-right whitespace-nowrap">
                            <p className="font-black tabular-nums text-slate-900">{lkr(bill.amount)}</p>
                            {permanent ? (
                              <span title="Bill exceeds LKR 30,000 — receipt retained permanently" className="mt-1 inline-flex items-center gap-1 rounded-full border border-violet-300/80 bg-violet-100/80 px-2 py-0.5 text-[9px] font-black text-violet-900">
                                <Lock className="h-2 w-2" />Permanent
                              </span>
                            ) : (
                              <span title={`Receipt auto-deletes on ${purgeDate(bill.date)}`} className="mt-1 inline-flex items-center gap-1 rounded-full border border-slate-200/80 bg-slate-100/60 px-2 py-0.5 text-[9px] font-semibold text-slate-400">
                                <Trash2 className="h-2 w-2" />60d purge
                              </span>
                            )}
                          </td>

                          <td className="px-5 py-6 text-sm font-medium text-slate-800">
                            <button type="button" onClick={() => setReceiptBill(bill)} className="flex items-center gap-1.5 rounded-lg border border-slate-200/80 bg-white/70 px-2.5 py-1.5 text-[10px] font-bold text-slate-700 shadow-sm hover:bg-white transition-all">
                              <Eye className="h-3 w-3" />View
                            </button>
                          </td>

                          <td className="px-5 py-6 text-sm font-medium text-slate-800 whitespace-nowrap">
                            <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10px] font-bold ${st.cls}`}>
                              {bill.status === 'PENDING_APPROVAL' && <Clock className="h-2.5 w-2.5" />}
                              {bill.status === 'APPROVED'         && <CheckCircle2 className="h-2.5 w-2.5" />}
                              {bill.status === 'REJECTED'         && <XCircle className="h-2.5 w-2.5" />}
                              {st.label}
                            </span>
                          </td>

                          <td className="px-5 py-6 text-sm font-medium text-slate-800 text-right whitespace-nowrap">
                            {isPending ? (
                              <div className="flex items-center justify-end gap-2">
                                <button type="button" onClick={() => reject(bill.id)} className="rounded-lg border border-rose-200/80 bg-rose-50/80 px-3 py-1.5 text-[10px] font-bold text-rose-800 hover:bg-rose-100/80 transition-all">Reject</button>
                                <button type="button" onClick={() => approve(bill.id)} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-[10px] font-bold text-white shadow-md shadow-emerald-600/25 hover:bg-emerald-500 transition-all"><CheckCircle2 className="h-3 w-3" />Approve for Payment</button>
                              </div>
                            ) : (
                              <span className="text-[10px] text-slate-400">
                                {bill.status === 'APPROVED' ? `Released ${bill.approvedAt ? new Date(bill.approvedAt).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }) : ''}` : 'Declined'}
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </ExecutiveGlassCard>

          {/* ── Footer banners ── */}
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-amber-200/70 bg-amber-50/50 px-5 py-3 text-xs text-amber-800 backdrop-blur-md">
              <AlertTriangle className="h-4 w-4 flex-shrink-0" />
              <span className="font-bold">Execution Lock Active:</span>
              <span>Bills remain <code className="rounded bg-amber-100 px-1 font-mono text-[10px]">PENDING_APPROVAL</code> until the MD clicks Approve. Only then does the row unlock on the FM's portal for fund release.</span>
            </div>
            <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200/70 bg-white/40 px-5 py-3 text-xs text-slate-600 backdrop-blur-md">
              <Archive className="h-4 w-4 flex-shrink-0 text-slate-400" />
              <span className="font-bold text-slate-700">Storage Policy:</span>
              <span>Receipt photos are auto-deleted after <strong>{RECEIPT_AUTO_PURGE_DAYS} days</strong>.</span>
              <span className="inline-flex items-center gap-1 rounded-full border border-violet-200/80 bg-violet-50/70 px-2 py-0.5 text-[10px] font-bold text-violet-800"><Lock className="h-2.5 w-2.5" />Permanent</span>
              <span>badge = exceeds LKR 30,000 threshold → retained permanently for audit compliance.</span>
            </div>
          </div>

        </div>
      </div>
    </>
  );
}
