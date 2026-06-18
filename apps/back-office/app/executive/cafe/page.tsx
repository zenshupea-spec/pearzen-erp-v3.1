'use client';

import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import {
  Coffee,
  User,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Camera,
  Clock,
  X,
  Trash2,
  TrendingDown,
  TrendingUp,
  Eye,
  ShieldAlert,
  Zap,
  ChevronDown,
  ChevronUp,
  Package,
  FlaskConical,
  BadgeAlert,
  Gavel,
  CalendarDays,
  Info,
  ChevronLeft,
  ChevronRight,
  VideoOff,
  ChefHat,
  Utensils,
  Layers,
  Truck,
  ShoppingCart,
  Plus,
} from 'lucide-react';
import { ExecutiveGlassCard } from '../../../components/executive/ExecutiveVaultShell';
import { isCafeHubView } from '../../../lib/hq-hub';
import {
  fetchExecutiveSessionProfile,
  type ExecutiveSessionProfile,
} from '../actions';
import {
  getCafeDashboard,
  getCafeLaborRoster,
  getCafeStaffDayLogs,
  issueCafeFine,
  saveCafeDashboard,
  updateCafeStaffDayLog,
  type CafeDashboardPayload,
  type CafeLaborRosterMember,
  type CafeStaffDayLog,
} from './actions';
import { calcPayrollCostLkr } from './cafe-cost-utils';
import { formatPeriodMonthLabel, normalizePeriodMonth } from './period-month';
import {
  getMenuKitchenTrackKind,
  reconcilePrepWithMenu,
  removeMenuFromKitchenTrack,
  setMenuKitchenTrack,
  type KitchenTrackKind,
} from './prep-menu-sync';
import { CafePortalShell } from './CafePortalShell';
import { useCafeBranchScope } from './use-cafe-branch';
import {
  addIngredientStockLot,
  assignUsePriorityForNewLot,
  normalizeIngredient,
  type FulfillmentMode,
  type Ingredient,
  type IngredientSupplier,
  type IngredientUnit,
} from './cafe-ingredient-utils';
import {
  calcIngredientBelowMinimum,
  calcIngredientOrderQty,
  calcIngredientVelocityBoost,
  calcMenuIngredientDailyDemand,
  calcMenuRollingAvg14d,
  MENU_DEFAULT_CATS,
  normalizeMenuItems,
  syncMenuRecipeCosts,
  type CafeMenuRecipeItem,
  type RecipeLine,
} from './cafe-menu-sync';
import { CAFE_MENU_PATH, cafePortalHref } from './cafe-portal-nav';

// ─── Types ────────────────────────────────────────────────────────────────────

interface StaffMember {
  id: string;
  name: string;
  role: string;
  dailyRate: number;
  daysWorked: number;
  deductionsMTD: number;
}

type TaskStatus = 'COMPLETE' | 'PENDING' | 'OVERDUE';
type TaskFreq   = 'DAILY' | 'WEEKLY';

const CAFE_TASK_ASSIGNEE_ROLES = [
  'Morning Barista',
  'Evening Barista',
  'Pastry Chef',
] as const;

interface Task {
  id: string;
  name: string;
  freq: TaskFreq;
  assignedTo: string;
  dueTime?: string;
  status: TaskStatus;
  proofUploadedAt?: string;
  purgeDate?: string;
}

function formatTaskDueTime(dueTime?: string): string | null {
  if (!dueTime) return null;
  return dueTime.slice(0, 5);
}

interface DailyStockItem {
  id: string;
  name: string;
  unit: string;
  openingStock: number;
  closingStock: number;
  posSold: number;
  loggedWastage: number; // staff-logged wastage with photo proof
  assignedTo: string;
}

interface BulkStockItem {
  id: string;
  name: string;
  unit: string;
  theoreticalStock: number;
  physicalCount: number;
  periodDays: number;
  assignedTo: string;
}

interface Void {
  id: string;
  time: string;
  item: string;
  amount: number;
  voidedBy: string;
  reason: string;
  flagged: boolean;
}

// ─── Predictive Prep Engine Types ─────────────────────────────────────────────

interface PrepItem {
  id: string;
  menuItemId: string;
  name: string;
  currentStock: number;
  unit: string;
  rollingAvg14d: number;  // average daily usage over past 14 days
  shelfLifeDays: number;  // MD-configured spoilage limit
}

interface DisplayItem {
  id: string;
  menuItemId: string;
  name: string;
  currentWhole: number;   // whole units in stock (e.g., whole cakes)
  currentSlices: number;  // loose slices already cut
  slicesPerWhole: number; // how many slices one whole unit yields
  rollingAvg14d: number;  // average daily slice sales over 14 days
  shelfLifeDays: number;  // MD-configured display shelf limit
}

const TODAY_STR = new Date().toISOString().slice(0, 10);

// Historical task snapshots keyed by date offset (0 = today, 1 = yesterday, etc.)
function getTasksForOffset(offset: number, tasks: Task[]): Task[] {
  if (offset === 0) return tasks;
  // Simulate historical data: older days have more complete tasks, some purged proofs
  return tasks.map((t) => {
    if (offset >= 3) {
      // 3+ days ago: most things were done, some proofs still available
      const purged = offset > 10 && t.proofUploadedAt;
      return {
        ...t,
        status: t.status === 'OVERDUE' && offset >= 5 ? 'PENDING' : t.status === 'PENDING' ? 'COMPLETE' : t.status,
        proofUploadedAt: purged ? undefined : t.proofUploadedAt,
        purgeDate: t.purgeDate,
      };
    }
    return { ...t };
  });
}

type MenuItem = CafeMenuRecipeItem;

function needsProcurement(
  ing: Ingredient,
  menuItems: MenuItem[],
  ingredients: Ingredient[],
): boolean {
  return (
    ing.currentStock < ing.minimumStock ||
    calcIngredientOrderQty(ing, menuItems, ingredients) > 0
  );
}



// ─── Variance helpers ─────────────────────────────────────────────────────────

function listAVariance(item: DailyStockItem) {
  // Expected Closing = Opening Stock - POS Sold - Logged Wastage
  const expectedClosing = item.openingStock - item.posSold - item.loggedWastage;
  return item.closingStock - expectedClosing; // negative = unexplained missing stock
}

function listAPct(item: DailyStockItem) {
  const expectedClosing = Math.max(item.openingStock - item.posSold - item.loggedWastage, 1);
  return (listAVariance(item) / expectedClosing) * 100;
}

function listBVariance(item: BulkStockItem) {
  return item.physicalCount - item.theoreticalStock; // negative = missing
}

function listBPct(item: BulkStockItem) {
  return (listBVariance(item) / Math.max(item.theoreticalStock, 0.01)) * 100;
}

const THEFT_THRESHOLD = -10; // percent

// ─── Helpers ──────────────────────────────────────────────────────────────────

function lkr(n: number) {
  const abs  = Math.abs(n);
  const sign = n < 0 ? '−' : '';
  if (abs >= 1_000_000) return `${sign}LKR ${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000)     return `${sign}LKR ${(abs / 1_000).toFixed(1)}K`;
  return `${sign}LKR ${abs.toLocaleString()}`;
}

function fmtPct(n: number) {
  const sign = n >= 0 ? '+' : '';
  return `${sign}${n.toFixed(1)}%`;
}

function offsetToDate(offset: number): string {
  const d = new Date(TODAY_STR);
  d.setDate(d.getDate() - offset);
  return d.toISOString().slice(0, 10);
}

function dateToOffset(dateStr: string): number {
  const today = new Date(TODAY_STR);
  const target = new Date(dateStr);
  return Math.round((today.getTime() - target.getTime()) / 86_400_000);
}

const STATUS_META: Record<TaskStatus, { label: string; cls: string; Icon: React.ElementType }> = {
  COMPLETE: { label: 'Complete', cls: 'bg-emerald-100/90 text-emerald-900 border-emerald-200', Icon: CheckCircle2 },
  PENDING:  { label: 'Pending',  cls: 'bg-amber-100/90   text-amber-900   border-amber-200',   Icon: Clock        },
  OVERDUE:  { label: 'Overdue',  cls: 'bg-rose-100/90    text-rose-900    border-rose-200',    Icon: XCircle      },
};

// ─── Disciplinary Fine Modal ───────────────────────────────────────────────────

interface FineTarget {
  itemName: string;
  suggestedAmount: number;
  defaultStaffId: string;
  category: 'STOCK' | 'COMPLIANCE';
}

function DisciplinaryFineModal({
  target,
  staff,
  onConfirm,
  onClose,
}: {
  target: FineTarget | null;
  staff: StaffMember[];
  onConfirm: (staffId: string, amount: number, reason: string) => void;
  onClose: () => void;
}) {
  const [staffId,  setStaffId]  = useState(target?.defaultStaffId ?? staff[0]?.id ?? '');
  const [amount,   setAmount]   = useState(String(target?.suggestedAmount ?? 500));
  const [reason,   setReason]   = useState(
    target ? `Stock variance on "${target.itemName}" — see Theft Radar report ${TODAY_STR}` : ''
  );
  const [confirmed, setConfirmed] = useState(false);

  // Reset when target changes
  React.useEffect(() => {
    if (!target) return;
    setStaffId(target.defaultStaffId);
    setAmount(String(target.suggestedAmount));
    setReason(`Stock variance on "${target.itemName}" — see Theft Radar report ${TODAY_STR}`);
    setConfirmed(false);
  }, [target]);

  if (!target) return null;

  const selectedStaff = staff.find((s) => s.id === staffId);
  const gross = selectedStaff ? selectedStaff.dailyRate * selectedStaff.daysWorked : 0;
  const currentNet = selectedStaff ? gross - selectedStaff.deductionsMTD : 0;
  const fineAmt = parseFloat(amount) || 0;
  const projectedNet = currentNet - fineAmt;

  const inputCls = 'w-full rounded-xl border border-slate-200 bg-white/95 px-3 py-2 text-sm font-semibold text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-rose-500/40 transition-all';
  const labelCls = 'mb-1 block text-[10px] font-bold uppercase tracking-widest text-slate-600';

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="relative w-full max-w-md overflow-hidden rounded-3xl border border-white/75 bg-[#eef2f6] shadow-[0_32px_80px_-16px_rgba(15,23,42,0.35)] backdrop-blur-2xl" onClick={(e) => e.stopPropagation()}>
        <div aria-hidden className="pointer-events-none absolute -top-12 right-0 h-44 w-44 rounded-full bg-rose-400/15 blur-[72px]" />

        <div className="relative p-6">
          {/* Header */}
          <div className="mb-5 flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-rose-200/80 bg-rose-50/80">
                <Gavel className="h-5 w-5 text-rose-700" />
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-rose-700">Disciplinary Action</p>
                <h2 className="text-lg font-black text-slate-900">Issue Disciplinary Fine</h2>
              </div>
            </div>
            <button type="button" onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200/80 bg-white/70 text-slate-500 hover:text-slate-900 transition-colors"><X className="h-4 w-4" /></button>
          </div>

          {/* Linked violation */}
          <div className="mb-4 flex items-start gap-2 rounded-xl border border-rose-200/70 bg-rose-50/50 px-3 py-2.5 text-[11px] text-rose-800">
            <BadgeAlert className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-rose-600" />
            <span>
              Linked violation: <strong>{target.itemName}</strong>
              {target.category === 'STOCK' ? ' — Stock Variance & Theft Radar flag' : ' — Compliance audit breach'}
            </span>
          </div>

          <div className="space-y-4">
            {/* Staff selector */}
            <ExecutiveGlassCard className="p-4">
              <label className={labelCls}>Staff Member to Fine</label>
              <select
                value={staffId}
                onChange={(e) => setStaffId(e.target.value)}
                className={inputCls}
              >
                {staff.map((s) => (
                  <option key={s.id} value={s.id}>{s.name} — {s.role}</option>
                ))}
              </select>

              {selectedStaff && (
                <div className="mt-3 grid grid-cols-3 gap-2">
                  <div className="rounded-xl bg-white/60 p-2 text-center">
                    <p className="text-[9px] font-bold uppercase tracking-widest text-slate-500">Gross MTD</p>
                    <p className="mt-0.5 text-xs font-black tabular-nums text-slate-800">{lkr(gross)}</p>
                  </div>
                  <div className="rounded-xl bg-white/60 p-2 text-center">
                    <p className="text-[9px] font-bold uppercase tracking-widest text-slate-500">Current Net</p>
                    <p className="mt-0.5 text-xs font-black tabular-nums text-emerald-800">{lkr(currentNet)}</p>
                  </div>
                  <div className={`rounded-xl p-2 text-center ${fineAmt > 0 ? 'bg-rose-50/80 ring-1 ring-rose-200/60' : 'bg-white/60'}`}>
                    <p className="text-[9px] font-bold uppercase tracking-widest text-slate-500">After Fine</p>
                    <p className={`mt-0.5 text-xs font-black tabular-nums ${fineAmt > 0 ? 'text-rose-800' : 'text-slate-800'}`}>{lkr(projectedNet)}</p>
                  </div>
                </div>
              )}
            </ExecutiveGlassCard>

            {/* Amount */}
            <ExecutiveGlassCard className="p-4">
              <label className={labelCls}>Fine Amount (LKR)</label>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[10px] font-mono text-slate-400">LKR</span>
                <input
                  type="number"
                  min="0"
                  step="100"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className={`${inputCls} pl-10`}
                />
              </div>
              <p className="mt-1 text-[10px] text-slate-400">Deducted from staff's MTD salary immediately upon confirmation.</p>
            </ExecutiveGlassCard>

            {/* Reason */}
            <ExecutiveGlassCard className="p-4">
              <label className={labelCls}>Official Reason (for payslip record)</label>
              <textarea
                rows={2}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className={`${inputCls} resize-none`}
              />
            </ExecutiveGlassCard>

            {/* Confirm checkbox */}
            <label className="flex cursor-pointer items-start gap-2.5 rounded-2xl border border-rose-200/70 bg-rose-50/40 px-4 py-3">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded accent-rose-600"
              />
              <span className="text-[11px] font-semibold text-rose-900">
                I, the MD, confirm this disciplinary deduction of <strong>LKR {(parseFloat(amount) || 0).toLocaleString()}</strong> from <strong>{selectedStaff?.name ?? '—'}</strong>'s MTD salary. This action is logged and non-reversible without a corrective entry.
              </span>
            </label>

            {/* Actions */}
            <div className="flex gap-3">
              <button type="button" onClick={onClose} className="flex-1 rounded-xl border border-slate-200 bg-white/70 py-3 text-sm font-bold text-slate-700 hover:bg-white/90 transition-all">Cancel</button>
              <button
                type="button"
                disabled={!confirmed || fineAmt <= 0}
                onClick={() => { onConfirm(staffId, fineAmt, reason); onClose(); }}
                className="flex-[2] rounded-xl bg-rose-700 py-3 text-sm font-bold uppercase tracking-widest text-white shadow-lg shadow-rose-700/25 hover:bg-rose-600 transition-all disabled:cursor-not-allowed disabled:opacity-40"
              >
                Confirm & Deduct from MTD Salary
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Visual Task Auditor rows ─────────────────────────────────────────────────

function CafeTaskRow({
  task,
  canEdit,
  onRemove,
  onViewProof,
  onFine,
}: {
  task: Task;
  canEdit: boolean;
  onRemove: (taskId: string) => void;
  onViewProof: (task: Task) => void;
  onFine: (task: Task) => void;
}) {
  const st = STATUS_META[task.status];
  const dueLabel = formatTaskDueTime(task.dueTime);
  const isFlagged = task.status === 'OVERDUE';

  return (
    <div
      className={`flex items-center gap-3 rounded-xl border p-3 transition-all ${
        task.status === 'COMPLETE'
          ? 'border-emerald-200/80 bg-emerald-50/40'
          : task.status === 'OVERDUE'
            ? 'border-rose-200/80 bg-rose-50/40 animate-pulse'
            : 'border-slate-200/60 bg-white/40'
      }`}
    >
      <st.Icon
        className={`h-4 w-4 flex-shrink-0 ${
          task.status === 'COMPLETE'
            ? 'text-emerald-600'
            : task.status === 'OVERDUE'
              ? 'text-rose-600'
              : 'text-amber-500'
        }`}
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-bold text-slate-900">{task.name}</p>
        <p className="text-[10px] text-slate-500">
          {dueLabel ? (
            <span className="font-mono font-bold text-slate-600">{dueLabel}</span>
          ) : null}
          {dueLabel ? ' · ' : ''}
          {task.freq === 'DAILY' ? 'Daily' : 'Weekly'}
          {' · '}
          {task.assignedTo}
        </p>
      </div>
      <div className="flex items-center gap-1.5">
        {task.proofUploadedAt ? (
          <button
            type="button"
            onClick={() => onViewProof(task)}
            className="flex items-center gap-1 rounded-lg border border-slate-200/80 bg-white/70 px-2 py-1 text-[10px] font-bold text-slate-700 hover:bg-white/90 transition-all"
          >
            <Eye className="h-3 w-3" />
            Proof
          </button>
        ) : task.status === 'OVERDUE' ? (
          <span className="text-[9px] font-bold text-rose-700 animate-pulse">NO PROOF</span>
        ) : (
          <Camera className="h-4 w-4 text-slate-300" />
        )}
        {isFlagged && (
          <button
            type="button"
            onClick={() => onFine(task)}
            className="flex items-center gap-1 rounded-lg border border-rose-200/80 bg-rose-50/70 px-2 py-1 text-[9px] font-black text-rose-800 hover:bg-rose-100/80 transition-all whitespace-nowrap"
          >
            <Gavel className="h-3 w-3" />
            Fine
          </button>
        )}
        {canEdit && (
          <button
            type="button"
            onClick={() => onRemove(task.id)}
            className="rounded-lg border border-slate-200/80 bg-white/70 p-1.5 text-slate-400 hover:border-rose-200/80 hover:text-rose-600 transition-all"
            title="Remove task"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Photo Proof Modal ────────────────────────────────────────────────────────

function PhotoModal({ task, lookbackDate, onClose }: { task: Task | null; lookbackDate: string; onClose: () => void }) {
  if (!task) return null;
  const st = STATUS_META[task.status];
  const offset = dateToOffset(lookbackDate);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="relative w-full max-w-sm overflow-hidden rounded-3xl border border-white/75 bg-[#eef2f6] shadow-[0_32px_80px_-16px_rgba(15,23,42,0.35)] backdrop-blur-2xl" onClick={(e) => e.stopPropagation()}>
        <div aria-hidden className="pointer-events-none absolute -top-10 right-0 h-40 w-40 rounded-full bg-emerald-400/18 blur-[60px]" />
        <div className="relative p-6">
          <div className="mb-4 flex items-start justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                Task Photo Proof · {offset === 0 ? 'Today' : lookbackDate}
              </p>
              <h3 className="mt-0.5 text-lg font-black text-slate-900">{task.name}</h3>
              <p className="text-xs text-slate-500">
                {formatTaskDueTime(task.dueTime) ? `${formatTaskDueTime(task.dueTime)} · ` : ''}
                {task.freq === 'DAILY' ? 'Daily' : 'Weekly'} · Assigned to {task.assignedTo}
              </p>
            </div>
            <button type="button" onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200/80 bg-white/70 text-slate-500 hover:text-slate-900 transition-colors"><X className="h-4 w-4" /></button>
          </div>

          <ExecutiveGlassCard className="flex flex-col items-center justify-center gap-3 py-12">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-slate-200/80 bg-slate-100/80">
              <Camera className="h-7 w-7 text-slate-400" />
            </div>
            <p className="text-xs font-semibold text-slate-500">
              {task.proofUploadedAt ? 'Live photo of completed task' : 'No photo uploaded for this date'}
            </p>
            {task.proofUploadedAt && <p className="text-[10px] text-slate-400">Uploaded {task.proofUploadedAt}</p>}
          </ExecutiveGlassCard>

          {task.purgeDate && (
            <div className="mt-3 flex items-center gap-2 rounded-xl border border-amber-200/80 bg-amber-50/60 px-3 py-2 text-[10px] text-amber-800">
              <Trash2 className="h-3.5 w-3.5 flex-shrink-0" />
              <span><strong>Auto-Purge:</strong> Photo permanently deleted after <strong>{task.purgeDate}</strong>. Compliance score record is permanent.</span>
            </div>
          )}

          <div className="mt-3">
            <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold ${st.cls}`}>
              <st.Icon className="h-3.5 w-3.5" />{st.label}
            </span>
          </div>

          <button type="button" onClick={onClose} className="mt-4 w-full rounded-xl border border-slate-200 bg-white/70 py-2.5 text-sm font-bold text-slate-700 hover:bg-white/90 transition-all">Close</button>
        </div>
      </div>
    </div>
  );
}

// ─── Stock Variance & Theft Radar ─────────────────────────────────────────────

function VarianceBadge({ pct }: { pct: number }) {
  const isFlagged = pct < THEFT_THRESHOLD;
  const isWarn    = pct < 0 && !isFlagged;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-black tabular-nums ${
      isFlagged ? 'border-rose-300 bg-rose-100/90 text-rose-900 animate-pulse' :
      isWarn    ? 'border-amber-200 bg-amber-50/80 text-amber-800' :
      'border-emerald-200 bg-emerald-50/80 text-emerald-800'
    }`}>
      {isFlagged && <BadgeAlert className="h-2.5 w-2.5" />}
      {fmtPct(pct)}
    </span>
  );
}

function StockVarianceRadar({
  staff,
  listA,
  listB,
  voids,
  onIssueFine,
}: {
  staff: StaffMember[];
  listA: DailyStockItem[];
  listB: BulkStockItem[];
  voids: Void[];
  onIssueFine: (target: FineTarget) => void;
}) {
  const [tab, setTab]              = useState<'A' | 'B'>('A');
  const [showVoids, setShowVoids]  = useState(false);
  const [showWastageLog, setShowWastageLog] = useState(false);

  const flaggedA = listA.filter((i) => listAPct(i) < THEFT_THRESHOLD).length;
  const flaggedB = listB.filter((i) => listBPct(i) < THEFT_THRESHOLD).length;
  const totalFlagged = flaggedA + flaggedB;

  return (
    <ExecutiveGlassCard className="overflow-hidden">
      {/* Header */}
      <div className="border-b border-slate-200/80 bg-slate-50/80 px-5 py-3.5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <FlaskConical className="h-4 w-4 text-slate-500" />
            <div>
              <h2 className="text-xs font-black uppercase tracking-widest text-slate-800">Stock Variance & Theft Radar</h2>
              <p className="text-[10px] text-slate-500">Flags items with &gt;10% unexplained loss vs. POS records</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {totalFlagged > 0 && (
              <span className="flex items-center gap-1.5 rounded-full border border-rose-200/80 bg-rose-50/80 px-3 py-1 text-[10px] font-black text-rose-800 animate-pulse">
                <ShieldAlert className="h-3 w-3" />
                {totalFlagged} theft/loss flag{totalFlagged > 1 ? 's' : ''}
              </span>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="mt-3 flex gap-1">
          {[
            { key: 'A' as const, label: 'List A — Daily Stock', Icon: Package, flags: flaggedA },
            { key: 'B' as const, label: 'List B — 3-Day Bulk',  Icon: FlaskConical, flags: flaggedB },
          ].map(({ key, label, Icon, flags }) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition-all ${
                tab === key
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'text-slate-600 hover:bg-white/70'
              }`}
            >
              <Icon className="h-3 w-3" />
              {label}
              {flags > 0 && (
                <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-black ${tab === key ? 'bg-rose-500 text-white' : 'bg-rose-100 text-rose-800'}`}>
                  {flags}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Live Camera enforcement note */}
        <div className="mt-2.5 flex flex-wrap items-start gap-3">
          <div className="flex items-center gap-1.5 rounded-full border border-emerald-300/70 bg-emerald-50/80 px-3 py-1">
            <Camera className="h-3 w-3 text-emerald-700" />
            <span className="text-[9px] font-black uppercase tracking-wider text-emerald-800">Live Camera Verified</span>
          </div>
          <div className="flex items-center gap-1.5 rounded-full border border-slate-200/80 bg-slate-50/60 px-3 py-1">
            <VideoOff className="h-3 w-3 text-slate-500" />
            <span className="text-[9px] font-semibold text-slate-600">
              Mobile app strictly restricted to Live Camera captures only — gallery uploads blocked to prevent delayed stock fraud.
            </span>
          </div>
        </div>
      </div>

      {/* Log Wastage action bar */}
      {tab === 'A' && (
        <div className="flex items-center gap-3 border-b border-slate-200/70 bg-white/30 px-5 py-2.5">
          <button
            type="button"
            onClick={() => setShowWastageLog((v) => !v)}
            className="flex items-center gap-1.5 rounded-xl border border-amber-200/80 bg-amber-50/80 px-3.5 py-2 text-[10px] font-black text-amber-800 transition-all hover:bg-amber-100/80"
          >
            <Camera className="h-3.5 w-3.5" />
            + Log Wastage (Photo Required)
          </button>
          {showWastageLog && (
            <span className="flex items-center gap-1.5 rounded-xl border border-amber-200/80 bg-amber-50/60 px-3 py-2 text-[10px] text-amber-800">
              <AlertTriangle className="h-3 w-3 flex-shrink-0" />
              Live camera capture required — select item and quantity in field app to submit.
              <button type="button" onClick={() => setShowWastageLog(false)} className="ml-1 font-black text-amber-900 hover:text-amber-700">✕</button>
            </span>
          )}
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto">
        {tab === 'A' && (
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200/80 bg-slate-50/60 text-[10px] font-bold uppercase tracking-widest text-slate-500">
              <tr>
                <th className="px-5 py-3">Item</th>
                <th className="px-5 py-3 text-center">Opening Stock</th>
                <th className="px-5 py-3 text-center">Evening Closing</th>
                <th className="px-5 py-3 text-center">POS Sold</th>
                <th className="px-5 py-3 text-center bg-amber-50/60">
                  <span className="text-amber-700">Logged Wastage</span>
                </th>
                <th className="px-5 py-3 text-center">Variance</th>
                <th className="px-5 py-3 text-center">% vs Expected</th>
                <th className="px-5 py-3">Status / Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/60">
              {listA.map((item) => {
                const variance = listAVariance(item);
                const pct = listAPct(item);
                const isFlagged = pct < THEFT_THRESHOLD;
                const expectedClosing = item.openingStock - item.posSold - item.loggedWastage;
                const responsible = staff.find((s) => s.name.split(' ')[0] === item.assignedTo);

                return (
                  <tr
                    key={item.id}
                    className={`transition-colors ${
                      isFlagged
                        ? 'bg-rose-50/50 hover:bg-rose-50/70'
                        : 'hover:bg-white/40'
                    }`}
                  >
                    <td className="px-5 py-3.5">
                      <p className="font-bold text-slate-900">{item.name}</p>
                      <p className="text-[10px] text-slate-500">{item.unit} · {item.assignedTo}</p>
                    </td>
                    <td className="px-5 py-3.5 text-center">
                      <p className="font-mono text-sm font-semibold text-slate-700">{item.openingStock}</p>
                      <div className="mt-0.5 flex flex-col items-center gap-0.5">
                        <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200/80 bg-emerald-50/80 px-1.5 py-0.5 text-[8px] font-black text-emerald-700">
                          <Camera className="h-2 w-2" /> Cam Verified
                        </span>
                        <button type="button" className="text-[8px] font-black text-sky-600 hover:underline">📷 View</button>
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-center">
                      <p className="font-mono text-sm font-semibold text-slate-700">{item.closingStock}</p>
                      <div className="mt-0.5 flex flex-col items-center gap-0.5">
                        <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200/80 bg-emerald-50/80 px-1.5 py-0.5 text-[8px] font-black text-emerald-700">
                          <Camera className="h-2 w-2" /> Cam Verified
                        </span>
                        <button type="button" className="text-[8px] font-black text-sky-600 hover:underline">📷 View</button>
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-center">
                      <div className="text-sm font-semibold text-slate-700">{item.posSold}</div>
                      <div className="text-[10px] text-slate-400">→ expect {expectedClosing} left</div>
                    </td>
                    <td className="px-5 py-3.5 text-center bg-amber-50/30">
                      {item.loggedWastage > 0 ? (
                        <div className="flex flex-col items-center gap-0.5">
                          <span className="font-black tabular-nums text-sm text-amber-800">{item.loggedWastage} {item.unit}</span>
                          <button type="button" className="text-[8px] font-black text-sky-600 hover:underline">📷 View proof</button>
                        </div>
                      ) : (
                        <span className="text-[10px] text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-center">
                      <span className={`font-black tabular-nums text-sm ${variance < 0 ? 'text-rose-800' : 'text-emerald-800'}`}>
                        {variance >= 0 ? '+' : ''}{variance} {item.unit}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-center">
                      <VarianceBadge pct={pct} />
                    </td>
                    <td className="px-5 py-3.5">
                      {isFlagged ? (
                        <div className="flex flex-col gap-1.5">
                          <span className="inline-flex items-center gap-1 rounded-full border border-rose-300/80 bg-rose-100/90 px-2 py-0.5 text-[9px] font-black text-rose-900">
                            <BadgeAlert className="h-2.5 w-2.5" />
                            Review for Theft/Loss
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              onIssueFine({
                                itemName: item.name,
                                suggestedAmount: 500,
                                defaultStaffId: responsible?.id ?? staff[0]?.id ?? '',
                                category: 'STOCK',
                              })
                            }
                            className="flex items-center gap-1 rounded-xl border border-rose-200/80 bg-white/70 px-2.5 py-1.5 text-[10px] font-black text-rose-800 hover:bg-rose-50 transition-all whitespace-nowrap"
                          >
                            <Gavel className="h-3 w-3" />
                            Issue Disciplinary Fine (LKR)
                          </button>
                        </div>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700">
                          <CheckCircle2 className="h-3 w-3" />
                          Within tolerance
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        {tab === 'B' && (
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200/80 bg-slate-50/60 text-[10px] font-bold uppercase tracking-widest text-slate-500">
              <tr>
                <th className="px-5 py-3">Bulk Item</th>
                <th className="px-5 py-3 text-center">Period</th>
                <th className="px-5 py-3 text-center">Theoretical Stock</th>
                <th className="px-5 py-3 text-center">Physical Count</th>
                <th className="px-5 py-3 text-center">Variance</th>
                <th className="px-5 py-3 text-center">% vs Theoretical</th>
                <th className="px-5 py-3">Status / Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/60">
              {listB.map((item) => {
                const variance = listBVariance(item);
                const pct = listBPct(item);
                const isFlagged = pct < THEFT_THRESHOLD;
                const responsible = staff.find((s) => s.name.split(' ')[0] === item.assignedTo);

                return (
                  <tr
                    key={item.id}
                    className={`transition-colors ${
                      isFlagged
                        ? 'bg-rose-50/50 hover:bg-rose-50/70'
                        : 'hover:bg-white/40'
                    }`}
                  >
                    <td className="px-5 py-3.5">
                      <p className="font-bold text-slate-900">{item.name}</p>
                      <p className="text-[10px] text-slate-500">{item.unit} · {item.assignedTo}</p>
                    </td>
                    <td className="px-5 py-3.5 text-center">
                      <span className="rounded-lg border border-slate-200/80 bg-white/60 px-2 py-0.5 text-[10px] font-bold text-slate-600">{item.periodDays}-day</span>
                    </td>
                    <td className="px-5 py-3.5 text-center font-mono text-sm font-semibold text-slate-700">{item.theoreticalStock} {item.unit}</td>
                    <td className="px-5 py-3.5 text-center">
                      <p className="font-mono text-sm font-semibold text-slate-700">{item.physicalCount} {item.unit}</p>
                      <button
                        type="button"
                        className="mt-1 inline-flex items-center gap-1 rounded-lg border border-sky-200/80 bg-sky-50/80 px-2 py-0.5 text-[8px] font-black text-sky-700 transition-all hover:bg-sky-100/80 whitespace-nowrap"
                      >
                        <Camera className="h-2 w-2" /> View Timestamped Photo
                      </button>
                    </td>
                    <td className="px-5 py-3.5 text-center">
                      <span className={`font-black tabular-nums text-sm ${variance < 0 ? 'text-rose-800' : 'text-emerald-800'}`}>
                        {variance >= 0 ? '+' : ''}{variance.toFixed(1)} {item.unit}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-center">
                      <VarianceBadge pct={pct} />
                    </td>
                    <td className="px-5 py-3.5">
                      {isFlagged ? (
                        <div className="flex flex-col gap-1.5">
                          <span className="inline-flex items-center gap-1 rounded-full border border-rose-300/80 bg-rose-100/90 px-2 py-0.5 text-[9px] font-black text-rose-900">
                            <BadgeAlert className="h-2.5 w-2.5" />
                            Review for Theft/Loss
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              onIssueFine({
                                itemName: item.name,
                                suggestedAmount: 1000,
                                defaultStaffId: responsible?.id ?? staff[0]?.id ?? '',
                                category: 'STOCK',
                              })
                            }
                            className="flex items-center gap-1 rounded-xl border border-rose-200/80 bg-white/70 px-2.5 py-1.5 text-[10px] font-black text-rose-800 hover:bg-rose-50 transition-all whitespace-nowrap"
                          >
                            <Gavel className="h-3 w-3" />
                            Issue Disciplinary Fine (LKR)
                          </button>
                        </div>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700">
                          <CheckCircle2 className="h-3 w-3" />
                          Within tolerance
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Threshold legend */}
      <div className="border-t border-slate-200/80 bg-slate-50/60 px-5 py-2.5 space-y-1.5">
        <div className="flex flex-wrap items-center gap-4 text-[10px] text-slate-500">
          <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-rose-400" /> RED = &gt;10% unexplained loss → "Review for Theft/Loss"</span>
          <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-amber-400" /> AMBER = 0–10% loss → monitor</span>
          <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-emerald-400" /> GREEN = balanced or surplus</span>
        </div>
        <p className="text-[10px] font-semibold text-slate-600">
          Formula: <span className="font-black text-slate-800">Expected Closing = Opening Stock − POS Sold − Logged Wastage</span>. Variance = Actual Closing − Expected Closing.
        </p>
      </div>

      {/* Collapsible POS Void Register */}
      <div className="border-t border-slate-200/80">
        <button
          type="button"
          onClick={() => setShowVoids((v) => !v)}
          className="flex w-full items-center justify-between bg-slate-50/60 px-5 py-3"
        >
          <div className="flex items-center gap-2">
            <XCircle className="h-3.5 w-3.5 text-slate-500" />
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-700">POS Void Register</span>
            {voids.filter((v) => v.flagged).length > 0 && (
              <span className="flex items-center gap-1 rounded-full border border-rose-200/80 bg-rose-50/80 px-2 py-0.5 text-[9px] font-bold text-rose-800">
                <AlertTriangle className="h-2.5 w-2.5" />
                {voids.filter((v) => v.flagged).length} suspicious
              </span>
            )}
          </div>
          {showVoids ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
        </button>

        {showVoids && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200/80 bg-slate-50/60 text-[10px] font-bold uppercase tracking-widest text-slate-500">
                <tr>
                  <th className="px-5 py-3">Time</th>
                  <th className="px-5 py-3">Item(s)</th>
                  <th className="px-5 py-3">Voided By</th>
                  <th className="px-5 py-3 text-right">Amount</th>
                  <th className="px-5 py-3">Reason</th>
                  <th className="px-5 py-3 text-center">Flag</th>
                  <th className="px-5 py-3">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/60">
                {voids.map((v) => {
                  const staffMatch = staff.find((s) => s.name.split(' ')[0] === v.voidedBy);
                  return (
                    <tr key={v.id} className={`transition-colors ${v.flagged ? 'bg-rose-50/30 hover:bg-rose-50/50' : 'hover:bg-white/40'}`}>
                      <td className="px-5 py-3 font-mono text-xs text-slate-500">{v.time}</td>
                      <td className="px-5 py-3 font-semibold text-slate-900">{v.item}</td>
                      <td className="px-5 py-3 text-slate-600">{v.voidedBy}</td>
                      <td className="px-5 py-3 text-right font-black tabular-nums text-rose-800">{lkr(v.amount)}</td>
                      <td className="px-5 py-3 text-xs italic text-slate-600">{v.reason}</td>
                      <td className="px-5 py-3 text-center">
                        {v.flagged
                          ? <span className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50/80 px-2 py-0.5 text-[9px] font-black text-rose-800"><AlertTriangle className="h-2.5 w-2.5" />Suspicious</span>
                          : <CheckCircle2 className="mx-auto h-4 w-4 text-slate-300" />}
                      </td>
                      <td className="px-5 py-3">
                        {v.flagged && (
                          <button
                            type="button"
                            onClick={() => {
                              // find staff for void
                              const sId = staffMatch?.id ?? staff.find((s) => s.name.split(' ')[0] === v.voidedBy)?.id ?? staff[0]?.id ?? '';
                              // This is just a stub — parent onIssueFine is not accessible here
                              // We'll handle this via a different mechanism; for now show tooltip
                            }}
                            className="flex items-center gap-1 rounded-xl border border-rose-200/80 bg-white/70 px-2 py-1 text-[10px] font-black text-rose-800 hover:bg-rose-50 transition-all whitespace-nowrap"
                          >
                            <Gavel className="h-3 w-3" />
                            Fine
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </ExecutiveGlassCard>
  );
}

// ─── Weekly Procurement Engine ────────────────────────────────────────────────

type ProcurementLine = {
  ingredient: Ingredient;
  orderQty: number;
  belowMinimum: boolean;
  velocityBoost: boolean;
};

function getMenuItemsUsingIngredient(ingredientId: string, menuItems: MenuItem[]) {
  return menuItems
    .map((item) => {
      const line = item.recipe.find((l) => l.ingredientId === ingredientId);
      return line ? { item, line } : null;
    })
    .filter((entry): entry is { item: MenuItem; line: RecipeLine } => entry !== null);
}

function buildProcurementLines(
  ingredients: Ingredient[],
  menuItems: MenuItem[],
): ProcurementLine[] {
  return ingredients
    .filter((ingredient) => needsProcurement(ingredient, menuItems, ingredients))
    .map((ingredient) => {
      const menuDaily = calcMenuIngredientDailyDemand(ingredient.id, menuItems, ingredients);
      return {
        ingredient,
        orderQty: calcIngredientOrderQty(ingredient, menuItems, ingredients),
        belowMinimum: calcIngredientBelowMinimum(ingredient, menuDaily),
        velocityBoost: calcIngredientVelocityBoost(ingredient, menuDaily),
      };
    })
    .filter((line) => line.orderQty > 0)
    .sort((a, b) => Number(b.belowMinimum) - Number(a.belowMinimum));
}


function ProcurementReceiveModal({
  line,
  menuItems,
  onConfirm,
  onClose,
}: {
  line: ProcurementLine | null;
  menuItems: MenuItem[];
  onConfirm: (ingredientId: string, packs: number, expiresOn: string) => void;
  onClose: () => void;
}) {
  const suggestedPacks = line
    ? Math.ceil(line.orderQty / Math.max(line.ingredient.purchaseAmount, 1))
    : 1;
  const [packs, setPacks] = useState(String(suggestedPacks));
  const [expiresOn, setExpiresOn] = useState('');

  useEffect(() => {
    if (!line) return;
    setPacks(String(Math.ceil(line.orderQty / Math.max(line.ingredient.purchaseAmount, 1))));
    setExpiresOn('');
  }, [line]);

  if (!line) return null;

  const { ingredient, orderQty, belowMinimum, velocityBoost } = line;
  const menuUsage = getMenuItemsUsingIngredient(ingredient.id, menuItems);
  const packCount = Math.max(0, parseFloat(packs) || 0);
  const addedQty = packCount * ingredient.purchaseAmount;
  const newStock = ingredient.currentStock + addedQty;
  const totalCost = packCount * ingredient.packagePrice;
  const usePriorityPreview =
    packCount > 0 && expiresOn
      ? assignUsePriorityForNewLot(ingredient.stockLots, expiresOn)
      : null;

  const inputCls =
    'w-full rounded-xl border border-slate-200 bg-white/95 px-3 py-2 text-sm font-semibold text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-500/40 transition-all';
  const labelCls = 'mb-1 block text-[10px] font-bold uppercase tracking-widest text-slate-600';

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-3xl border border-white/75 bg-[#eef2f6] shadow-[0_32px_80px_-16px_rgba(15,23,42,0.35)] backdrop-blur-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div aria-hidden className="pointer-events-none absolute -top-12 right-0 h-44 w-44 rounded-full bg-sky-400/15 blur-[72px]" />

        <div className="relative flex min-h-0 flex-1 flex-col p-6">
          <div className="mb-4 flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-sky-200/80 bg-sky-50/80">
                <Package className="h-5 w-5 text-sky-700" />
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-sky-700">Receive Stock</p>
                <h2 className="text-lg font-black text-slate-900">{ingredient.name}</h2>
                <p className="text-xs text-slate-500">{ingredient.supplier.name}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200/80 bg-white/70 text-slate-500 hover:text-slate-900 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="mb-4 flex flex-wrap gap-2 text-[10px]">
            <span className="rounded-full border border-slate-200/80 bg-white/70 px-2.5 py-1 font-bold text-slate-600">
              On hand {ingredient.currentStock.toLocaleString()} {ingredient.unit}
            </span>
            {belowMinimum && (
              <span className="rounded-full border border-rose-200/80 bg-rose-50/80 px-2.5 py-1 font-bold text-rose-800">
                Below MD min {ingredient.minimumStock.toLocaleString()}
              </span>
            )}
            {velocityBoost && (
              <span className="rounded-full border border-amber-200/80 bg-amber-50/80 px-2.5 py-1 font-bold text-amber-800">
                14d velocity boost
              </span>
            )}
            <span className="rounded-full border border-sky-200/80 bg-sky-50/80 px-2.5 py-1 font-bold text-sky-800">
              Suggested order {orderQty.toLocaleString()} {ingredient.unit}
            </span>
          </div>

          <ExecutiveGlassCard className="mb-4 min-h-0 flex-1 overflow-hidden">
            <div className="border-b border-slate-200/80 bg-slate-50/60 px-4 py-2.5">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-700">
                Menu items using this ingredient
              </p>
            </div>
            <div className="max-h-48 overflow-y-auto">
              {menuUsage.length === 0 ? (
                <p className="px-4 py-6 text-center text-xs text-slate-500">
                  No menu recipes linked to this ingredient yet.
                </p>
              ) : (
                <ul className="divide-y divide-slate-200/60">
                  {menuUsage.map(({ item, line: recipeLine }) => (
                    <li key={item.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                      <div className="min-w-0">
                        <p className="truncate text-xs font-bold text-slate-900">{item.name}</p>
                        <p className="text-[10px] text-slate-500">{item.category}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs font-black tabular-nums text-slate-800">
                          {recipeLine.quantity.toLocaleString()} {ingredient.unit}
                        </p>
                        <p className="text-[9px] text-slate-500">per serving</p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </ExecutiveGlassCard>

          <ExecutiveGlassCard className="mb-4 p-4 space-y-4">
            <div>
              <label className={labelCls}>Packs received</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={packs}
                  onChange={(e) => setPacks(e.target.value)}
                  className={`${inputCls} font-mono`}
                />
                <span className="whitespace-nowrap text-[10px] font-bold text-slate-500">
                  × {ingredient.purchaseAmount.toLocaleString()} {ingredient.unit}
                </span>
              </div>
            </div>
            <div>
              <label className={labelCls}>
                Expiry date <span className="text-rose-600">*</span>
              </label>
              <input
                type="date"
                value={expiresOn}
                min={TODAY_STR}
                required
                onChange={(e) => setExpiresOn(e.target.value)}
                className={`${inputCls} ${!expiresOn ? 'border-amber-300/80 ring-1 ring-amber-200/60' : ''}`}
              />
              <p className="mt-1 text-[9px] font-semibold text-amber-800">
                Required — enter the date printed on the received packages.
              </p>
            </div>
            {usePriorityPreview != null ? (
              <p className="rounded-xl border border-indigo-200/80 bg-indigo-50/80 px-4 py-3 text-center text-sm font-bold text-indigo-900">
                Write{' '}
                <span className="font-mono text-lg tabular-nums">{usePriorityPreview}</span> on each
                package (lower number = use first)
              </p>
            ) : null}
            <div className="mt-3 grid grid-cols-3 gap-2">
              <div className="rounded-xl bg-white/60 p-2 text-center">
                <p className="text-[9px] font-bold uppercase tracking-widest text-slate-500">Adding</p>
                <p className="mt-0.5 text-xs font-black tabular-nums text-sky-800">
                  +{addedQty.toLocaleString()} {ingredient.unit}
                </p>
              </div>
              <div className="rounded-xl bg-white/60 p-2 text-center">
                <p className="text-[9px] font-bold uppercase tracking-widest text-slate-500">New on hand</p>
                <p className="mt-0.5 text-xs font-black tabular-nums text-emerald-800">
                  {newStock.toLocaleString()} {ingredient.unit}
                </p>
              </div>
              <div className="rounded-xl bg-white/60 p-2 text-center">
                <p className="text-[9px] font-bold uppercase tracking-widest text-slate-500">Cost</p>
                <p className="mt-0.5 text-xs font-black tabular-nums text-slate-800">
                  LKR {totalCost.toLocaleString()}
                </p>
              </div>
            </div>
          </ExecutiveGlassCard>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-xl border border-slate-200 bg-white/70 py-3 text-sm font-bold text-slate-700 hover:bg-white/90 transition-all"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={packCount <= 0 || !expiresOn}
              onClick={() => {
                onConfirm(ingredient.id, packCount, expiresOn);
                onClose();
              }}
              className="flex-[2] rounded-xl bg-sky-700 py-3 text-sm font-bold uppercase tracking-widest text-white shadow-lg shadow-sky-700/25 hover:bg-sky-600 transition-all disabled:cursor-not-allowed disabled:opacity-40"
            >
              Add to stock
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function WeeklyProcurementPanel({
  ingredients,
  menuItems,
  setIngredients,
  setMenuItems,
}: {
  ingredients: Ingredient[];
  menuItems: MenuItem[];
  setIngredients: React.Dispatch<React.SetStateAction<Ingredient[]>>;
  setMenuItems: React.Dispatch<React.SetStateAction<MenuItem[]>>;
}) {
  const [selectedLine, setSelectedLine] = useState<ProcurementLine | null>(null);

  const lines = useMemo(
    () => buildProcurementLines(ingredients, menuItems),
    [ingredients, menuItems],
  );
  const driverLines = lines.filter((l) => l.ingredient.fulfillmentMode === 'bought');
  const supplierLines = lines.filter((l) => l.ingredient.fulfillmentMode === 'delivered');

  const handleReceiveStock = (ingredientId: string, packs: number, expiresOn: string) => {
    setIngredients((prev) => {
      const next = prev.map((ing) => {
        if (ing.id !== ingredientId) return ing;
        return addIngredientStockLot(ing, packs * ing.purchaseAmount, expiresOn);
      });
      setMenuItems((items) => syncMenuRecipeCosts(items, next));
      return next;
    });
  };

  const renderList = (title: string, Icon: typeof Truck, rows: ProcurementLine[], accent: string) => (
    <div className="min-w-0 flex-1">
      <div className="mb-3 flex items-center gap-2">
        <Icon className={`h-4 w-4 ${accent}`} />
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-700">{title}</p>
        <span className="rounded-full border border-slate-200/80 bg-white/70 px-2 py-0.5 text-[9px] font-bold text-slate-500">
          {rows.length} item{rows.length !== 1 ? 's' : ''} · 14d cover
        </span>
      </div>
      {rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-200/80 bg-white/40 px-4 py-6 text-center text-xs text-slate-500">
          No orders this week — stock above minimum.
        </p>
      ) : (
        <div className="space-y-2">
          {rows.map((procLine) => {
            const { ingredient, orderQty, belowMinimum, velocityBoost } = procLine;
            return (
            <button
              key={ingredient.id}
              type="button"
              onClick={() => setSelectedLine(procLine)}
              className={`flex w-full flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-2.5 text-left transition-all hover:shadow-md hover:ring-1 hover:ring-slate-900/5 ${
                belowMinimum ? 'border-rose-200/80 bg-rose-50/50 hover:bg-rose-50/70' : 'border-amber-200/70 bg-amber-50/40 hover:bg-amber-50/60'
              }`}
            >
              <div className="min-w-0">
                <p className="truncate text-xs font-bold text-slate-900">{ingredient.name}</p>
                <p className="text-[10px] text-slate-500">
                  {ingredient.supplier.name} · on hand {ingredient.currentStock.toLocaleString()} {ingredient.unit}
                  {belowMinimum && (
                    <span className="ml-1 font-bold text-rose-700">· below MD min {ingredient.minimumStock.toLocaleString()}</span>
                  )}
                  {velocityBoost && (
                    <span className="ml-1 font-bold text-amber-800">· 14d velocity boost</span>
                  )}
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm font-black tabular-nums text-slate-900">
                  {orderQty.toLocaleString()} {ingredient.unit}
                </p>
                <p className="text-[9px] text-slate-500">
                  ≈ {Math.ceil(orderQty / Math.max(ingredient.purchaseAmount, 1))} pack
                  {Math.ceil(orderQty / Math.max(ingredient.purchaseAmount, 1)) !== 1 ? 's' : ''} · LKR{' '}
                  {(
                    Math.ceil(orderQty / Math.max(ingredient.purchaseAmount, 1)) * ingredient.packagePrice
                  ).toLocaleString()}
                </p>
              </div>
            </button>
          );
          })}
        </div>
      )}
    </div>
  );

  return (
    <>
      <ProcurementReceiveModal
        line={selectedLine}
        menuItems={menuItems}
        onConfirm={handleReceiveStock}
        onClose={() => setSelectedLine(null)}
      />
      <ExecutiveGlassCard className="overflow-hidden">
        <div className="border-b border-slate-200/80 bg-slate-50/80 px-5 py-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-2xl border border-sky-200/80 bg-sky-50/80">
                <Package className="h-4 w-4 text-sky-700" />
              </div>
              <div>
                <h2 className="text-xs font-black uppercase tracking-widest text-slate-800">
                  Weekly Procurement — Auto Order List
                </h2>
                <p className="mt-0.5 max-w-2xl text-[10px] leading-relaxed text-slate-500">
                  Computed once per week for 14-day cover from menu BOM, sales velocity, and MD minimums. Bought items sync to the driver webapp buy list;
                  delivered items go to the supplier order list. Tap an item to see menu usage and receive stock.
                </p>
              </div>
            </div>
            <span className="rounded-full border border-sky-200/80 bg-sky-50/80 px-3 py-1 text-[10px] font-black text-sky-800">
              {lines.length} to order
            </span>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-6 p-5 lg:grid-cols-2">
          {renderList('Driver Buy List (Bought)', Truck, driverLines, 'text-emerald-600')}
          {renderList('Supplier Order List (Delivered)', ShoppingCart, supplierLines, 'text-indigo-600')}
        </div>
      </ExecutiveGlassCard>
    </>
  );
}

// ─── Predictive Prep & Wastage Control Engine ─────────────────────────────────

/** Returns the recommended prep quantity, capped so the kitchen never preps more
 *  than `shelfLifeDays` days worth of stock, and never less than 0. */
function calcPrepQty(item: PrepItem): number {
  const maxBatch = Math.ceil(item.rollingAvg14d * item.shelfLifeDays);
  const needed   = Math.max(0, item.rollingAvg14d - item.currentStock);
  return Math.min(needed, maxBatch);
}

/** Returns a bakery whole-unit action for a display item (no slice-cutting). */
function calcDisplayAction(item: DisplayItem): { text: string; urgent: boolean } {
  const totalAvail  = item.currentSlices + item.currentWhole * item.slicesPerWhole;
  const wholesToThaw = Math.max(1, Math.ceil((item.rollingAvg14d - item.currentWhole * item.slicesPerWhole) / item.slicesPerWhole));

  if (item.currentWhole === 0 && item.currentSlices === 0) {
    return { text: 'OUT OF STOCK — Reorder required', urgent: true };
  }
  if (totalAvail < item.rollingAvg14d * 0.5) {
    return { text: `⚡ Thaw ${wholesToThaw} Whole Unit${wholesToThaw > 1 ? 's' : ''} — Urgent`, urgent: true };
  }
  if (item.currentWhole === 0 && item.currentSlices < item.rollingAvg14d * 0.6) {
    return { text: '👨‍🍳 Bake 1 Batch — stock running low', urgent: false };
  }
  if (item.currentWhole > 0 && totalAvail < item.rollingAvg14d) {
    return { text: `⚡ Thaw ${wholesToThaw} Whole Unit${wholesToThaw > 1 ? 's' : ''}`, urgent: false };
  }
  return { text: '✓ Stock Adequate', urgent: false };
}

function PrepActionBadge({ text, urgent }: { text: string; urgent: boolean }) {
  if (text.startsWith('✓')) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200/80 bg-emerald-50/80 px-2 py-0.5 text-[9px] font-black text-emerald-800">
        {text}
      </span>
    );
  }
  if (text.startsWith('OUT OF STOCK')) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-rose-400/80 bg-rose-100/90 px-2 py-0.5 text-[9px] font-black text-rose-900 animate-pulse">
        <BadgeAlert className="h-2.5 w-2.5 flex-shrink-0" /> {text}
      </span>
    );
  }
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-black ${
      urgent
        ? 'border-rose-300/80 bg-rose-100/90 text-rose-900 animate-pulse'
        : 'border-amber-200/80 bg-amber-50/80 text-amber-900'
    }`}>
      {text}
    </span>
  );
}

function PredictivePrepEngine({
  menuItems,
  prepItems,
  setPrepItems,
  displayItems,
  setDisplayItems,
  menuPageHref,
}: {
  menuItems: MenuItem[];
  prepItems: PrepItem[];
  setPrepItems: React.Dispatch<React.SetStateAction<PrepItem[]>>;
  displayItems: DisplayItem[];
  setDisplayItems: React.Dispatch<React.SetStateAction<DisplayItem[]>>;
  menuPageHref: string;
}) {
  const [activeTab, setActiveTab] = useState<'PREP' | 'DISPLAY'>('PREP');
  const [linkMenuId, setLinkMenuId] = useState('');

  const unlinkedMenuItems = menuItems.filter(
    (item) => getMenuKitchenTrackKind(item.id, prepItems, displayItems) === 'none',
  );

  const linkMenuItem = (menuId: string, track: KitchenTrackKind) => {
    const menu = menuItems.find((item) => item.id === menuId);
    if (!menu) return;
    const linked = setMenuKitchenTrack(menu, track, prepItems, displayItems);
    setPrepItems(linked.prepItems);
    setDisplayItems(linked.displayItems);
    setLinkMenuId('');
  };

  const unlinkMenuItem = (menuItemId: string) => {
    const linked = removeMenuFromKitchenTrack(menuItemId, prepItems, displayItems);
    setPrepItems(linked.prepItems);
    setDisplayItems(linked.displayItems);
  };

  const updatePrepShelf = (id: string, days: number) =>
    setPrepItems((prev) => prev.map((i) => (i.id === id ? { ...i, shelfLifeDays: Math.max(1, days) } : i)));

  const updateDisplayShelf = (id: string, days: number) =>
    setDisplayItems((prev) => prev.map((i) => (i.id === id ? { ...i, shelfLifeDays: Math.max(1, days) } : i)));

  const shelfInputCls = 'w-14 rounded-lg border border-violet-200/80 bg-white/90 px-1.5 py-1 text-center text-xs font-black text-violet-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-violet-400/40 transition-all';
  const linkSelectCls =
    'rounded-xl border border-violet-200/80 bg-white/90 px-2.5 py-1.5 text-xs font-semibold text-slate-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-violet-400/40';

  return (
    <ExecutiveGlassCard className="overflow-hidden">
      {/* Header */}
      <div className="border-b border-slate-200/80 bg-slate-50/80 px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-2xl border border-violet-200/80 bg-violet-50/80">
              <ChefHat className="h-4.5 w-4.5 text-violet-700" />
            </div>
            <div>
              <h2 className="text-xs font-black uppercase tracking-widest text-slate-800">
                Predictive Prep &amp; Wastage Control
              </h2>
              <p className="mt-0.5 max-w-xl text-[10px] leading-relaxed text-slate-500">
                Only menu items explicitly set to Prep or Display are tracked here. Morning prep quantities
                subtract verified stock from MD min/day and 14-day velocity, capped by spoilage limits.
              </p>
            </div>
          </div>
        </div>

        {/* Sub-tabs */}
        <div className="mt-3 flex gap-1">
          {[
            { key: 'PREP'    as const, label: 'Prep Items',    Icon: ChefHat   },
            { key: 'DISPLAY' as const, label: 'Display Items', Icon: Utensils  },
          ].map(({ key, label, Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => setActiveTab(key)}
              className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition-all ${
                activeTab === key
                  ? 'bg-violet-700 text-white shadow-sm'
                  : 'text-slate-600 hover:bg-white/70'
              }`}
            >
              <Icon className="h-3 w-3" />
              {label}
            </button>
          ))}
        </div>
      </div>

      {activeTab === 'PREP' && (
        <div className="border-b border-slate-200/60 bg-violet-50/20 px-5 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={linkMenuId}
              onChange={(e) => setLinkMenuId(e.target.value)}
              className={linkSelectCls}
            >
              <option value="">Link menu item to prep…</option>
              {unlinkedMenuItems.map((item) => (
                <option key={item.id} value={item.id}>{item.name}</option>
              ))}
            </select>
            <button
              type="button"
              disabled={!linkMenuId}
              onClick={() => linkMenuItem(linkMenuId, 'prep')}
              className="inline-flex items-center gap-1 rounded-xl border border-violet-300/80 bg-violet-700 px-3 py-1.5 text-xs font-bold text-white transition-all hover:bg-violet-600 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Plus className="h-3 w-3" />
              Add prep item
            </button>
            {unlinkedMenuItems.length === 0 ? (
              <span className="text-[10px] text-slate-500">All menu items are already linked.</span>
            ) : null}
          </div>
        </div>
      )}

      {activeTab === 'DISPLAY' && (
        <div className="border-b border-slate-200/60 bg-violet-50/20 px-5 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={linkMenuId}
              onChange={(e) => setLinkMenuId(e.target.value)}
              className={linkSelectCls}
            >
              <option value="">Link menu item to display…</option>
              {unlinkedMenuItems.map((item) => (
                <option key={item.id} value={item.id}>{item.name}</option>
              ))}
            </select>
            <button
              type="button"
              disabled={!linkMenuId}
              onClick={() => linkMenuItem(linkMenuId, 'display')}
              className="inline-flex items-center gap-1 rounded-xl border border-violet-300/80 bg-violet-700 px-3 py-1.5 text-xs font-bold text-white transition-all hover:bg-violet-600 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Plus className="h-3 w-3" />
              Add display item
            </button>
            {unlinkedMenuItems.length === 0 ? (
              <span className="text-[10px] text-slate-500">All menu items are already linked.</span>
            ) : null}
          </div>
        </div>
      )}

      {/* ── Prep Items Table ── */}
      {activeTab === 'PREP' && prepItems.length === 0 ? (
        <p className="px-5 py-10 text-center text-sm text-slate-500">
          No prep items linked yet — set Kitchen prep tracking to Prep in{' '}
          <Link href={menuPageHref} className="font-bold text-violet-700 hover:text-violet-900">
            Menu &amp; Pricing
          </Link>{' '}
          or link a menu item above.
        </p>
      ) : null}
      {activeTab === 'PREP' && prepItems.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200/80 bg-slate-50/60 text-[10px] font-bold uppercase tracking-widest text-slate-500">
              <tr>
                <th className="px-5 py-3">Item Name</th>
                <th className="px-5 py-3 text-center">Current Stock</th>
                <th className="px-5 py-3 text-center">
                  <span className="flex items-center justify-center gap-1">
                    <TrendingUp className="h-3 w-3" /> 14-Day Rolling Avg
                  </span>
                </th>
                <th className="px-5 py-3 text-center">MD Shelf Life (Days)</th>
                <th className="px-5 py-3 text-center bg-violet-50/60">
                  <span className="text-violet-700">System Prep Qty</span>
                </th>
                <th className="px-5 py-3 w-10" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/60">
              {prepItems.map((item) => {
                const prepQty   = calcPrepQty(item);
                const isUrgent  = prepQty > 0 && item.currentStock < item.rollingAvg14d * 0.5;
                const isOut     = item.currentStock < item.rollingAvg14d * 0.2;
                return (
                  <tr key={item.id} className={`transition-colors ${
                    isOut    ? 'bg-rose-50/40 hover:bg-rose-50/60' :
                    isUrgent ? 'bg-amber-50/30 hover:bg-amber-50/50' :
                    'hover:bg-white/40'
                  }`}>
                    <td className="px-5 py-3.5">
                      <p className="font-bold text-slate-900">{item.name}</p>
                      <p className="text-[10px] text-slate-500">{item.unit}</p>
                    </td>
                    <td className="px-5 py-3.5 text-center">
                      <span className={`font-black tabular-nums ${
                        item.currentStock < item.rollingAvg14d * 0.3 ? 'text-rose-800' :
                        item.currentStock < item.rollingAvg14d * 0.6 ? 'text-amber-800' :
                        'text-slate-700'
                      }`}>
                        {item.currentStock} {item.unit}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-center font-mono text-sm text-slate-600">
                      {item.rollingAvg14d} <span className="text-[10px] text-slate-400">{item.unit}/day</span>
                    </td>
                    <td className="px-5 py-3.5 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <input
                          type="number"
                          min={1}
                          max={30}
                          value={item.shelfLifeDays}
                          onChange={(e) => updatePrepShelf(item.id, parseInt(e.target.value) || 1)}
                          className={shelfInputCls}
                        />
                        <span className="text-[9px] font-bold text-violet-600">days</span>
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-center bg-violet-50/40">
                      {prepQty === 0 ? (
                        <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200/80 bg-emerald-50/80 px-2 py-0.5 text-[9px] font-black text-emerald-800">
                          <CheckCircle2 className="h-2.5 w-2.5" /> No prep needed
                        </span>
                      ) : (
                        <div className="flex flex-col items-center gap-0.5">
                          <span className={`text-lg font-black tabular-nums ${isOut ? 'text-rose-800' : 'text-violet-800'}`}>
                            {prepQty}
                          </span>
                          <span className="text-[9px] font-semibold text-slate-500">{item.unit} to prep</span>
                          {isOut && (
                            <span className="mt-0.5 inline-flex items-center gap-0.5 rounded-full border border-rose-300/80 bg-rose-100/90 px-1.5 py-0.5 text-[8px] font-black text-rose-900 animate-pulse">
                              <AlertTriangle className="h-2 w-2" /> Critical
                            </span>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-center">
                      <button
                        type="button"
                        onClick={() => unlinkMenuItem(item.menuItemId)}
                        className="rounded-xl border border-slate-200/80 bg-white/60 p-1.5 text-slate-400 hover:border-rose-200/80 hover:text-rose-600"
                        title="Remove from prep tracking"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Display Items Table ── */}
      {activeTab === 'DISPLAY' && displayItems.length === 0 ? (
        <p className="px-5 py-10 text-center text-sm text-slate-500">
          No display items linked yet — set Kitchen prep tracking to Display in{' '}
          <Link href={menuPageHref} className="font-bold text-violet-700 hover:text-violet-900">
            Menu &amp; Pricing
          </Link>{' '}
          or link a menu item above.
        </p>
      ) : null}
      {activeTab === 'DISPLAY' && displayItems.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200/80 bg-slate-50/60 text-[10px] font-bold uppercase tracking-widest text-slate-500">
              <tr>
                <th className="px-5 py-3">Item Name</th>
                <th className="px-5 py-3 text-center">Whole Stock</th>
                <th className="px-5 py-3 text-center">Loose Slices</th>
                <th className="px-5 py-3 text-center">
                  <span className="flex items-center justify-center gap-1">
                    <TrendingUp className="h-3 w-3" /> 14-Day Sales Avg
                  </span>
                </th>
                <th className="px-5 py-3 text-center">MD Shelf Life</th>
                <th className="px-5 py-3 bg-violet-50/60">
                  <span className="text-violet-700">Action Required</span>
                </th>
                <th className="px-5 py-3 w-10" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/60">
              {displayItems.map((item) => {
                const action = calcDisplayAction(item);
                const totalSlices = item.currentSlices + item.currentWhole * item.slicesPerWhole;
                const lowStock = totalSlices < item.rollingAvg14d * 0.5;
                return (
                  <tr key={item.id} className={`transition-colors ${
                    action.urgent ? 'bg-rose-50/40 hover:bg-rose-50/60' :
                    lowStock      ? 'bg-amber-50/30 hover:bg-amber-50/50' :
                    'hover:bg-white/40'
                  }`}>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2">
                        <div className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200/80 bg-white/60">
                          <Layers className="h-3.5 w-3.5 text-slate-400" />
                        </div>
                        <div>
                          <p className="font-bold text-slate-900">{item.name}</p>
                          <p className="text-[10px] text-slate-500">{item.slicesPerWhole} portions per whole unit</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-center">
                      <span className={`text-sm font-black ${item.currentWhole === 0 ? 'text-rose-700' : 'text-slate-700'}`}>
                        {item.currentWhole}
                      </span>
                      <p className="text-[9px] text-slate-400">whole</p>
                    </td>
                    <td className="px-5 py-3.5 text-center">
                      <span className={`text-sm font-black ${item.currentSlices === 0 ? 'text-amber-700' : 'text-slate-700'}`}>
                        {item.currentSlices}
                      </span>
                      <p className="text-[9px] text-slate-400">on display</p>
                    </td>
                    <td className="px-5 py-3.5 text-center font-mono text-sm text-slate-600">
                      {item.rollingAvg14d} <span className="text-[10px] text-slate-400">units/day</span>
                    </td>
                    <td className="px-5 py-3.5 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <input
                          type="number"
                          min={1}
                          max={30}
                          value={item.shelfLifeDays}
                          onChange={(e) => updateDisplayShelf(item.id, parseInt(e.target.value) || 1)}
                          className={shelfInputCls}
                        />
                        <span className="text-[9px] font-bold text-violet-600">days</span>
                      </div>
                    </td>
                    <td className="px-5 py-3.5 bg-violet-50/40">
                      <PrepActionBadge text={action.text} urgent={action.urgent} />
                    </td>
                    <td className="px-5 py-3.5 text-center">
                      <button
                        type="button"
                        onClick={() => unlinkMenuItem(item.menuItemId)}
                        className="rounded-xl border border-slate-200/80 bg-white/60 p-1.5 text-slate-400 hover:border-rose-200/80 hover:text-rose-600"
                        title="Remove from display tracking"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Footer note */}
      <div className="border-t border-slate-200/80 bg-slate-50/60 px-5 py-2.5">
        <p className="text-[10px] text-slate-500">
          Recommendations are computed live from verified stock counts and 14-day POS velocity. Shelf life limits
          prevent over-prepping beyond the MD&apos;s configured spoilage window.
        </p>
      </div>
    </ExecutiveGlassCard>
  );
}

// ─── Menu Engineering Desk ────────────────────────────────────────────────────


// ─── Labor Roster ───────────────────────────────────────────────────────────

function shiftPeriodMonth(periodMonth: string, delta: number): string {
  const d = new Date(`${normalizePeriodMonth(periodMonth)}T12:00:00`);
  d.setMonth(d.getMonth() + delta);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

function daysInPeriodMonth(periodMonth: string): string[] {
  const normalized = normalizePeriodMonth(periodMonth);
  const [year, month] = normalized.split('-').map(Number);
  const total = new Date(year, month, 0).getDate();
  return Array.from({ length: total }, (_, i) => {
    const day = i + 1;
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  });
}

function LaborRosterPanel({
  hubView,
  editorName,
  editorEmail,
}: {
  hubView: boolean;
  editorName: string;
  editorEmail: string;
}) {
  const [periodMonth, setPeriodMonth] = useState(normalizePeriodMonth());
  const [panelExpanded, setPanelExpanded] = useState(true);
  const [roster, setRoster] = useState<CafeLaborRosterMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [rosterError, setRosterError] = useState<string | null>(null);
  const [selectedStaffId, setSelectedStaffId] = useState<string | null>(null);
  const [dayLogs, setDayLogs] = useState<CafeStaffDayLog[]>([]);
  const [dayLogsLoading, setDayLogsLoading] = useState(false);
  const [savingDate, setSavingDate] = useState<string | null>(null);

  const isCurrentMonth = periodMonth === normalizePeriodMonth();
  const monthDays = useMemo(() => daysInPeriodMonth(periodMonth), [periodMonth]);
  const dayLogByDate = useMemo(
    () => new Map(dayLogs.map((log) => [log.workDate, log])),
    [dayLogs],
  );

  const reloadRoster = useCallback(() => {
    setLoading(true);
    void getCafeLaborRoster(periodMonth).then((payload) => {
      if (payload.error) setRosterError(payload.error);
      else setRosterError(null);
      setRoster(payload.staff);
      setLoading(false);
    });
  }, [periodMonth]);

  useEffect(() => {
    reloadRoster();
  }, [reloadRoster]);

  useEffect(() => {
    if (!selectedStaffId) {
      setDayLogs([]);
      return;
    }
    setDayLogsLoading(true);
    void getCafeStaffDayLogs(selectedStaffId, periodMonth).then((result) => {
      setDayLogs(result.logs);
      setDayLogsLoading(false);
    });
  }, [selectedStaffId, periodMonth]);

  const totalGross = roster.reduce(
    (sum, s) => sum + s.dailyRate * s.daysWorked + s.otTotalLkr,
    0,
  );
  const totalDeductions = roster.reduce((sum, s) => sum + s.deductionsMTD, 0);
  const totalNet = totalGross - totalDeductions;
  const colSpan = hubView ? 6 : 7;

  const handleDayUpdate = async (
    staffMember: CafeLaborRosterMember,
    workDate: string,
    patch: { worked: boolean; otHours: number; otLkr: number },
  ) => {
    setSavingDate(workDate);
    const result = await updateCafeStaffDayLog({
      employeeId: staffMember.id,
      workDate,
      worked: patch.worked,
      otHours: patch.otHours,
      otLkr: patch.otLkr,
      periodMonth,
      editorName,
      editorEmail,
    });
    setSavingDate(null);
    if (!result.ok || !result.log) return;

    setDayLogs((prev) => {
      const next = prev.filter((l) => l.workDate !== workDate);
      return [...next, result.log!].sort((a, b) => a.workDate.localeCompare(b.workDate));
    });
    reloadRoster();
  };

  const selectedStaff = roster.find((s) => s.id === selectedStaffId) ?? null;

  return (
    <ExecutiveGlassCard className="overflow-hidden">
      <div className="border-b border-slate-200/80 bg-slate-50/80 px-5 py-3.5 flex flex-wrap items-center gap-2">
        <User className="h-4 w-4 text-slate-500" />
        <h2 className="text-lg font-bold text-slate-800 uppercase">Labor Roster — MTD Salary Tracker</h2>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 rounded-xl border border-slate-200/80 bg-white/70 p-0.5">
            <button
              type="button"
              onClick={() => setPeriodMonth((m) => shiftPeriodMonth(m, -1))}
              className="rounded-lg p-1.5 text-slate-600 transition-all hover:bg-slate-100"
              aria-label="Previous month"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="min-w-[9rem] px-2 text-center text-xs font-black uppercase tracking-wider text-slate-800">
              {formatPeriodMonthLabel(periodMonth)}
            </span>
            <button
              type="button"
              onClick={() => {
                if (!isCurrentMonth) setPeriodMonth((m) => shiftPeriodMonth(m, 1));
              }}
              disabled={isCurrentMonth}
              className="rounded-lg p-1.5 text-slate-600 transition-all hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-30"
              aria-label="Next month"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          {!isCurrentMonth ? (
            <button
              type="button"
              onClick={() => setPeriodMonth(normalizePeriodMonth())}
              className="rounded-xl border border-indigo-200/80 bg-indigo-50/70 px-2.5 py-1 text-[10px] font-bold text-indigo-800 hover:bg-indigo-100/70"
            >
              Current month
            </button>
          ) : null}

          <button
            type="button"
            onClick={() => setPanelExpanded((v) => !v)}
            className="flex items-center gap-1 rounded-xl border border-slate-200/80 bg-white/70 px-2.5 py-1 text-[10px] font-bold text-slate-700 hover:bg-white"
          >
            {panelExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            {panelExpanded ? 'Collapse' : 'Expand'}
          </button>
        </div>
      </div>

      {rosterError ? (
        <div className="border-b border-rose-200/80 bg-rose-50/50 px-5 py-2 text-xs font-semibold text-rose-800">
          {rosterError}
        </div>
      ) : null}

      {panelExpanded ? (
        <div className="overflow-x-auto">
          {loading ? (
            <p className="px-5 py-10 text-center text-sm text-slate-500">Loading roster…</p>
          ) : roster.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-slate-500">No active café staff on roster.</p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200/80 bg-slate-50/60">
                <tr>
                  <th className="px-5 py-3.5 text-xs font-bold text-slate-500 uppercase tracking-wider">Staff Member</th>
                  <th className="px-5 py-3.5 text-xs font-bold text-slate-500 uppercase tracking-wider">Role</th>
                  <th className="px-5 py-3.5 text-xs font-bold text-slate-500 uppercase tracking-wider text-center">Daily Rate</th>
                  <th className="px-5 py-3.5 text-xs font-bold text-slate-500 uppercase tracking-wider text-center">Days Worked</th>
                  <th className="px-5 py-3.5 text-xs font-bold text-slate-500 uppercase tracking-wider text-center">OT (Month)</th>
                  {!hubView ? (
                    <th className="px-5 py-3.5 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Deductions</th>
                  ) : null}
                  <th className="px-5 py-3.5 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50/80 px-2.5 py-0.5 text-[10px] font-black text-emerald-800">
                      <Zap className="h-2.5 w-2.5" />
                      {hubView ? 'MTD Gross' : 'MTD Net'}
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/60">
                {roster.map((s) => {
                  const gross = s.dailyRate * s.daysWorked + s.otTotalLkr;
                  const net = gross - s.deductionsMTD;
                  const isOpen = selectedStaffId === s.id;
                  return (
                    <React.Fragment key={s.id}>
                      <tr
                        className={`cursor-pointer transition-colors ${isOpen ? 'bg-indigo-50/40' : 'hover:bg-white/40'}`}
                        onClick={() => setSelectedStaffId(isOpen ? null : s.id)}
                      >
                        <td className="px-5 py-4 text-sm font-medium text-slate-800">
                          <div className="flex items-center gap-2.5">
                            <div className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200/80 bg-slate-100/80 text-xs font-black text-slate-600">
                              {s.name.charAt(0)}
                            </div>
                            <div>
                              <p className="font-bold text-slate-900">{s.name}</p>
                              <p className="text-[10px] font-semibold text-indigo-700">
                                {isOpen ? 'Hide daily breakdown' : 'Click for days & OT'}
                              </p>
                            </div>
                            {isOpen ? (
                              <ChevronUp className="ml-1 h-4 w-4 text-indigo-600" />
                            ) : (
                              <ChevronDown className="ml-1 h-4 w-4 text-slate-400" />
                            )}
                          </div>
                        </td>
                        <td className="px-5 py-4 text-sm font-medium text-slate-800">{s.role}</td>
                        <td className="px-5 py-4 text-center font-mono text-sm text-slate-800">{lkr(s.dailyRate)}/day</td>
                        <td className="px-5 py-4 text-sm text-slate-800">
                          <div className="flex flex-col items-center gap-1">
                            <span className="font-bold text-slate-900">{s.daysWorked}</span>
                            <div className="h-1 w-16 overflow-hidden rounded-full bg-slate-200/80">
                              <div
                                className="h-full rounded-full bg-emerald-500"
                                style={{ width: `${Math.min((s.daysWorked / 26) * 100, 100)}%` }}
                              />
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-4 text-center font-mono text-sm font-bold text-amber-800">
                          {s.otTotalLkr > 0 ? lkr(s.otTotalLkr) : '—'}
                        </td>
                        {!hubView ? (
                          <td className="px-5 py-4 text-right font-mono text-sm text-slate-800">
                            {s.deductionsMTD > 0 ? `−${lkr(s.deductionsMTD)}` : '—'}
                          </td>
                        ) : null}
                        <td className="px-5 py-4 text-right">
                          <span className="inline-block rounded-xl border border-emerald-200/80 bg-emerald-50/70 px-3 py-1 text-sm font-black tabular-nums text-emerald-900">
                            {lkr(hubView ? gross : net)}
                          </span>
                        </td>
                      </tr>

                      {isOpen && selectedStaff ? (
                        <tr className="bg-indigo-50/20">
                          <td colSpan={colSpan} className="px-5 py-4">
                            {dayLogsLoading ? (
                              <p className="text-center text-xs text-slate-500">Loading daily log…</p>
                            ) : (
                              <div className="space-y-3">
                                <p className="text-[10px] font-black uppercase tracking-widest text-indigo-900">
                                  Daily attendance — {selectedStaff.name} · {formatPeriodMonthLabel(periodMonth)}
                                </p>
                                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
                                  {monthDays.map((date) => {
                                    const log = dayLogByDate.get(date);
                                    const worked = log?.worked ?? false;
                                    const otHours = log?.otHours ?? 0;
                                    const otLkr = log?.otLkr ?? 0;
                                    const dayNum = Number(date.slice(8, 10));
                                    const isSaving = savingDate === date;
                                    const wasEdited = Boolean(log?.editedAt);

                                    return (
                                      <div
                                        key={date}
                                        className={`rounded-xl border p-2.5 ${
                                          worked
                                            ? 'border-emerald-200/80 bg-emerald-50/50'
                                            : 'border-slate-200/70 bg-white/60'
                                        }`}
                                      >
                                        <div className="mb-2 flex items-center justify-between">
                                          <span className="text-xs font-black text-slate-800">{dayNum}</span>
                                          <label className="flex cursor-pointer items-center gap-1 text-[9px] font-bold text-slate-600">
                                            <input
                                              type="checkbox"
                                              checked={worked}
                                              disabled={isSaving}
                                              onChange={(e) => {
                                                e.stopPropagation();
                                                void handleDayUpdate(selectedStaff, date, {
                                                  worked: e.target.checked,
                                                  otHours: e.target.checked ? otHours : 0,
                                                  otLkr: e.target.checked ? otLkr : 0,
                                                });
                                              }}
                                              onClick={(e) => e.stopPropagation()}
                                              className="accent-emerald-600"
                                            />
                                            Day
                                          </label>
                                        </div>

                                        {worked ? (
                                          <div className="space-y-1.5" onClick={(e) => e.stopPropagation()}>
                                            <div>
                                              <label className="text-[8px] font-bold uppercase text-slate-500">OT hrs</label>
                                              <input
                                                type="number"
                                                min={0}
                                                step={0.5}
                                                defaultValue={otHours || ''}
                                                key={`${date}-hrs-${otHours}`}
                                                disabled={isSaving}
                                                onBlur={(e) => {
                                                  const nextHours = Math.max(0, parseFloat(e.target.value) || 0);
                                                  if (nextHours === otHours) return;
                                                  const hourly = selectedStaff.dailyRate / 8;
                                                  void handleDayUpdate(selectedStaff, date, {
                                                    worked: true,
                                                    otHours: nextHours,
                                                    otLkr: nextHours > 0 ? Math.round(nextHours * hourly * 1.5) : otLkr,
                                                  });
                                                }}
                                                className="w-full rounded-lg border border-slate-200/80 bg-white/90 px-1.5 py-1 text-center text-xs font-mono"
                                              />
                                            </div>
                                            <div>
                                              <label className="text-[8px] font-bold uppercase text-slate-500">OT LKR</label>
                                              <input
                                                type="number"
                                                min={0}
                                                step={1}
                                                defaultValue={otLkr || ''}
                                                key={`${date}-lkr-${otLkr}`}
                                                disabled={isSaving}
                                                onBlur={(e) => {
                                                  const nextLkr = Math.max(0, parseFloat(e.target.value) || 0);
                                                  if (nextLkr === otLkr) return;
                                                  void handleDayUpdate(selectedStaff, date, {
                                                    worked: true,
                                                    otHours,
                                                    otLkr: nextLkr,
                                                  });
                                                }}
                                                className="w-full rounded-lg border border-slate-200/80 bg-white/90 px-1.5 py-1 text-center text-xs font-mono"
                                              />
                                            </div>
                                          </div>
                                        ) : (
                                          <p className="text-[9px] text-slate-400">Off</p>
                                        )}

                                        {wasEdited && log ? (
                                          <div className="mt-2 rounded-lg border border-amber-200/80 bg-amber-50/80 px-1.5 py-1 text-[8px] leading-snug text-amber-900">
                                            <span className="font-black">Edited by {log.editedByName ?? 'staff'}</span>
                                            <br />
                                            Was: {log.prevWorked ? 'worked' : 'off'}
                                            {log.prevOtHours ? ` · ${log.prevOtHours}h OT` : ''}
                                            {log.prevOtLkr ? ` · ${lkr(log.prevOtLkr)}` : ''}
                                          </div>
                                        ) : null}
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            )}
                          </td>
                        </tr>
                      ) : null}
                    </React.Fragment>
                  );
                })}
              </tbody>
              <tfoot className="border-t border-slate-200/80 bg-slate-50/60">
                <tr>
                  <td colSpan={hubView ? 4 : 4} className="px-5 py-3 text-xs font-bold text-slate-600">
                    Total — {formatPeriodMonthLabel(periodMonth)}
                  </td>
                  <td className="px-5 py-3 text-center font-mono text-xs font-black text-amber-800">
                    {roster.some((s) => s.otTotalLkr > 0)
                      ? lkr(roster.reduce((sum, s) => sum + s.otTotalLkr, 0))
                      : '—'}
                  </td>
                  {!hubView ? (
                    <td className="px-5 py-3 text-right font-mono text-xs font-black text-rose-700">
                      −{lkr(totalDeductions)}
                    </td>
                  ) : null}
                  <td className="px-5 py-3 text-right">
                    <span className="inline-block rounded-xl border border-emerald-200/80 bg-emerald-100/70 px-3 py-1 text-sm font-black tabular-nums text-emerald-900">
                      {lkr(hubView ? totalGross : totalNet)}
                    </span>
                  </td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      ) : (
        <div className="px-5 py-4 text-xs text-slate-500">
          {roster.length} staff · {formatPeriodMonthLabel(periodMonth)} · click Expand to view roster
        </div>
      )}
    </ExecutiveGlassCard>
  );
}

// ─── Lookback Date Strip ──────────────────────────────────────────────────────

function LookbackDateStrip({
  selected,
  onSelect,
}: {
  selected: string;
  onSelect: (date: string) => void;
}) {
  // Build 14-day window (today back to 13 days ago)
  const days = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(TODAY_STR);
    d.setDate(d.getDate() - i);
    return {
      date: d.toISOString().slice(0, 10),
      dayNum: d.getDate(),
      dayName: ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d.getDay()],
      offset: i,
    };
  });

  return (
    <div className="flex items-center gap-2 overflow-x-auto pb-1">
      <div className="flex items-center gap-1.5 flex-shrink-0 text-[10px] font-bold uppercase tracking-widest text-slate-500">
        <CalendarDays className="h-3.5 w-3.5" />
        Lookback:
      </div>
      {days.map(({ date, dayNum, dayName, offset }) => {
        const active = date === selected;
        const purged = offset >= 12; // last 2 days in window — proofs may be purged soon
        return (
          <button
            key={date}
            type="button"
            onClick={() => onSelect(date)}
            title={date}
            className={`flex flex-shrink-0 flex-col items-center rounded-xl border px-2.5 py-1.5 transition-all ${
              active
                ? 'border-emerald-300/80 bg-emerald-600 text-white shadow-md shadow-emerald-600/25'
                : purged
                ? 'border-amber-200/70 bg-amber-50/60 text-amber-800 hover:bg-amber-100/60'
                : 'border-slate-200/70 bg-white/50 text-slate-700 hover:bg-white/80'
            }`}
          >
            <span className={`text-[8px] font-bold uppercase ${active ? 'text-emerald-100' : purged ? 'text-amber-600' : 'text-slate-500'}`}>{dayName}</span>
            <span className={`text-sm font-black tabular-nums leading-tight ${active ? 'text-white' : ''}`}>{dayNum}</span>
            {offset === 0 && <span className={`text-[7px] font-black uppercase leading-tight ${active ? 'text-emerald-100' : 'text-emerald-700'}`}>TODAY</span>}
            {purged && offset > 0 && <span className="text-[7px] font-bold uppercase leading-tight text-amber-600">≈PURGE</span>}
          </button>
        );
      })}
      <div className="flex-shrink-0 flex items-center gap-1.5 rounded-xl border border-amber-200/70 bg-amber-50/50 px-2.5 py-1.5 text-[9px] text-amber-800">
        <Trash2 className="h-3 w-3" />
        14-day purge window
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CafePage() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const fromHub = searchParams.get('hub') === '1';
  const {
    branches,
    locationId,
    locationName,
    setLocationName,
    handleBranchChange,
  } = useCafeBranchScope(pathname);
  const [sessionProfile, setSessionProfile] = useState<ExecutiveSessionProfile | null>(null);
  const [mtdWastageCostLkr, setMtdWastageCostLkr] = useState(0);
  const [laborRoster, setLaborRoster] = useState<CafeLaborRosterMember[]>([]);
  const [staff, setStaff]             = useState<StaffMember[]>([]);
  const [tasks, setTasks]             = useState<Task[]>([]);
  const [listA, setListA]               = useState<DailyStockItem[]>([]);
  const [listB, setListB]               = useState<BulkStockItem[]>([]);
  const [voids, setVoids]               = useState<Void[]>([]);
  const [menuItems, setMenuItems]       = useState<MenuItem[]>([]);
  const [ingredients, setIngredients]   = useState<Ingredient[]>([]);
  const [menuCategories, setMenuCategories] = useState<string[]>(MENU_DEFAULT_CATS);
  const [prepItems, setPrepItems]       = useState<PrepItem[]>([]);
  const [displayItems, setDisplayItems] = useState<DisplayItem[]>([]);
  const [globalOverhead, setGlobalOverhead] = useState(20);
  const [cafeLogoUrl, setCafeLogoUrl]   = useState<string | null>(null);
  const [cafeCoverUrl, setCafeCoverUrl] = useState<string | null>(null);
  const [cafeCoverTextColor, setCafeCoverTextColor] = useState('#ffffff');
  const [cafeCoverTintStrength, setCafeCoverTintStrength] = useState(100);
  const [customerMenuUrl, setCustomerMenuUrl] = useState<string | null>('https://tasha.lk');
  const [dashboardReady, setDashboardReady] = useState(false);
  const [loadError, setLoadError]       = useState<string | null>(null);
  const [photoTask, setPhotoTask]     = useState<Task | null>(null);
  const [fineTarget, setFineTarget]   = useState<FineTarget | null>(null);
  const [lookbackDate, setLookbackDate] = useState(TODAY_STR);
  const [showVoids, setShowVoids]     = useState(false);
  const [showAddTask, setShowAddTask] = useState(false);
  const [newTaskName, setNewTaskName] = useState('');
  const [newTaskTime, setNewTaskTime] = useState('09:00');
  const [newTaskFreq, setNewTaskFreq] = useState<TaskFreq>('DAILY');
  const [newTaskAssignee, setNewTaskAssignee] = useState<string>(CAFE_TASK_ASSIGNEE_ROLES[0]);

  useEffect(() => {
    fetchExecutiveSessionProfile().then(setSessionProfile);
  }, []);

  useEffect(() => {
    if (!locationId) return;
    setDashboardReady(false);
    void getCafeDashboard(locationId).then((payload) => {
      if (payload.error) setLoadError(payload.error);
      setStaff(payload.staff);
      setTasks(payload.tasks);
      setListA(payload.listA);
      setListB(payload.listB);
      setVoids(payload.voids);
      const loadedIngredients = (payload.ingredients ?? []).map((ing) =>
        normalizeIngredient(ing as Partial<Ingredient> & Pick<Ingredient, 'id' | 'name' | 'supplier'>),
      );
      const loadedMenu = syncMenuRecipeCosts(
        normalizeMenuItems(payload.menuItems ?? []),
        loadedIngredients,
      );
      const linkedPrep = reconcilePrepWithMenu(
        loadedMenu,
        payload.prepItems ?? [],
        payload.displayItems ?? [],
      );
      setIngredients(loadedIngredients);
      setMenuItems(loadedMenu);
      setPrepItems(linkedPrep.prepItems);
      setDisplayItems(linkedPrep.displayItems);
      setMenuCategories(payload.menuCategories.length ? payload.menuCategories : MENU_DEFAULT_CATS);
      setGlobalOverhead(payload.globalOverhead ?? 20);
      setCafeLogoUrl(payload.cafeLogoUrl ?? null);
      setCafeCoverUrl(payload.cafeCoverUrl ?? null);
      setCafeCoverTextColor(payload.cafeCoverTextColor ?? '#ffffff');
      setCafeCoverTintStrength(payload.cafeCoverTintStrength ?? 100);
      setCustomerMenuUrl(payload.customerMenuUrl ?? 'https://tasha.lk');
      setLocationName(payload.locationName ?? null);
      setMtdWastageCostLkr(payload.mtdWastageCostLkr ?? 0);
      setDashboardReady(true);
    });
    void getCafeLaborRoster().then((result) => {
      setLaborRoster(result.staff);
    });
  }, [locationId, setLocationName]);

  const persistDashboard = useCallback(
    (patch: Partial<CafeDashboardPayload>) => {
      if (!dashboardReady) return;
      void saveCafeDashboard(
        {
          staff: patch.staff ?? staff,
          tasks: patch.tasks ?? tasks,
          listA: patch.listA ?? listA,
          listB: patch.listB ?? listB,
          voids: patch.voids ?? voids,
          menuItems: patch.menuItems ?? menuItems,
          menuCategories: patch.menuCategories ?? menuCategories,
          ingredients: patch.ingredients ?? ingredients,
          prepItems: patch.prepItems ?? prepItems,
          displayItems: patch.displayItems ?? displayItems,
          globalOverhead: patch.globalOverhead ?? globalOverhead,
          cafeLogoUrl: patch.cafeLogoUrl ?? cafeLogoUrl,
          cafeCoverUrl: patch.cafeCoverUrl ?? cafeCoverUrl,
          cafeCoverTextColor: patch.cafeCoverTextColor ?? cafeCoverTextColor,
          cafeCoverTintStrength: patch.cafeCoverTintStrength ?? cafeCoverTintStrength,
          customerMenuUrl: patch.customerMenuUrl ?? customerMenuUrl,
          locationId: locationId ?? undefined,
        },
        locationId,
      );
    },
    [dashboardReady, staff, tasks, listA, listB, voids, menuItems, menuCategories, ingredients, prepItems, displayItems, globalOverhead, cafeLogoUrl, cafeCoverUrl, cafeCoverTextColor, cafeCoverTintStrength, customerMenuUrl, locationId],
  );

  const menuPrepSyncKey = useMemo(
    () =>
      menuItems
        .map((item) => `${item.id}:${item.name}:${item.minReadyStock}:${item.rollingAvg14d}`)
        .join('|'),
    [menuItems],
  );

  useEffect(() => {
    if (!dashboardReady) return;
    const linked = reconcilePrepWithMenu(menuItems, prepItems, displayItems);
    setPrepItems(linked.prepItems);
    setDisplayItems(linked.displayItems);
    // Only re-sync when the sellable menu changes — not when shelf-life edits update prep rows.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [menuPrepSyncKey, dashboardReady]);

  useEffect(() => {
    if (!dashboardReady) return;
    const timer = window.setTimeout(() => {
      persistDashboard({});
    }, 900);
    return () => window.clearTimeout(timer);
  }, [staff, tasks, listA, listB, voids, menuItems, menuCategories, ingredients, prepItems, displayItems, globalOverhead, cafeLogoUrl, cafeCoverUrl, cafeCoverTextColor, cafeCoverTintStrength, customerMenuUrl, dashboardReady, persistDashboard]);

  const lookbackOffset = dateToOffset(lookbackDate);
  const activeTasks    = getTasksForOffset(lookbackOffset, tasks);
  const dailyTasks     = activeTasks.filter((t) => t.freq === 'DAILY');
  const weeklyTasks    = activeTasks.filter((t) => t.freq === 'WEEKLY');
  const overdue        = activeTasks.filter((t) => t.status === 'OVERDUE').length;
  const complete       = activeTasks.filter((t) => t.status === 'COMPLETE').length;
  const compliancePct  = activeTasks.length
    ? Math.round((complete / activeTasks.length) * 100)
    : 0;

  const grossPayroll    = staff.reduce((s, m) => s + m.dailyRate * m.daysWorked, 0);
  const totalDeductions = staff.reduce((s, m) => s + m.deductionsMTD, 0);
  const netPayroll      = grossPayroll - totalDeductions;
  const payrollCost     = laborRoster.length
    ? calcPayrollCostLkr(laborRoster)
    : grossPayroll;
  const payrollAndWastageCost = payrollCost + mtdWastageCostLkr;

  const flaggedA = listA.filter((i) => listAPct(i) < THEFT_THRESHOLD).length;
  const flaggedB = listB.filter((i) => listBPct(i) < THEFT_THRESHOLD).length;
  const hubView = isCafeHubView(sessionProfile?.rank, fromHub);

  const resetAddTaskForm = () => {
    setNewTaskName('');
    setNewTaskTime('09:00');
    setNewTaskFreq('DAILY');
    setNewTaskAssignee(CAFE_TASK_ASSIGNEE_ROLES[0]);
    setShowAddTask(false);
  };

  const handleAddTask = () => {
    const name = newTaskName.trim();
    if (!name) return;
    const assignedTo = newTaskAssignee || CAFE_TASK_ASSIGNEE_ROLES[0];
    setTasks((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        name,
        freq: newTaskFreq,
        assignedTo,
        dueTime: newTaskTime,
        status: 'PENDING',
      },
    ]);
    resetAddTaskForm();
  };

  const handleRemoveTask = (taskId: string) => {
    setTasks((prev) => prev.filter((task) => task.id !== taskId));
  };

  const handleIssueFine = (staffId: string, amount: number, reason: string) => {
    void issueCafeFine({ staffId, amount, reason }).then((result) => {
      if (result.staff) {
        setStaff(result.staff);
        return;
      }
      setStaff((prev) =>
        prev.map((s) =>
          s.id === staffId ? { ...s, deductionsMTD: s.deductionsMTD + amount } : s,
        ),
      );
    });
  };

  const canEditTasks = lookbackOffset === 0;

  return (
    <>
      <PhotoModal task={photoTask} lookbackDate={lookbackDate} onClose={() => setPhotoTask(null)} />
      <DisciplinaryFineModal
        target={fineTarget}
        staff={staff}
        onConfirm={handleIssueFine}
        onClose={() => setFineTarget(null)}
      />

      <CafePortalShell
        hubView={hubView}
        subtitle={
          hubView
            ? 'Labor roster · task proof lock · procurement & menu'
            : 'Labor roster · task proof lock · stock variance & theft radar'
        }
        branches={branches}
        selectedBranchId={locationId}
        onBranchChange={handleBranchChange}
        showBranchSelector={!hubView}
        locationName={locationName}
      >
          {loadError ? (
            <ExecutiveGlassCard className="border-rose-200/80 bg-rose-50/50 p-4">
              <p className="text-sm font-bold text-rose-900">Could not load live café data</p>
              <p className="mt-1 text-xs text-rose-700">{loadError}</p>
            </ExecutiveGlassCard>
          ) : null}

          {/* ── Summary Cards ── */}
          <div className={`grid grid-cols-2 gap-4 ${hubView ? 'md:grid-cols-2' : 'md:grid-cols-4'}`}>
            <ExecutiveGlassCard className="p-5">
              <p className="text-xs font-bold uppercase tracking-widest text-slate-500">Staff Count</p>
              <p className="mt-2 text-4xl font-black text-slate-900">{staff.length}</p>
              <p className="mt-1 text-xs font-semibold text-slate-500">active café staff</p>
            </ExecutiveGlassCard>

            <ExecutiveGlassCard className="bg-gradient-to-br from-white/70 to-emerald-50/50 p-5">
              <p className="text-xs font-bold uppercase tracking-widest text-slate-500">Gross MTD Accrual</p>
              <div className="mt-2 flex items-baseline gap-1.5">
                <TrendingUp className="h-5 w-5 text-emerald-600" />
                <p className="text-2xl font-black tabular-nums text-emerald-900">{lkr(grossPayroll)}</p>
              </div>
              {!hubView ? (
                <p className="mt-1 text-xs font-semibold text-slate-500">
                  Net after deductions:{' '}
                  <span className="font-black tabular-nums text-emerald-800">{lkr(netPayroll)}</span>
                </p>
              ) : (
                <p className="mt-1 text-xs font-semibold text-slate-500">month-to-date labor accrual</p>
              )}
            </ExecutiveGlassCard>

            {!hubView ? (
              <>
                <ExecutiveGlassCard className="bg-gradient-to-br from-white/70 to-amber-50/50 p-5">
                  <p className="text-xs font-bold uppercase tracking-widest text-slate-500">
                    Payroll &amp; Wastage Cost
                  </p>
                  <div className="mt-2 flex items-baseline gap-1.5">
                    <TrendingDown className="h-5 w-5 text-amber-700" />
                    <p className="text-2xl font-black tabular-nums text-amber-950">
                      {lkr(payrollAndWastageCost)}
                    </p>
                  </div>
                  <p className="mt-1 text-xs font-semibold text-slate-500">
                    Labor {lkr(payrollCost)} + wastage {lkr(mtdWastageCostLkr)} · MTD
                  </p>
                </ExecutiveGlassCard>

                <ExecutiveGlassCard className={`p-5 ${flaggedA + flaggedB > 0 ? 'bg-gradient-to-br from-white/70 to-rose-50/50' : 'bg-gradient-to-br from-white/70 to-slate-50/50'}`}>
                  <p className="text-xs font-bold uppercase tracking-widest text-slate-500">Theft Radar Flags</p>
                  <div className="mt-2 flex items-baseline gap-1.5">
                    {flaggedA + flaggedB > 0
                      ? <><ShieldAlert className="h-5 w-5 text-rose-600" /><p className="text-2xl font-black tabular-nums text-rose-900">{flaggedA + flaggedB} items</p></>
                      : <><CheckCircle2 className="h-5 w-5 text-emerald-600" /><p className="text-2xl font-black tabular-nums text-emerald-900">Clear</p></>}
                  </div>
                  <p className="mt-1 text-xs font-semibold text-slate-500">{flaggedA} daily · {flaggedB} bulk</p>
                </ExecutiveGlassCard>
              </>
            ) : null}
          </div>

          {/* ── Weekly Procurement — auto order lists ── */}
          <WeeklyProcurementPanel
            ingredients={ingredients}
            menuItems={menuItems}
            setIngredients={setIngredients}
            setMenuItems={setMenuItems}
          />

          {/* ── Labor Roster & MTD Salary Tracker ── */}
          <LaborRosterPanel
            hubView={hubView}
            editorName={sessionProfile?.fullName ?? 'Executive'}
            editorEmail={sessionProfile?.email ?? ''}
          />

          {/* ── Visual Task Auditor ── */}
          <ExecutiveGlassCard className="overflow-hidden">
            <div className="border-b border-slate-200/80 bg-slate-50/80 px-5 py-3.5 flex flex-wrap items-center gap-3">
              <Coffee className="h-4 w-4 text-slate-500" />
              <h2 className="text-lg font-bold text-slate-800 uppercase">Visual Task Auditor</h2>
              <div className="flex items-center gap-2">
                <span className="rounded-full border border-emerald-200 bg-emerald-50/80 px-2 py-0.5 text-[10px] font-bold text-emerald-800">{complete} Complete</span>
                {overdue > 0 && <span className="rounded-full border border-rose-200 bg-rose-50/80 px-2 py-0.5 text-[10px] font-bold text-rose-800">{overdue} Overdue</span>}
              </div>
              <span className={`ml-auto text-sm font-black ${compliancePct >= 80 ? 'text-emerald-800' : 'text-amber-800'}`}>{compliancePct}%</span>
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">compliance</span>
              <div className="flex items-center gap-1.5 rounded-full border border-amber-200/80 bg-amber-50/70 px-2.5 py-0.5 text-[10px] font-bold text-amber-800">
                <Trash2 className="h-2.5 w-2.5" />
                14-Day Photo Auto-Purge Active
              </div>
              {canEditTasks && (
                <button
                  type="button"
                  onClick={() => setShowAddTask((open) => !open)}
                  className="inline-flex items-center gap-1 rounded-xl border border-slate-200/80 bg-white/80 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-white transition-all"
                >
                  <Plus className="h-3.5 w-3.5" />
                  {showAddTask ? 'Cancel' : 'Add task'}
                </button>
              )}
            </div>

            {canEditTasks && showAddTask && (
              <div className="border-b border-slate-200/60 bg-white/40 px-5 py-3">
                <div className="flex flex-wrap items-end gap-2">
                  <div className="min-w-[180px] flex-1">
                    <label className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-slate-600">
                      Task name
                    </label>
                    <input
                      type="text"
                      value={newTaskName}
                      onChange={(e) => setNewTaskName(e.target.value)}
                      placeholder="e.g. Espresso machine purge"
                      className="w-full rounded-xl border border-slate-200/80 bg-white/95 px-3 py-2 text-sm font-semibold text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-400/40"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-slate-600">
                      Due time
                    </label>
                    <input
                      type="time"
                      value={newTaskTime}
                      onChange={(e) => setNewTaskTime(e.target.value)}
                      className="rounded-xl border border-slate-200/80 bg-white/95 px-3 py-2 text-sm font-mono font-semibold text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-400/40"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-slate-600">
                      Frequency
                    </label>
                    <div className="inline-flex rounded-xl border border-slate-200/80 bg-white/70 p-0.5 text-[10px] font-black uppercase tracking-wider">
                      {(['DAILY', 'WEEKLY'] as const).map((freq) => (
                        <button
                          key={freq}
                          type="button"
                          onClick={() => setNewTaskFreq(freq)}
                          className={`rounded-lg px-2.5 py-1.5 transition-all ${
                            newTaskFreq === freq
                              ? 'bg-slate-900 text-white shadow-sm'
                              : 'text-slate-500 hover:text-slate-700'
                          }`}
                        >
                          {freq === 'DAILY' ? 'Daily' : 'Weekly'}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="min-w-[160px]">
                    <label className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-slate-600">
                      Assigned to
                    </label>
                    <select
                      value={newTaskAssignee}
                      onChange={(e) => setNewTaskAssignee(e.target.value)}
                      className="w-full rounded-xl border border-slate-200/80 bg-white/95 px-3 py-2 text-sm font-semibold text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-400/40"
                    >
                      {CAFE_TASK_ASSIGNEE_ROLES.map((role) => (
                        <option key={role} value={role}>
                          {role}
                        </option>
                      ))}
                    </select>
                  </div>
                  <button
                    type="button"
                    onClick={handleAddTask}
                    disabled={!newTaskName.trim()}
                    className="rounded-xl border border-emerald-300/80 bg-emerald-600 px-4 py-2 text-xs font-black uppercase tracking-widest text-white hover:bg-emerald-500 transition-all disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Save task
                  </button>
                </div>
              </div>
            )}

            {/* ── Lookback Date Picker ── */}
            <div className="border-b border-slate-200/60 bg-white/30 px-5 py-3">
              <LookbackDateStrip selected={lookbackDate} onSelect={setLookbackDate} />
              {lookbackOffset > 0 && (
                <div className="mt-2 flex items-center gap-2 rounded-xl border border-indigo-200/70 bg-indigo-50/50 px-3 py-1.5 text-[10px] text-indigo-800">
                  <Info className="h-3 w-3 flex-shrink-0" />
                  <span>Viewing archived compliance data for <strong>{lookbackDate}</strong> ({lookbackOffset} day{lookbackOffset > 1 ? 's' : ''} ago). Photo proofs auto-purge after 14 days.</span>
                  <button type="button" onClick={() => setLookbackDate(TODAY_STR)} className="ml-auto rounded-lg border border-indigo-200 bg-white/70 px-2 py-0.5 font-bold text-indigo-700 hover:bg-indigo-50 transition-all">Back to Today</button>
                </div>
              )}
            </div>

            <div className="p-5 space-y-5">
              {/* Daily tasks */}
              <div>
                <p className="mb-3 text-[10px] font-black uppercase tracking-widest text-slate-600">Daily Checklist — {lookbackOffset === 0 ? 'Today' : lookbackDate}</p>
                {dailyTasks.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-slate-200/80 bg-white/40 px-4 py-6 text-center text-xs text-slate-500">
                    No daily tasks yet — use Add task above.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {dailyTasks.map((task) => (
                      <CafeTaskRow
                        key={task.id}
                        task={task}
                        canEdit={canEditTasks}
                        onRemove={handleRemoveTask}
                        onViewProof={setPhotoTask}
                        onFine={(row) =>
                          setFineTarget({
                            itemName: row.name,
                            suggestedAmount: 300,
                            defaultStaffId:
                              staff.find((s) => s.name.split(' ')[0] === row.assignedTo)?.id ??
                              staff[0]?.id ??
                              '',
                            category: 'COMPLIANCE',
                          })
                        }
                      />
                    ))}
                  </div>
                )}
              </div>

              {/* Weekly tasks */}
              <div>
                <p className="mb-3 text-[10px] font-black uppercase tracking-widest text-slate-600">Weekly Deep-Cleaning</p>
                {weeklyTasks.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-slate-200/80 bg-white/40 px-4 py-6 text-center text-xs text-slate-500">
                    No weekly tasks yet — use Add task above.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {weeklyTasks.map((task) => (
                      <CafeTaskRow
                        key={task.id}
                        task={task}
                        canEdit={canEditTasks}
                        onRemove={handleRemoveTask}
                        onViewProof={setPhotoTask}
                        onFine={(row) =>
                          setFineTarget({
                            itemName: row.name,
                            suggestedAmount: 300,
                            defaultStaffId:
                              staff.find((s) => s.name.split(' ')[0] === row.assignedTo)?.id ??
                              staff[0]?.id ??
                              '',
                            category: 'COMPLIANCE',
                          })
                        }
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          </ExecutiveGlassCard>

          {/* ── Stock Variance & Theft Radar (executive vault only) ── */}
          {!hubView ? (
            <StockVarianceRadar
              staff={staff}
              listA={listA}
              listB={listB}
              voids={voids}
              onIssueFine={setFineTarget}
            />
          ) : null}

          {/* ── Predictive Prep & Wastage Control ── */}
          <PredictivePrepEngine
            menuItems={menuItems}
            prepItems={prepItems}
            setPrepItems={setPrepItems}
            displayItems={displayItems}
            setDisplayItems={setDisplayItems}
            menuPageHref={cafePortalHref(CAFE_MENU_PATH, hubView)}
          />

      </CafePortalShell>
    </>
  );
}
